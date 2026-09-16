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

  // Decoy chunk: one-hot at a different index, so it is far in cosine distance
  // from the mocked query embedding (one-hot at index 0). This proves the
  // ORDER BY embedding <=> $1 clause is actually doing the ranking.
  const decoyChunkEmbedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 5 ? 1 : 0)))
  await query(
    `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
    [source.id, 'Mitokondri hücrenin enerji santralidir.', decoyChunkEmbedding]
  )

  const [qa] = await query<{ id: number }>(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ('q', 'a', true, '{}') RETURNING id`
  )
  const feedbackEmbedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Fotosentez anlatırken klorofili de belirt', feedbackEmbedding]
  )

  // Decoy feedback: one-hot at a different index than the matching row.
  const decoyFeedbackEmbedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 5 ? 1 : 0)))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Mitokondri konusunda örnek şema ekle', decoyFeedbackEmbedding]
  )
})

describe('retrieve', () => {
  it('retrieveChunks returns the closest chunk for a matching question', async () => {
    const results = await retrieveChunks('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('Fotosentez')
    expect(results[0].content).not.toContain('Mitokondri')

    // With k=1, only the truly closest row (the matching one-hot-at-0
    // embedding) should come back - the decoy must be ranked out entirely.
    const top1 = await retrieveChunks('fotosentez nedir', 1)
    expect(top1.length).toBe(1)
    expect(top1[0].content).toContain('Fotosentez')
  })

  it('retrieveFeedback returns the closest feedback note', async () => {
    const results = await retrieveFeedback('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].note).toContain('klorofil')
    expect(results[0].note).not.toContain('şema')

    // With k=1, only the truly closest row should come back.
    const top1 = await retrieveFeedback('fotosentez nedir', 1)
    expect(top1.length).toBe(1)
    expect(top1[0].note).toContain('klorofil')
  })
})
