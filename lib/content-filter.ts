// Basic word-list filter for student questions (first line of defence, Groq's
// own safety layer is the second). Deliberately small: it only covers
// profanity and insults. Reproductive-system vocabulary (penis, meme, vajina)
// is part of the 11th grade biology curriculum and must stay allowed.

// Words below are written in normalized form (see normalize): lowercase,
// no Turkish diacritics.
const EXACT_WORDS = new Set([
  "amk",
  "aq",
  "amina",
  "amcik",
  "pic",
  "ibne",
  "salak",
  "aptal",
  "dangalak",
  "gavat",
  "pust",
  "boktan",
  "serefsiz",
  "haysiyetsiz",
]);

// Matched as token prefixes so common suffixes ("siktirgit", "orospuluk")
// are caught. Every stem is at least 5 letters to avoid hitting ordinary
// biology terms.
const PREFIX_STEMS = [
  "siktir",
  "sikeyim",
  "sikerim",
  "sikik",
  "orospu",
  "aminakoy",
  "aminakod",
  "amcik",
  "yarrak",
  "gotver",
  "pezevenk",
  "surtuk",
  "fahise",
  "gerizekal",
  "aptal",
];

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u");
}

export function isInappropriate(text: string): boolean {
  const tokens = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some(
    (token) =>
      EXACT_WORDS.has(token) ||
      PREFIX_STEMS.some((stem) => token.startsWith(stem)),
  );
}
