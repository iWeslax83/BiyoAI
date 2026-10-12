import { describe, it, expect } from "vitest";
import { networkFailure } from "../../lib/network-error";
import { ProviderError } from "../../lib/provider-error";

// What Node's fetch throws: a TypeError whose cause carries the real reason.
function fetchError(code: string, message = code): TypeError {
  const err = new TypeError("fetch failed");
  (err as TypeError & { cause?: unknown }).cause = Object.assign(
    new Error(message),
    { code },
  );
  return err;
}

describe("networkFailure", () => {
  it.each([
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED",
  ])(
    "treats %s as a configuration problem that retrying will not fix",
    (code) => {
      const error = networkFailure(fetchError(code), "Embedding sağlayıcısı");

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.kind).toBe("config");
      expect(error.message).toContain(code);
      expect(error.message).toContain("sertifika");
    },
  );

  it.each(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"])(
    "treats %s as a transient failure and names the cause",
    (code) => {
      const error = networkFailure(fetchError(code), "Groq");

      expect(error.kind).toBe("transient");
      expect(error.message).toContain("Groq");
      expect(error.message).toContain(code);
    },
  );

  it("falls back to the error message when there is no cause", () => {
    const error = networkFailure(new Error("boom"), "Groq");
    expect(error.kind).toBe("transient");
    expect(error.message).toContain("boom");
  });

  it("handles non-Error values", () => {
    const error = networkFailure("weird", "Groq");
    expect(error.kind).toBe("transient");
  });
});
