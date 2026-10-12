// A cheap check that an answer actually leans on the retrieved sources.
//
// The model is told to cite sources, but it can attach "[kaynak:1]" to a
// sentence the source never said. This measures how many of the answer's
// content words also appear in the retrieved text. It is a heuristic, not a
// proof: a low score is a strong hint the answer wandered off the sources,
// a high score does not guarantee every claim is right.

// Turkish is agglutinative ("hücre", "hücrenin", "hücreleri"), so words are
// compared by their first letters instead of exact match.
const STEM_LENGTH = 5;
const MIN_WORD_LENGTH = 4;

const STOPWORDS = new Set([
  "ancak",
  "ayrıca",
  "böylece",
  "bunun",
  "burada",
  "çünkü",
  "daha",
  "genellikle",
  "gibi",
  "kadar",
  "olan",
  "olarak",
  "olur",
  "onun",
  "sonra",
  "için",
  "veya",
  "yani",
]);

function stems(text: string): Set<string> {
  const words = text
    .replace(/\[kaynak:\d+\]/g, " ")
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_WORD_LENGTH && !STOPWORDS.has(w));
  return new Set(words.map((w) => w.slice(0, STEM_LENGTH)));
}

// Share (0 to 1) of the answer's content words found in the sources.
export function supportScore(
  answer: string,
  chunks: { content: string }[],
): number {
  const answerStems = stems(answer);
  if (answerStems.size === 0 || chunks.length === 0) return 0;

  const sourceStems = stems(chunks.map((c) => c.content).join(" "));
  let supported = 0;
  for (const stem of answerStems) {
    if (sourceStems.has(stem)) supported++;
  }
  return supported / answerStems.size;
}

// Below this share the answer is shown as unverified even if it cites a
// source. Not calibrated against real classroom material yet: run
// scripts/eval.ts with real questions and adjust GROUNDING_MIN_SUPPORT.
const DEFAULT_MIN_SUPPORT = 0.3;

export function minSupport(): number {
  const configured = Number(process.env.GROUNDING_MIN_SUPPORT);
  return Number.isFinite(configured) && process.env.GROUNDING_MIN_SUPPORT
    ? configured
    : DEFAULT_MIN_SUPPORT;
}
