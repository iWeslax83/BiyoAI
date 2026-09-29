import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionCookie } from "../../lib/auth";
import { POST } from "../../app/api/restart/route";

function makeRequest(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/restart", {
    method: "POST",
    headers: cookie ? { cookie: `session=${cookie}` } : {},
  });
}

describe("POST /api/restart", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
  });

  it("returns 401 when there is no session cookie", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when the session cookie is tampered with", async () => {
    const res = await POST(makeRequest("garbage.value"));

    expect(res.status).toBe(401);
  });

  it("returns 200 and schedules a process exit for a valid session, without killing the process immediately", async () => {
    vi.useFakeTimers();
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    try {
      const cookie = createSessionCookie();
      const res = await POST(makeRequest(cookie));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toContain("yeniden başlatılıyor");
      expect(exitSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
