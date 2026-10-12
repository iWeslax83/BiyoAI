// Splits source text into pieces for embedding. Pieces end at sentence
// boundaries where possible so a retrieved chunk reads as complete thoughts,
// and the tail of one chunk is repeated at the start of the next (when it
// fits the overlap budget) so a fact split across a boundary is still found.

type Options = { maxChars?: number; overlap?: number };

// Paragraphs first, then sentences. The lookbehind keeps the punctuation with
// its sentence.
function splitUnits(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?…])\s+/))
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Fallback for a single run of text with no usable boundary (a very long
// sentence, or text with no punctuation): fixed-size windows with overlap.
function hardSplit(text: string, maxChars: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function splitIntoChunks(text: string, opts: Options = {}): string[] {
  const maxChars = opts.maxChars ?? 1000;
  const overlap = opts.overlap ?? 100;
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let current: string[] = [];

  const joined = () => current.join(" ");
  const flush = () => {
    if (current.length > 0) chunks.push(joined());
  };

  for (const unit of splitUnits(trimmed)) {
    if (unit.length > maxChars) {
      flush();
      current = [];
      chunks.push(...hardSplit(unit, maxChars, overlap));
      continue;
    }

    if (current.length > 0 && joined().length + 1 + unit.length > maxChars) {
      flush();
      // Carry trailing sentences into the next chunk while they fit the
      // overlap budget and still leave room for the new sentence.
      const carry: string[] = [];
      let carryLength = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const next = carryLength + current[i].length + (carry.length ? 1 : 0);
        if (next > overlap) break;
        carry.unshift(current[i]);
        carryLength = next;
      }
      current = carryLength + 1 + unit.length <= maxChars ? carry : [];
    }
    current.push(unit);
  }
  flush();

  return chunks;
}
