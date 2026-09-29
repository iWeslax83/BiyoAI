import { describe, it, expect, vi, beforeEach } from "vitest";
import { embed, chatComplete } from "../../lib/groq";

describe("groq client", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
    process.env.GROQ_EMBED_MODEL = "nomic-embed-text-v1_5";
  });

  it("embed() posts to the embeddings endpoint and returns vectors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const vectors = await embed(["metin bir", "metin iki"]);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/embeddings");
    expect(JSON.parse(init.body)).toEqual({
      model: "nomic-embed-text-v1_5",
      input: ["metin bir", "metin iki"],
    });
    expect(init.headers.Authorization).toBe("Bearer test-key");
    vi.unstubAllGlobals();
  });

  it("chatComplete() posts messages and returns the assistant content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "cevap metni" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const answer = await chatComplete([{ role: "user", content: "soru" }]);

    expect(answer).toBe("cevap metni");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).model).toBe("llama-3.3-70b-versatile");
    vi.unstubAllGlobals();
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 429,
          text: async () => "rate limited",
        }),
    );
    await expect(
      chatComplete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("Groq API error 429: rate limited");
    vi.unstubAllGlobals();
  });
});
