import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ingestSource } from "@/lib/ingest";
import { isValidSession } from "@/lib/auth";
import { clearCache } from "@/lib/cache";
import { kickPendingSources } from "@/lib/pending";

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  kickPendingSources();
  const sources = await query(
    "SELECT id, title, kind, status, created_at FROM sources ORDER BY created_at DESC",
  );
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { title, kind, text } = await req.json();
  if (!title || !kind || !text) {
    return NextResponse.json(
      { error: "title, kind ve text zorunlu" },
      { status: 400 },
    );
  }
  const [source] = await query<{ id: number }>(
    "INSERT INTO sources (title, kind, raw_text, status) VALUES ($1, $2, $3, 'pending') RETURNING id",
    [title, kind, text],
  );

  try {
    const chunkCount = await ingestSource(source.id, text);
    await query("UPDATE sources SET status = 'ready' WHERE id = $1", [
      source.id,
    ]);
    clearCache();
    return NextResponse.json({ id: source.id, chunkCount, status: "ready" });
  } catch (err) {
    console.error("sources: ingest failed", err);
    // Groq unreachable (network down, bad key, rate limit). Keep the source
    // as 'pending': it is retried automatically (lib/pending.ts) once the
    // connection is back, instead of making the teacher paste it again.
    return NextResponse.json(
      {
        id: source.id,
        status: "pending",
        message:
          "Kaynak kaydedildi ama şu an işlenemedi (internet bağlantısı olmayabilir). Bağlantı gelince otomatik işlenecek.",
      },
      { status: 202 },
    );
  }
}
