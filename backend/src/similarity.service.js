/**
 * Deterministic similarity service for question-to-field matching.
 *
 * Uses rule-based scoring:
 *   1. Exact match → 1.0
 *   2. Type hint match → 0.65
 *   3. Token overlap (Jaccard) → threshold-based
 *   4. Character n-gram similarity → threshold-based
 *
 * No AI models, no external APIs.
 */

import { normalizeText } from "./text-normalizer.js";

/**
 * Default configuration.
 */
const DEFAULT_CONFIG = {
  threshold: 0.72,
  ambiguousMargin: 0.08,
  typeHintScore: 0.65,
};

/**
 * Field type hints — maps field keys to their expected input types.
 */
const FIELD_TYPE_HINTS = {
  email: ["email", "e-mail"],
  phone: ["phone", "tel", "mobile"],
  short_text: ["text", "short_text"],
  long_text: ["long_text", "paragraph"],
};

/**
 * Creates a similarity service with the given configuration.
 *
 * @param {object} [config] - Configuration overrides
 * @param {number} [config.threshold=0.72] - Minimum confidence to accept a match
 * @param {number} [config.ambiguousMargin=0.08] - Minimum gap between top scores to avoid ambiguity
 * @param {number} [config.typeHintScore=0.65] - Score for type hint matches
 * @returns {SimilarityService}
 */
export function createSimilarityService(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  return new SimilarityService(merged);
}

/**
 * Service for computing text similarity scores.
 */
export class SimilarityService {
  /**
   * @param {object} config - Configuration
   * @param {number} config.threshold - Minimum confidence to accept
   * @param {number} config.ambiguousMargin - Minimum gap between top scores
   * @param {number} config.typeHintScore - Score for type hint matches
   */
  constructor(config) {
    this.threshold = config.threshold;
    this.ambiguousMargin = config.ambiguousMargin;
    this.typeHintScore = config.typeHintScore;
  }

  /**
   * Score a normalized question against a normalized pattern.
   *
   * @param {string} question - Normalized question text
   * @param {string} pattern - Normalized pattern text
   * @returns {number} Score between 0 and 1
   */
  score(question, pattern) {
    if (!question || !pattern) {
      return 0;
    }

    // Exact match
    if (question === pattern) {
      return 1.0;
    }

    // Token overlap (Jaccard)
    const tokenScore = this._tokenOverlap(question, pattern);

    // Character n-gram similarity
    const ngramScore = this._ngramSimilarity(question, pattern);

    // Return the higher of the two
    return Math.max(tokenScore, ngramScore);
  }

  /**
   * Match a normalized question against a list of patterns.
   *
   * @param {string} normalizedQuestion
   * @param {Array<{text: string, key: string}>} patterns
   * @returns {object|null} MatchResult or null if below threshold
   */
  match(normalizedQuestion, patterns) {
    let best = null;

    for (const pattern of patterns) {
      const score = this.score(normalizedQuestion, pattern.text);

      if (score > (best?.score ?? -1)) {
        best = { score, key: pattern.key, text: pattern.text };
      }
    }

    if (!best || best.score < this.threshold) {
      return null;
    }

    // Check ambiguity
    const scores = patterns
      .map((p) => ({
        score: this.score(normalizedQuestion, p.text),
        key: p.key,
      }))
      .filter((r) => r.score >= this.threshold)
      .sort((a, b) => b.score - a.score);

    if (scores.length >= 2) {
      const gap = scores[0].score - scores[1].score;
      if (gap < this.ambiguousMargin) {
        return null;
      }
    }

    return {
      field: best.key,
      confidence: best.score,
      matchSource: best.score === 1.0 ? "exact" : best.score >= 0.72 ? "similarity" : "similarity",
    };
  }

