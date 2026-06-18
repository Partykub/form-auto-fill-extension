(function initializeContentScript(global) {
  const namespace = global.FormAutoFill;
  const registry = namespace.adapterRegistry;

  let adapter;
  let adapterReady = false;
  let extractionCache;
  let autofillRunning = false;
  let stopObserving = () => {};
  const MANUAL_MAPPING_CONFIDENCE_THRESHOLD = 0.72;

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

  async function getBackendUrl() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        { backendUrl: "http://localhost:3000" },
        (result) => {
          resolve(result.backendUrl || "http://localhost:3000");
        },
      );
    });
  }

  async function getStoredProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ profile: null }, (result) => {
        resolve(result.profile || null);
      });
    });
  }

  function buildProfileFieldMap(profile) {
    return new Map(
      Array.isArray(profile?.fields)
        ? profile.fields.map((field) => [field.key, field])
        : [],
    );
  }

  async function buildQuestionMatches(questions) {
    const mappingStore = namespace.mappingStore;
    const manualMappings = await mappingStore?.getAll?.();
    const profile = await getStoredProfile();
    const fieldsByKey = buildProfileFieldMap(profile);
    const matches = new Array(questions.length).fill(null);
    const backendQuestions = [];
    const backendIndexes = [];

    questions.forEach((question, index) => {
      const mappingKey = mappingStore?.normalize?.(question.text);
      const profileFieldKey = mappingKey ? manualMappings?.[mappingKey] : null;
      const field = profileFieldKey ? fieldsByKey.get(profileFieldKey) : null;

      if (profileFieldKey && field) {
        matches[index] = {
          field: profileFieldKey,
          value: field.value || "",
          confidence: 1.0,
          matchSource: "manual_mapping",
        };
        return;
      }

      backendQuestions.push(question);
      backendIndexes.push(index);
    });

    if (backendQuestions.length > 0) {
      const backendUrl = await getBackendUrl();
      const matchResponse = await chrome.runtime.sendMessage({
        type: "MATCH_QUESTIONS",
        questions: backendQuestions,
        backendUrl,
      });

      if (!matchResponse?.ok) {
        return {
          ok: false,
          error: matchResponse.error || {
            code: "MATCH_FAILED",
            message: "Failed to match questions",
          },
        };
      }

      backendIndexes.forEach((index, backendIndex) => {
        matches[index] = matchResponse.matches?.[backendIndex] || null;
      });
    }

    return {
      ok: true,
      profile,
      matches,
    };
  }

  function collectUnresolvedQuestions(questions, matches, skippedQuestionIds) {
    const skippedIds = new Set(skippedQuestionIds || []);
    return questions
      .map((question, index) => ({
        question,
        match: matches[index],
      }))
      .filter(({ question, match }) => {
        if (skippedIds.has(question.id)) {
          return false;
        }

        if (!match?.field) {
          return true;
        }

        return (
          typeof match.confidence === "number" &&
          match.confidence < MANUAL_MAPPING_CONFIDENCE_THRESHOLD
        );
      })
      .map(({ question, match }) => ({
        id: question.id,
        text: question.text,
        type: question.type,
        confidence: match?.confidence ?? null,
        matchSource: match?.matchSource ?? null,
      }));
  }

  async function startAutofill({ skippedQuestionIds = [] } = {}) {
    autofillRunning = true;
    try {
      const extraction = await extractQuestions({ force: true });
      const readyAdapter = await getReadyAdapter();

      if (!extraction.ok) {
        return extraction;
      }

      const supportedQuestions = extraction.questions.filter(
        (q) => q.supported,
      );

      if (supportedQuestions.length === 0) {
        return {
          ok: true,
          platform: extraction.platform,
          questions: [],
          unsupportedCount: extraction.unsupportedCount,
          warnings: extraction.warnings,
          autofill: {
            filled: 0,
            skipped: 0,
            failed: 0,
            message: "No supported questions to autofill.",
          },
        };
      }

      const preparedMatches = await buildQuestionMatches(supportedQuestions);
      if (!preparedMatches.ok) {
        return {
          ...extraction,
          autofill: {
            filled: 0,
            skipped: 0,
            failed: 0,
            error: preparedMatches.error,
          },
        };
      }

      const unresolvedQuestions = collectUnresolvedQuestions(
        supportedQuestions,
        preparedMatches.matches,
        skippedQuestionIds,
      );

      if (unresolvedQuestions.length > 0) {
        return {
          ...extraction,
          manualMappingRequired: {
            questions: unresolvedQuestions,
          },
        };
      }

      const questionBindings = new Map(
        supportedQuestions.map((question) => [
          question.id,
          readyAdapter.bindings.get(question.id) || null,
        ]),
      );

      const fillResult = await namespace.fillEngine.fillAll(
        supportedQuestions,
        preparedMatches.matches,
        questionBindings,
      );

      return {
        ...extraction,
        autofill: fillResult,
      };
    } finally {
      autofillRunning = false;
    }
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

    if (message?.type === "START_AUTOFILL") {
      if (autofillRunning) {
        return {
          ok: false,
          error: {
            code: "AUTOFILL_IN_PROGRESS",
            message: "Autofill is already running",
          },
        };
      }
      return startAutofill({
        skippedQuestionIds: Array.isArray(message.skippedQuestionIds)
          ? message.skippedQuestionIds
          : [],
      });
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

  if (!namespace.fillEngine) {
    namespace.fillEngine = {
      fillAll() {
        return { filled: 0, skipped: 0, failed: 0, message: "Fill engine not loaded" };
      },
    };
  }
})(globalThis);
