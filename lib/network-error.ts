import { ProviderError } from "./provider-error";

// Turns a failed fetch into a ProviderError that says why. Node reports every
// network problem as "fetch failed" and hides the real reason in `cause`, so
// without this a certificate problem looks like "the internet is down".
//
// Certificate errors are configuration problems: networks that inspect TLS
// (common on school and government networks) re-sign HTTPS traffic with their
// own CA, which Node does not trust until it is given that CA. Retrying never
// helps, so they must not look transient.

const CERTIFICATE_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function causeOf(err: unknown): { code?: string; message?: string } {
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (cause && typeof cause === "object") {
    return cause as { code?: string; message?: string };
  }
  return {};
}

export function networkFailure(err: unknown, label: string): ProviderError {
  const cause = causeOf(err);
  const code = cause.code;
  const detail =
    code ?? cause.message ?? (err instanceof Error ? err.message : String(err));

  if (code && CERTIFICATE_CODES.has(code)) {
    return new ProviderError(
      `${label} için TLS sertifikası doğrulanamadı (${code}). ` +
        "Ağ HTTPS trafiğini denetliyor olabilir: ağın CA sertifikasını ekle (OPERATIONS.md, TLS sertifika hatası).",
      "config",
    );
  }
  return new ProviderError(`${label} ulaşılamadı: ${detail}`, "transient");
}
