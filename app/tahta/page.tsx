'use client'

import { useState } from 'react'

type Answer = { answer: string; grounded: boolean; sourceIds: number[] }

export default function TahtaPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    if (!question.trim() || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Bir hata oluştu.')
        return
      }
      setAnswer(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="tahta-page">
      <h1 className="tahta-title">Biyoloji Soru-Cevap</h1>

      <div className="tahta-input-group">
        <textarea
          className="tahta-textarea"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Biyoloji ile ilgili sorunu yaz..."
        />
        <div className="tahta-button-row">
          <button
            className="tahta-button tahta-button-primary"
            onClick={ask}
            disabled={loading}
          >
            {loading ? 'Yanıtlanıyor...' : 'Sor'}
          </button>
          <button
            className="tahta-button tahta-button-secondary"
            onClick={() => {
              setQuestion('')
              setAnswer(null)
              setError(null)
            }}
          >
            Temizle
          </button>
        </div>
      </div>

      {error && <p className="tahta-error">{error}</p>}

      {answer && (
        <div className="tahta-answer">
          {!answer.grounded && (
            <span className="tahta-tag">
              <span className="tahta-tag-dot" />
              Doğrulanamadı
            </span>
          )}
          <p className="tahta-answer-text">{answer.answer}</p>
          {!answer.grounded && (
            <p className="tahta-answer-text">Bu cevap doğrulanamadı, öğretmenine sor.</p>
          )}
        </div>
      )}
    </main>
  )
}
