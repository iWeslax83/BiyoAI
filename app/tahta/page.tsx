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

type Exchange = { question: string; answer: string };

export default function TahtaPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Verified answers of this conversation, sent along so a follow-up like
  // "peki ya mayozda?" can be understood. "Temizle" starts a new topic.
  const [history, setHistory] = useState<Exchange[]>([]);

  async function ask() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(-2) }),
      });
      if (!res.ok) {
        setError(await parseErrorMessage(res));
        return;
      }
      const result: Answer = await res.json();
      setAnswer(result);
      if (result.grounded) {
        setHistory((prev) =>
          [...prev, { question, answer: result.answer }].slice(-2),
        );
      }
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
        {history.length > 0 && (
          <p className="tahta-hint">
            Önceki soruların devamı olarak cevaplanır. Yeni bir konu için
            Temizle&apos;ye bas.
          </p>
        )}
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
              setHistory([]);
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
