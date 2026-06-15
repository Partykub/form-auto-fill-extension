import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDefaultProfile } from "../../extension/profile.js";
import { JsonProfileStorage } from "../src/json-profile.storage.js";
import {
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileStorageError,
  ProfileValidationError,
} from "../src/profile.errors.js";
import { ProfileService } from "../src/profile.service.js";

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "profile-service-"));
  const filePath = path.join(directory, "data", "profile.json");
  const storage = new JsonProfileStorage(filePath);
  const service = new ProfileService(storage, {
    now: () => "2026-06-15T12:00:00.000Z",
  });

  return {
    directory,
    filePath,
    service,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test("returns not found when no profile exists", async () => {
  const fixture = await createFixture();
  await assert.rejects(() => fixture.service.get(), ProfileNotFoundError);
  await fixture.cleanup();
});

test("saves atomically and increments revision", async () => {
  const fixture = await createFixture();
  const profile = createDefaultProfile();

  const saved = await fixture.service.save(profile, 0);
  const stored = JSON.parse(await readFile(fixture.filePath, "utf8"));

  assert.equal(saved.revision, 1);
  assert.equal(saved.updatedAt, "2026-06-15T12:00:00.000Z");
  assert.deepEqual(stored, saved);
  assert.deepEqual(await fixture.service.get(), saved);
  await fixture.cleanup();
});

test("rejects stale revisions without overwriting the profile", async () => {
  const fixture = await createFixture();
  const first = await fixture.service.save(createDefaultProfile(), 0);
  const changed = structuredClone(first);
  changed.fields[0].value = "New value";

  await assert.rejects(
    () => fixture.service.save(changed, 0),
    ProfileConflictError,
  );
  assert.equal((await fixture.service.get()).fields[0].value, "");
  await fixture.cleanup();
});

test("rejects invalid profiles", async () => {
  const fixture = await createFixture();
  const profile = createDefaultProfile();
  profile.fields[2].value = "invalid";

  await assert.rejects(
    () => fixture.service.save(profile, 0),
    ProfileValidationError,
  );
  await fixture.cleanup();
});

test("reports malformed stored JSON without exposing its contents", async () => {
  const fixture = await createFixture();
  await writeFile(fixture.filePath, '{"secret":', { encoding: "utf8" }).catch(
    async (error) => {
      if (error.code === "ENOENT") {
        await fixture.service.storage.write(createDefaultProfile());
        await writeFile(fixture.filePath, '{"secret":', "utf8");
        return;
      }
      throw error;
    },
  );

  await assert.rejects(
    () => fixture.service.get(),
    (error) =>
      error instanceof ProfileStorageError &&
      !error.message.includes("secret"),
  );
  await fixture.cleanup();
});

