import { describe, it, expect } from 'vitest'
import { getCachedAnswer, setCachedAnswer } from '../../lib/cache'

describe('cache', () => {
  it('returns undefined for an unseen question', () => {
    expect(getCachedAnswer('görülmemiş soru')).toBeUndefined()
  })

  it('normalizes whitespace/case and returns a cached answer', () => {
    const answer = { answer: 'cevap', grounded: true, sourceIds: [1] }
    setCachedAnswer('Fotosentez Nedir?', answer)
    expect(getCachedAnswer('  fotosentez nedir?  ')).toEqual(answer)
  })
})
