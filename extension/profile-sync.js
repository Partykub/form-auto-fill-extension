export const PROFILE_SYNC_STATUS = {
  SYNCED: "synced",
  PENDING: "pending",
  CONFLICT: "conflict",
  ERROR: "error",
};

export async function synchronizeProfile(state, client) {
  const serverProfile = await client.getProfile();

  if (state.profileSyncStatus === PROFILE_SYNC_STATUS.CONFLICT) {
    return {
      ...state,
      conflictServerProfile: serverProfile ?? state.conflictServerProfile,
    };
  }

  if (state.profileSyncStatus === PROFILE_SYNC_STATUS.PENDING) {
    const serverRevision = serverProfile?.revision ?? 0;

    if (serverRevision !== state.lastSyncedRevision) {
      return {
        ...state,
        profileSyncStatus: PROFILE_SYNC_STATUS.CONFLICT,
        conflictServerProfile: serverProfile,
      };
    }

    const savedProfile = await client.putProfile(
      state.profile,
      state.lastSyncedRevision,
    );

    return {
      profile: savedProfile,
      profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
      lastSyncedRevision: savedProfile.revision,
      conflictServerProfile: null,
    };
  }

  if (!serverProfile) {
    const savedProfile = await client.putProfile(state.profile, 0);
    return {
      profile: savedProfile,
      profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
      lastSyncedRevision: savedProfile.revision,
      conflictServerProfile: null,
    };
  }

  if (serverProfile.revision > state.profile.revision) {
    return {
      profile: serverProfile,
      profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
      lastSyncedRevision: serverProfile.revision,
      conflictServerProfile: null,
    };
  }

  if (serverProfile.revision < state.profile.revision) {
    return {
      ...state,
      profileSyncStatus: PROFILE_SYNC_STATUS.CONFLICT,
      conflictServerProfile: serverProfile,
    };
  }

  return {
    ...state,
    profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
    lastSyncedRevision: serverProfile.revision,
    conflictServerProfile: null,
  };
}

export async function resolveConflictWithLocal(state, client) {
  const expectedRevision = state.conflictServerProfile?.revision ?? 0;
  const savedProfile = await client.putProfile(state.profile, expectedRevision);

  return {
    profile: savedProfile,
    profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
    lastSyncedRevision: savedProfile.revision,
    conflictServerProfile: null,
  };
}

export function resolveConflictWithServer(state) {
  if (!state.conflictServerProfile) {
    throw new Error("Server profile is required to resolve this conflict");
  }

  return {
    profile: state.conflictServerProfile,
    profileSyncStatus: PROFILE_SYNC_STATUS.SYNCED,
    lastSyncedRevision: state.conflictServerProfile.revision,
    conflictServerProfile: null,
  };
}
