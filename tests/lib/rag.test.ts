import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/retrieve', () => ({
  retrieveChunks: vi.fn(async () => [{ id: 1, sourceId: 3, content: 'Mitoz hücre bölünmesidir.' }]),
  retrieveFeedback: vi.fn(async () => []),
}))
vi.mock('../../lib/groq', () => ({
  chatComplete: vi.fn(async () => 'Mitoz, [kaynak:3] hücrenin bölünmesidir.'),
}))
const queryMock = vi.fn(async () => [{ id: 42 }])
vi.mock('../../lib/db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

import { answerQuestion } from '../../lib/rag'

describe('answerQuestion', () => {
  it('returns a grounded answer with cited source ids and logs it', async () => {
    const result = await answerQuestion('Mitoz nedir?')

    expect(result.grounded).toBe(true)
    expect(result.sourceIds).toEqual([3])
    expect(result.answer).toContain('Mitoz')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO qa_log'),
      expect.arrayContaining(['Mitoz nedir?'])
    )
  })
})
