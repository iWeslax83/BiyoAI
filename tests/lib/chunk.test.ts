import { describe, it, expect } from 'vitest'
import { splitIntoChunks } from '../../lib/chunk'

describe('splitIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks = splitIntoChunks('Hücre canlıların yapı taşıdır.')
    expect(chunks).toEqual(['Hücre canlıların yapı taşıdır.'])
  })

  it('splits long text into overlapping chunks', () => {
    const text = 'A'.repeat(2500)
    const chunks = splitIntoChunks(text, { maxChars: 1000, overlap: 100 })
    expect(chunks.length).toBe(3)
    expect(chunks[0].length).toBe(1000)
    expect(chunks[1].slice(0, 100)).toBe(chunks[0].slice(-100))
  })

  it('does not produce empty chunks', () => {
    const chunks = splitIntoChunks('   ')
    expect(chunks).toEqual([])
  })
})
