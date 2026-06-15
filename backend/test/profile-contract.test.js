import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultProfile,
  normalizeProfile,
  validateProfile,
} from "../../extension/profile.js";

test("creates the four required default fields", () => {
  const profile = createDefaultProfile("2026-06-15T00:00:00.000Z");

  assert.deepEqual(
    profile.fields.map((field) => field.key),
    ["full_name", "phone", "email", "province"],
  );
  assert.equal(profile.revision, 0);
  assert.ok(profile.fields.every((field) => field.isDefault));
  assert.equal(validateProfile(profile).valid, true);
});

test("normalizes whitespace and removes empty aliases", () => {
  const profile = createDefaultProfile();
  profile.fields[0].label = "  Full name  ";
  profile.fields[0].value = "  Jane Doe  ";
  profile.fields[0].aliases = [" Applicant name ", " ", ""];

  const normalized = normalizeProfile(profile);

  assert.equal(normalized.fields[0].label, "Full name");
  assert.equal(normalized.fields[0].value, "Jane Doe");
  assert.deepEqual(normalized.fields[0].aliases, ["Applicant name"]);
});

test("rejects invalid custom keys, duplicate keys, aliases, and email", () => {
  const profile = createDefaultProfile();
  profile.fields[2].value = "not-an-email";
  profile.fields[0].aliases = ["Name", "name"];
  profile.fields.push({
    key: "full_name",
    label: "Duplicate",
    aliases: [],
    value: "",
    isDefault: false,
  });
  profile.fields.push({
    key: "Company Name",
    label: "",
    aliases: [],
    value: "",
    isDefault: false,
  });

  const result = validateProfile(profile);

  assert.equal(result.valid, false);
  assert.match(result.fieldErrors[0].aliases, /unique/);
  assert.match(result.fieldErrors[2].value, /valid email/);
  assert.match(result.fieldErrors[4].key, /unique/);
  assert.match(result.fieldErrors[5].key, /snake_case/);
  assert.match(result.fieldErrors[5].label, /required/);
});

test("rejects an alias reused by another field", () => {
  const profile = createDefaultProfile();
  profile.fields[0].aliases = ["Applicant"];
  profile.fields[1].aliases = ["applicant"];

  const result = validateProfile(profile);

  assert.equal(result.valid, false);
  assert.match(result.fieldErrors[1].aliases, /unique/);
});

test("accepts a valid custom field", () => {
  const profile = createDefaultProfile();
  profile.fields.push({
    key: "company_name",
    label: "ชื่อบริษัท",
    aliases: ["บริษัท", "หน่วยงาน"],
    value: "Example Co.",
    isDefault: false,
  });

  assert.equal(validateProfile(profile).valid, true);
});
