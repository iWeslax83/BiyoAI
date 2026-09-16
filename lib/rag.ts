import { retrieveChunks, retrieveFeedback } from './retrieve'
import { chatComplete } from './groq'
import { buildSystemPrompt } from './prompt'
import { query } from './db'

export type RagAnswer = { answer: string; grounded: boolean; sourceIds: number[] }

export async function answerQuestion(question: string): Promise<RagAnswer> {
  const [chunks, feedback] = await Promise.all([
    retrieveChunks(question, 5),
    retrieveFeedback(question, 5),
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

  return { answer, grounded, sourceIds: validatedIds }
}
