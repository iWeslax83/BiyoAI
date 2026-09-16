import { retrieveChunks, retrieveFeedback } from './retrieve'
import { chatComplete, embed } from './groq'
import { buildSystemPrompt } from './prompt'
import { query } from './db'

export type RagAnswer = {
  answer: string
  grounded: boolean
  sourceIds: number[]
  sourceTitles: string[]
}

export async function answerQuestion(question: string): Promise<RagAnswer> {
  // Embed the question once and reuse the vector for both retrieval calls,
  // instead of each independently calling Groq's embeddings endpoint for the
  // identical text (2x the calls, latency, and rate-limit consumption).
  const [vector] = await embed([question])
  const [chunks, feedback] = await Promise.all([
    retrieveChunks(vector, 5),
    retrieveFeedback(vector, 5),
  ])

  const systemPrompt = buildSystemPrompt(chunks, feedback)
  const answer = await chatComplete([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ])

  const citedIds = Array.from(new Set(
    Array.from(answer.matchAll(/\[kaynak:(\d+)\]/g)).map((m) => Number(m[1]))
  ))

  const retrievedSourceIds = new Set(chunks.map((c) => c.sourceId))
  const validatedIds = citedIds.filter((id) => retrievedSourceIds.has(id))
  const grounded = validatedIds.length > 0

  await query(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ($1, $2, $3, $4)`,
    [question, answer, grounded, validatedIds]
  )

  const sourceTitles =
    validatedIds.length > 0
      ? (
          await query<{ title: string }>('SELECT title FROM sources WHERE id = ANY($1)', [
            validatedIds,
          ])
        ).map((s) => s.title)
      : []

  return { answer, grounded, sourceIds: validatedIds, sourceTitles }
}
