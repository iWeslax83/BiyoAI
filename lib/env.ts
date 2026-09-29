// Small, shared startup-validation helpers. Each of these is called lazily
// (on first real use, e.g. signing a session or calling Groq) rather than at
// module-import time, so a missing/invalid env var fails fast on the very
// first operation that needs it, without breaking test setups that set
// process.env inside beforeEach hooks.

export function requireEnv(
  name: string,
  options?: { minLength?: number },
): string {
  const value = process.env[name];
  const minLength = options?.minLength ?? 1;
  if (!value || value.length < minLength) {
    throw new Error(
      `${name} ortam değişkeni eksik veya geçersiz (en az ${minLength} karakter olmalı). ` +
        `.env dosyasını kontrol et.`,
    );
  }
  return value;
}
