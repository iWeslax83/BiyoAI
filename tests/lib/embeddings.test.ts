import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embed, EMBEDDING_DIMENSIONS } from "../../lib/embeddings";
import { ProviderError } from "../../lib/provider-error";
import { getProviderStatus } from "../../lib/provider-status";

const vec = (n = EMBEDDING_DIMENSIONS) => new Array(n).fill(0.1);

function okResponse(vectors: number[][]) {
  return {
    ok: true,
    json: async () => ({ data: vectors.map((embedding) => ({ embedding })) }),
  };
}

function errorResponse(status: number, body = "x") {
  return { ok: false, status, text: async () => body };
}

const ENV_KEYS = [
  "EMBED_BASE_URL",
  "EMBED_API_KEY",
  "EMBED_MODEL",
  "GROQ_API_KEY",
  "GROQ_EMBED_MODEL",
];

describe("embed", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.GROQ_API_KEY = "groq-key";
    process.env.GROQ_EMBED_MODEL = "groq-embed";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Groq and its key when no embedding provider is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([vec()]));
    vi.stubGlobal("fetch", fetchMock);

    await embed(["a"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer groq-key");
    expect(JSON.parse(init.body).model).toBe("groq-embed");
  });

  it("calls a custom OpenAI-compatible server without sending a key", async () => {
    process.env.EMBED_BASE_URL = "http://ollama:11434/v1";
    process.env.EMBED_MODEL = "nomic-embed-text";
    const fetchMock = vi.fn().mockResolvedValue(okResponse([vec()]));
    vi.stubGlobal("fetch", fetchMock);

    await embed(["a"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/embeddings");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body).model).toBe("nomic-embed-text");
  });

  it("sends EMBED_API_KEY to a custom server when one is set", async () => {
    process.env.EMBED_BASE_URL = "https://embed.example/v1";
    process.env.EMBED_API_KEY = "secret";
    process.env.EMBED_MODEL = "m";
    const fetchMock = vi.fn().mockResolvedValue(okResponse([vec()]));
    vi.stubGlobal("fetch", fetchMock);

    await embed(["a"]);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer secret",
    );
  });

  it("rejects vectors whose size does not match the database column", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([vec(1024)])));

    const error = await embed(["a"]).catch((e) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("config");
    expect(error.message).toContain("768");
    expect(error.message).toContain("1024");
  });

  it("rejects a response with a different number of vectors than inputs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([vec()])));
    const error = await embed(["a", "b"]).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("config");
  });

  it.each([
    [401, "config"],
    [403, "config"],
    [404, "config"],
    [400, "input"],
    [422, "input"],
    [429, "transient"],
    [500, "transient"],
    [503, "transient"],
  ])("classifies HTTP %i as %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(status)));
    const error = await embed(["a"]).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe(kind);
    expect(error.message).toContain(String(status));
  });

  it("classifies a network failure as transient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const error = await embed(["a"]).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("transient");
  });

  it("records a configuration problem and clears it after a success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(401, "bad key")),
    );
    await embed(["a"]).catch(() => undefined);
    expect(getProviderStatus().embeddings.ok).toBe(false);
    expect(getProviderStatus().embeddings.error).toContain("401");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([vec()])));
    await embed(["a"]);
    expect(getProviderStatus().embeddings.ok).toBe(true);
  });

  it("does not report a transient failure as a configuration problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([vec()])));
    await embed(["a"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(503)));
    await embed(["a"]).catch(() => undefined);
    expect(getProviderStatus().embeddings.ok).toBe(true);
  });
});
