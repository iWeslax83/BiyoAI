import { requireEnv } from "./env";
import { ProviderError, kindForStatus } from "./provider-error";
import { recordProviderConfigError, recordProviderOk } from "./provider-status";
import { networkFailure } from "./network-error";

// Embeddings go through lib/embeddings.ts so they can use a different
// provider than chat. Re-exported here for existing callers.
export { embed } from "./embeddings";

const BASE_URL = "https://api.groq.com/openai/v1";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Whether the Groq chat env vars are present. Checked lazily (not at import
// time) so it fails fast on the first real Groq call rather than an unset key
// silently producing a 401. Also used by /api/health to report configuration
// status without making a live API call.
export function hasGroqConfig(): boolean {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_CHAT_MODEL);
}

function requireChatConfig(): { apiKey: string; chatModel: string } {
  return {
    apiKey: requireEnv("GROQ_API_KEY"),
    chatModel: requireEnv("GROQ_CHAT_MODEL"),
  };
}

async function groqFetch<T>(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const failure = networkFailure(err, "Groq'a");
    if (failure.kind === "config") {
      recordProviderConfigError("chat", failure.message);
    }
    throw failure;
  }
  if (!res.ok) {
    const text = await res.text();
    const message = `Groq API error ${res.status}: ${text}`;
    const kind = kindForStatus(res.status);
    if (kind === "config") recordProviderConfigError("chat", message);
    throw new ProviderError(message, kind);
  }
  recordProviderOk("chat");
  return res.json();
}

// Some reasoning models return their thinking inline as <think>...</think>.
// Students must only see the answer.
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const { apiKey, chatModel } = requireChatConfig();
  // Reasoning models (for example openai/gpt-oss-120b) answer faster with a
  // low effort, which is enough for answering from provided sources. Only
  // sent when configured: models without reasoning would reject it.
  const reasoningEffort = process.env.GROQ_REASONING_EFFORT;
  const json = await groqFetch<{
    choices: { message: { content: string } }[];
  }>("/chat/completions", apiKey, {
    model: chatModel,
    messages,
    temperature: 0.2,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  });
  return stripThinking(json.choices[0].message.content);
}
