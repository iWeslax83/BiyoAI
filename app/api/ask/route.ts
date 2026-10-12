import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { withRateLimitQueue } from "@/lib/queue";
import { isInappropriate } from "@/lib/content-filter";
import { createRateLimiter } from "@/lib/rate-limit";

// Per-client cap so one device can't burn the shared Groq quota. The board
// is a single device; 30 questions a minute is far above real classroom use.
const askLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const limit = askLimiter.check(clientKey(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Şu anda çok fazla soru geldi, lütfen biraz bekle." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question zorunlu" }, { status: 400 });
  }

  if (isInappropriate(question)) {
    return NextResponse.json(
      {
        error: "Bu soru uygun değil. Lütfen biyoloji ile ilgili bir soru sor.",
      },
      { status: 400 },
    );
  }

  const cached = getCachedAnswer(question);
  if (cached) return NextResponse.json(cached);

  try {
    const result = await withRateLimitQueue(() => answerQuestion(question));
    setCachedAnswer(question, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("ask: answerQuestion failed", err);
    return NextResponse.json(
      { error: "Sistem şu anda yoğun, lütfen birazdan tekrar deneyin." },
      { status: 503 },
    );
  }
}
