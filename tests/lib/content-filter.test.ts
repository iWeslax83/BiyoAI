import { describe, it, expect } from "vitest";
import { isInappropriate } from "../../lib/content-filter";

describe("isInappropriate", () => {
  it("flags a plain profanity", () => {
    expect(isInappropriate("siktir git")).toBe(true);
  });

  it("flags profanity regardless of case and Turkish characters", () => {
    expect(isInappropriate("SİKTİR")).toBe(true);
    expect(isInappropriate("Orospu çocuğu")).toBe(true);
  });

  it("flags profanity written without Turkish diacritics", () => {
    expect(isInappropriate("orospu cocugu")).toBe(true);
  });

  it("flags profanity surrounded by punctuation", () => {
    expect(isInappropriate("Bu ne be, aptal!")).toBe(true);
  });

  it("allows ordinary biology questions", () => {
    expect(isInappropriate("Mitoz ve mayoz arasındaki fark nedir?")).toBe(
      false,
    );
  });

  it("allows legitimate reproductive system vocabulary", () => {
    expect(isInappropriate("Erkek üreme sisteminde penis ne işe yarar?")).toBe(
      false,
    );
    expect(isInappropriate("Meme bezleri süt üretimini nasıl sağlar?")).toBe(
      false,
    );
  });

  it("does not flag a profanity stem hidden inside an unrelated word", () => {
    expect(isInappropriate("Hücre döngüsünde siklus ne demek?")).toBe(false);
    expect(isInappropriate("Sıkıştırma ve gaz basıncı")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isInappropriate("")).toBe(false);
  });
});
