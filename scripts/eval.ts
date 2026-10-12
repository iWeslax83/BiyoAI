import { readFileSync } from "node:fs";
import { answerQuestion } from "../lib/rag";
import { getPool } from "../lib/db";
import { judge, suggestMinSupport, summarize } from "../lib/eval";
import { ProviderError } from "../lib/provider-error";
import type { EvalCase, EvalOutcome } from "../lib/eval";

// Runs a list of questions through the real pipeline (database and AI
// provider included) and reports how often the system behaves as expected.
//
//   npm run eval -- eval/questions.json
//
// Use it with the teacher's real sources loaded, so the answers reflect what
// students will actually see. Questions are not written to the qa log.

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Kullanım: npm run eval -- <sorular.json>");
    console.error("Örnek dosya: eval/questions.example.json");
    process.exit(1);
  }

  const cases = JSON.parse(readFileSync(file, "utf8")) as EvalCase[];
  const outcomes: EvalOutcome[] = [];

  for (const c of cases) {
    const result = await answerQuestion(c.question, { log: false });
    const outcome: EvalOutcome = {
      case: c,
      answer: result.answer,
      grounded: result.grounded,
      supportScore: result.supportScore,
    };
    outcomes.push(outcome);
    const verdict = judge(outcome);
    console.log(
      `${verdict.passed ? "GEÇTİ " : "KALDI "} [destek ${result.supportScore.toFixed(2)}] ${c.question}` +
        (verdict.reason ? `\n        ${verdict.reason}` : ""),
    );
  }

  const summary = summarize(outcomes);
  console.log("\n--- Özet ---");
  console.log(`Toplam: ${summary.passed}/${summary.total} geçti`);
  console.log(
    `Kaynakta olan sorular: ${summary.answerable.passed}/${summary.answerable.total}`,
  );
  console.log(
    `Kapsam dışı sorular:   ${summary.outOfScope.passed}/${summary.outOfScope.total}`,
  );

  const suggestion = suggestMinSupport(outcomes);
  if (suggestion === null) {
    console.log(
      "\nGROUNDING_MIN_SUPPORT önerisi: yok (puan aralıkları çakışıyor ya da iki türden de örnek yok).",
    );
  } else {
    console.log(
      `\nGROUNDING_MIN_SUPPORT önerisi: ${suggestion.toFixed(2)} (.env dosyasına yaz)`,
    );
  }

  await getPool().end();
  process.exit(summary.failures.length > 0 ? 2 : 0);
}

main().catch(async (err) => {
  if (err instanceof ProviderError) {
    // A setup problem, not a bug: show the reason without a stack trace.
    console.error(`\nHata (${err.kind}): ${err.message}`);
    if (err.kind === "config") {
      console.error(
        "Ayarları .env dosyasında kontrol et (README: Ortam değişkenleri).",
      );
    }
  } else {
    console.error(err);
  }
  await getPool().end();
  process.exit(1);
});
