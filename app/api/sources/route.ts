import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ingestSource } from "@/lib/ingest";
import { isValidSession } from "@/lib/auth";
import { clearCache } from "@/lib/cache";
import { kickPendingSources } from "@/lib/pending";
import { LinkError, fetchLinkText } from "@/lib/fetch-link";
import { extractPdfText } from "@/lib/pdf";
import { recordIngestFailure } from "@/lib/source-status";
import { getProviderStatus } from "@/lib/provider-status";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

type NewSource = { title: string; kind: "text" | "pdf" | "link"; text: string };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function readPdfSource(
  req: NextRequest,
): Promise<NewSource | NextResponse> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail("PDF dosyası seçilmedi.", 400);
  }
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return fail("Sadece PDF dosyası yüklenebilir.", 400);
  }
  if (file.size > MAX_PDF_BYTES) {
    return fail("PDF çok büyük (en fazla 10 MB).", 413);
  }

  let text: string;
  try {
    text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    console.error("sources: pdf parse failed", err);
    return fail("PDF okunamadı. Dosya bozuk olabilir.", 400);
  }
  if (!text) {
    return fail(
      "PDF'de okunabilir metin yok. Taranmış (görüntü) bir PDF olabilir; metni yapıştırmayı dene.",
      422,
    );
  }
  const title = String(form.get("title") ?? "").trim() || file.name;
  return { title, kind: "pdf", text };
}

async function readJsonSource(
  req: NextRequest,
): Promise<NewSource | NextResponse> {
  let body: { title?: unknown; kind?: unknown; text?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Geçersiz istek.", 400);
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (body.kind === "link") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return fail("Bağlantı adresi zorunlu.", 400);
    try {
      const page = await fetchLinkText(url);
      return {
        title: title || page.title || url,
        kind: "link",
        text: page.text,
      };
    } catch (err) {
      if (err instanceof LinkError) return fail(err.message, 400);
      console.error("sources: link fetch failed", err);
      return fail("Sayfa alınamadı. Daha sonra tekrar dene.", 502);
    }
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!title || body.kind !== "text" || !text.trim()) {
    return fail("title, kind ve text zorunlu", 400);
  }
  return { title, kind: "text", text };
}

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  kickPendingSources();
  const sources = await query(
    "SELECT id, title, kind, status, error, created_at FROM sources ORDER BY created_at DESC",
  );
  return NextResponse.json({ sources, provider: getProviderStatus() });
}

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const isUpload = (req.headers.get("content-type") ?? "").includes(
    "multipart/form-data",
  );
  const parsed = isUpload
    ? await readPdfSource(req)
    : await readJsonSource(req);
  if (parsed instanceof NextResponse) return parsed;
  const { title, kind, text } = parsed;

  const [source] = await query<{ id: number }>(
    "INSERT INTO sources (title, kind, raw_text, status) VALUES ($1, $2, $3, 'pending') RETURNING id",
    [title, kind, text],
  );

  try {
    const chunkCount = await ingestSource(source.id, text);
    await query(
      "UPDATE sources SET status = 'ready', error = NULL WHERE id = $1",
      [source.id],
    );
    clearCache();
    return NextResponse.json({ id: source.id, chunkCount, status: "ready" });
  } catch (err) {
    console.error("sources: ingest failed", err);
    const outcome = await recordIngestFailure(source.id, err);
    if (outcome.status === "failed") {
      return NextResponse.json(
        { id: source.id, status: "failed", error: outcome.message },
        { status: 422 },
      );
    }
    // Provider unreachable or misconfigured. Keep the source as 'pending': it
    // is retried automatically (lib/pending.ts) once things work again,
    // instead of making the teacher paste it again.
    return NextResponse.json(
      {
        id: source.id,
        status: "pending",
        message: outcome.configProblem
          ? "Kaynak kaydedildi ama yapay zeka servisi ayarı geçersiz görünüyor. Ayar düzeltilince otomatik işlenecek."
          : "Kaynak kaydedildi ama şu an işlenemedi (internet bağlantısı olmayabilir). Bağlantı gelince otomatik işlenecek.",
      },
      { status: 202 },
    );
  }
}
