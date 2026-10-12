"use client";

import { useEffect, useState } from "react";

type SourceKind = "text" | "pdf" | "link";
type Source = {
  id: number;
  title: string;
  kind: SourceKind;
  status: "ready" | "pending" | "failed";
  error: string | null;
  created_at: string;
};
type ProviderStatus = {
  embeddings: { ok: boolean; error: string | null };
  chat: { ok: boolean; error: string | null };
};
type QaLogEntry = {
  id: number;
  question: string;
  answer: string;
  grounded: boolean;
  created_at: string;
};

const KIND_LABELS: Record<SourceKind, string> = {
  text: "Metin",
  pdf: "PDF",
  link: "Bağlantı",
};

const PENDING_REFRESH_MS = 15_000;

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

async function parseNotice(res: Response): Promise<string | null> {
  try {
    const body = await res.json();
    return typeof body?.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

export default function OgretmenPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [kind, setKind] = useState<SourceKind>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [qaLog, setQaLog] = useState<QaLogEntry[]>([]);
  const [onlyUngrounded, setOnlyUngrounded] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [sendingNoteId, setSendingNoteId] = useState<number | null>(null);
  const [qaLogError, setQaLogError] = useState<string | null>(null);
  const [qaSearch, setQaSearch] = useState("");
  const [activeQaSearch, setActiveQaSearch] = useState("");
  const [hasMoreQa, setHasMoreQa] = useState(false);
  const [loadingQa, setLoadingQa] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  async function loadSources() {
    const res = await fetch("/api/sources");
    const body = await res.json();
    setSources(body.sources ?? []);
    setProvider(body.provider ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      try {
        const [sourcesRes, qaLogRes] = await Promise.all([
          fetch("/api/sources"),
          fetch("/api/qa-log"),
        ]);
        const sourcesBody = await sourcesRes.json();
        const qaLogBody = await qaLogRes.json();
        if (cancelled) return;
        setSources(sourcesBody.sources ?? []);
        setProvider(sourcesBody.provider ?? null);
        setQaLog(qaLogBody.entries ?? []);
        setHasMoreQa(Boolean(qaLogBody.hasMore));
      } catch {
        if (!cancelled) {
          setError("Veriler yüklenemedi. Sayfayı yenileyip tekrar dene.");
        }
      }
    }
    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sources saved while offline are retried by the server. While any is still
  // pending, refresh the list so it flips to ready without a manual reload.
  const hasPending = sources.some((s) => s.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sources");
        const body = await res.json();
        setSources(body.sources ?? []);
        setProvider(body.provider ?? null);
      } catch {
        // network still down: try again on the next tick
      }
    }, PENDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [hasPending]);

  // Loads a page of the question log. `append` adds older entries below the
  // ones already shown; otherwise the list is replaced (new search).
  async function loadQaLog(search: string, append: boolean) {
    if (loadingQa) return;
    setLoadingQa(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (append && qaLog.length > 0) {
        params.set("before", String(qaLog[qaLog.length - 1].id));
      }
      const res = await fetch(`/api/qa-log?${params.toString()}`);
      if (!res.ok) {
        setQaLogError(await parseErrorMessage(res));
        return;
      }
      const body = await res.json();
      setQaLogError(null);
      setQaLog((prev) =>
        append ? [...prev, ...(body.entries ?? [])] : (body.entries ?? []),
      );
      setHasMoreQa(Boolean(body.hasMore));
      setActiveQaSearch(search);
    } catch {
      setQaLogError("Sorular yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoadingQa(false);
    }
  }

  async function changePassword() {
    if (changingPassword) return;
    setChangingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: currentPassword,
          next: newPassword,
        }),
      });
      if (!res.ok) {
        setPasswordMessage({
          text: await parseErrorMessage(res),
          isError: true,
        });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage({ text: "Şifre değiştirildi.", isError: false });
    } catch {
      setPasswordMessage({
        text: "Bir hata oluştu. Lütfen tekrar deneyin.",
        isError: true,
      });
    } finally {
      setChangingPassword(false);
    }
  }

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

  function resetForm() {
    setTitle("");
    setText("");
    setUrl("");
    setFile(null);
    setEditingId(null);
  }

  function buildCreateRequest(): RequestInit {
    if (kind === "pdf" && file) {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title.trim());
      return { method: "POST", body: form };
    }
    const payload =
      kind === "link"
        ? { kind, url: url.trim(), title: title.trim() }
        : { kind, title, text };
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  async function saveSource() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res =
        editingId !== null
          ? await fetch(`/api/sources/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, text }),
            })
          : await fetch("/api/sources", buildCreateRequest());
      if (!res.ok && res.status !== 202) {
        setError(await parseErrorMessage(res));
        // A rejected source is kept in the list as failed, show it there.
        if (res.status === 422) await loadSources();
        return;
      }
      setError(null);
      if (res.status === 202) setNotice(await parseNotice(res));
      resetForm();
      await loadSources();
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  }

  async function startEditing(id: number) {
    setNotice(null);
    try {
      const res = await fetch(`/api/sources/${id}`);
      if (!res.ok) {
        setError(await parseErrorMessage(res));
        return;
      }
      const { source } = await res.json();
      setError(null);
      setEditingId(id);
      setKind("text");
      setTitle(source.title);
      setText(source.raw_text);
      setUrl("");
      setFile(null);
    } catch {
      setError("Kaynak açılamadı. Lütfen tekrar deneyin.");
    }
  }

  async function retrySource(id: number) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/sources/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        setError(await parseErrorMessage(res));
        return;
      }
      setError(null);
      await loadSources();
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setRetryingId(null);
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
      if (editingId === id) resetForm();
      await loadSources();
    } finally {
      setDeletingId(null);
    }
  }

  const editing = editingId !== null;
  const canSave = editing
    ? Boolean(title.trim() && text.trim())
    : kind === "text"
      ? Boolean(title.trim() && text.trim())
      : kind === "link"
        ? Boolean(url.trim())
        : Boolean(file);

  const ungroundedCount = qaLog.filter((e) => !e.grounded).length;
  const visibleQaLog = onlyUngrounded
    ? qaLog.filter((e) => !e.grounded)
    : qaLog;

  return (
    <main className="ogretmen-page">
      <h1 className="ogretmen-title">Kaynak Yönetimi</h1>
      {error && <p className="ogretmen-error">{error}</p>}
      {notice && <p className="ogretmen-notice">{notice}</p>}
      {provider && !provider.embeddings.ok && (
        <p className="ogretmen-error">
          Yapay zeka servisi ayarı hatalı, kaynaklar işlenemiyor. Ayar
          düzeltilince bekleyen kaynaklar otomatik işlenir. Ayrıntı:{" "}
          {provider.embeddings.error}
        </p>
      )}

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">
          {editing ? "Kaynağı düzenle" : "Kaynak ekle"}
        </h2>

        {!editing && (
          <div className="ogretmen-tabs" role="group" aria-label="Kaynak türü">
            {(Object.keys(KIND_LABELS) as SourceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className="ogretmen-tab"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        <input
          className="ogretmen-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            !editing && kind !== "text" ? "Başlık (isteğe bağlı)" : "Başlık"
          }
          aria-label="Başlık"
        />

        {(editing || kind === "text") && (
          <textarea
            className="ogretmen-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kaynak metni yapıştır..."
            aria-label="Kaynak metni"
            rows={6}
          />
        )}

        {!editing && kind === "link" && (
          <input
            className="ogretmen-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            aria-label="Bağlantı adresi"
          />
        )}

        {!editing && kind === "pdf" && (
          <label className="ogretmen-file">
            <span className="ogretmen-file-name">
              {file ? file.name : "PDF dosyası seç (en fazla 10 MB)"}
            </span>
            <input
              className="ogretmen-file-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <div className="ogretmen-form-actions">
          <button
            className="ogretmen-button ogretmen-button-primary"
            onClick={saveSource}
            disabled={saving || !canSave}
          >
            {saving
              ? "Kaydediliyor..."
              : editing
                ? "Değişiklikleri Kaydet"
                : "Kaynak Ekle"}
          </button>
          {editing && (
            <button
              className="ogretmen-button"
              onClick={resetForm}
              disabled={saving}
            >
              Vazgeç
            </button>
          )}
        </div>
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Kaynaklar</h2>
        {sources.length === 0 ? (
          <p className="ogretmen-source-empty">Henüz kaynak eklenmedi.</p>
        ) : (
          <ul className="ogretmen-source-list">
            {sources.map((s) => (
              <li key={s.id} className="ogretmen-source-item">
                <div className="ogretmen-source-info">
                  <span className="ogretmen-source-title">{s.title}</span>
                  <span className="ogretmen-source-meta">
                    {KIND_LABELS[s.kind] ?? s.kind}
                    {" · "}
                    {s.status === "pending" ? (
                      <span className="ogretmen-status ogretmen-status-pending">
                        İşlenmeyi bekliyor
                      </span>
                    ) : s.status === "failed" ? (
                      <span className="ogretmen-status ogretmen-status-failed">
                        İşlenemedi
                      </span>
                    ) : (
                      <span className="ogretmen-status ogretmen-status-ready">
                        Hazır
                      </span>
                    )}
                  </span>
                  {s.status === "failed" && s.error && (
                    <span className="ogretmen-source-reason">{s.error}</span>
                  )}
                </div>
                <div className="ogretmen-source-actions">
                  {s.status === "failed" && (
                    <button
                      className="ogretmen-button"
                      onClick={() => retrySource(s.id)}
                      disabled={retryingId === s.id}
                    >
                      {retryingId === s.id ? "Deneniyor..." : "Yeniden dene"}
                    </button>
                  )}
                  <button
                    className="ogretmen-button"
                    onClick={() => startEditing(s.id)}
                    disabled={saving || deletingId === s.id}
                  >
                    Düzenle
                  </button>
                  <button
                    className="ogretmen-delete-button"
                    onClick={() => removeSource(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? "Siliniyor..." : "Sil"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Son Sorular</h2>
        {qaLogError && <p className="ogretmen-error">{qaLogError}</p>}
        <form
          className="ogretmen-search"
          onSubmit={(e) => {
            e.preventDefault();
            loadQaLog(qaSearch.trim(), false);
          }}
        >
          <input
            className="ogretmen-input"
            type="search"
            value={qaSearch}
            onChange={(e) => setQaSearch(e.target.value)}
            placeholder="Sorularda ara..."
            aria-label="Sorularda ara"
          />
          <button
            className="ogretmen-button"
            type="submit"
            disabled={loadingQa}
          >
            Ara
          </button>
        </form>
        {qaLog.length > 0 && (
          <label className="ogretmen-filter">
            <input
              type="checkbox"
              checked={onlyUngrounded}
              onChange={(e) => setOnlyUngrounded(e.target.checked)}
            />
            <span>Sadece kaynaksız cevapları göster ({ungroundedCount})</span>
          </label>
        )}
        {qaLog.length === 0 ? (
          <p className="ogretmen-source-empty">
            {activeQaSearch
              ? "Aramayla eşleşen soru yok."
              : "Henüz soru sorulmadı."}
          </p>
        ) : visibleQaLog.length === 0 ? (
          <p className="ogretmen-source-empty">
            Kaynaksız cevap yok. Son sorular kaynaklarla cevaplanmış.
          </p>
        ) : (
          <ul className="ogretmen-qalog-list">
            {visibleQaLog.map((entry) => (
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
        {hasMoreQa && (
          <button
            className="ogretmen-button ogretmen-more-button"
            onClick={() => loadQaLog(activeQaSearch, true)}
            disabled={loadingQa}
          >
            {loadingQa ? "Yükleniyor..." : "Daha eski soruları göster"}
          </button>
        )}
      </section>

      <section className="ogretmen-section">
        <h2 className="ogretmen-section-title">Şifre değiştir</h2>
        {passwordMessage && (
          <p
            className={
              passwordMessage.isError ? "ogretmen-error" : "ogretmen-success"
            }
          >
            {passwordMessage.text}
          </p>
        )}
        <input
          className="ogretmen-input"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Mevcut şifre"
          aria-label="Mevcut şifre"
        />
        <input
          className="ogretmen-input"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Yeni şifre (en az 8 karakter)"
          aria-label="Yeni şifre"
        />
        <button
          className="ogretmen-button ogretmen-button-primary"
          onClick={changePassword}
          disabled={
            changingPassword || !currentPassword || newPassword.length < 8
          }
        >
          {changingPassword ? "Kaydediliyor..." : "Şifreyi Değiştir"}
        </button>
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
