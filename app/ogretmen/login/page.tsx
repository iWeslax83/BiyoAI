"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function login() {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Hatalı şifre");
        return;
      }
      router.push("/ogretmen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ogretmen-login-page">
      <form
        className="ogretmen-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          login();
        }}
      >
        <h1 className="ogretmen-title">Öğretmen Girişi</h1>
        <input
          className="ogretmen-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Şifre"
          autoComplete="current-password"
          autoFocus
        />
        <button
          type="submit"
          className="ogretmen-button ogretmen-button-primary"
          disabled={loading}
        >
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
        {error && <p className="ogretmen-error">{error}</p>}
      </form>
    </main>
  );
}
