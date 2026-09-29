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
    `SELECT id, source_id AS "sourceId", content
     FROM chunks
     WHERE embedding <=> $1 < $3
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k, CHUNK_DISTANCE_THRESHOLD],
  );
}

export async function retrieveFeedback(
  vector: number[],
  k = 5,
): Promise<{ id: number; note: string }[]> {
  return query(
    `SELECT id, note
     FROM feedback
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k],
  );
}
