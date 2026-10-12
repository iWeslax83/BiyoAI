import { splitIntoChunks } from "./chunk";
import { embed } from "./groq";
import { query } from "./db";

// Groq's embeddings endpoint takes a list of inputs; a long PDF can produce
// hundreds of chunks, so send them in small batches instead of one huge call.
const EMBED_BATCH_SIZE = 32;

export async function ingestSource(
  sourceId: number,
  text: string,
): Promise<number> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return 0;

  // Embed everything before inserting anything, so a failure never leaves a
  // half-ingested source behind.
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    vectors.push(...(await embed(chunks.slice(i, i + EMBED_BATCH_SIZE))));
  }

  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
      [sourceId, chunks[i], JSON.stringify(vectors[i])],
    );
  }

  return chunks.length;
}
