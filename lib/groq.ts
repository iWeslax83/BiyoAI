const BASE_URL = 'https://api.groq.com/openai/v1'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

async function groqFetch(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function embed(texts: string[]): Promise<number[][]> {
  const json = await groqFetch('/embeddings', {
    model: process.env.GROQ_EMBED_MODEL,
    input: texts,
  })
  return json.data.map((d: { embedding: number[] }) => d.embedding)
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const json = await groqFetch('/chat/completions', {
    model: process.env.GROQ_CHAT_MODEL,
    messages,
    temperature: 0.2,
  })
  return json.choices[0].message.content
}
