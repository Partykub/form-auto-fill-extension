const statusElement = document.querySelector("#status");
const autofillButton = document.querySelector("#autofill");
const optionsButton = document.querySelector("#options");
const loadingEl = document.querySelector("#loading");
const resultEl = document.querySelector("#result");
const resultMessageEl = document.querySelector("#result-message");
const filledCountEl = document.querySelector("#filled-count");
const skippedCountEl = document.querySelector("#skipped-count");
const failedCountEl = document.querySelector("#failed-count");
const backendStatusEl = document.querySelector("#backend-status");
const autoSubmitToggle = document.querySelector("#auto-submit-toggle");
const manualMappingSection = document.querySelector("#manual-mapping-section");
const manualMappingList = document.querySelector("#manual-mapping-list");
const manualMappingHelp = document.querySelector("#manual-mapping-help");
const saveMappingsButton = document.querySelector("#save-mappings");
const cancelMappingsButton = document.querySelector("#cancel-mappings");

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:3000",
};
let pendingManualQuestions = [];
let profileFields = [];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tab;
}

async function loadProfileFields() {
  const { profile } = await chrome.storage.local.get({ profile: null });
  profileFields = Array.isArray(profile?.fields) ? profile.fields : [];
}

// ─── Backend Health Check ──────────────────────────────────────

async function checkBackendHealth() {
  const { backendUrl } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const url = (backendUrl || DEFAULT_SETTINGS.backendUrl).replace(/\/+$/, "");

  backendStatusEl.dataset.status = "checking";
  backendStatusEl.textContent = "Checking...";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${url}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      backendStatusEl.dataset.status = "online";
      backendStatusEl.textContent = "Backend connected";
    } else {
      backendStatusEl.dataset.status = "offline";
      backendStatusEl.textContent = "Backend error";
    }
  } catch {
    backendStatusEl.dataset.status = "offline";
    backendStatusEl.textContent = "Backend offline";
  }
}

// ─── Page Status ───────────────────────────────────────────────

async function refreshPageStatus() {
  const tab = await getActiveTab();

  if (!tab?.id) {
    statusElement.textContent = "No active tab found.";
    return;
  }

  try {
    const status = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_STATUS",
    });

    autofillButton.disabled = !status.supported;
    statusElement.textContent = status.supported
      ? `Supported form detected on ${status.hostname}.`
      : "Open a supported Google Form or Microsoft Form.";
  } catch {
    statusElement.textContent = "Open a supported Google Form or Microsoft Form.";
  }
}

// ─── Autofill ──────────────────────────────────────────────────

function showLoading(show) {
  loadingEl.classList.toggle("visible", show);
  autofillButton.disabled = show;
  saveMappingsButton.disabled = show;
  cancelMappingsButton.disabled = show;
  if (show) {
    resultEl.classList.remove("visible", "error");
  }
}

function showResult(summary) {
  hideManualMapping();
  filledCountEl.textContent = summary.filled ?? 0;
  skippedCountEl.textContent = summary.skipped ?? 0;
  failedCountEl.textContent = summary.failed ?? 0;

  resultEl.classList.remove("error");
  resultEl.classList.add("visible");
  resultMessageEl.textContent = summary.message || "";
}

function showError(message, { preserveManualMapping = false } = {}) {
  if (!preserveManualMapping) {
    hideManualMapping();
  }
  filledCountEl.textContent = "0";
  skippedCountEl.textContent = "0";
  failedCountEl.textContent = "0";

  resultEl.classList.add("visible", "error");
  resultMessageEl.textContent = message || "Autofill failed";
}

function hideResult() {
  resultEl.classList.remove("visible", "error");
  resultMessageEl.textContent = "";
}

function hideManualMapping() {
  manualMappingSection.classList.remove("visible");
  manualMappingList.replaceChildren();
  pendingManualQuestions = [];
}

function handleAutofillResponse(result) {
  if (result?.error) {
    showError(result.error.message || "Autofill failed");
    return;
  }

  if (result?.autofill?.error) {
    showError(result.autofill.error.message || "Autofill failed");
    return;
  }

  if (result?.manualMappingRequired) {
    renderManualMappingQuestions(result.manualMappingRequired.questions);
    return;
  }

  if (result?.autofill) {
    showResult(result.autofill);
    return;
  }

  statusElement.textContent = result?.message || "Autofill completed";
}

function updatePreview(container, fieldKey) {
  const preview = container.querySelector(".mapping-preview");
  const field = profileFields.find((item) => item.key === fieldKey);

  preview.textContent = field
    ? `Value preview: ${field.value || "(empty)"}`
    : "Value preview: -";
}

