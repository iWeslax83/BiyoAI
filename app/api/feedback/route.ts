import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { embed } from '@/lib/groq'
import { isValidSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { qaLogId, note } = await req.json()
  if (!qaLogId || !note) {
    return NextResponse.json({ error: 'qaLogId ve note zorunlu' }, { status: 400 })
  }
  const [vector] = await embed([note])
  await query(
    'INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)',
    [qaLogId, note, JSON.stringify(vector)]
  )
  return NextResponse.json({ ok: true })
}
