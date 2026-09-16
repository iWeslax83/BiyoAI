import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ingestSource } from '@/lib/ingest'
import { isValidSession } from '@/lib/auth'
import { clearCache } from '@/lib/cache'

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

  let chunkCount: number
  try {
    chunkCount = await ingestSource(source.id, text)
  } catch (err) {
    // Ingest failed (bad/missing Groq key, network down, ...) - don't leave
    // a zero-chunk source behind that the teacher thinks succeeded while
    // students silently get "bilmiyorum" for it forever. Roll back the row
    // and surface a clear error instead.
    await query('DELETE FROM sources WHERE id = $1', [source.id])
    return NextResponse.json(
      { error: 'Kaynak eklendi ama işlenirken hata oluştu, tekrar dene.' },
      { status: 502 }
    )
  }

  clearCache()
  return NextResponse.json({ id: source.id, chunkCount })
}
