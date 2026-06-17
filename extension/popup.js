const statusElement = document.querySelector("#status");
const autofillButton = document.querySelector("#autofill");
const optionsButton = document.querySelector("#options");
const loadingEl = document.querySelector("#loading");
const resultEl = document.querySelector("#result");
const filledCountEl = document.querySelector("#filled-count");
const skippedCountEl = document.querySelector("#skipped-count");
const failedCountEl = document.querySelector("#failed-count");
const backendStatusEl = document.querySelector("#backend-status");
const autoSubmitToggle = document.querySelector("#auto-submit-toggle");

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:3000",
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tab;
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
  if (show) {
    resultEl.classList.remove("visible", "error");
  }
}

function showResult(summary) {
  filledCountEl.textContent = summary.filled ?? 0;
  skippedCountEl.textContent = summary.skipped ?? 0;
  failedCountEl.textContent = summary.failed ?? 0;

  resultEl.classList.remove("error");
  resultEl.classList.add("visible");
}

function showError(message) {
  filledCountEl.textContent = "0";
  skippedCountEl.textContent = "0";
  failedCountEl.textContent = "0";

  resultEl.classList.add("visible", "error");
  resultEl.textContent = message || "Autofill failed";
}

function hideResult() {
  resultEl.classList.remove("visible", "error");
}

autofillButton.addEventListener("click", async () => {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return;
  }

  showLoading(true);
  hideResult();

  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "START_AUTOFILL",
      source: "popup",
    });

    if (result?.error) {
      showError(result.error.message || "Autofill failed");
    } else if (result?.autofill) {
      showResult(result.autofill);
    } else {
      statusElement.textContent = result?.message || "Autofill completed";
    }
  } catch (error) {
    showError("Unable to contact the form page");
  } finally {
    showLoading(false);
  }
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
  await refreshPageStatus();
  await checkBackendHealth();
}

void init();
