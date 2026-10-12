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

import { GET } from "../../app/api/qa-log/route";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 - i,
    question: `soru ${i}`,
    answer: "a",
    grounded: true,
    created_at: "2026-10-01T00:00:00Z",
  }));

const request = (search = "") =>
  new NextRequest(`http://localhost/api/qa-log${search}`);

describe("GET /api/qa-log", () => {
  beforeEach(() => {
    isValidSessionMock.mockReset().mockReturnValue(true);
    queryMock.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    isValidSessionMock.mockReturnValue(false);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns the newest 20 entries by default and says there are no more", async () => {
    queryMock.mockResolvedValue(rows(5));

    const res = await GET(request());
    const body = await res.json();

    expect(body.entries).toHaveLength(5);
    expect(body.hasMore).toBe(false);
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([null, null, 21]);
  });

  it("reports hasMore and trims the extra row used to detect it", async () => {
    queryMock.mockResolvedValue(rows(21));

    const body = await (await GET(request())).json();

    expect(body.entries).toHaveLength(20);
    expect(body.hasMore).toBe(true);
  });

  it("pages backwards from a given entry id", async () => {
    queryMock.mockResolvedValue([]);
    await GET(request("?before=81"));
    expect(queryMock.mock.calls[0][1]).toEqual([81, null, 21]);
  });

  it("searches questions and escapes LIKE wildcards", async () => {
    queryMock.mockResolvedValue([]);
    await GET(request("?q=" + encodeURIComponent("100%_mitoz")));
    expect(queryMock.mock.calls[0][1]).toEqual([null, "100\\%\\_mitoz", 21]);
  });

  it("caps the page size", async () => {
    queryMock.mockResolvedValue([]);
    await GET(request("?limit=500"));
    expect(queryMock.mock.calls[0][1]).toEqual([null, null, 51]);
  });

  it("ignores a non-numeric cursor", async () => {
    queryMock.mockResolvedValue([]);
    await GET(request("?before=abc"));
    expect(queryMock.mock.calls[0][1]).toEqual([null, null, 21]);
  });
});
