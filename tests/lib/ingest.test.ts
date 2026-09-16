import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/groq', () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}))

const queryMock = vi.fn(async (_sql: string, _params: unknown[]): Promise<unknown[]> => [])
vi.mock('../../lib/db', () => ({
  query: (sql: string, params: unknown[]) => queryMock(sql, params),
}))

import { ingestSource } from '../../lib/ingest'

describe('ingestSource', () => {
  it('chunks, embeds, and stores each chunk, returning the count', async () => {
    const longText = 'Fotosentez '.repeat(200)
    const count = await ingestSource(7, longText)

    expect(count).toBeGreaterThan(0)
    expect(queryMock).toHaveBeenCalledTimes(count)
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toContain('INSERT INTO chunks')
    expect(params[0]).toBe(7)
  })
})
