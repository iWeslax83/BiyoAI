import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isValidSession } from "@/lib/auth";
import { clearCache } from "@/lib/cache";
import { ingestSource } from "@/lib/ingest";

type Context = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function notFound() {
  return NextResponse.json({ error: "Kaynak bulunamadı." }, { status: 404 });
}

async function sourceId(context: Context): Promise<number | null> {
  const id = Number((await context.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, context: Context) {
  if (!isValidSession(req.cookies.get("session")?.value)) return unauthorized();
  const id = await sourceId(context);
  if (id === null) return notFound();

  const [source] = await query(
    "SELECT id, title, kind, status, raw_text FROM sources WHERE id = $1",
    [id],
  );
  if (!source) return notFound();
  return NextResponse.json({ source });
}

export async function PATCH(req: NextRequest, context: Context) {
  if (!isValidSession(req.cookies.get("session")?.value)) return unauthorized();
  const id = await sourceId(context);
  if (id === null) return notFound();

  let body: { title?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text : null;

  if (text !== null && !text.trim()) {
    return NextResponse.json(
      { error: "Kaynak metni boş olamaz." },
      { status: 400 },
    );
  }
  if (!title && text === null) {
    return NextResponse.json(
      { error: "title veya text göndermelisin." },
      { status: 400 },
    );
  }

  // Rename only: the stored chunks are still valid.
  if (text === null) {
    const [renamed] = await query<{ id: number }>(
      "UPDATE sources SET title = $2 WHERE id = $1 RETURNING id",
      [id, title],
    );
    if (!renamed) return notFound();
    clearCache();
    return NextResponse.json({ id, status: "ready" });
  }

  // New text: the old chunks no longer describe the source, so drop them and
  // re-ingest. The row is 'pending' until ingest succeeds, which also keeps
  // it out of retrieval and lets lib/pending.ts retry if Groq is unreachable.
  const [updated] = await query<{ id: number }>(
    `UPDATE sources
     SET title = COALESCE(NULLIF($2, ''), title), raw_text = $3, status = 'pending'
     WHERE id = $1
     RETURNING id`,
    [id, title, text],
  );
  if (!updated) return notFound();
  await query("DELETE FROM chunks WHERE source_id = $1", [id]);
  clearCache();

  try {
    const chunkCount = await ingestSource(id, text);
    await query("UPDATE sources SET status = 'ready' WHERE id = $1", [id]);
    clearCache();
    return NextResponse.json({ id, chunkCount, status: "ready" });
  } catch (err) {
    console.error("sources: re-ingest failed", err);
    return NextResponse.json(
      {
        id,
        status: "pending",
        message:
          "Değişiklik kaydedildi ama şu an işlenemedi (internet bağlantısı olmayabilir). Bağlantı gelince otomatik işlenecek.",
      },
      { status: 202 },
    );
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  if (!isValidSession(req.cookies.get("session")?.value)) return unauthorized();
  const id = await sourceId(context);
  if (id === null) return notFound();

  await query("DELETE FROM sources WHERE id = $1", [id]);
  clearCache();
  return NextResponse.json({ ok: true });
}
