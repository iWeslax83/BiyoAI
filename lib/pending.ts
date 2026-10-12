import { query } from "./db";
import { ingestSource } from "./ingest";
import { clearCache } from "./cache";

let running = false;

// Re-processes sources that were saved while Groq was unreachable (status
// 'pending'). Stops at the first failure: if one embed call fails the network
// is almost certainly still down, so retrying the rest would just burn time.
// Returns how many sources became ready. Never throws.
export async function processPendingSources(): Promise<number> {
  if (running) return 0;
  running = true;
  let processed = 0;
  try {
    const pending = await query<{ id: number; raw_text: string }>(
      "SELECT id, raw_text FROM sources WHERE status = 'pending' ORDER BY id",
    );
    for (const source of pending) {
      try {
        // A previous attempt may have inserted some chunks before failing.
        await query("DELETE FROM chunks WHERE source_id = $1", [source.id]);
        await ingestSource(source.id, source.raw_text);
        await query("UPDATE sources SET status = 'ready' WHERE id = $1", [
          source.id,
        ]);
        processed++;
      } catch (err) {
        console.error("pending: ingest still failing", source.id, err);
        break;
      }
    }
  } catch (err) {
    console.error("pending: could not list pending sources", err);
  } finally {
    running = false;
  }
  if (processed > 0) clearCache();
  return processed;
}

// Fire-and-forget trigger used by request handlers (health check, teacher
// panel) so pending sources get retried without a separate worker process.
export function kickPendingSources(): void {
  void processPendingSources();
}
