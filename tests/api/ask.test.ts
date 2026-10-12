import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const answerQuestionMock = vi.fn(async (q: string) => ({
  answer: `cevap: ${q}`,
  grounded: true,
  sourceIds: [1],
}));
vi.mock("@/lib/rag", () => ({
  answerQuestion: (q: string) => answerQuestionMock(q),
}));

import { POST } from "../../app/api/ask/route";

function makeRequest(body: unknown, ip?: string): NextRequest {
  return new NextRequest("http://localhost/api/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ask", () => {
  beforeEach(() => {
    answerQuestionMock.mockClear();
  });

  it("returns 200 with the answer, hitting the cache on a repeat question", async () => {
    const question = "Mitoz nedir? (happy path testi)";

    const first = await POST(makeRequest({ question }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.answer).toContain(question);

    const second = await POST(makeRequest({ question }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);

    expect(answerQuestionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when question is missing from the request body", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when question is an empty string", async () => {
    const res = await POST(makeRequest({ question: "" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });

  it("returns 400 without calling the model when the question is inappropriate", async () => {
    const res = await POST(makeRequest({ question: "siktir git aptal" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("uygun değil");
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once one client exceeds the per-minute limit", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 30; i++) {
      const ok = await POST(
        makeRequest({ question: `Hız sınırı sorusu ${i}` }, ip),
      );
      expect(ok.status).toBe(200);
    }

    const blocked = await POST(
      makeRequest({ question: "Hız sınırı sorusu 31" }, ip),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const body = await blocked.json();
    expect(body.error).toContain("çok fazla");

    // A different client is not affected.
    const other = await POST(
      makeRequest({ question: "Başka cihaz sorusu" }, "10.1.1.1"),
    );
    expect(other.status).toBe(200);
  });

  it("returns 503 with a Turkish busy message when answerQuestion fails", async () => {
    answerQuestionMock.mockRejectedValueOnce(new Error("groq unavailable"));
    const question = "Bu soru 503 hatasina dusecek";

    const res = await POST(makeRequest({ question }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Sistem şu anda yoğun");
  });
});
