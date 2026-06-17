/**
 * Text normalizer for Thai and English form questions.
 *
 * Removes filler words, punctuation, ordinal numbers, and extra whitespace,
 * then lowercases the result.
 */

/**
 * Regex patterns for filler words/phrases to strip.
 * Order matters: longer patterns first so they are matched before shorter substrings.
 */
const FILLER_PATTERNS = [
  // Thai filler phrases
  /กรุณา(?:ระบุ|กรอก|ตอบ)/gu,
  /โปรด(?:กรอก|ระบุ|ตอบ)/gu,
  /กรุณา/gu,
  /โปรด/gu,
  /กรุณา(?:ที่อยู่|เบอร์)/gu,
  /โปรด(?:กรอก|ระบุ)/gu,

  // English filler phrases
  /please\s+(?:enter|provide|fill\s+in|type|specify)/gi,
  /please\s+(?:enter|provide)/gi,
  /please\s+enter/gi,
  /please/gi,

  // Common suffixes
  /required/gi,
  /\s*\(required\)/gi,
  /\s*\*$/gu,
];

/**
 * Ordinal number patterns: "1.", "2)", "3-", "01.", "ก.", "ข."
 */
const ORDINAL_PATTERN = /^(?:\d+[\.\)\-]|\d{2}[\.\-]|[ก-๛][\.])\s*/gu;

/**
 * Punctuation and symbols to strip.
 */
const PUNCTUATION_PATTERN = /[*\-_\[\]{}<>—…~`"'"()]/gu;

/**
 * Normalize a question text string for matching.
 *
 * Steps:
 *   1. Trim whitespace
 *   2. Remove ordinal prefixes (1., 2), ก., etc.)
 *   3. Remove filler words/phrases
 *   4. Remove punctuation
 *   5. Collapse whitespace
 *   6. Lowercase
 *
 * @param {string} text - Raw question text
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (typeof text !== "string" || !text) {
    return "";
  }

  let result = text.trim();

  // Remove ordinal prefixes
  result = result.replace(ORDINAL_PATTERN, "");

  // Remove filler words/phrases
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Remove punctuation
  result = result.replace(PUNCTUATION_PATTERN, "");

  // Collapse whitespace
  result = result.replace(/\s+/gu, " ").trim();

  // Lowercase
  result = result.toLocaleLowerCase();

  return result;
}

/**
 * Exposed for testing — do not use outside tests.
 * @ignore
 */
export const FILLER_PATTERNS_LIST = FILLER_PATTERNS;
export const ORDINAL_PATTERN_REGEXP = ORDINAL_PATTERN;
export const PUNCTUATION_PATTERN_REGEXP = PUNCTUATION_PATTERN;
