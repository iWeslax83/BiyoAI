import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("../../lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

const ingestMock = vi.fn<(id: number, text: string) => Promise<number>>();
vi.mock("../../lib/ingest", () => ({
  ingestSource: (id: number, text: string) => ingestMock(id, text),
}));

const clearCacheMock = vi.fn();
vi.mock("../../lib/cache", () => ({ clearCache: () => clearCacheMock() }));

import { processPendingSources } from "../../lib/pending";
import { ProviderError } from "../../lib/provider-error";

function sqlCalls(fragment: string) {
  return queryMock.mock.calls.filter(([sql]) => sql.includes(fragment));
}

describe("processPendingSources", () => {
  beforeEach(() => {
    queryMock.mockReset();
    ingestMock.mockReset();
    clearCacheMock.mockReset();
  });

  it("re-ingests each pending source, marks it ready and clears the cache", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM sources WHERE status = 'pending'")) {
        return [
          { id: 1, raw_text: "bir" },
          { id: 2, raw_text: "iki" },
        ];
      }
      return [];
    });
    ingestMock.mockResolvedValue(3);

    const processed = await processPendingSources();

    expect(processed).toBe(2);
    expect(ingestMock).toHaveBeenCalledWith(1, "bir");
    expect(ingestMock).toHaveBeenCalledWith(2, "iki");
    expect(sqlCalls("DELETE FROM chunks")).toHaveLength(2);
    expect(sqlCalls("SET status = 'ready'")).toHaveLength(2);
    expect(clearCacheMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the first failure, leaves that source pending and does not throw", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM sources WHERE status = 'pending'")) {
        return [
          { id: 1, raw_text: "bir" },
          { id: 2, raw_text: "iki" },
        ];
      }
      return [];
    });
    ingestMock.mockRejectedValueOnce(new Error("network down"));

    const processed = await processPendingSources();

    expect(processed).toBe(0);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(sqlCalls("SET status = 'ready'")).toHaveLength(0);
    expect(clearCacheMock).not.toHaveBeenCalled();
  });

  it("does not run two passes at the same time", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM sources WHERE status = 'pending'")) {
        return [{ id: 1, raw_text: "bir" }];
      }
      return [];
    });
    ingestMock.mockImplementation(async () => {
      await gate;
      return 1;
    });

    const first = processPendingSources();
    const second = await processPendingSources();
    release();
    const firstResult = await first;

    expect(second).toBe(0);
    expect(firstResult).toBe(1);
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("marks a source failed when the provider rejects its content, and keeps going", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM sources WHERE status = 'pending'")) {
        return [
          { id: 1, raw_text: "bir" },
          { id: 2, raw_text: "iki" },
        ];
      }
      return [];
    });
    ingestMock
      .mockRejectedValueOnce(new ProviderError("too long", "input"))
      .mockResolvedValueOnce(1);

    const processed = await processPendingSources();

    expect(processed).toBe(1);
    const failedCall = sqlCalls("SET status = 'failed'")[0];
    expect(failedCall[1]).toEqual([1, "too long"]);
    expect(ingestMock).toHaveBeenCalledTimes(2);
  });

  it("leaves sources pending and stops when the provider is misconfigured", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM sources WHERE status = 'pending'")) {
        return [
          { id: 1, raw_text: "bir" },
          { id: 2, raw_text: "iki" },
        ];
      }
      return [];
    });
    ingestMock.mockRejectedValue(new ProviderError("bad key", "config"));

    const processed = await processPendingSources();

    expect(processed).toBe(0);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
  });
});
