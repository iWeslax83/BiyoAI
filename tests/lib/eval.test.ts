import { describe, it, expect } from "vitest";
import { judge, summarize, suggestMinSupport } from "../../lib/eval";
import type { EvalOutcome } from "../../lib/eval";

function outcome(partial: Partial<EvalOutcome> & Pick<EvalOutcome, "case">) {
  return {
    answer: "cevap",
    grounded: true,
    supportScore: 0.8,
    ...partial,
  } satisfies EvalOutcome;
}

describe("judge", () => {
  it("passes an answerable question that was answered from the sources", () => {
    const result = judge(
      outcome({
        case: { question: "Mitoz nedir?", expect: "answer" },
        answer: "Mitoz hücre bölünmesidir.",
      }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails an answerable question that came back unverified", () => {
    const result = judge(
      outcome({
        case: { question: "Mitoz nedir?", expect: "answer" },
        grounded: false,
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("doğrulanamadı");
  });

  it("fails an answerable question when a required term is missing", () => {
    const result = judge(
      outcome({
        case: {
          question: "Mitoz nedir?",
          expect: "answer",
          mustMention: ["hücre", "bölünme"],
        },
        answer: "Mitoz hücre ile ilgilidir.",
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("bölünme");
  });

  it("matches required terms ignoring case and Turkish capitals", () => {
    const result = judge(
      outcome({
        case: {
          question: "x",
          expect: "answer",
          mustMention: ["ışık"],
        },
        answer: "IŞIK enerjisi kullanılır.",
      }),
    );
    expect(result.passed).toBe(true);
  });

  it("passes an out-of-scope question that was not presented as verified", () => {
    const result = judge(
      outcome({
        case: { question: "Başkent neresi?", expect: "refuse" },
        grounded: false,
        answer: "Bu konuda elimde kaynak yok, bilmiyorum.",
      }),
    );
    expect(result.passed).toBe(true);
  });

  it("fails an out-of-scope question that was presented as verified", () => {
    const result = judge(
      outcome({
        case: { question: "Başkent neresi?", expect: "refuse" },
        grounded: true,
      }),
    );
    expect(result.passed).toBe(false);
  });
});

describe("summarize", () => {
  it("counts passes per kind of question", () => {
    const outcomes = [
      outcome({ case: { question: "a", expect: "answer" } }),
      outcome({ case: { question: "b", expect: "answer" }, grounded: false }),
      outcome({
        case: { question: "c", expect: "refuse" },
        grounded: false,
      }),
    ];

    const summary = summarize(outcomes);

    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.answerable).toEqual({ total: 2, passed: 1 });
    expect(summary.outOfScope).toEqual({ total: 1, passed: 1 });
    expect(summary.failures.map((f) => f.question)).toEqual(["b"]);
  });
});

describe("suggestMinSupport", () => {
  it("returns the midpoint between the best out-of-scope score and the worst answerable score", () => {
    const outcomes = [
      outcome({ case: { question: "a", expect: "answer" }, supportScore: 0.7 }),
      outcome({ case: { question: "b", expect: "answer" }, supportScore: 0.5 }),
      outcome({ case: { question: "c", expect: "refuse" }, supportScore: 0.1 }),
      outcome({ case: { question: "d", expect: "refuse" }, supportScore: 0.2 }),
    ];
    expect(suggestMinSupport(outcomes)).toBeCloseTo(0.35, 5);
  });

  it("returns null when the score ranges overlap", () => {
    const outcomes = [
      outcome({ case: { question: "a", expect: "answer" }, supportScore: 0.3 }),
      outcome({ case: { question: "c", expect: "refuse" }, supportScore: 0.4 }),
    ];
    expect(suggestMinSupport(outcomes)).toBeNull();
  });

  it("returns null without examples of both kinds", () => {
    const outcomes = [
      outcome({ case: { question: "a", expect: "answer" }, supportScore: 0.7 }),
    ];
    expect(suggestMinSupport(outcomes)).toBeNull();
  });
});
