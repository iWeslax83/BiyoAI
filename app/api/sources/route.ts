import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ingestSource } from '@/lib/ingest'
import { isValidSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const sources = await query('SELECT id, title, kind, created_at FROM sources ORDER BY created_at DESC')
  return NextResponse.json({ sources })
}

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { title, kind, text } = await req.json()
  if (!title || !kind || !text) {
    return NextResponse.json({ error: 'title, kind ve text zorunlu' }, { status: 400 })
  }
  const [source] = await query<{ id: number }>(
    'INSERT INTO sources (title, kind, raw_text) VALUES ($1, $2, $3) RETURNING id',
    [title, kind, text]
  )
  const chunkCount = await ingestSource(source.id, text)
  return NextResponse.json({ id: source.id, chunkCount })
}
