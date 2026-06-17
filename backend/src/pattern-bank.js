/**
 * Pattern bank for question matching.
 *
 * Combines default field patterns with profile labels, aliases, and keys
 * to create a comprehensive set of patterns for matching form questions
 * to profile fields.
 */

import { normalizeText } from "./text-normalizer.js";

/**
 * Default patterns for well-known fields.
 * These are used as fallback when no profile is available or when
 * the profile doesn't cover a particular field.
 */
const DEFAULT_PATTERNS = [
  {
    key: "full_name",
    patterns: [
      "ชื่-นามสกุล",
      "ชื่-นามสกุลจริง",
      "ชื่-นามสกุลผสู้ มัคร",
      "full name",
      "ชื่อ",
      "นามสกุล",
      "ชื่อจริงและนามสกุล",
      "ชื่อ-นามสกุล",
      "ชื่อจริง",
      "full_name",
      "fullname",
    ],
  },
  {
    key: "phone",
    patterns: [
      "เบอร์",
      "เบอร์โทร",
      "เบอร์โทรศัพท์",
      "เบอร์ติดต่อ",
      "เบอร์ติดต่อกลับ",
      "หมายเลขโทรศัพท์",
      "โทรศัพท์",
      "mobile",
      "phone",
      "tel",
      "telephone",
    ],
  },
  {
    key: "email",
    patterns: [
      "อีเมล",
      "อีเมลแอดเดรส",
      "ที่อยู่อีเมล",
      "e-mail",
      "email",
      "email address",
      "อีเมลล์",
    ],
  },
  {
    key: "province",
    patterns: [
      "จังหวัด",
      "จังหวัดที่อาศัยอยู่",
      "จังหวัดปัจจุบัน",
      "province",
      "state",
      "region",
      "ที่อยู่",
      "address",
    ],
  },
];

/**
 * Creates a pattern bank from a profile object.
 *
 * The bank contains:
 *   - Default patterns for well-known fields
 *   - Profile field labels (normalized)
 *   - Profile field aliases (normalized)
 *   - Profile field keys
 *
 * @param {object} profile - Profile object with fields array
 * @param {object} [profile.fields] - Array of profile fields
 * @returns {PatternBank}
 */
export function createPatternBank(profile) {
  const entries = [];

  // Add default patterns
  for (const defaultPattern of DEFAULT_PATTERNS) {
    entries.push({
      key: defaultPattern.key,
      patterns: defaultPattern.patterns.map((p) => normalizeText(p)),
    });
  }

  // Add profile field patterns
  if (profile && Array.isArray(profile.fields)) {
    for (const field of profile.fields) {
      if (!field.key) continue;

      // Add normalized label
      if (field.label) {
        entries.push({
          key: field.key,
          patterns: [normalizeText(field.label)],
        });
      }

      // Add normalized aliases
      if (Array.isArray(field.aliases)) {
        entries.push({
          key: field.key,
          patterns: field.aliases
            .filter((a) => typeof a === "string")
            .map((a) => normalizeText(a)),
        });
      }

      // Add normalized key itself
      entries.push({
        key: field.key,
        patterns: [normalizeText(field.key)],
      });
    }
  }

  return new PatternBank(entries);
}

/**
 * Pattern bank for matching form questions to profile fields.
 */
export class PatternBank {
  /**
   * @param {Array<{key: string, patterns: string[]>}>} entries
   */
  constructor(entries) {
    /** @type {Map<string, string>} */
    this._exactMap = new Map();

    /** @type {Array<{key: string, patterns: string[]}>} */
    this._entries = [];

    for (const entry of entries) {
      const normalizedPatterns = entry.patterns.map((p) => normalizeText(p));
      this._entries.push({
        key: entry.key,
        patterns: normalizedPatterns,
      });

      // Build exact match index
      for (const pattern of normalizedPatterns) {
        if (pattern && !this._exactMap.has(pattern)) {
          this._exactMap.set(pattern, entry.key);
        }
      }
    }
  }

  /**
   * Get all normalized patterns.
   * @returns {string[]}
   */
  getAllPatterns() {
    const patterns = [];
    for (const entry of this._entries) {
      patterns.push(...entry.patterns);
    }
    return patterns;
  }

  /**
   * Check if a normalized text has an exact match.
   * @param {string} normalizedText
   * @returns {string | null} Field key if matched, null otherwise
   */
  matchExact(normalizedText) {
    const key = this._exactMap.get(normalizedText);
    return key || null;
  }

  /**
   * Check if the bank has any pattern matching the given text exactly.
   * @param {string} normalizedText
   * @returns {boolean}
   */
  hasPattern(normalizedText) {
    return this._exactMap.has(normalizedText);
  }

  /**
   * Get all field entries.
   * @returns {Array<{key: string, patterns: string[]}>}
   */
  getEntries() {
    return this._entries;
  }
}
