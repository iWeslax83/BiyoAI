import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  query: async () => [{ password_hash: "hash" }],
}));

const verifyPasswordMock = vi.fn<(p: string, h: string) => Promise<boolean>>();
vi.mock("@/lib/auth", () => ({
  verifyPassword: (p: string, h: string) => verifyPasswordMock(p, h),
  createSessionCookie: () => "signed-session",
}));

import { POST } from "../../app/api/auth/login/route";

function loginRequest(password: string, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    verifyPasswordMock.mockReset().mockResolvedValue(false);
  });

  it("returns 401 for a wrong password", async () => {
    const res = await POST(loginRequest("yanlis", "10.2.0.1"));
    expect(res.status).toBe(401);
  });

  it("sets a session cookie for the right password", async () => {
    verifyPasswordMock.mockResolvedValue(true);
    const res = await POST(loginRequest("dogru", "10.2.0.2"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("session")?.value).toBe("signed-session");
  });

  it("blocks a client after 10 attempts in a minute, even with the right password", async () => {
    const ip = "10.2.0.3";
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest("yanlis", ip));
      expect(res.status).toBe(401);
    }

    verifyPasswordMock.mockClear();
    verifyPasswordMock.mockResolvedValue(true);
    const blocked = await POST(loginRequest("dogru", ip));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(verifyPasswordMock).not.toHaveBeenCalled();

    verifyPasswordMock.mockResolvedValue(false);
    const otherClient = await POST(loginRequest("yanlis", "10.2.0.4"));
    expect(otherClient.status).toBe(401);
  });
});
