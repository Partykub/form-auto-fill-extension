import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDefaultProfile } from "../../extension/profile.js";
import { createApp } from "../src/app.js";
import { JsonProfileStorage } from "../src/json-profile.storage.js";
import { ProfileService } from "../src/profile.service.js";

async function startTestServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "profile-api-"));
  const storage = new JsonProfileStorage(path.join(directory, "profile.json"));
  const app = createApp({ profileService: new ProfileService(storage) });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();

  return {
    url: `http://127.0.0.1:${address.port}`,
    async cleanup() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("profile API supports create, read, validation, and conflict responses", async () => {
  const fixture = await startTestServer();

  const missingResponse = await fetch(`${fixture.url}/api/profile`);
  assert.equal(missingResponse.status, 404);
  assert.equal((await missingResponse.json()).error.code, "PROFILE_NOT_FOUND");

  const createResponse = await fetch(`${fixture.url}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: createDefaultProfile(),
      expectedRevision: 0,
    }),
  });
  const created = (await createResponse.json()).profile;
  assert.equal(createResponse.status, 200);
  assert.equal(created.revision, 1);

  const readResponse = await fetch(`${fixture.url}/api/profile`);
  assert.equal(readResponse.status, 200);
  assert.deepEqual((await readResponse.json()).profile, created);

  const invalid = structuredClone(created);
  invalid.fields[2].value = "not-email";
  const invalidResponse = await fetch(`${fixture.url}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: invalid, expectedRevision: 1 }),
  });
  const invalidBody = await invalidResponse.json();
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidBody.error.code, "PROFILE_INVALID");
  assert.equal(JSON.stringify(invalidBody).includes("not-email"), false);
  assert.equal("stack" in invalidBody.error, false);

  const conflictResponse = await fetch(`${fixture.url}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: created, expectedRevision: 0 }),
  });
  const conflictBody = await conflictResponse.json();
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictBody.error.code, "PROFILE_CONFLICT");
  assert.equal(conflictBody.error.details.profile.revision, 1);

  await fixture.cleanup();
});

