import { requireEnv } from "./env";

const BASE_URL = "https://api.groq.com/openai/v1";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Whether the Groq env vars this module needs are present. Checked lazily
// (not at import time) so it fails fast on the first real Groq call rather
// than an unset key silently producing a 401 that shows up to students as an
// unhelpful generic "system busy" message. Also used by /api/health to
// report Groq configuration status without making a live API call.
export function hasGroqConfig(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY &&
    process.env.GROQ_CHAT_MODEL &&
    process.env.GROQ_EMBED_MODEL,
  );
}

function requireGroqConfig(): {
  apiKey: string;
  chatModel: string;
  embedModel: string;
} {
  return {
    apiKey: requireEnv("GROQ_API_KEY"),
    chatModel: requireEnv("GROQ_CHAT_MODEL"),
    embedModel: requireEnv("GROQ_EMBED_MODEL"),
  };
}

async function groqFetch(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function embed(texts: string[]): Promise<number[][]> {
  const { apiKey, embedModel } = requireGroqConfig();
  const json = await groqFetch("/embeddings", apiKey, {
    model: embedModel,
    input: texts,
  });
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const { apiKey, chatModel } = requireGroqConfig();
  const json = await groqFetch("/chat/completions", apiKey, {
    model: chatModel,
    messages,
    temperature: 0.2,
  });
  return json.choices[0].message.content;
}
