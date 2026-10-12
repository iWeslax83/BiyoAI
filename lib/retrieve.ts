import { query } from "./db";

// Cosine-distance cutoff: rows farther than this from the question's
// embedding are treated as irrelevant and dropped, so an off-topic question
// reaches buildSystemPrompt's "no source found" branch instead of getting the
// nearest-but-unrelated text stuffed into the prompt.
//
// The right value depends on the embedding model, because models differ in
// how tightly they pack scores. Measured with the shipped model
// (multilingual-e5-base) on a handful of biology passages: on-topic questions
// landed at distance 0.11 to 0.21, off-topic ones at 0.23 to 0.27. That gap is
// narrow and the sample tiny, so treat 0.22 as a starting point and calibrate
// with real material (npm run eval). RETRIEVAL_MAX_DISTANCE overrides it.
const DEFAULT_MAX_DISTANCE = 0.22;

function maxDistance(): number {
  const configured = Number(process.env.RETRIEVAL_MAX_DISTANCE);
  return process.env.RETRIEVAL_MAX_DISTANCE &&
    Number.isFinite(configured) &&
    configured > 0
    ? configured
    : DEFAULT_MAX_DISTANCE;
}

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
    [JSON.stringify(vector), k, maxDistance()],
  );
}

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
    [JSON.stringify(vector), k, maxDistance()],
  );
}
