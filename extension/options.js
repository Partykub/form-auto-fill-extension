import {
  createDefaultProfile,
  normalizeProfile,
  validateProfile,
} from "./profile.js";
import {
  PROFILE_SYNC_STATUS,
  resolveConflictWithLocal,
  resolveConflictWithServer,
  synchronizeProfile,
} from "./profile-sync.js";

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:3000",
};

const settingsForm = document.querySelector("#settings-form");
const backendUrlInput = document.querySelector("#backend-url");
const settingsStatus = document.querySelector("#settings-status");
const profileForm = document.querySelector("#profile-form");
const fieldsElement = document.querySelector("#fields");
const profileError = document.querySelector("#profile-error");
const syncStatus = document.querySelector("#sync-status");
const retrySyncButton = document.querySelector("#retry-sync");
const addFieldButton = document.querySelector("#add-field");
const saveProfileButton = document.querySelector("#save-profile");
const conflictPanel = document.querySelector("#conflict-panel");
const localPreview = document.querySelector("#local-preview");
const serverPreview = document.querySelector("#server-preview");
const useLocalButton = document.querySelector("#use-local");
const useServerButton = document.querySelector("#use-server");
const mappingsEmpty = document.querySelector("#mappings-empty");
const mappingsTable = document.querySelector("#mappings-table");
const mappingsBody = document.querySelector("#mappings-body");

let state;
const mappingStore = globalThis.FormAutoFill?.mappingStore;

function normalizeBackendUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function createApiClient(backendUrl) {
  async function request(path, options) {
    const response = await fetch(`${backendUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(body.error?.message ?? "Backend request failed");
      error.code = body.error?.code;
      error.details = body.error?.details;
      throw error;
    }

    return body;
  }

  return {
    async getProfile() {
      try {
        const body = await request("/api/profile");
        return body.profile;
      } catch (error) {
        if (error.code === "PROFILE_NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },
    async putProfile(profile, expectedRevision) {
      try {
        const body = await request("/api/profile", {
          method: "PUT",
          body: JSON.stringify({ profile, expectedRevision }),
        });
        return body.profile;
      } catch (error) {
        if (error.code === "PROFILE_CONFLICT") {
          error.serverProfile = error.details?.profile ?? null;
        }
        throw error;
      }
    },
  };
}

function setBusy(busy) {
  saveProfileButton.disabled = busy;
  retrySyncButton.disabled = busy;
  useLocalButton.disabled = busy;
  useServerButton.disabled = busy;
}

function syncStatusLabel(status) {
  return {
    [PROFILE_SYNC_STATUS.SYNCED]: "Synced",
    [PROFILE_SYNC_STATUS.PENDING]: "Pending sync",
    [PROFILE_SYNC_STATUS.CONFLICT]: "Conflict",
    [PROFILE_SYNC_STATUS.ERROR]: "Sync error",
  }[status] ?? "Unknown";
}

function renderSyncState(message = "") {
  syncStatus.dataset.status = state.profileSyncStatus;
  syncStatus.textContent = message || syncStatusLabel(state.profileSyncStatus);
  conflictPanel.hidden = state.profileSyncStatus !== PROFILE_SYNC_STATUS.CONFLICT;

  if (!conflictPanel.hidden) {
    localPreview.replaceChildren(createProfilePreview(state.profile));
    serverPreview.replaceChildren(
      createProfilePreview(state.conflictServerProfile),
    );
  }
}

async function renderSavedMappings() {
  if (!mappingStore) {
    mappingsEmpty.textContent = "Manual mapping store is unavailable";
    mappingsEmpty.hidden = false;
    mappingsTable.hidden = true;
    return;
  }

  const mappings = await mappingStore.getAll();
  const entries = Object.entries(mappings);
  const fieldsByKey = new Map(
    state.profile.fields.map((field) => [field.key, field]),
  );

  mappingsBody.replaceChildren();
  mappingsEmpty.hidden = entries.length > 0;
  mappingsTable.hidden = entries.length === 0;

  for (const [questionKey, fieldKey] of entries) {
    const row = document.createElement("tr");
    const questionCell = document.createElement("td");
    const fieldCell = document.createElement("td");
    const statusCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const status = document.createElement("span");
    const deleteButton = document.createElement("button");
    const valid = fieldsByKey.has(fieldKey);

    questionCell.textContent = questionKey;
    fieldCell.textContent = fieldKey;
    status.className = `mapping-status ${valid ? "valid" : "invalid"}`;
    status.textContent = valid ? "Valid" : "Invalid";
    statusCell.append(status);

    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.dataset.questionKey = questionKey;
    deleteButton.textContent = "Delete";
    actionCell.append(deleteButton);

    row.append(questionCell, fieldCell, statusCell, actionCell);
    mappingsBody.append(row);
  }
}

function createProfilePreview(profile) {
  const container = document.createElement("div");

  if (!profile) {
    container.textContent = "No profile on server";
    return container;
  }

  const revision = document.createElement("p");
  revision.textContent = `Revision ${profile.revision}`;
  const list = document.createElement("ul");

  profile.fields.forEach((field) => {
    const item = document.createElement("li");
    item.textContent = `${field.label}: ${field.value || "(empty)"}`;
    list.append(item);
  });

  container.append(revision, list);
  return container;
}

function createInputGroup(labelText, name, value, options = {}) {
  const group = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const error = document.createElement("div");

  label.textContent = labelText;
  input.name = name;
  input.value = value;
  input.type = options.type ?? "text";
  input.readOnly = options.readOnly ?? false;
  input.placeholder = options.placeholder ?? "";
  error.className = "error";
  error.dataset.errorFor = name;

  group.append(label, input, error);
  return group;
}

function renderFields() {
  fieldsElement.replaceChildren();

  state.profile.fields.forEach((field, index) => {
    const card = document.createElement("section");
    const header = document.createElement("div");
    const title = document.createElement("strong");
    const grid = document.createElement("div");

    card.className = "field-card";
    card.dataset.fieldIndex = String(index);
    header.className = "panel-header";
    grid.className = "field-grid";
    title.textContent = field.isDefault ? "Default Field" : "Custom Field";
    header.append(title);

    if (!field.isDefault) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "danger";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        state.profile.fields.splice(index, 1);
        renderFields();
      });
      header.append(removeButton);
    }

    grid.append(
      createInputGroup("Field Key", "key", field.key, {
        readOnly: field.isDefault,
        placeholder: "company_name",
      }),
      createInputGroup("Label", "label", field.label),
      createInputGroup("Value", "value", field.value, {
        type: field.key === "email" ? "email" : "text",
      }),
      createInputGroup("Aliases (comma separated)", "aliases", field.aliases.join(", ")),
    );
    card.append(header, grid);
    fieldsElement.append(card);
  });

  void renderSavedMappings();
}

function collectProfileFromForm() {
  const fields = [...fieldsElement.querySelectorAll(".field-card")].map(
    (card, index) => ({
      key: card.querySelector('[name="key"]').value,
      label: card.querySelector('[name="label"]').value,
      value: card.querySelector('[name="value"]').value,
      aliases: card
        .querySelector('[name="aliases"]')
        .value.split(","),
      isDefault: state.profile.fields[index].isDefault,
    }),
  );

  return normalizeProfile({
    ...state.profile,
    updatedAt: new Date().toISOString(),
    fields,
  });
}

function showValidationErrors(result) {
  profileError.textContent = result.errors.fields ?? "";

  result.fieldErrors.forEach((errors, index) => {
    const card = fieldsElement.querySelector(`[data-field-index="${index}"]`);
    if (!card) {
      return;
    }

    Object.entries(errors).forEach(([name, message]) => {
      const errorElement = card.querySelector(`[data-error-for="${name}"]`);
      if (errorElement) {
        errorElement.textContent = message;
      } else {
        profileError.textContent = message;
      }
    });
  });
}

async function persistState() {
  await chrome.storage.local.set({
    profile: state.profile,
    profileSyncStatus: state.profileSyncStatus,
    lastSyncedRevision: state.lastSyncedRevision,
    conflictServerProfile: state.conflictServerProfile,
  });
}

async function trySync() {
  setBusy(true);
  profileError.textContent = "";

  try {
    const client = createApiClient(normalizeBackendUrl(backendUrlInput.value));
    state = await synchronizeProfile(state, client);
    await persistState();
    renderFields();
    renderSyncState();
    await renderSavedMappings();
  } catch (error) {
    if (error.code === "PROFILE_CONFLICT") {
      state.profileSyncStatus = PROFILE_SYNC_STATUS.CONFLICT;
      state.conflictServerProfile = error.serverProfile;
      await persistState();
      renderSyncState();
    } else {
      state.profileSyncStatus =
        state.profileSyncStatus === PROFILE_SYNC_STATUS.PENDING
          ? PROFILE_SYNC_STATUS.PENDING
          : PROFILE_SYNC_STATUS.ERROR;
      await persistState();
      renderSyncState(
        state.profileSyncStatus === PROFILE_SYNC_STATUS.PENDING
          ? "Saved locally, pending sync"
          : "Backend unavailable",
      );
    }
  } finally {
    setBusy(false);
  }
}

async function load() {
  const stored = await chrome.storage.local.get({
    ...DEFAULT_SETTINGS,
    profile: null,
    profileSyncStatus: PROFILE_SYNC_STATUS.PENDING,
    lastSyncedRevision: 0,
    conflictServerProfile: null,
  });

  backendUrlInput.value = stored.backendUrl;
  state = {
    profile: stored.profile ?? createDefaultProfile(),
    profileSyncStatus: stored.profile
      ? stored.profileSyncStatus
      : PROFILE_SYNC_STATUS.PENDING,
    lastSyncedRevision: stored.lastSyncedRevision,
    conflictServerProfile: stored.conflictServerProfile,
  };

  await persistState();
  renderFields();
  renderSyncState();
  await renderSavedMappings();
  await trySync();
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  await chrome.storage.local.set({ backendUrl });
  settingsStatus.textContent = "Saved";
  await trySync();
  window.setTimeout(() => {
    settingsStatus.textContent = "";
  }, 1500);
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileError.textContent = "";
  document.querySelectorAll(".error[data-error-for]").forEach((element) => {
    element.textContent = "";
  });

  const profile = collectProfileFromForm();
  const result = validateProfile(profile);

  if (!result.valid) {
    showValidationErrors(result);
    return;
  }

  state.profile = result.profile;
  state.profileSyncStatus = PROFILE_SYNC_STATUS.PENDING;
  state.conflictServerProfile = null;
  await persistState();
  renderSyncState("Saved locally, pending sync");
  await trySync();
});

addFieldButton.addEventListener("click", () => {
  state.profile.fields.push({
    key: "",
    label: "",
    value: "",
    aliases: [],
    isDefault: false,
  });
  renderFields();
});

retrySyncButton.addEventListener("click", () => {
  void trySync();
});

useLocalButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const client = createApiClient(normalizeBackendUrl(backendUrlInput.value));
    state = await resolveConflictWithLocal(state, client);
    await persistState();
    renderFields();
    renderSyncState();
  } catch (error) {
    if (error.code === "PROFILE_CONFLICT") {
      state.conflictServerProfile = error.serverProfile;
      await persistState();
    }
    renderSyncState("Could not resolve conflict");
  } finally {
    setBusy(false);
  }
});

useServerButton.addEventListener("click", async () => {
  state = resolveConflictWithServer(state);
  await persistState();
  renderFields();
  renderSyncState();
  await renderSavedMappings();
});

mappingsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-question-key]");
  if (!button || !mappingStore) {
    return;
  }

  await mappingStore.removeMapping(button.dataset.questionKey);
  await renderSavedMappings();
});

void load();
