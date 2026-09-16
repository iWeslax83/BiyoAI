import { describe, it, expect, beforeAll, vi } from 'vitest'
import { query } from '../../lib/db'

vi.mock('../../lib/groq', () => ({
  embed: vi.fn(async (texts: string[]) =>
    texts.map(() => {
      const v = new Array(768).fill(0)
      v[0] = 1
      return v
    })
  ),
}))

import { retrieveChunks, retrieveFeedback } from '../../lib/retrieve'

beforeAll(async () => {
  await query('DELETE FROM feedback')
  await query('DELETE FROM chunks')
  await query('DELETE FROM qa_log')
  await query('DELETE FROM sources')

  const [source] = await query<{ id: number }>(
    `INSERT INTO sources (title, kind, raw_text) VALUES ('Test Kaynak', 'text', 'x') RETURNING id`
  )
  const embedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)))
  await query(
    `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
    [source.id, 'Fotosentez ışık enerjisini kimyasal enerjiye çevirir.', embedding]
  )

  const [qa] = await query<{ id: number }>(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ('q', 'a', true, '{}') RETURNING id`
  )
  const feedbackEmbedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Fotosentez anlatırken klorofili de belirt', feedbackEmbedding]
  )
})

describe('retrieve', () => {
  it('retrieveChunks returns the closest chunk for a matching question', async () => {
    const results = await retrieveChunks('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('Fotosentez')
  })

  it('retrieveFeedback returns the closest feedback note', async () => {
    const results = await retrieveFeedback('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].note).toContain('klorofil')
  })
})
