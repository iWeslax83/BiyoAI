import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, isValidSession, verifyPassword } from "@/lib/auth";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

const MIN_LENGTH = 8;

// A stolen session cookie must not allow unlimited guessing of the current
// password, so attempts are limited like login.
const passwordLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const attempt = passwordLimiter.check(clientKey(req));
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "Çok fazla deneme yapıldı, lütfen biraz bekle." },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSeconds) },
      },
    );
  }

  let body: { current?: unknown; next?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";

  if (!current || !next) {
    return NextResponse.json(
      { error: "Mevcut ve yeni şifre zorunlu." },
      { status: 400 },
    );
  }
  if (next.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `Yeni şifre en az ${MIN_LENGTH} karakter olmalı.` },
      { status: 400 },
    );
  }

  const [teacher] = await query<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM teacher ORDER BY id LIMIT 1",
  );
  if (!teacher || !(await verifyPassword(current, teacher.password_hash))) {
    return NextResponse.json(
      { error: "Mevcut şifre hatalı." },
      { status: 403 },
    );
  }

  await query("UPDATE teacher SET password_hash = $1 WHERE id = $2", [
    await hashPassword(next),
    teacher.id,
  ]);
  return NextResponse.json({ ok: true });
}
