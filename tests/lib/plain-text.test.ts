import { describe, it, expect } from "vitest";
import { toPlainText } from "../../lib/plain-text";

describe("toPlainText", () => {
  it("removes bold and underline emphasis markers but keeps the words", () => {
    expect(toPlainText("**Mitoz** ve __mayoz__ farklıdır.")).toBe(
      "Mitoz ve mayoz farklıdır.",
    );
  });

  it("removes heading markers at the start of a line", () => {
    expect(toPlainText("## Evreler\nProfaz")).toBe("Evreler\nProfaz");
  });

  it("turns asterisk bullets into dashes", () => {
    expect(toPlainText("* bir\n* iki")).toBe("- bir\n- iki");
  });

  it("flattens markdown tables into one row per line", () => {
    const table = "| Özellik | Mitoz |\n|---|---|\n| Amaç | Büyüme |";
    expect(toPlainText(table)).toBe("Özellik: Mitoz\nAmaç: Büyüme");
  });

  it("keeps citation tags and ordinary text untouched", () => {
    const text = "Mitoz bölünmedir. [kaynak:3]\n1. Profaz\n- not";
    expect(toPlainText(text)).toBe(text);
  });

  it("does not touch a single asterisk used as a symbol", () => {
    expect(toPlainText("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("removes single-asterisk italics but leaves arithmetic alone", () => {
    expect(toPlainText("- *Mitoz*: büyüme ve *mayoz*: üreme")).toBe(
      "- Mitoz: büyüme ve mayoz: üreme",
    );
    expect(toPlainText("2 * 3 * 4 = 24")).toBe("2 * 3 * 4 = 24");
  });
});
