import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { isValidSession } from '@/lib/auth'

const RECENT_LIMIT = 20

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const entries = await query(
    `SELECT id, question, answer, grounded, created_at
     FROM qa_log
     ORDER BY created_at DESC
     LIMIT $1`,
    [RECENT_LIMIT]
  )
  return NextResponse.json({ entries })
}
