import { describe, it, expect } from 'vitest'
import { getCachedAnswer, setCachedAnswer, clearCache } from '../../lib/cache'

describe('cache', () => {
  it('returns undefined for an unseen question', () => {
    expect(getCachedAnswer('görülmemiş soru')).toBeUndefined()
  })

  it('normalizes whitespace/case and returns a cached answer', () => {
    const answer = { answer: 'cevap', grounded: true, sourceIds: [1], sourceTitles: ['Kaynak'] }
    setCachedAnswer('Fotosentez Nedir?', answer)
    expect(getCachedAnswer('  fotosentez nedir?  ')).toEqual(answer)
  })

  it('clearCache empties every cached entry', () => {
    setCachedAnswer('silinecek soru', { answer: 'x', grounded: true, sourceIds: [], sourceTitles: [] })
    expect(getCachedAnswer('silinecek soru')).toBeDefined()
    clearCache()
    expect(getCachedAnswer('silinecek soru')).toBeUndefined()
  })

  it('evicts the oldest entry once the cache is at capacity', () => {
    clearCache()
    for (let i = 0; i < 501; i++) {
      setCachedAnswer(`soru ${i}`, { answer: `cevap ${i}`, grounded: true, sourceIds: [], sourceTitles: [] })
    }
    // The very first inserted entry should have been evicted to make room.
    expect(getCachedAnswer('soru 0')).toBeUndefined()
    // The most recent entry should still be present.
    expect(getCachedAnswer('soru 500')).toBeDefined()
  })
})
