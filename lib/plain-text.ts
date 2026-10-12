// The board shows answers as plain text, so formatting marks that models like
// to emit would appear literally. The prompt asks for plain text; this is the
// safety net for when the model ignores that.

export function toPlainText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    // Table separator rows ("|---|---|") carry no content.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line))
      continue;

    let result = line;
    // Table rows: "| a | b |" becomes "a: b".
    if (/^\s*\|.*\|\s*$/.test(result)) {
      const cells = result
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      result = cells.join(": ");
    }
    result = result
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^(\s*)\*\s+/, "$1- ")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      // Single-asterisk italics: the text must touch both asterisks, so
      // "2 * 3 * 4" is left alone.
      .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1");
    out.push(result);
  }
  return out.join("\n");
}
