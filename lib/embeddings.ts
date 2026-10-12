import { ProviderError, kindForStatus } from "./provider-error";
import { recordProviderConfigError, recordProviderOk } from "./provider-status";

// The vector column in lib/schema.sql is vector(768). A model with another
// output size cannot be stored without changing the schema and re-embedding
// every source, so mismatches are rejected loudly instead of failing inside
// Postgres.
export const EMBEDDING_DIMENSIONS = 768;

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

type EmbeddingConfig = {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
};

// Any OpenAI-compatible /embeddings server works: set EMBED_BASE_URL (and
// EMBED_API_KEY if it needs one). Without EMBED_BASE_URL, Groq is used with
// GROQ_API_KEY, which keeps older .env files working.
function resolveConfig(): EmbeddingConfig | null {
  const customBase = process.env.EMBED_BASE_URL?.replace(/\/+$/, "");
  const model = process.env.EMBED_MODEL || process.env.GROQ_EMBED_MODEL;
  if (!model) return null;

  if (customBase) {
    return {
      baseUrl: customBase,
      apiKey: process.env.EMBED_API_KEY || undefined,
      model,
    };
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return { baseUrl: GROQ_BASE_URL, apiKey, model };
}

export function hasEmbeddingConfig(): boolean {
  return resolveConfig() !== null;
}

function configError(message: string): ProviderError {
  recordProviderConfigError("embeddings", message);
  return new ProviderError(message, "config");
}

export async function embed(texts: string[]): Promise<number[][]> {
  const config = resolveConfig();
  if (!config) {
    throw configError(
      "Embedding ayarı eksik: EMBED_BASE_URL + EMBED_MODEL ya da GROQ_API_KEY + GROQ_EMBED_MODEL tanımla.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: config.model, input: texts }),
    });
  } catch (err) {
    throw new ProviderError(
      `Embedding sağlayıcısına ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
      "transient",
    );
  }

  if (!res.ok) {
    const body = await res.text();
    const kind = kindForStatus(res.status);
    const message = `Embedding API error ${res.status}: ${body}`;
    if (kind === "config") throw configError(message);
    throw new ProviderError(message, kind);
  }

  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const vectors = (json.data ?? []).map((d) => d.embedding);

  if (vectors.length !== texts.length) {
    throw configError(
      `Embedding sağlayıcısı ${texts.length} metin için ${vectors.length} vektör döndürdü. Model adını ve adresi kontrol et.`,
    );
  }
  const wrong = vectors.find((v) => v.length !== EMBEDDING_DIMENSIONS);
  if (wrong) {
    throw configError(
      `Embedding modeli ${wrong.length} boyutlu vektör üretiyor, veritabanı ${EMBEDDING_DIMENSIONS} bekliyor. ` +
        `${EMBEDDING_DIMENSIONS} boyutlu bir model seç (ör. nomic-embed-text).`,
    );
  }

  recordProviderOk("embeddings");
  return vectors;
}
