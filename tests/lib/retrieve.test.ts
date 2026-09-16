import { describe, it, expect, beforeAll } from 'vitest'

// Safety: the beforeAll below performs destructive DELETEs to set up a known
// fixture. Never let this run against a real/production database. Set
// TEST_DATABASE_URL (see .env.example) - or DATABASE_URL, if that's what
// tests are invoked with - to a database whose name contains "test", e.g.
// postgres://user:pass@host:5432/biyoai_test.
//
// Note: lib/db.ts's pool reads DATABASE_URL lazily on first query() call
// (not at import time), so setting it here before any query runs is safe
// even though these imports are hoisted above this check.
const resolvedDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
if (!/test/i.test(resolvedDbUrl)) {
  throw new Error(
    'Refusing to run tests/lib/retrieve.test.ts: it performs destructive DELETEs and the ' +
    'resolved database URL does not look like a disposable test database (its name must ' +
    `contain "test"). Set TEST_DATABASE_URL to point at one. Resolved: ${resolvedDbUrl || '(unset)'}`
  )
}
process.env.DATABASE_URL = resolvedDbUrl

import { query } from '../../lib/db'
import { retrieveChunks, retrieveFeedback } from '../../lib/retrieve'

const oneHot = (index: number) => new Array(768).fill(0).map((_, i) => (i === index ? 1 : 0))
const queryVector = oneHot(0) // matches the "on-topic" fixture rows below exactly (cosine distance 0)

beforeAll(async () => {
  await query('DELETE FROM feedback')
  await query('DELETE FROM chunks')
  await query('DELETE FROM qa_log')
  await query('DELETE FROM sources')

  const [source] = await query<{ id: number }>(
    `INSERT INTO sources (title, kind, raw_text) VALUES ('Test Kaynak', 'text', 'x') RETURNING id`
  )
  const embedding = JSON.stringify(oneHot(0))
  await query(
    `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
    [source.id, 'Fotosentez ışık enerjisini kimyasal enerjiye çevirir.', embedding]
  )

  // Decoy chunk: one-hot at a different index, so it is orthogonal (cosine
  // distance 1) from the query vector - both far from the closest match and
  // past the CHUNK_DISTANCE_THRESHOLD cutoff in retrieveChunks.
  const decoyChunkEmbedding = JSON.stringify(oneHot(5))
  await query(
    `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
    [source.id, 'Mitokondri hücrenin enerji santralidir.', decoyChunkEmbedding]
  )

  const [qa] = await query<{ id: number }>(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ('q', 'a', true, '{}') RETURNING id`
  )
  const feedbackEmbedding = JSON.stringify(oneHot(0))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Fotosentez anlatırken klorofili de belirt', feedbackEmbedding]
  )

  // Decoy feedback: one-hot at a different index than the matching row.
  const decoyFeedbackEmbedding = JSON.stringify(oneHot(5))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Mitokondri konusunda örnek şema ekle', decoyFeedbackEmbedding]
  )
})

describe('retrieve', () => {
  it('retrieveChunks returns the closest chunk for a matching question vector', async () => {
    const results = await retrieveChunks(queryVector, 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('Fotosentez')
    expect(results[0].content).not.toContain('Mitokondri')

    // With k=1, only the truly closest row (the matching one-hot-at-0
    // embedding) should come back - the decoy must be ranked out entirely.
    const top1 = await retrieveChunks(queryVector, 1)
    expect(top1.length).toBe(1)
    expect(top1[0].content).toContain('Fotosentez')
  })

  it('retrieveChunks drops rows past the distance threshold (no relevant match)', async () => {
    // A query vector orthogonal to every fixture row's embedding: the
    // closest possible match is still cosine distance 1, so both rows
    // should be filtered out entirely, deterministically producing an empty
    // result (the "no source found" path) instead of returning irrelevant
    // chunks just because they were the top-k nearest.
    const unrelatedVector = new Array(768).fill(0)
    unrelatedVector[100] = 1
    const results = await retrieveChunks(unrelatedVector, 5)
    expect(results).toEqual([])
  })

  it('retrieveFeedback returns the closest feedback note', async () => {
    const results = await retrieveFeedback(queryVector, 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].note).toContain('klorofil')
    expect(results[0].note).not.toContain('şema')

    // With k=1, only the truly closest row should come back.
    const top1 = await retrieveFeedback(queryVector, 1)
    expect(top1.length).toBe(1)
    expect(top1[0].note).toContain('klorofil')
  })
})
