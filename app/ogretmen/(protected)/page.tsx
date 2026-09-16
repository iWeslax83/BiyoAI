'use client'

import { useEffect, useState } from 'react'

type Source = { id: number; title: string; kind: string; created_at: string }

export default function OgretmenPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function loadSources() {
    const res = await fetch('/api/sources')
    const body = await res.json()
    setSources(body.sources ?? [])
  }

  useEffect(() => {
    loadSources()
  }, [])

  async function addSource() {
    if (!title.trim() || !text.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, kind: 'text', text }),
      })
      setTitle('')
      setText('')
      await loadSources()
    } finally {
      setSaving(false)
    }
  }

  async function removeSource(id: number) {
    setDeletingId(id)
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      await loadSources()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="ogretmen-page">
      <h1 className="ogretmen-title">Kaynak Yönetimi</h1>

      <section className="ogretmen-section">
        <input
          className="ogretmen-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Başlık"
        />
        <textarea
          className="ogretmen-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Kaynak metni yapıştır..."
          rows={6}
        />
        <button
          className="ogretmen-button ogretmen-button-primary"
          onClick={addSource}
          disabled={saving || !title.trim() || !text.trim()}
        >
          {saving ? 'Ekleniyor...' : 'Kaynak Ekle'}
        </button>
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Kaynaklar</h2>
        {sources.length === 0 ? (
          <p className="ogretmen-source-empty">Henüz kaynak eklenmedi.</p>
        ) : (
          <ul className="ogretmen-source-list">
            {sources.map((s) => (
              <li key={s.id} className="ogretmen-source-item">
                <span className="ogretmen-source-title">{s.title}</span>
                <button
                  className="ogretmen-delete-button"
                  onClick={() => removeSource(s.id)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? 'Siliniyor...' : 'Sil'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
