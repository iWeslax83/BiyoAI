import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { isValidSession } from '@/lib/auth'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await query('DELETE FROM sources WHERE id = $1', [Number(id)])
  return NextResponse.json({ ok: true })
}
