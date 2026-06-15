import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultProfile } from "../../extension/profile.js";
import {
  PROFILE_SYNC_STATUS,
  resolveConflictWithLocal,
  resolveConflictWithServer,
  synchronizeProfile,
} from "../../extension/profile-sync.js";

function createState(overrides = {}) {
  return {
    profile: createDefaultProfile("2026-06-15T00:00:00.000Z"),
    profileSyncStatus: PROFILE_SYNC_STATUS.PENDING,
    lastSyncedRevision: 0,
    conflictServerProfile: null,
    ...overrides,
  };
}

test("uploads a pending local profile when server revision is unchanged", async () => {
  const savedProfile = {
    ...createDefaultProfile(),
    revision: 1,
  };
  const calls = [];
  const result = await synchronizeProfile(createState(), {
    getProfile: async () => null,
    putProfile: async (profile, expectedRevision) => {
      calls.push({ profile, expectedRevision });
      return savedProfile;
    },
  });

  assert.equal(calls[0].expectedRevision, 0);
  assert.equal(result.profileSyncStatus, PROFILE_SYNC_STATUS.SYNCED);
  assert.equal(result.lastSyncedRevision, 1);
});

test("detects a conflict when the server changed while local is pending", async () => {
  const serverProfile = {
    ...createDefaultProfile(),
    revision: 2,
  };
  const result = await synchronizeProfile(
    createState({ lastSyncedRevision: 1 }),
    {
      getProfile: async () => serverProfile,
      putProfile: async () => assert.fail("must not overwrite server"),
    },
  );

  assert.equal(result.profileSyncStatus, PROFILE_SYNC_STATUS.CONFLICT);
  assert.deepEqual(result.conflictServerProfile, serverProfile);
});

test("keeps a conflict after reload until the user resolves it", async () => {
  const local = { ...createDefaultProfile(), revision: 1 };
  local.fields[0].value = "Local";
  const server = { ...createDefaultProfile(), revision: 2 };
  server.fields[0].value = "Server";
  const result = await synchronizeProfile(
    createState({
      profile: local,
      profileSyncStatus: PROFILE_SYNC_STATUS.CONFLICT,
      lastSyncedRevision: 1,
      conflictServerProfile: server,
    }),
    {
      getProfile: async () => server,
      putProfile: async () => assert.fail("must wait for user choice"),
    },
  );

  assert.equal(result.profileSyncStatus, PROFILE_SYNC_STATUS.CONFLICT);
  assert.equal(result.profile.fields[0].value, "Local");
  assert.equal(result.conflictServerProfile.fields[0].value, "Server");
});

test("uses a newer server profile when local has no pending changes", async () => {
  const local = { ...createDefaultProfile(), revision: 1 };
  const server = { ...createDefaultProfile(), revision: 2 };
  server.fields[0].value = "Server value";

  const result = await synchronizeProfile(
    createState({
      profile: local,
      profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
      lastSyncedRevision: 1,
    }),
    {
      getProfile: async () => server,
      putProfile: async () => assert.fail("must not upload local"),
    },
  );

  assert.equal(result.profile.fields[0].value, "Server value");
  assert.equal(result.lastSyncedRevision, 2);
});

test("resolves conflicts using either local or server data", async () => {
  const local = { ...createDefaultProfile(), revision: 1 };
  local.fields[0].value = "Local";
  const server = { ...createDefaultProfile(), revision: 2 };
  server.fields[0].value = "Server";
  const state = createState({
    profile: local,
    profileSyncStatus: PROFILE_SYNC_STATUS.CONFLICT,
    lastSyncedRevision: 1,
    conflictServerProfile: server,
  });

  const localResult = await resolveConflictWithLocal(state, {
    putProfile: async (profile, expectedRevision) => ({
      ...profile,
      revision: expectedRevision + 1,
    }),
  });
  const serverResult = resolveConflictWithServer(state);

  assert.equal(localResult.profile.fields[0].value, "Local");
  assert.equal(localResult.profile.revision, 3);
  assert.equal(serverResult.profile.fields[0].value, "Server");
  assert.equal(serverResult.lastSyncedRevision, 2);
});
