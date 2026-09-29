"use client";

import { useState } from "react";

type Answer = {
  answer: string;
  grounded: boolean;
  sourceIds: number[];
  sourceTitles: string[];
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

export default function TahtaPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        setError(await parseErrorMessage(res));
        return;
      }
      setAnswer(await res.json());
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  const displayedAnswer = answer
    ? answer.answer.replace(/\[kaynak:\d+\]/g, "").trim()
    : "";

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
            {loading ? "Yanıtlanıyor..." : "Sor"}
          </button>
          <button
            className="tahta-button tahta-button-secondary"
            onClick={() => {
              setQuestion("");
              setAnswer(null);
              setError(null);
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
          <p className="tahta-answer-text">{displayedAnswer}</p>
          {!answer.grounded && (
            <p className="tahta-answer-text">
              Bu cevap doğrulanamadı, öğretmenine sor.
            </p>
          )}
          {answer.grounded && answer.sourceTitles.length > 0 && (
            <p className="tahta-sources">
              Kaynaklar: {answer.sourceTitles.join(", ")}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
