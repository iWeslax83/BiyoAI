import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const [teacher] = await query<{ password_hash: string }>(
    "SELECT password_hash FROM teacher ORDER BY id LIMIT 1",
  );
  if (!teacher || !(await verifyPassword(password, teacher.password_hash))) {
    return NextResponse.json({ error: "Hatalı şifre" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", createSessionCookie(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
