import { query } from "./db";

// Cosine-distance cutoff for retrieveChunks: rows farther than this from the
// question's embedding are treated as irrelevant and dropped, so a
// completely off-topic question deterministically reaches
// buildSystemPrompt's "no source found" branch instead of getting the
// nearest-but-still-unrelated chunks stuffed into the prompt. This is a
// reasonable starting point, not an empirically tuned value - revisit once
// there's real course material to calibrate against.
const CHUNK_DISTANCE_THRESHOLD = 0.6;

export async function retrieveChunks(
  vector: number[],
  k = 5,
): Promise<{ id: number; sourceId: number; content: string }[]> {
  return query(
    `SELECT c.id, c.source_id AS "sourceId", c.content
     FROM chunks c
     JOIN sources s ON s.id = c.source_id AND s.status = 'ready'
     WHERE c.embedding <=> $1 < $3
     ORDER BY c.embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k, CHUNK_DISTANCE_THRESHOLD],
  );
}

// Same cutoff as chunks: a teacher note about an unrelated topic must not be
// injected into the prompt just because it was among the k nearest.
const FEEDBACK_DISTANCE_THRESHOLD = 0.6;

// Picks the k most similar notes, then returns them newest first so that, when
// notes contradict each other, the most recent one wins (see buildSystemPrompt).
export async function retrieveFeedback(
  vector: number[],
  k = 5,
): Promise<{ id: number; note: string }[]> {
  return query(
    `SELECT id, note
     FROM (
       SELECT id, note, created_at
       FROM feedback
       WHERE embedding <=> $1 < $3
       ORDER BY embedding <=> $1
       LIMIT $2
     ) nearest
     ORDER BY created_at DESC, id DESC`,
    [JSON.stringify(vector), k, FEEDBACK_DISTANCE_THRESHOLD],
  );
}
