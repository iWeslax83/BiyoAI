import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/groq", () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}));

const queryMock = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>(
  async () => [],
);
vi.mock("../../lib/db", () => ({
  query: (sql: string, params: unknown[]) => queryMock(sql, params),
}));

import { embed } from "../../lib/groq";
import { ingestSource } from "../../lib/ingest";

describe("ingestSource", () => {
  beforeEach(() => {
    queryMock.mockClear();
    vi.mocked(embed).mockClear();
  });

  it("chunks, embeds, and stores each chunk, returning the count", async () => {
    const longText = "Fotosentez ".repeat(200);
    const count = await ingestSource(7, longText);

    expect(count).toBeGreaterThan(0);
    expect(queryMock).toHaveBeenCalledTimes(count);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO chunks");
    expect(params[0]).toBe(7);
  });

  it("embeds a large source in several small batches", async () => {
    const bigText = "Hücre zarı seçici geçirgendir. ".repeat(2500);
    const count = await ingestSource(7, bigText);

    const batches = vi.mocked(embed).mock.calls.map(([texts]) => texts.length);
    expect(count).toBeGreaterThan(64);
    expect(batches.length).toBeGreaterThan(1);
    expect(Math.max(...batches)).toBeLessThanOrEqual(32);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(count);
  });
});
