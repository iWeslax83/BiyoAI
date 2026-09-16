import { describe, it, expect, vi, beforeEach } from 'vitest'

const answerQuestionMock = vi.fn(async (q: string) => ({ answer: `cevap: ${q}`, grounded: true, sourceIds: [1] }))
vi.mock('../../lib/rag', () => ({ answerQuestion: (q: string) => answerQuestionMock(q) }))

import { getCachedAnswer, setCachedAnswer } from '../../lib/cache'
import { withRateLimitQueue } from '../../lib/queue'
import { answerQuestion } from '../../lib/rag'

async function handleAsk(question: string) {
  const cached = getCachedAnswer(question)
  if (cached) return cached
  const result = await withRateLimitQueue(() => answerQuestion(question))
  setCachedAnswer(question, result)
  return result
}

describe('ask handler logic', () => {
  beforeEach(() => {
    answerQuestionMock.mockClear()
  })

  it('calls answerQuestion once and caches the result for repeat questions', async () => {
    const first = await handleAsk('Mitoz nedir?')
    const second = await handleAsk('Mitoz nedir?')

    expect(first).toEqual(second)
    expect(answerQuestionMock).toHaveBeenCalledTimes(1)
  })
})
