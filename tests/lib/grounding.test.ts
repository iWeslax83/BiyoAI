import { describe, it, expect } from "vitest";
import { supportScore } from "../../lib/grounding";

const chunks = [
  {
    content:
      "Mitokondri hücrenin enerji santralidir. Hücresel solunum mitokondride gerçekleşir ve ATP üretilir.",
  },
];

describe("supportScore", () => {
  it("is high when the answer restates what the sources say", () => {
    const score = supportScore(
      "Mitokondri, hücrenin enerji santralidir. [kaynak:1] Solunum burada olur ve ATP üretilir.",
      chunks,
    );
    expect(score).toBeGreaterThan(0.7);
  });

  it("is low when the answer talks about things the sources never mention", () => {
    const score = supportScore(
      "Kloroplast fotosentez yapar. [kaynak:1] Güneş ışığı glikoz oluşturmak için kullanılır.",
      chunks,
    );
    expect(score).toBeLessThan(0.3);
  });

  it("matches Turkish suffix variants of the same word", () => {
    const score = supportScore("Hücreleri enerji üretir.", [
      { content: "Hücre enerji üretir." },
    ]);
    expect(score).toBeGreaterThan(0.7);
  });

  it("ignores citation tags and short function words", () => {
    const withTags = supportScore(
      "Mitokondri enerji santralidir. [kaynak:1][kaynak:2]",
      chunks,
    );
    const withoutTags = supportScore("Mitokondri enerji santralidir.", chunks);
    expect(withTags).toBe(withoutTags);
  });

  it("is 0 for an empty answer or no sources", () => {
    expect(supportScore("", chunks)).toBe(0);
    expect(supportScore("Mitokondri enerji üretir.", [])).toBe(0);
  });
});
