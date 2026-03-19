// Unicode ranges for Thai script: U+0E00 to U+0E7F
const THAI_REGEX = /[\u0E00-\u0E7F]/;
const LATIN_REGEX = /[A-Za-z]/;

export type DetectedLanguage = "th" | "en" | "mixed";

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length === 0) return "en";

  let thaiChars = 0;
  let latinChars = 0;

  for (const char of text) {
    if (THAI_REGEX.test(char)) thaiChars++;
    else if (LATIN_REGEX.test(char)) latinChars++;
  }

  const total = thaiChars + latinChars;
  if (total === 0) return "en";

  const thaiRatio = thaiChars / total;

  if (thaiRatio > 0.7) return "th";
  if (thaiRatio < 0.3) return "en";
  return "mixed";
}
