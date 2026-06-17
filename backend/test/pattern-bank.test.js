import assert from "node:assert/strict";
import test from "node:test";
import { createPatternBank } from "../src/pattern-bank.js";
import { normalizeText } from "../src/text-normalizer.js";

function createTestProfile(fields) {
  return {
    schemaVersion: 1,
    profileId: "default",
    revision: 0,
    updatedAt: "2026-06-15T00:00:00.000Z",
    fields: fields || [
      {
        key: "full_name",
        label: "ชื่อ-นามสกุล",
        aliases: ["ชื่อ-นามสกุล"],
        value: "John Doe",
        isDefault: true,
      },
      {
        key: "phone",
        label: "เบอร์โทรศัพท์",
        aliases: ["เบอร์ติดต่อ"],
        value: "0812345678",
        isDefault: true,
      },
      {
        key: "email",
        label: "อีเมล",
        aliases: ["ที่อยู่อีเมล"],
        value: "john@example.com",
        isDefault: true,
      },
      {
        key: "province",
        label: "จังหวัด",
        aliases: ["จังหวัดที่อาศัยอยู่"],
        value: "Bangkok",
        isDefault: true,
      },
    ],
  };
}

test("creates pattern bank from default profile", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const patterns = bank.getAllPatterns();

  assert.ok(patterns.length > 0, "Should have patterns");
  assert.ok(
    patterns.some((p) => p.includes("ชื่อ")),
    "Should contain full_name label",
  );
  assert.ok(
    patterns.some((p) => p.includes("เบอร์")),
    "Should contain phone label",
  );
});

test("exact match returns field key", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);

  // Use the normalized form of the label (same as stored in bank)
  const label = profile.fields[0].label;
  const normalizedLabel = normalizeText(label);
  const fullNameMatch = bank.matchExact(normalizedLabel);
  assert.equal(fullNameMatch, "full_name");

  // Should match normalized alias
  const alias = profile.fields[1].aliases[0];
  const normalizedAlias = normalizeText(alias);
  const phoneMatch = bank.matchExact(normalizedAlias);
  assert.equal(phoneMatch, "phone");
});

test("no match returns null", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);

  const result = bank.matchExact("random unknown question");
  assert.equal(result, null);
});

test("hasPattern returns true for known patterns", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);

  // Use normalized forms
  assert.ok(bank.hasPattern(normalizeText("ชื่อ-นามสกุล")));
  assert.ok(bank.hasPattern(normalizeText("เบอร์โทรศัพท์")));
});

test("hasPattern returns false for unknown patterns", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);

  assert.ok(!bank.hasPattern("unknown field"));
});

test("getEntries returns all field entries", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const entries = bank.getEntries();

  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);

  for (const entry of entries) {
    assert.ok(typeof entry.key === "string");
    assert.ok(Array.isArray(entry.patterns));
  }
});

test("default patterns are included", () => {
  const profile = createTestProfile();
  const bank = createPatternBank(profile);
  const patterns = bank.getAllPatterns();

  // Default patterns should include English keywords
  assert.ok(
    patterns.some((p) => p.includes("email")),
    "Should include email keyword",
  );
  assert.ok(
    patterns.some((p) => p.includes("phone")),
    "Should include phone keyword",
  );
});

test("empty profile creates bank with only defaults", () => {
  const bank = createPatternBank({});
  const patterns = bank.getAllPatterns();

  assert.ok(patterns.length > 0, "Should have default patterns");
});

test("null profile creates bank with only defaults", () => {
  const bank = createPatternBank(null);
  const patterns = bank.getAllPatterns();

  assert.ok(patterns.length > 0, "Should have default patterns");
});
