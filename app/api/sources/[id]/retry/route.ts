import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isValidSession } from "@/lib/auth";
import { kickPendingSources } from "@/lib/pending";

// Puts a failed source back in the queue (for example after the teacher fixed
// the provider settings) and starts processing right away.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Kaynak bulunamadı." }, { status: 404 });
  }

  const [source] = await query<{ id: number }>(
    "UPDATE sources SET status = 'pending', error = NULL WHERE id = $1 AND status = 'failed' RETURNING id",
    [id],
  );
  if (!source) {
    return NextResponse.json(
      { error: "Yeniden denenecek başarısız kaynak bulunamadı." },
      { status: 404 },
    );
  }
  kickPendingSources();
  return NextResponse.json({ id, status: "pending" });
}
