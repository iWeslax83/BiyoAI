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
})
