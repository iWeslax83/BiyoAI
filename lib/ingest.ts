import { splitIntoChunks } from './chunk'
import { embed } from './groq'
import { query } from './db'

export async function ingestSource(sourceId: number, text: string): Promise<number> {
  const chunks = splitIntoChunks(text)
  if (chunks.length === 0) return 0

  const vectors = await embed(chunks)

  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
      [sourceId, chunks[i], JSON.stringify(vectors[i])]
    )
  }

  return chunks.length
}
