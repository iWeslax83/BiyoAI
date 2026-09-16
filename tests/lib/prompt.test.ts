import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../../lib/prompt'

describe('buildSystemPrompt', () => {
  it('includes chunk content, citation instructions, and TYMM guidance', () => {
    const prompt = buildSystemPrompt(
      [{ id: 1, sourceId: 1, content: 'Mitokondri hücrenin enerji santralidir.' }],
      []
    )
    expect(prompt).toContain('Mitokondri hücrenin enerji santralidir.')
    expect(prompt).toContain('bilmiyorum')
    expect(prompt).toContain('[kaynak:')
  })

  it('includes feedback notes when present', () => {
    const prompt = buildSystemPrompt(
      [{ id: 1, sourceId: 1, content: 'x' }],
      [{ id: 1, note: 'Örneklerle anlat' }]
    )
    expect(prompt).toContain('Örneklerle anlat')
  })

  it('says no matching source when chunks is empty', () => {
    const prompt = buildSystemPrompt([], [])
    expect(prompt).toContain('bilmiyorum')
  })
})
