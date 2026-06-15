(function initializeGoogleFormsAdapter(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});
  const core = namespace.core;

  const ROOT_SELECTORS = [
    "form[data-google-form]",
    'form[action*="/forms/"]',
    '[data-form-root="google"]',
    'div[role="list"][data-form-response]',
  ];
  const QUESTION_SELECTORS = [
    "[data-question-id]",
    '[role="listitem"][data-params]',
    '[role="listitem"][data-question-type]',
    '[role="listitem"]',
  ];
  const TITLE_SELECTORS = [
    "[data-question-title]",
    '[role="heading"][aria-level="3"]',
    '[role="heading"]',
    "legend",
  ];
  const DESCRIPTION_SELECTORS = [
    "[data-question-description]",
    '[data-description-for="question"]',
  ];
  const RAW_TYPE_MAP = {
    short_text: core.QUESTION_TYPES.SHORT_TEXT,
    text: core.QUESTION_TYPES.SHORT_TEXT,
    long_text: core.QUESTION_TYPES.LONG_TEXT,
    paragraph: core.QUESTION_TYPES.LONG_TEXT,
    radio: core.QUESTION_TYPES.RADIO,
    multiple_choice: core.QUESTION_TYPES.RADIO,
    checkbox: core.QUESTION_TYPES.CHECKBOX,
    checkboxes: core.QUESTION_TYPES.CHECKBOX,
    dropdown: core.QUESTION_TYPES.DROPDOWN,
  };

  class GoogleFormsAdapter {
    constructor(document, location) {
      this.document = document;
      this.location = location;
      this.platform = "google";
      this.root = null;
      this.bindings = new Map();
    }

    static detect(document, location) {
      return (
        GoogleFormsAdapter.supportsLocation(location) &&
        Boolean(core.queryFirst(document, ROOT_SELECTORS))
      );
    }

    static supportsLocation(location) {
      return (
        location?.hostname === "docs.google.com" &&
        location.pathname.includes("/forms/")
      );
    }

    async waitForReady({ timeoutMs = 8000 } = {}) {
      this.root = await core.waitForElement(this.document, ROOT_SELECTORS, timeoutMs);
      return this.root;
    }

    extractQuestions() {
      const root = this.root || core.queryFirst(this.document, ROOT_SELECTORS);
      if (!root) {
        throw new core.FormAdapterError("FORM_NOT_READY", "Google Form root was not found");
      }

      this.root = root;
      this.bindings.clear();
      const questions = [];
      const warnings = [];
      const occurrences = new Map();

      [...root.querySelectorAll(QUESTION_SELECTORS.join(","))]
        .filter((container) => core.isElementVisible(container))
        .filter(
          (container, index, all) =>
            !all.some(
              (other, otherIndex) =>
                index !== otherIndex &&
                other.contains(container) &&
                other.matches(QUESTION_SELECTORS.join(",")),
            ),
        )
        .forEach((container, index) => {
          try {
            const question = this.parseQuestion(container, occurrences);
            questions.push(question);
            this.bindings.set(question.id, {
              container,
              control: this.findPrimaryControl(container, question.type),
            });
          } catch (error) {
            warnings.push({
              index,
              code: "QUESTION_PARSE_FAILED",
              message: error.message,
            });
          }
        });

      return { questions, warnings };
    }

    parseQuestion(container, occurrences) {
      const titleElement = core.queryFirst(container, TITLE_SELECTORS);
      const initialControl = this.findPrimaryControl(container);
      const text =
        core.getVisibleText(titleElement) ||
        core.getAccessibleText(container) ||
        core.getAccessibleText(initialControl);
      if (!text) {
        throw new Error("Question title was not found");
      }

      const occurrence = occurrences.get(text) ?? 0;
      occurrences.set(text, occurrence + 1);
      const nativeId =
        container.getAttribute("data-question-id") ||
        container.getAttribute("data-item-id") ||
        container.id;
      const rawType = this.getRawType(container);
      const type = this.getQuestionType(container, text, rawType);
      const description = core.normalizeText(
        core.getVisibleText(core.queryFirst(container, DESCRIPTION_SELECTORS)),
      );
      const control = this.findPrimaryControl(container, type);
      const required =
        core.parseBoolean(container.getAttribute("data-required")) ||
        container.getAttribute("aria-required") === "true" ||
        Boolean(container.querySelector('[aria-required="true"]')) ||
        Boolean(control?.required) ||
        control?.getAttribute("aria-required") === "true";

      return {
        id: core.createStableId(this.platform, nativeId, text, occurrence),
        platform: this.platform,
        text,
        description,
        type,
        rawType,
        required,
        supported: type !== core.QUESTION_TYPES.UNSUPPORTED,
        options: core.extractOptions(container, type),
      };
    }

    getRawType(container) {
      return core.normalizeText(
        container.getAttribute("data-question-type") ||
          container.getAttribute("data-type") ||
          this.findPrimaryControl(container)?.getAttribute("type") ||
          "unknown",
      ).toLowerCase();
    }

    getQuestionType(container, text, rawType) {
      if (RAW_TYPE_MAP[rawType]) {
        if (RAW_TYPE_MAP[rawType] === core.QUESTION_TYPES.SHORT_TEXT) {
          return core.inferTextType(this.findPrimaryControl(container), text);
        }
        return RAW_TYPE_MAP[rawType];
      }

      if (container.querySelector("textarea")) {
        return core.QUESTION_TYPES.LONG_TEXT;
      }
      if (container.querySelector('input[type="radio"], [role="radio"]')) {
        return core.QUESTION_TYPES.RADIO;
      }
      if (container.querySelector('input[type="checkbox"], [role="checkbox"]')) {
        return core.QUESTION_TYPES.CHECKBOX;
      }
      if (container.querySelector('select, [role="combobox"], [role="listbox"]')) {
        return core.QUESTION_TYPES.DROPDOWN;
      }

      const textControl = container.querySelector(
        'input:not([type]), input[type="text"], input[type="email"], input[type="tel"]',
      );
      if (textControl) {
        return core.inferTextType(textControl, text);
      }

      return core.QUESTION_TYPES.UNSUPPORTED;
    }

    findPrimaryControl(container, type) {
      const selectors = {
        [core.QUESTION_TYPES.LONG_TEXT]: "textarea",
        [core.QUESTION_TYPES.RADIO]: 'input[type="radio"], [role="radio"]',
        [core.QUESTION_TYPES.CHECKBOX]: 'input[type="checkbox"], [role="checkbox"]',
        [core.QUESTION_TYPES.DROPDOWN]: 'select, [role="combobox"], [role="listbox"]',
      };

      return container.querySelector(
        selectors[type] ||
          'input, textarea, select, [role="radio"], [role="checkbox"], [role="combobox"], [role="listbox"]',
      );
    }

    observeChanges(callback) {
      const root = this.root || core.queryFirst(this.document, ROOT_SELECTORS);
      return root
        ? core.createDebouncedObserver(this.document, root, callback)
        : () => {};
    }

    fillAnswer() {
      return core.notImplemented("fillAnswer");
    }

    submit() {
      return core.notImplemented("submit");
    }
  }

  namespace.GoogleFormsAdapter = GoogleFormsAdapter;
})(globalThis);
