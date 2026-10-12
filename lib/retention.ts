import { query } from "./db";

// Students type free text into the question box, so a stored question can
// contain a name or other personal detail. Keeping the log forever turns a
// convenience (the teacher reviews recent questions) into a growing pile of
// personal data. Old questions are deleted; teacher notes are kept (the link
// from a note to its question is cleared, see lib/schema.sql).

const DEFAULT_RETENTION_DAYS = 90;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastRun: number | null = null;

// QA_LOG_RETENTION_DAYS: days to keep questions. 0 keeps everything.
export function retentionDays(): number {
  const raw = process.env.QA_LOG_RETENTION_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 0 ? days : DEFAULT_RETENTION_DAYS;
}

export function resetRetentionThrottle(): void {
  lastRun = null;
}

// Deletes questions older than the retention period, at most once a day.
// Returns how many were deleted. Never throws.
export async function purgeOldQaLogs(
  now: number = Date.now(),
): Promise<number> {
  const days = retentionDays();
  if (days === 0) return 0;
  if (lastRun !== null && now - lastRun < RUN_INTERVAL_MS) return 0;
  lastRun = now;

  try {
    const rows = await query<{ id: number }>(
      "DELETE FROM qa_log WHERE created_at < now() - make_interval(days => $1) RETURNING id",
      [days],
    );
    return rows.length;
  } catch (err) {
    console.error("retention: could not purge old questions", err);
    lastRun = null;
    return 0;
  }
}

// Fire-and-forget trigger for request handlers (the health check polls often
// enough to make this a daily job without a separate scheduler).
export function kickRetention(): void {
  void purgeOldQaLogs();
}
