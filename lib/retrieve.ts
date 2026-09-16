import { embed } from './groq'
import { query } from './db'

export async function retrieveChunks(
  question: string,
  k = 5
): Promise<{ id: number; sourceId: number; content: string }[]> {
  const [vector] = await embed([question])
  return query(
    `SELECT id, source_id AS "sourceId", content
     FROM chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k]
  )
}

export async function retrieveFeedback(
  question: string,
  k = 5
): Promise<{ id: number; note: string }[]> {
  const [vector] = await embed([question])
  return query(
    `SELECT id, note
     FROM feedback
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k]
  )
}
