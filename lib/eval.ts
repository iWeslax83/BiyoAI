// Pure helpers for scripts/eval.ts: judging answers against expectations and
// summarising a run. Kept free of database and network access so they can be
// unit tested.

export type EvalCase = {
  question: string;
  // "answer": the sources cover it, a verified answer is expected.
  // "refuse": out of scope, the system must not present an answer as verified.
  expect: "answer" | "refuse";
  // Terms a correct answer must contain (case-insensitive).
  mustMention?: string[];
};

export type EvalOutcome = {
  case: EvalCase;
  answer: string;
  grounded: boolean;
  supportScore: number;
};

export type Judgement = { passed: boolean; reason?: string };

function lower(text: string): string {
  return text.toLocaleLowerCase("tr");
}

export function judge(outcome: EvalOutcome): Judgement {
  const { case: c, grounded, answer } = outcome;

  if (c.expect === "refuse") {
    return grounded
      ? { passed: false, reason: "kapsam dışı soru doğrulanmış gibi sunuldu" }
      : { passed: true };
  }

  if (!grounded) {
    return { passed: false, reason: "cevap doğrulanamadı" };
  }
  const missing = (c.mustMention ?? []).filter(
    (term) => !lower(answer).includes(lower(term)),
  );
  if (missing.length > 0) {
    return {
      passed: false,
      reason: `cevapta beklenen terimler yok: ${missing.join(", ")}`,
    };
  }
  return { passed: true };
}

type Tally = { total: number; passed: number };

export type EvalSummary = {
  total: number;
  passed: number;
  answerable: Tally;
  outOfScope: Tally;
  failures: { question: string; reason: string }[];
};

export function summarize(outcomes: EvalOutcome[]): EvalSummary {
  const summary: EvalSummary = {
    total: outcomes.length,
    passed: 0,
    answerable: { total: 0, passed: 0 },
    outOfScope: { total: 0, passed: 0 },
    failures: [],
  };

  for (const outcome of outcomes) {
    const result = judge(outcome);
    const tally =
      outcome.case.expect === "answer"
        ? summary.answerable
        : summary.outOfScope;
    tally.total++;
    if (result.passed) {
      summary.passed++;
      tally.passed++;
    } else {
      summary.failures.push({
        question: outcome.case.question,
        reason: result.reason ?? "başarısız",
      });
    }
  }
  return summary;
}

// A GROUNDING_MIN_SUPPORT value that separates the two kinds of question:
// halfway between the highest score an out-of-scope question reached and the
// lowest score an answerable question reached. Null when the ranges overlap
// (no threshold can separate them) or one kind has no examples.
export function suggestMinSupport(outcomes: EvalOutcome[]): number | null {
  const answerable = outcomes
    .filter((o) => o.case.expect === "answer")
    .map((o) => o.supportScore);
  const outOfScope = outcomes
    .filter((o) => o.case.expect === "refuse")
    .map((o) => o.supportScore);
  if (answerable.length === 0 || outOfScope.length === 0) return null;

  const lowestAnswerable = Math.min(...answerable);
  const highestOutOfScope = Math.max(...outOfScope);
  if (highestOutOfScope >= lowestAnswerable) return null;
  return (highestOutOfScope + lowestAnswerable) / 2;
}
