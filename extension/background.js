const RUN_AUTOFILL_COMMAND = "run-autofill";

async function runAutofillInActiveTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "RUN_AUTOFILL",
      source: "background",
    });
  } catch (error) {
    console.warn("Unable to run autofill on the active tab:", error.message);
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === RUN_AUTOFILL_COMMAND) {
    void runAutofillInActiveTab();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("Form Auto Filler installed");
});

