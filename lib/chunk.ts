export function splitIntoChunks(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {}
): string[] {
  const maxChars = opts.maxChars ?? 1000
  const overlap = opts.overlap ?? 100
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const chunks: string[] = []
  let start = 0
  while (start < trimmed.length) {
    const end = Math.min(start + maxChars, trimmed.length)
    chunks.push(trimmed.slice(start, end))
    if (end === trimmed.length) break
    start = end - overlap
  }
  return chunks
}
