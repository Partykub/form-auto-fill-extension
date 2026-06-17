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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MATCH_QUESTIONS") {
    void proxyMatchRequest(message.questions, message.backendUrl)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error: {
            code: "MATCH_FAILED",
            message: error.message || "Backend request failed",
          },
        }),
      );
    return true;
  }
});

async function proxyMatchRequest(questions, backendUrl) {
  if (!backendUrl) {
    throw new Error("Backend URL is not configured");
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("No questions to match");
  }

  const url = `${backendUrl.replace(/\/+$/, "")}/api/v1/match`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Backend returned ${response.status}`,
    );
  }

  return { ok: true, matches: data.matches };
}

