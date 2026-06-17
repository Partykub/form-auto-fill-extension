/**
 * Mapping service — orchestrates question-to-field matching.
 *
 * Matching priority:
 *   1. Manual mapping (mock data / request context)
 *   2. Exact match (pattern bank)
 *   3. Rule-based fallback (similarity with type hint)
 *
 * No AI models, no external APIs.
 */

import { normalizeText } from "./text-normalizer.js";
import { createPatternBank } from "./pattern-bank.js";
import { createSimilarityService } from "./similarity.service.js";

/**
 * Creates a mapping service.
 *
 * @param {object} config
 * @param {object} [config.profileService] - Profile service for loading profiles
 * @param {object} [config.similarityService] - Similarity service (creates default if not provided)
 * @param {object} [config.patternBank] - Pattern bank (creates from profile if not provided)
 * @param {Array} [config.manualMappings] - Manual mapping overrides [{question: string, field: string, value: string}]
 * @returns {MappingService}
 */
export function createMappingService(config = {}) {
  const {
    profileService,
    similarityService = createSimilarityService(),
    patternBank,
    manualMappings = [],
  } = config;

  return new MappingService({
    profileService,
    similarityService,
    patternBank,
    manualMappings,
  });
}

/**
 * Orchestrator for matching form questions to profile fields.
 */
export class MappingService {
  /**
   * @param {object} config
   * @param {object} [config.profileService]
   * @param {object} [config.similarityService]
   * @param {object} [config.patternBank]
   * @param {Array} [config.manualMappings]
   */
  constructor({ profileService, similarityService, patternBank, manualMappings = [] }) {
    this.profileService = profileService;
    this.similarityService = similarityService;
    this.patternBank = patternBank;
    this.manualMappings = manualMappings;
  }

  /**
   * Match a single question against the profile.
   *
   * Priority:
   *   1. Manual mapping
   *   2. Exact match from pattern bank
   *   3. Rule-based similarity with type hint
   *
   * @param {object} question - Question object with id, text, type
   * @param {string} question.id - Question ID
   * @param {string} question.text - Raw question text
   * @param {string} [question.type] - Question type (short_text, email, phone, etc.)
   * @param {object} [profile] - Profile object (loads from service if not provided)
   * @returns {Promise<object|null>} Match result or null
   */
  async matchQuestion(question, profile) {
    const normalizedText = normalizeText(question.text);

    // Step 1: Manual mapping
    const manualResult = this._matchManual(normalizedText, profile);
    if (manualResult) {
      return {
        ...manualResult,
        id: question.id,
        matchSource: "manual_mapping",
      };
    }

    // Step 2: Build pattern bank if not already provided
    let patterns = [];
    let bank = this.patternBank;

    if (!bank) {
      const prof = profile || (this.profileService ? await this._loadProfile() : null);
      if (prof) {
        bank = createPatternBank(prof);
        patterns = bank.getEntries();
      }
    } else {
      patterns = bank.getEntries();
    }

    if (!patterns || patterns.length === 0) {
      return null;
    }

    // Step 3: Exact match from pattern bank
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const profileData = profile || (this.profileService ? await this._loadProfile() : null);
      const value = this._getFieldValue(profileData, exactMatch);

      return {
        id: question.id,
        field: exactMatch,
        value,
        confidence: 1.0,
        matchSource: "exact",
      };
    }

    // Step 4: Rule-based similarity with type hint
    const patternEntries = patterns.map((entry) => ({
      text: entry.patterns[0] || "", // Use first pattern as primary
      key: entry.key,
    }));

    // Get type hint from question
    const typeHint = this._getTypeHint(question.type);

    const similarityResult = this.similarityService.scoreWithHint(
      normalizedText,
      patternEntries,
      typeHint,
    );

    if (similarityResult) {
      const profileData = profile || (this.profileService ? await this._loadProfile() : null);
      similarityResult.value = this._getFieldValue(profileData, similarityResult.field);

      return {
        id: question.id,
        ...similarityResult,
      };
    }

    return null;
  }

  /**
   * Match multiple questions at once.
   *
   * @param {Array<object>} questions - Array of question objects
   * @param {object} [profile] - Profile object
   * @returns {Promise<Array<object|null>>} Array of match results
   */
  async matchQuestions(questions, profile) {
    const results = [];

    for (const question of questions) {
      try {
        const result = await this.matchQuestion(question, profile);
        results.push(result);
      } catch (error) {
        // Individual question failures don't break the batch
        console.warn(`Failed to match question ${question.id}:`, error.message);
        results.push(null);
      }
    }

    return results;
  }

  /**
   * Match with manual mapping overrides.
   *
   * @param {string} normalizedText
   * @param {object} [profile]
   * @returns {object|null}
   */
  _matchManual(normalizedText, profile) {
    for (const mapping of this.manualMappings) {
      const normalizedMapping = normalizeText(mapping.question);
      if (normalizedText === normalizedMapping) {
        return {
          field: mapping.field,
          value: mapping.value || this._getFieldValue(profile, mapping.field),
        };
      }
    }
    return null;
  }

  /**
   * Get field value from profile.
   *
   * @param {object} profile
   * @param {string} fieldKey
   * @returns {string}
   */
  _getFieldValue(profile, fieldKey) {
    if (!profile || !Array.isArray(profile.fields)) {
      return "";
    }

    const field = profile.fields.find((f) => f.key === fieldKey);
    return field?.value || "";
  }

  /**
   * Get type hint from question type.
   *
   * @param {string} [questionType]
   * @returns {string|null}
   */
  _getTypeHint(questionType) {
    if (!questionType) return null;

    const type = questionType.toLocaleLowerCase().trim();
    if (type === "email" || type === "e-mail") return "email";
    if (type === "phone" || type === "tel") return "phone";
    if (type === "short_text" || type === "text") return "text";
    if (type === "long_text" || type === "paragraph") return "long_text";

    return null;
  }

  /**
   * Load profile from service.
   *
   * @returns {Promise<object|null>}
   */
  async _loadProfile() {
    if (!this.profileService) return null;
    try {
      return await this.profileService.get();
    } catch {
      return null;
    }
  }
}
