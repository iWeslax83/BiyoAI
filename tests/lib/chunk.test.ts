import { describe, it, expect } from "vitest";
import { splitIntoChunks } from "../../lib/chunk";

describe("splitIntoChunks", () => {
  it("returns a single chunk for short text", () => {
    const chunks = splitIntoChunks("Hücre canlıların yapı taşıdır.");
    expect(chunks).toEqual(["Hücre canlıların yapı taşıdır."]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "A".repeat(2500);
    const chunks = splitIntoChunks(text, { maxChars: 1000, overlap: 100 });
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(1000);
    expect(chunks[1].slice(0, 100)).toBe(chunks[0].slice(-100));
  });

  it("does not produce empty chunks", () => {
    const chunks = splitIntoChunks("   ");
    expect(chunks).toEqual([]);
  });

  const sentence = (n: number, length: number) =>
    `Cümle ${n} ` +
    "kelime ".repeat(Math.floor((length - 12) / 7)).trim() +
    ".";

  it("breaks between sentences instead of in the middle of one", () => {
    const sentences = Array.from({ length: 8 }, (_, i) => sentence(i + 1, 180));
    const chunks = splitIntoChunks(sentences.join(" "), {
      maxChars: 500,
      overlap: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
      expect(chunk.endsWith(".")).toBe(true);
    }
    for (const s of sentences) {
      expect(chunks.some((c) => c.includes(s))).toBe(true);
    }
  });

  it("repeats the last sentence at the start of the next chunk when it fits the overlap", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => sentence(i + 1, 60));
    const chunks = splitIntoChunks(sentences.join(" "), {
      maxChars: 250,
      overlap: 100,
    });

    expect(chunks.length).toBeGreaterThan(1);
    const lastOfFirst = chunks[0].split(". ").pop()!;
    expect(chunks[1].startsWith(lastOfFirst)).toBe(true);
  });

  it("keeps every chunk within the size limit", () => {
    const text = Array.from({ length: 40 }, (_, i) => sentence(i + 1, 90)).join(
      " ",
    );
    for (const chunk of splitIntoChunks(text, {
      maxChars: 400,
      overlap: 100,
    })) {
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
  });
});
