// How a failed call to an AI provider should be handled:
// - "config":    the setup is wrong (bad key, unknown model, wrong vector
//                size). Retrying does nothing until someone fixes it.
// - "input":     this particular request was rejected (too long, malformed).
//                Retrying the same content will fail the same way.
// - "transient": network down, rate limited, provider outage. Retry later.
export type ProviderErrorKind = "config" | "input" | "transient";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(message: string, kind: ProviderErrorKind) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403 || status === 404) return "config";
  if (status === 400 || status === 413 || status === 422) return "input";
  return "transient";
}
