const MAX_QUEUE_DEPTH = 10

let tail: Promise<unknown> = Promise.resolve()
let depth = 0

export function withRateLimitQueue<T>(fn: () => Promise<T>): Promise<T> {
  if (depth >= MAX_QUEUE_DEPTH) {
    return Promise.reject(
      new Error(`Rate limit queue is full (${MAX_QUEUE_DEPTH} pending), rejecting immediately`)
    )
  }

  depth++
  const result = tail.then(fn)
  tail = result.catch(() => undefined)
  // Decrement on either outcome without creating a floating rejected
  // promise: .finally() would propagate a rejection from `result` into an
  // unhandled rejection since nothing else consumes its return value.
  result.then(
    () => {
      depth--
    },
    () => {
      depth--
    }
  )
  return result
}
