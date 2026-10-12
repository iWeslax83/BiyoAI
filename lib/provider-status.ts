// Remembers whether the last call to each provider hit a configuration
// problem, so the teacher panel can say "the API key is wrong" instead of
// leaving sources silently waiting. In memory on purpose: it is rebuilt by the
// next call after a restart.

type Name = "embeddings" | "chat";
type Status = { ok: boolean; error: string | null };

const status: Record<Name, Status> = {
  embeddings: { ok: true, error: null },
  chat: { ok: true, error: null },
};

export function recordProviderOk(name: Name): void {
  status[name] = { ok: true, error: null };
}

export function recordProviderConfigError(name: Name, message: string): void {
  status[name] = { ok: false, error: message };
}

export function getProviderStatus(): Record<Name, Status> {
  return { embeddings: { ...status.embeddings }, chat: { ...status.chat } };
}