function toggleSkip(container) {
  const skipped = container.dataset.skipped === "true";
  const nextSkipped = !skipped;
  container.dataset.skipped = String(nextSkipped);
  container.querySelector(".mapping-skip").textContent = nextSkipped
    ? "Undo Skip"
    : "Skip";
  container.querySelector("select").disabled = nextSkipped;
}

function renderManualMappingQuestions(questions) {
  hideResult();
  manualMappingList.replaceChildren();
  pendingManualQuestions = questions;

  questions.forEach((question) => {
    const item = document.createElement("article");
    const title = document.createElement("p");
    const select = document.createElement("select");
    const actions = document.createElement("div");
    const preview = document.createElement("span");
    const skipButton = document.createElement("button");

    item.className = "mapping-item";
    item.dataset.questionId = question.id;
    item.dataset.questionText = question.text;
    item.dataset.skipped = "false";

    title.textContent = question.text;
    select.innerHTML = '<option value="">Select a profile field</option>';

    profileFields.forEach((field) => {
      const option = document.createElement("option");
      option.value = field.key;
      option.textContent = `${field.label} (${field.key})`;
      select.append(option);
    });

    actions.className = "mapping-actions";
    preview.className = "mapping-preview";
    preview.textContent = "Value preview: -";

    skipButton.type = "button";
    skipButton.className = "mapping-skip";
    skipButton.textContent = "Skip";
    skipButton.addEventListener("click", () => {
      toggleSkip(item);
    });

    select.addEventListener("change", () => {
      updatePreview(item, select.value);
    });

    actions.append(preview, skipButton);
    item.append(title, select, actions);
    manualMappingList.append(item);
  });

  manualMappingHelp.textContent = profileFields.length > 0
    ? "เลือก field ที่ตรง แล้วกด Save & Fill"
    : "ยังไม่มี profile fields ให้เลือก โปรดตั้งค่า profile ก่อน";
  manualMappingSection.classList.add("visible");
}

async function runAutofill({ skippedQuestionIds = [] } = {}) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return null;
  }

  return chrome.tabs.sendMessage(tab.id, {
    type: "START_AUTOFILL",
    source: "popup",
    skippedQuestionIds,
  });
}

autofillButton.addEventListener("click", async () => {
  showLoading(true);
  hideResult();
  hideManualMapping();
  await loadProfileFields();

  try {
    const result = await runAutofill();
    handleAutofillResponse(result);
  } catch (error) {
    showError("Unable to contact the form page");
  } finally {
    showLoading(false);
  }
});

saveMappingsButton.addEventListener("click", async () => {
  if (profileFields.length === 0) {
    showError("Profile has no fields to map", {
      preserveManualMapping: true,
    });
    return;
  }

  const rows = [...manualMappingList.querySelectorAll(".mapping-item")];
  const skippedQuestionIds = [];
  const selectedMappings = [];

  for (const row of rows) {
    const skipped = row.dataset.skipped === "true";
    const questionId = row.dataset.questionId;
    const questionText = row.dataset.questionText;
    const fieldKey = row.querySelector("select").value;

    if (skipped) {
      skippedQuestionIds.push(questionId);
      continue;
    }

    if (!fieldKey) {
      showError("Select a profile field or skip each unresolved question", {
        preserveManualMapping: true,
      });
      return;
    }

    selectedMappings.push({ questionText, fieldKey });
  }

  showLoading(true);
  try {
    for (const mapping of selectedMappings) {
      await globalThis.FormAutoFill.mappingStore.saveMapping(
        mapping.questionText,
        mapping.fieldKey,
      );
    }

    const result = await runAutofill({ skippedQuestionIds });
    handleAutofillResponse(result);
  } catch {
    showError("Unable to save mappings");
  } finally {
    showLoading(false);
  }
});

cancelMappingsButton.addEventListener("click", () => {
  hideManualMapping();
});

// ─── Auto Submit Toggle ────────────────────────────────────────

autoSubmitToggle.addEventListener("change", () => {
  void chrome.storage.local.set({
    autoSubmit: autoSubmitToggle.checked,
  });
});

async function loadAutoSubmitSetting() {
  const { autoSubmit } = await chrome.storage.local.get({
    autoSubmit: false,
  });
  autoSubmitToggle.checked = !!autoSubmit;
}

// ─── Options ───────────────────────────────────────────────────

optionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

// ─── Init ──────────────────────────────────────────────────────

async function init() {
  await loadAutoSubmitSetting();
  await loadProfileFields();
  await refreshPageStatus();
  await checkBackendHealth();
}

void init();
