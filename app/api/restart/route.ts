import { NextRequest, NextResponse } from 'next/server'
import { isValidSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  setTimeout(() => process.exit(0), 200)
  return NextResponse.json({ ok: true, message: 'Sistem yeniden başlatılıyor...' })
}
