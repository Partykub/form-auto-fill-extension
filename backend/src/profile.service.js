import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProfile } from "../../extension/profile.js";
import { JsonProfileStorage } from "./json-profile.storage.js";
import {
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileValidationError,
} from "./profile.errors.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_PATH = path.resolve(currentDirectory, "../data/profile.json");

export class ProfileService {
  constructor(storage, { now = () => new Date().toISOString() } = {}) {
    this.storage = storage;
    this.now = now;
    this.writeQueue = Promise.resolve();
  }

  async get() {
    const profile = await this.storage.read();

    if (!profile) {
      throw new ProfileNotFoundError();
    }

    const result = validateProfile(profile);

    if (!result.valid) {
      throw new ProfileValidationError({
        message: "Stored profile is invalid",
      });
    }

    return result.profile;
  }

  async save(profileInput, expectedRevision) {
    const operation = this.writeQueue.then(() =>
      this.saveWithRevisionCheck(profileInput, expectedRevision),
    );
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async saveWithRevisionCheck(profileInput, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new ProfileValidationError({
        expectedRevision: "expectedRevision must be a non-negative integer",
      });
    }

    const result = validateProfile(profileInput);

    if (!result.valid) {
      throw new ProfileValidationError({
        profile: result.errors,
        fields: result.fieldErrors,
      });
    }

    const currentProfile = await this.storage.read();
    const currentRevision = currentProfile?.revision ?? 0;

    if (expectedRevision !== currentRevision) {
      throw new ProfileConflictError(currentProfile);
    }

    const profile = {
      ...result.profile,
      revision: currentRevision + 1,
      updatedAt: this.now(),
    };

    await this.storage.write(profile);
    return profile;
  }
}

export function createProfileService(filePath = DEFAULT_PROFILE_PATH) {
  return new ProfileService(new JsonProfileStorage(filePath));
}
