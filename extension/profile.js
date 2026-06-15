export const PROFILE_SCHEMA_VERSION = 1;
export const DEFAULT_PROFILE_ID = "default";

export const DEFAULT_FIELD_DEFINITIONS = [
  {
    key: "full_name",
    label: "ชื่อ-นามสกุล",
    aliases: ["ชื่อผู้สมัคร", "ชื่อจริงและนามสกุล"],
  },
  {
    key: "phone",
    label: "เบอร์โทรศัพท์",
    aliases: ["เบอร์ติดต่อ", "หมายเลขโทรศัพท์"],
  },
  {
    key: "email",
    label: "อีเมล",
    aliases: ["อีเมลแอดเดรส", "ที่อยู่อีเมล"],
  },
  {
    key: "province",
    label: "จังหวัด",
    aliases: ["จังหวัดที่อาศัยอยู่", "จังหวัดปัจจุบัน"],
  },
];

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeAliases(aliases) {
  if (!Array.isArray(aliases)) {
    return aliases;
  }

  return aliases
    .map(trimString)
    .filter((alias) => typeof alias !== "string" || alias.length > 0);
}

export function createDefaultProfile(now = new Date().toISOString()) {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: DEFAULT_PROFILE_ID,
    revision: 0,
    updatedAt: now,
    fields: DEFAULT_FIELD_DEFINITIONS.map((field) => ({
      ...field,
      aliases: [...field.aliases],
      value: "",
      isDefault: true,
    })),
  };
}

export function normalizeProfile(input) {
  const source = input && typeof input === "object" ? input : {};
  const fields = Array.isArray(source.fields) ? source.fields : source.fields;

  return {
    schemaVersion: source.schemaVersion,
    profileId: trimString(source.profileId),
    revision: source.revision,
    updatedAt: trimString(source.updatedAt),
    fields: Array.isArray(fields)
      ? fields.map((field) => ({
          key: trimString(field?.key),
          label: trimString(field?.label),
          aliases: normalizeAliases(field?.aliases),
          value: trimString(field?.value),
          isDefault: field?.isDefault,
        }))
      : fields,
  };
}

export function validateProfile(input) {
  const profile = normalizeProfile(input);
  const errors = {};
  const fieldErrors = [];

  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    errors.schemaVersion = `schemaVersion must be ${PROFILE_SCHEMA_VERSION}`;
  }

  if (profile.profileId !== DEFAULT_PROFILE_ID) {
    errors.profileId = `profileId must be "${DEFAULT_PROFILE_ID}"`;
  }

  if (!Number.isInteger(profile.revision) || profile.revision < 0) {
    errors.revision = "revision must be a non-negative integer";
  }

  if (
    typeof profile.updatedAt !== "string" ||
    !profile.updatedAt ||
    Number.isNaN(Date.parse(profile.updatedAt))
  ) {
    errors.updatedAt = "updatedAt must be a valid ISO date";
  }

  if (!Array.isArray(profile.fields)) {
    errors.fields = "fields must be an array";
    return { valid: false, profile, errors, fieldErrors };
  }

  const seenKeys = new Set();
  const seenAliases = new Set();

  profile.fields.forEach((field, index) => {
    const currentErrors = {};

    if (typeof field.key !== "string" || !FIELD_KEY_PATTERN.test(field.key)) {
      currentErrors.key = "Use lowercase snake_case, for example company_name";
    } else if (seenKeys.has(field.key)) {
      currentErrors.key = "Field key must be unique";
    } else {
      seenKeys.add(field.key);
    }

    if (typeof field.label !== "string" || !field.label) {
      currentErrors.label = "Label is required";
    }

    if (!Array.isArray(field.aliases)) {
      currentErrors.aliases = "Aliases must be an array";
    } else {
      const aliases = field.aliases.map((alias) =>
        typeof alias === "string" ? alias.toLocaleLowerCase() : alias,
      );

      if (aliases.some((alias) => typeof alias !== "string")) {
        currentErrors.aliases = "Every alias must be a string";
      } else {
        for (const alias of aliases) {
          if (seenAliases.has(alias)) {
            currentErrors.aliases = "Aliases must be unique across the profile";
            break;
          }
          seenAliases.add(alias);
        }
      }
    }

    if (typeof field.value !== "string") {
      currentErrors.value = "Value must be a string";
    } else if (field.key === "email" && field.value && !EMAIL_PATTERN.test(field.value)) {
      currentErrors.value = "Enter a valid email address";
    }

    if (typeof field.isDefault !== "boolean") {
      currentErrors.isDefault = "isDefault must be a boolean";
    }

    fieldErrors[index] = currentErrors;
  });

  for (const definition of DEFAULT_FIELD_DEFINITIONS) {
    const fieldIndex = profile.fields.findIndex((field) => field.key === definition.key);

    if (fieldIndex === -1) {
      errors.fields = `Missing default field: ${definition.key}`;
      continue;
    }

    if (profile.fields[fieldIndex].isDefault !== true) {
      fieldErrors[fieldIndex].isDefault = "Default fields must have isDefault set to true";
    }
  }

  profile.fields.forEach((field, index) => {
    const isKnownDefault = DEFAULT_FIELD_DEFINITIONS.some(
      (definition) => definition.key === field.key,
    );

    if (!isKnownDefault && field.isDefault !== false) {
      fieldErrors[index].isDefault = "Custom fields must have isDefault set to false";
    }
  });

  const hasFieldErrors = fieldErrors.some(
    (currentErrors) => Object.keys(currentErrors).length > 0,
  );

  return {
    valid: Object.keys(errors).length === 0 && !hasFieldErrors,
    profile,
    errors,
    fieldErrors,
  };
}
