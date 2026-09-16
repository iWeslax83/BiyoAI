import { describe, it, expect } from 'vitest'
import { withRateLimitQueue } from '../../lib/queue'

describe('withRateLimitQueue', () => {
  it('runs queued calls one at a time, in order', async () => {
    const order: number[] = []
    const makeTask = (id: number, delay: number) => () =>
      withRateLimitQueue(async () => {
        await new Promise((r) => setTimeout(r, delay))
        order.push(id)
        return id
      })

    const results = await Promise.all([makeTask(1, 20)(), makeTask(2, 0)(), makeTask(3, 0)()])

    expect(results).toEqual([1, 2, 3])
    expect(order).toEqual([1, 2, 3])
  })

  it('rejects immediately once the queue is at max depth (10), instead of waiting behind it', async () => {
    // Hold the queue open with a slow first task so subsequent calls pile up
    // behind it as pending work, then fill it to capacity (10).
    let releaseFirst: () => void = () => {}
    const blocker = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withRateLimitQueue(async () => {
      await blocker
      return 'first'
    })

    const pending = Array.from({ length: 9 }, () => withRateLimitQueue(async () => 'ok'))

    // Queue is now full (1 running + 9 pending = 10). The 11th call must be
    // rejected immediately rather than enqueued.
    await expect(withRateLimitQueue(async () => 'overflow')).rejects.toThrow(/full/i)

    releaseFirst()
    await expect(first).resolves.toBe('first')
    await Promise.all(pending)
  })
})
