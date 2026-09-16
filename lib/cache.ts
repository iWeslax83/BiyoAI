import type { RagAnswer } from './rag'

const store = new Map<string, RagAnswer>()

function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getCachedAnswer(question: string): RagAnswer | undefined {
  return store.get(normalize(question))
}

export function setCachedAnswer(question: string, answer: RagAnswer): void {
  store.set(normalize(question), answer)
}
