import { NextRequest, NextResponse } from 'next/server'
import { answerQuestion } from '@/lib/rag'
import { getCachedAnswer, setCachedAnswer } from '@/lib/cache'
import { withRateLimitQueue } from '@/lib/queue'

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'question zorunlu' }, { status: 400 })
  }

  const cached = getCachedAnswer(question)
  if (cached) return NextResponse.json(cached)

  try {
    const result = await withRateLimitQueue(() => answerQuestion(question))
    setCachedAnswer(question, result)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'Sistem şu anda yoğun, lütfen birazdan tekrar deneyin.' },
      { status: 503 }
    )
  }
}
