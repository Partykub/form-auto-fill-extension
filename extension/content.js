(function initializeContentScript(global) {
  const namespace = global.FormAutoFill;
  const registry = namespace.adapterRegistry;

  let adapter;
  let adapterReady = false;
  let extractionCache;
  let stopObserving = () => {};

  function serializeError(error) {
    return {
      ok: false,
      error: {
        code: error?.code || "EXTRACTION_FAILED",
        message: error?.message || "Question extraction failed",
        ...(error?.details ? { details: error.details } : {}),
      },
    };
  }

  function getPageStatus() {
    return {
      supported: registry.isSupportedLocation(global.location),
      detected: registry.isSupportedForm(global.document, global.location),
      hostname: global.location.hostname,
      title: global.document.title,
    };
  }

  async function getReadyAdapter() {
    if (!adapter) {
      adapter = registry.createAdapter(global.document, global.location);
    }

    if (!adapterReady) {
      await adapter.waitForReady({ timeoutMs: 8000 });
      adapterReady = true;
      stopObserving();
      stopObserving = adapter.observeChanges(() => {
        extractionCache = null;
      });
    }

    return adapter;
  }

  async function extractQuestions({ force = false } = {}) {
    if (!force && extractionCache) {
      return extractionCache;
    }

    const readyAdapter = await getReadyAdapter();
    const { questions, warnings } = readyAdapter.extractQuestions();
    extractionCache = {
      ok: true,
      platform: readyAdapter.platform,
      questions,
      unsupportedCount: questions.filter((question) => !question.supported).length,
      warnings,
    };
    return extractionCache;
  }

  async function handleMessage(message) {
    if (message?.type === "GET_PAGE_STATUS") {
      return { ok: true, ...getPageStatus() };
    }

    if (message?.type === "EXTRACT_QUESTIONS") {
      return extractQuestions({ force: Boolean(message.force) });
    }

    if (message?.type === "RUN_AUTOFILL") {
      const result = await extractQuestions({ force: true });
      return {
        ...result,
        started: true,
        message: `Extracted ${result.questions.length} questions (${result.unsupportedCount} unsupported).`,
      };
    }

    return serializeError(
      new namespace.core.FormAdapterError(
        "UNKNOWN_MESSAGE",
        "The content script does not recognize this message",
      ),
    );
  }

  global.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message)
      .then(sendResponse)
      .catch((error) => sendResponse(serializeError(error)));
    return true;
  });

  namespace.contentScript = {
    extractQuestions,
    getPageStatus,
    handleMessage,
    invalidateCache() {
      extractionCache = null;
    },
  };
})(globalThis);
