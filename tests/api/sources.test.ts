import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ isValidSession: () => true }));

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

const ingestMock = vi.fn<(id: number, text: string) => Promise<number>>();
vi.mock("@/lib/ingest", () => ({
  ingestSource: (id: number, text: string) => ingestMock(id, text),
}));

vi.mock("@/lib/pending", () => ({ kickPendingSources: vi.fn() }));

import { POST } from "../../app/api/sources/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sources (text)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    ingestMock.mockReset();
    queryMock.mockImplementation(async (sql) =>
      sql.includes("INSERT INTO sources") ? [{ id: 9 }] : [],
    );
  });

  it("stores and ingests the source, then marks it ready", async () => {
    ingestMock.mockResolvedValue(4);

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 9, chunkCount: 4, status: "ready" });
    expect(
      queryMock.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'ready'"),
      ),
    ).toBe(true);
  });

  it("keeps the source as pending and answers 202 when ingest fails", async () => {
    ingestMock.mockRejectedValue(new Error("network down"));

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.id).toBe(9);
    expect(body.message).toContain("otomatik");
    expect(
      queryMock.mock.calls.some(([sql]) => sql.includes("DELETE FROM sources")),
    ).toBe(false);
  });

  it("returns 400 when a required field is missing", async () => {
    const res = await POST(makeRequest({ title: "Hücre", kind: "text" }));
    expect(res.status).toBe(400);
  });
});
