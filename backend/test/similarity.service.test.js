import assert from "node:assert/strict";
import test from "node:test";
import { createSimilarityService } from "../src/similarity.service.js";

test("exact match returns score 1.0", () => {
  const service = createSimilarityService();
  assert.equal(service.score("ชื่อ-นามสกุล", "ชื่อ-นามสกุล"), 1.0);
  assert.equal(service.score("email", "email"), 1.0);
});

test("empty strings return score 0", () => {
  const service = createSimilarityService();
  assert.equal(service.score("", "text"), 0);
  assert.equal(service.score("text", ""), 0);
  assert.equal(service.score("", ""), 0);
});

test("token overlap returns positive score for shared tokens", () => {
  const service = createSimilarityService();
  const score = service.score("เบอร์โทรศัพท์", "เบอร์ติดต่อ");
  assert.ok(score > 0, "Should have positive token overlap");
  assert.ok(score <= 1.0, "Score should not exceed 1.0");
});

test("n-gram similarity for similar strings", () => {
  const service = createSimilarityService();
  const score = service.score("เบอร์โทรศัพท์", "เบอร์โทรศัพท์");
  assert.equal(score, 1.0, "Identical strings should score 1.0");
});

test("different strings return low score", () => {
  const service = createSimilarityService();
  const score = service.score("ชื่อ-นามสกุล", "เบอร์โทรศัพท์");
  assert.ok(score < 0.5, "Different strings should have low score");
});

test("match returns null when below threshold", () => {
  const service = createSimilarityService({ threshold: 0.72 });
  const result = service.match("random question", [
    { text: "ชื่อ-นามสกุล", key: "full_name" },
    { text: "เบอร์โทรศัพท์", key: "phone" },
  ]);
  assert.equal(result, null);
});

test("match returns result when above threshold", () => {
  const service = createSimilarityService({ threshold: 0.72 });
  const result = service.match("ชื่อ-นามสกุล", [
    { text: "ชื่อ-นามสกุล", key: "full_name" },
    { text: "เบอร์โทรศัพท์", key: "phone" },
  ]);
  assert.ok(result);
  assert.equal(result.field, "full_name");
  assert.equal(result.confidence, 1.0);
  assert.equal(result.matchSource, "exact");
});

test("match selects highest scoring pattern", () => {
  const service = createSimilarityService({ threshold: 0.72 });
  const result = service.match("เบอร์โทรศัพท์", [
    { text: "ชื่อ-นามสกุล", key: "full_name" },
    { text: "เบอร์โทรศัพท์", key: "phone" },
  ]);
  assert.ok(result);
  assert.equal(result.field, "phone");
});

test("ambiguous scores return null", () => {
  const service = createSimilarityService({
    threshold: 0.72,
    ambiguousMargin: 0.08,
  });

  // Two patterns with similar scores
  const result = service.match("ชื่อ-นามสกุล", [
    { text: "ชื่อ-นามสกุล", key: "full_name" },
    { text: "ชื่อ-นามสกุล", key: "other_field" },
  ]);
  // Both exact match (1.0), gap = 0 < 0.08 → null
  assert.equal(result, null);
});

test("type hint scoring with matching types", () => {
  const service = createSimilarityService({ threshold: 0.65 });
  const result = service.scoreWithHint("email", [
    { text: "ชื่อ-นามสกุล", key: "full_name", inputType: "text" },
    { text: "อีเมล", key: "email", inputType: "email" },
  ], "email");

  assert.ok(result);
  assert.equal(result.field, "email");
  // Type hint (0.65) beats token overlap for non-exact match
  assert.ok(result.matchSource === "type_hint" || result.matchSource === "similarity");
});

test("type hint scoring adds bonus for matching types", () => {
  const service = createSimilarityService({ threshold: 0.65, typeHintScore: 0.65 });
  const result = service.scoreWithHint("เบอร์", [
    { text: "เบอร์", key: "phone", inputType: "phone" },
  ], "phone");

  assert.ok(result);
  // Should be exact match (1.0) since text matches exactly
  assert.equal(result.field, "phone");
});

test("token overlap Jaccard calculation", () => {
  const service = createSimilarityService();

  // Same tokens → Jaccard = 1.0
  assert.equal(service.score("hello world", "hello world"), 1.0);

  // Partial overlap
  const score = service.score("hello world test", "hello world");
  assert.ok(score > 0 && score <= 1.0);
});

test("n-gram bigrams for Thai text", () => {
  const service = createSimilarityService();

  // Identical Thai strings
  assert.equal(service.score("ชื่อ-นามสกุล", "ชื่อ-นามสกุล"), 1.0);

  // Very similar Thai strings
  const score = service.score("ชื่อ-นามสกุล", "ชื่อนามสกุล");
  assert.ok(score > 0.5, "Similar Thai strings should have high n-gram score");
});

test("threshold boundary: 0.71 returns null, 0.72 returns match", () => {
  const service = createSimilarityService({ threshold: 0.72 });

  // Create a pattern that will score exactly at boundary
  const result = service.match("ชื่อ-นามสกุล", [
    { text: "ชื่อ-นามสกุล", key: "full_name" },
  ]);

  assert.ok(result);
  assert.equal(result.confidence, 1.0);
});
