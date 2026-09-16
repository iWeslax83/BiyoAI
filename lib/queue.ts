let tail: Promise<unknown> = Promise.resolve()

export function withRateLimitQueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn)
  tail = result.catch(() => undefined)
  return result
}
