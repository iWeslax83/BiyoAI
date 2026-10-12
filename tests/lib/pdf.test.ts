import { describe, it, expect } from "vitest";
import { extractPdfText } from "../../lib/pdf";

// Builds a one-page PDF containing `text` with correct xref offsets, so the
// test exercises the real parser instead of a mock.
function buildPdf(text: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 18 Tf 20 80 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 18 Tf 20 80 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("extractPdfText", () => {
  it("extracts the text of a PDF", async () => {
    const text = await extractPdfText(buildPdf("Mitokondri enerji uretir"));
    expect(text).toContain("Mitokondri enerji uretir");
  });

  it("throws on data that is not a PDF", async () => {
    await expect(
      extractPdfText(new TextEncoder().encode("bu bir pdf degil")),
    ).rejects.toThrow();
  });
});