  /**
   * Match with type hint scoring.
   *
   * @param {string} normalizedQuestion
   * @param {Array<{text: string, key: string, inputType?: string}>} patterns
   * @param {string} [questionInputType] - Expected input type from the form (e.g., "email", "phone")
   * @returns {object|null} MatchResult or null
   */
  scoreWithHint(normalizedQuestion, patterns, questionInputType) {
    let best = null;
    let bestScore = -1;

    for (const pattern of patterns) {
      let score = this.score(normalizedQuestion, pattern.text);
      let matchSource = score === 1.0 ? "exact" : "similarity";

      // Apply type hint bonus
      if (questionInputType && pattern.inputType) {
        if (this._typesMatch(questionInputType, pattern.inputType)) {
          const hintScore = this.typeHintScore;
          if (hintScore > score) {
            score = hintScore;
            matchSource = "type_hint";
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = {
          field: pattern.key,
          value: "", // Will be filled from profile later
          confidence: score,
          matchSource,
        };
      }
    }

    if (!best || best.confidence < this.threshold) {
      return null;
    }

    // Check ambiguity
    const scored = [];
    for (const pattern of patterns) {
      let score = this.score(normalizedQuestion, pattern.text);
      if (questionInputType && pattern.inputType && this._typesMatch(questionInputType, pattern.inputType)) {
        if (this.typeHintScore > score) {
          score = this.typeHintScore;
        }
      }
      if (score >= this.threshold) {
        scored.push(score);
      }
    }

    scored.sort((a, b) => b - a);
    if (scored.length >= 2 && (scored[0] - scored[1]) < this.ambiguousMargin) {
      return null;
    }

    return best;
  }

  /**
   * Jaccard token overlap similarity.
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} Score between 0 and 1
   */
  _tokenOverlap(a, b) {
    const tokensA = this._tokenize(a);
    const tokensB = this._tokenize(b);

    if (tokensA.length === 0 || tokensB.length === 0) {
      return 0;
    }

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) {
        intersection++;
      }
    }

    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Character n-gram similarity.
   * Uses bigrams for Thai, trigrams for English.
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} Score between 0 and 1
   */
  _ngramSimilarity(a, b) {
    const n = this._detectNGram(a, b);
    const gramsA = this._getNgrams(a, n);
    const gramsB = this._getNgrams(b, n);

    if (gramsA.length === 0 && gramsB.length === 0) {
      return 0;
    }

    let intersection = 0;
    for (const gram of gramsA) {
      if (gramsB.has(gram)) {
        intersection++;
      }
    }

    const union = new Set([...gramsA, ...gramsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Detect appropriate n-gram size based on script.
   * Thai text → bigrams, English text → trigrams.
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} n value (2 for Thai, 3 for English)
   */
  _detectNGram(a, b) {
    const combined = a + b;
    // Check for Thai characters
    const thaiPattern = /[฀-๿]/;
    return thaiPattern.test(combined) ? 2 : 3;
  }

  /**
   * Get n-grams from a string.
   *
   * @param {string} text
   * @param {number} n
   * @returns {Set<string>}
   */
  _getNgrams(text, n) {
    if (text.length < n) {
      return new Set([text]);
    }

    const grams = new Set();
    for (let i = 0; i <= text.length - n; i++) {
      grams.add(text.slice(i, i + n));
    }
    return grams;
  }

  /**
   * Tokenize text into words.
   * For Thai: split by whitespace only (no proper tokenizer in MVP).
   * For English: split by whitespace and punctuation.
   *
   * @param {string} text
   * @returns {string[]}
   */
  _tokenize(text) {
    if (!text) return [];

    // Check if text contains Thai characters
    const thaiPattern = /[฀-๿]/;
    if (thaiPattern.test(text)) {
      // Thai: split by whitespace only
      return text.split(/\s+/).filter((t) => t.length > 0);
    }

    // English: split by whitespace and punctuation
    return text
      .split(/[\s\p{P}]+/gu)
      .filter((t) => t.length > 0);
  }

  /**
   * Check if two input types match.
   *
   * @param {string} typeA
   * @param {string} typeB
   * @returns {boolean}
   */
  _typesMatch(typeA, typeB) {
    const a = typeA.toLocaleLowerCase().trim();
    const b = typeB.toLocaleLowerCase().trim();

    if (a === b) return true;

    // Cross-mapping common types
    const typeGroups = [
      ["email", "e-mail", "mail"],
      ["phone", "tel", "mobile", "telephone"],
      ["text", "short_text", "string"],
      ["long_text", "paragraph", "textarea"],
    ];

    for (const group of typeGroups) {
      if (group.includes(a) && group.includes(b)) {
        return true;
      }
    }

    return false;
  }
}
