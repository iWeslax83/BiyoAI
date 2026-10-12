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

const kickMock = vi.fn();
vi.mock("@/lib/pending", () => ({ kickPendingSources: () => kickMock() }));

import { POST } from "../../app/api/sources/[id]/retry/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = () =>
  new NextRequest("http://localhost/api/sources/4/retry", { method: "POST" });

describe("POST /api/sources/[id]/retry", () => {
  beforeEach(() => {
    isValidSessionMock.mockReset().mockReturnValue(true);
    queryMock.mockReset();
    kickMock.mockReset();
  });

  it("puts a failed source back in the queue and triggers processing", async () => {
    queryMock.mockResolvedValue([{ id: 4 }]);

    const res = await POST(request(), params("4"));

    expect(res.status).toBe(200);
    const [sql, args] = queryMock.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("status = 'failed'");
    expect(args).toEqual([4]);
    expect(kickMock).toHaveBeenCalled();
  });

  it("returns 404 when there is no failed source with that id", async () => {
    queryMock.mockResolvedValue([]);
    const res = await POST(request(), params("4"));
    expect(res.status).toBe(404);
    expect(kickMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    isValidSessionMock.mockReturnValue(false);
    const res = await POST(request(), params("4"));
    expect(res.status).toBe(401);
  });
});
