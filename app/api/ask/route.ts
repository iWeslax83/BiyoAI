import { NextRequest, NextResponse } from "next/server";
import { answerQuestion, type Exchange } from "@/lib/rag";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { withRateLimitQueue } from "@/lib/queue";
import { isInappropriate } from "@/lib/content-filter";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

// Per-client cap so one device can't burn the shared Groq quota. The board
// is a single device; 30 questions a minute is far above real classroom use.
const askLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const MAX_HISTORY = 2;
const MAX_TURN_CHARS = 2000;

// The conversation lives in the browser, so treat it as untrusted: keep only
// well-formed, size-limited exchanges and only the most recent ones.
function sanitizeHistory(raw: unknown): Exchange[] {
  if (!Array.isArray(raw)) return [];
  const turns: Exchange[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item.question === "string" &&
      typeof item.answer === "string" &&
      item.question.trim() &&
      item.answer.trim()
    ) {
      turns.push({
        question: item.question.slice(0, MAX_TURN_CHARS),
        answer: item.answer.slice(0, MAX_TURN_CHARS),
      });
    }
  }
  return turns.slice(-MAX_HISTORY);
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

  const { question, history: rawHistory } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question zorunlu" }, { status: 400 });
  }

  const history = sanitizeHistory(rawHistory);

  if (
    isInappropriate(question) ||
    history.some((turn) => isInappropriate(turn.question))
  ) {
    return NextResponse.json(
      {
        error: "Bu soru uygun değil. Lütfen biyoloji ile ilgili bir soru sor.",
      },
      { status: 400 },
    );
  }

  // Answers to follow-ups depend on the conversation, so only standalone
  // questions are cached.
  const cacheable = history.length === 0;
  const cached = cacheable ? getCachedAnswer(question) : undefined;
  if (cached) return NextResponse.json(cached);

  try {
    const result = await withRateLimitQueue(() =>
      answerQuestion(question, history.length > 0 ? { history } : undefined),
    );
    if (cacheable) setCachedAnswer(question, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("ask: answerQuestion failed", err);
    return NextResponse.json(
      { error: "Sistem şu anda yoğun, lütfen birazdan tekrar deneyin." },
      { status: 503 },
    );
  }
}
