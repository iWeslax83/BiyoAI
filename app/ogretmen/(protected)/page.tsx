"use client";

import { useEffect, useState } from "react";

type Source = { id: number; title: string; kind: string; created_at: string };
type QaLogEntry = {
  id: number;
  question: string;
  answer: string;
  grounded: boolean;
  created_at: string;
};

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // response body wasn't JSON (e.g. an unhandled server error) - fall through
  }
  return "Bir hata oluştu. Lütfen tekrar deneyin.";
}

export default function OgretmenPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [qaLog, setQaLog] = useState<QaLogEntry[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [sendingNoteId, setSendingNoteId] = useState<number | null>(null);
  const [qaLogError, setQaLogError] = useState<string | null>(null);

  async function loadSources() {
    const res = await fetch("/api/sources");
    const body = await res.json();
    setSources(body.sources ?? []);
  }

  async function loadQaLog() {
    const res = await fetch("/api/qa-log");
    const body = await res.json();
    setQaLog(body.entries ?? []);
  }

  useEffect(() => {
    loadSources();
    loadQaLog();
  }, []);

  async function sendNote(qaLogId: number) {
    const note = (notes[qaLogId] ?? "").trim();
    if (!note || sendingNoteId !== null) return;
    setSendingNoteId(qaLogId);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qaLogId, note }),
      });
      if (!res.ok) {
        const message = await parseErrorMessage(res);
        setQaLogError(message);
        return;
      }
      setQaLogError(null);
      setNotes((prev) => ({ ...prev, [qaLogId]: "" }));
    } finally {
      setSendingNoteId(null);
    }
  }

  async function addSource() {
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind: "text", text }),
      });
      if (!res.ok) {
        const message = await parseErrorMessage(res);
        setError(message);
        return;
      }
      setError(null);
      setTitle("");
      setText("");
      await loadSources();
    } finally {
      setSaving(false);
    }
  }

  async function removeSource(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const message = await parseErrorMessage(res);
        setError(message);
        return;
      }
      setError(null);
      await loadSources();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="ogretmen-page">
      <h1 className="ogretmen-title">Kaynak Yönetimi</h1>
      {error && <p className="ogretmen-error">{error}</p>}

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
          {saving ? "Ekleniyor..." : "Kaynak Ekle"}
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
                  {deletingId === s.id ? "Siliniyor..." : "Sil"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Son Sorular</h2>
        {qaLogError && <p className="ogretmen-error">{qaLogError}</p>}
        {qaLog.length === 0 ? (
          <p className="ogretmen-source-empty">Henüz soru sorulmadı.</p>
        ) : (
          <ul className="ogretmen-qalog-list">
            {qaLog.map((entry) => (
              <li key={entry.id} className="ogretmen-qalog-item">
                <p className="ogretmen-qalog-question">{entry.question}</p>
                <p className="ogretmen-qalog-answer">{entry.answer}</p>
                <p className="ogretmen-qalog-meta">
                  {entry.grounded ? "Kaynaklı" : "Kaynaksız"} ·{" "}
                  {new Date(entry.created_at).toLocaleString("tr-TR")}
                </p>
                <div className="ogretmen-qalog-note-row">
                  <input
                    className="ogretmen-input ogretmen-qalog-note-input"
                    value={notes[entry.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [entry.id]: e.target.value,
                      }))
                    }
                    placeholder="Not ekle..."
                  />
                  <button
                    className="ogretmen-button ogretmen-qalog-note-button"
                    onClick={() => sendNote(entry.id)}
                    disabled={
                      sendingNoteId === entry.id ||
                      !(notes[entry.id] ?? "").trim()
                    }
                  >
                    {sendingNoteId === entry.id ? "Gönderiliyor..." : "Gönder"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Sistem</h2>
        <button
          className="ogretmen-button ogretmen-button-primary"
          onClick={async () => {
            if (confirm("Sistemi yeniden başlatmak istediğine emin misin?")) {
              await fetch("/api/restart", { method: "POST" });
            }
          }}
        >
          Sistemi Yeniden Başlat
        </button>
      </section>
    </main>
  );
}
