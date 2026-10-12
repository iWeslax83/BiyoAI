import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const isValidSessionMock = vi.fn<(token: string | undefined) => boolean>();
vi.mock("@/lib/auth", () => ({
  isValidSession: (token: string | undefined) => isValidSessionMock(token),
}));

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

const ingestMock = vi.fn<(id: number, text: string) => Promise<number>>();
vi.mock("@/lib/ingest", () => ({
  ingestSource: (id: number, text: string) => ingestMock(id, text),
}));

const clearCacheMock = vi.fn();
vi.mock("@/lib/cache", () => ({ clearCache: () => clearCacheMock() }));

import { GET, PATCH } from "../../app/api/sources/[id]/route";
import { ProviderError } from "../../lib/provider-error";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sources/4", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(): NextRequest {
  return new NextRequest("http://localhost/api/sources/4");
}

function sqlIncludes(fragment: string) {
  return queryMock.mock.calls.some(([sql]) => sql.includes(fragment));
}

describe("/api/sources/[id]", () => {
  beforeEach(() => {
    isValidSessionMock.mockReset().mockReturnValue(true);
    queryMock.mockReset();
    ingestMock.mockReset();
    clearCacheMock.mockReset();
  });

  it("GET returns the stored text so it can be edited", async () => {
    queryMock.mockResolvedValue([
      { id: 4, title: "Hücre", kind: "text", raw_text: "Hücre zarı" },
    ]);

    const res = await GET(getRequest(), params("4"));

    expect(res.status).toBe(200);
    expect((await res.json()).source.raw_text).toBe("Hücre zarı");
  });

  it("GET returns 404 for an unknown source", async () => {
    queryMock.mockResolvedValue([]);
    const res = await GET(getRequest(), params("99"));
    expect(res.status).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    isValidSessionMock.mockReturnValue(false);
    const res = await PATCH(patchRequest({ title: "x" }), params("4"));
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("PATCH with only a title renames without re-ingesting", async () => {
    queryMock.mockResolvedValue([{ id: 4 }]);

    const res = await PATCH(
      patchRequest({ title: "Yeni başlık" }),
      params("4"),
    );

    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
    expect(sqlIncludes("DELETE FROM chunks")).toBe(false);
    expect(clearCacheMock).toHaveBeenCalled();
  });

  it("PATCH with new text drops old chunks, re-ingests and marks ready", async () => {
    queryMock.mockResolvedValue([{ id: 4 }]);
    ingestMock.mockResolvedValue(2);

    const res = await PATCH(patchRequest({ text: "Yeni metin" }), params("4"));

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ready");
    expect(sqlIncludes("DELETE FROM chunks")).toBe(true);
    expect(ingestMock).toHaveBeenCalledWith(4, "Yeni metin");
    expect(sqlIncludes("SET status = 'ready'")).toBe(true);
  });

  it("PATCH keeps the source pending and answers 202 when re-ingest fails", async () => {
    queryMock.mockResolvedValue([{ id: 4 }]);
    ingestMock.mockRejectedValue(new Error("network down"));

    const res = await PATCH(patchRequest({ text: "Yeni metin" }), params("4"));

    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("pending");
    expect(sqlIncludes("SET status = 'ready'")).toBe(false);
  });

  it("PATCH marks the source failed and answers 422 when the provider rejects the text", async () => {
    queryMock.mockResolvedValue([{ id: 4 }]);
    ingestMock.mockRejectedValue(new ProviderError("too long", "input"));

    const res = await PATCH(patchRequest({ text: "Yeni metin" }), params("4"));

    expect(res.status).toBe(422);
    expect((await res.json()).status).toBe("failed");
    expect(sqlIncludes("SET status = 'failed'")).toBe(true);
  });

  it("PATCH returns 404 for an unknown source", async () => {
    queryMock.mockResolvedValue([]);
    const res = await PATCH(patchRequest({ title: "x" }), params("99"));
    expect(res.status).toBe(404);
  });

  it("PATCH returns 400 when neither title nor text is given", async () => {
    const res = await PATCH(patchRequest({}), params("4"));
    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 for a blank text", async () => {
    const res = await PATCH(patchRequest({ text: "   " }), params("4"));
    expect(res.status).toBe(400);
  });
});
