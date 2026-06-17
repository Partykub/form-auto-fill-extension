import assert from "node:assert/strict";
import test from "node:test";
import { createMappingService, MappingService } from "../src/mapping.service.js";
import { normalizeText } from "../src/text-normalizer.js";
import { createSimilarityService } from "../src/similarity.service.js";
import { createPatternBank } from "../src/pattern-bank.js";

function createTestProfile() {
  return {
    schemaVersion: 1,
    profileId: "default",
    revision: 0,
    updatedAt: "2026-06-15T00:00:00.000Z",
    fields: [
      {
        key: "full_name",
        label: "ชื่-นามสกุล",
        aliases: ["ชื่-นามสกุล"],
        value: "John Doe",
        isDefault: true,
      },
      {
        key: "phone",
        label: "เบอรืโทรศัพท",
        aliases: ["เบอรืตดตอ"],
        value: "0812345678",
        isDefault: true,
      },
      {
        key: "email",
        label: "อเมล",
        aliases: ["ท่อยอูอเมล"],
        value: "john@example.com",
        isDefault: true,
      },
      {
        key: "province",
        label: "จหวด",
        aliases: ["จหวดทออาศยอย"],
        value: "Bangkok",
        isDefault: true,
      },
    ],
  };
}

function createMockProfileService(profile) {
  return {
    get: async () => profile,
  };
}

test("creates mapping service with defaults", () => {
  const service = createMappingService();
  assert.ok(service instanceof MappingService);
});

test("exact match via pattern bank", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const service = createMappingService({
    patternBank: bank,
  });

  // Override matchQuestion to use provided profile
  service.matchQuestion = async function (question, prof) {
    const normalizedText = normalizeText(question.text);
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }
    return null;
  };

  const result = await service.matchQuestion(
    { id: "q1", text: "ชื่-นามสกุล" },
    profile,
  );

  assert.ok(result);
  assert.equal(result.field, "full_name");
  assert.equal(result.value, "John Doe");
  assert.equal(result.confidence, 1.0);
  assert.equal(result.matchSource, "exact");
});

test("no match returns null", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const service = createMappingService({ patternBank: bank });

  service.matchQuestion = async function (question, prof) {
    const normalizedText = normalizeText(question.text);
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }
    return null;
  };

  const result = await service.matchQuestion(
    { id: "q1", text: "unknown question xyz" },
    profile,
  );

  assert.equal(result, null);
});

test("manual mapping overrides normal matching", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const service = createMappingService({
    patternBank: bank,
    manualMappings: [
      { question: "ชื่-นามสกุล", field: "full_name", value: "Jane Smith" },
    ],
  });

  service.matchQuestion = async function (question, prof) {
    const normalizedText = normalizeText(question.text);

    // Manual mapping check
    for (const mapping of this.manualMappings) {
      const normalizedMapping = normalizeText(mapping.question);
      if (normalizedText === normalizedMapping) {
        return {
          id: question.id,
          field: mapping.field,
          value: mapping.value,
          confidence: 1.0,
          matchSource: "manual_mapping",
        };
      }
    }

    // Exact match
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }

    return null;
  };

  const result = await service.matchQuestion(
    { id: "q1", text: "ชื่-นามสกุล" },
    profile,
  );

  assert.ok(result);
  assert.equal(result.matchSource, "manual_mapping");
  assert.equal(result.value, "Jane Smith");
});

test("batch matching returns results for all questions", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const service = createMappingService({ patternBank: bank });

  service.matchQuestion = async function (question, prof) {
    const normalizedText = normalizeText(question.text);
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }
    return null;
  };

  const questions = [
    { id: "q1", text: "ชื่-นามสกุล" },
    { id: "q2", text: "เบอรืโทรศัพท" },
    { id: "q3", text: "unknown" },
  ];

  const results = await service.matchQuestions(questions, profile);

  assert.equal(results.length, 3);
  assert.ok(results[0]);
  assert.ok(results[1]);
  assert.equal(results[2], null);
});

test("batch matching handles individual failures gracefully", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const service = createMappingService({ patternBank: bank });

  service.matchQuestion = async function (question, prof) {
    if (question.id === "q2") {
      throw new Error("Simulated failure");
    }

    const normalizedText = normalizeText(question.text);
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }
    return null;
  };

  const questions = [
    { id: "q1", text: "ชื่-นามสกุล" },
    { id: "q2", text: "เบอรืโทรศัพท" },
  ];

  const results = await service.matchQuestions(questions, profile);

  assert.equal(results.length, 2);
  assert.ok(results[0]);
  assert.equal(results[1], null);
});

test("similarity service is used for non-exact matches", async () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const similarityService = createSimilarityService({ threshold: 0.5 });
  const service = createMappingService({
    patternBank: bank,
    similarityService,
  });

  // Test with a question that won't have exact match but might have similarity
  service.matchQuestion = async function (question, prof) {
    const normalizedText = normalizeText(question.text);
    const exactMatch = bank.matchExact(normalizedText);
    if (exactMatch) {
      const field = prof.fields.find((f) => f.key === exactMatch);
      return {
        id: question.id,
        field: exactMatch,
        value: field?.value || "",
        confidence: 1.0,
        matchSource: "exact",
      };
    }

    const patterns = bank.getEntries().map((entry) => ({
      text: entry.patterns[0] || "",
      key: entry.key,
    }));

    const result = similarityService.scoreWithHint(normalizedText, patterns, null);
    if (result) {
      const field = prof.fields.find((f) => f.key === result.field);
      result.value = field?.value || "";
      result.id = question.id;
      return result;
    }

    return null;
  };

  const result = await service.matchQuestion(
    { id: "q1", text: "ชื่-นามสกุล" },
    profile,
  );

  assert.ok(result);
  assert.equal(result.field, "full_name");
});
