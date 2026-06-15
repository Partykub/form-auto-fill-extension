const SUPPORTED_HOSTS = new Set([
  "docs.google.com",
  "forms.office.com",
  "forms.microsoft.com",
]);

function getPageStatus() {
  return {
    supported: SUPPORTED_HOSTS.has(window.location.hostname),
    hostname: window.location.hostname,
    title: document.title,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_STATUS") {
    sendResponse(getPageStatus());
    return;
  }

  if (message?.type === "RUN_AUTOFILL") {
    const status = getPageStatus();

    sendResponse({
      ...status,
      started: status.supported,
      message: status.supported
        ? "Autofill foundation is ready. Question extraction will be added next."
        : "This page is not a supported form.",
    });
  }
});

