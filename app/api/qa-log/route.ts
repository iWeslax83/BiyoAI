import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isValidSession } from "@/lib/auth";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// Newest first. `before` is the id of the last entry already shown, `q`
// filters by question text. One extra row is fetched to know if more exist.
export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get("session")?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const before = Number(params.get("before"));
  const cursor = Number.isInteger(before) && before > 0 ? before : null;
  const search = params.get("q")?.trim() ?? "";
  const requested = Number(params.get("limit"));
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rows = await query(
    `SELECT id, question, answer, grounded, created_at
     FROM qa_log
     WHERE ($1::int IS NULL OR id < $1)
       AND ($2::text IS NULL OR question ILIKE '%' || $2 || '%')
     ORDER BY id DESC
     LIMIT $3`,
    [cursor, search ? escapeLike(search) : null, limit + 1],
  );

  return NextResponse.json({
    entries: rows.slice(0, limit),
    hasMore: rows.length > limit,
  });
}
