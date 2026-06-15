const statusElement = document.querySelector("#status");
const autofillButton = document.querySelector("#autofill");
const optionsButton = document.querySelector("#options");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tab;
}

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

autofillButton.addEventListener("click", async () => {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return;
  }

  autofillButton.disabled = true;

  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_AUTOFILL",
      source: "popup",
    });
    statusElement.textContent =
      result.message || result.error?.message || "Question extraction failed.";
  } catch {
    statusElement.textContent = "Unable to contact the form page.";
  } finally {
    autofillButton.disabled = false;
  }
});

optionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

void refreshPageStatus();
