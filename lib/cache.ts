import type { RagAnswer } from "./rag";

const MAX_ENTRIES = 500;

const store = new Map<string, RagAnswer>();

function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCachedAnswer(question: string): RagAnswer | undefined {
  return store.get(normalize(question));
}

export function setCachedAnswer(question: string, answer: RagAnswer): void {
  const key = normalize(question);
  // Evict the oldest entry before inserting once we're at capacity, so the
  // cache can't grow unbounded over a long-running server process. Map
  // iteration order is insertion order, so the first key is the oldest.
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, answer);
}

// Clear every cached answer. Call this whenever the underlying source
// material changes (a source is added or deleted) so students don't keep
// getting stale answers that cited material that no longer exists or predate
// newly-added material.
export function clearCache(): void {
  store.clear();
}
