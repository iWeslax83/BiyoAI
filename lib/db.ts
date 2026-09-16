import { Pool, type QueryResultRow } from 'pg'

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params)
  return result.rows
}
