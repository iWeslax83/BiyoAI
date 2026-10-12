import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const isValidSessionMock = vi.fn<(token: string | undefined) => boolean>();
const verifyPasswordMock = vi.fn<(p: string, h: string) => Promise<boolean>>();
vi.mock("@/lib/auth", () => ({
  isValidSession: (token: string | undefined) => isValidSessionMock(token),
  verifyPassword: (p: string, h: string) => verifyPasswordMock(p, h),
  hashPassword: async (p: string) => `hashed:${p}`,
}));

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

import { POST } from "../../app/api/auth/password/route";

function request(body: unknown, ip = "10.7.0.1"): NextRequest {
  return new NextRequest("http://localhost/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/password", () => {
  beforeEach(() => {
    isValidSessionMock.mockReset().mockReturnValue(true);
    verifyPasswordMock.mockReset().mockResolvedValue(true);
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql) =>
      sql.startsWith("SELECT") ? [{ id: 1, password_hash: "old-hash" }] : [],
    );
  });

  it("rejects unauthenticated requests", async () => {
    isValidSessionMock.mockReturnValue(false);
    const res = await POST(request({ current: "a", next: "yeni-sifre-1" }));
    expect(res.status).toBe(401);
  });

  it("changes the password when the current one is right", async () => {
    const res = await POST(
      request({ current: "eski-sifre", next: "yeni-sifre-1" }),
    );

    expect(res.status).toBe(200);
    expect(verifyPasswordMock).toHaveBeenCalledWith("eski-sifre", "old-hash");
    const update = queryMock.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE teacher"),
    );
    expect(update?.[1]).toEqual(["hashed:yeni-sifre-1", 1]);
  });

  it("refuses when the current password is wrong", async () => {
    verifyPasswordMock.mockResolvedValue(false);

    const res = await POST(
      request({ current: "yanlis", next: "yeni-sifre-1" }),
    );

    expect(res.status).toBe(403);
    expect(
      queryMock.mock.calls.some(([sql]) => sql.startsWith("UPDATE teacher")),
    ).toBe(false);
  });

  it("refuses a new password shorter than 8 characters", async () => {
    const res = await POST(request({ current: "eski", next: "kisa" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("8");
  });

  it("refuses when either field is missing", async () => {
    const res = await POST(request({ next: "yeni-sifre-1" }));
    expect(res.status).toBe(400);
  });

  it("limits repeated attempts from one client", async () => {
    verifyPasswordMock.mockResolvedValue(false);
    const ip = "10.7.0.9";
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        request({ current: "yanlis", next: "yeni-sifre-1" }, ip),
      );
      expect(res.status).toBe(403);
    }
    const blocked = await POST(
      request({ current: "yanlis", next: "yeni-sifre-1" }, ip),
    );
    expect(blocked.status).toBe(429);
  });
});
