import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hasGroqConfig } from "@/lib/groq";
import { hasEmbeddingConfig } from "@/lib/embeddings";
import { kickPendingSources } from "@/lib/pending";
import { kickRetention } from "@/lib/retention";

export async function GET() {
  // Groq config presence is a non-fatal, informational field: just checking
  // the env vars are set (no live API call, that would be slow and burn
  // quota on every health check poll).
  const groq = hasGroqConfig();
  const embeddings = hasEmbeddingConfig();
  try {
    await query("SELECT 1");
    // The healthcheck cron polls this endpoint, which makes it a natural
    // heartbeat for retrying sources that were saved while offline.
    if (embeddings) kickPendingSources();
    kickRetention();
    return NextResponse.json({ ok: true, db: true, groq, embeddings });
  } catch {
    return NextResponse.json(
      { ok: false, db: false, groq, embeddings },
      { status: 503 },
    );
  }
}
