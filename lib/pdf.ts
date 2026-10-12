import { extractText, getDocumentProxy } from "unpdf";

// Returns the text layer of a PDF. Scanned PDFs (images only) come back as an
// empty string; callers decide how to report that. Throws if the bytes are
// not a readable PDF.
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}
