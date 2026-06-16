(function initializeMicrosoftFormsAdapter(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});
  const core = namespace.core;

  const ROOT_SELECTORS = [
    'form[data-microsoft-form]',
    '[data-form-root="microsoft"]',
    '[data-automation-id="formContainer"]',
    'main form',
    'main [role="form"]',
    'main [role="main"]',
    "main",
  ];
  const QUESTION_SELECTORS = [
    '[data-automation-id="questionItem"]',
    "[data-question-id]",
    '[data-question-type][role="group"]',
    '[role="group"][aria-labelledby]',
    '[role="radiogroup"][aria-labelledby]',
    '[role="radiogroup"]',
  ];
  const TITLE_SELECTORS = [
    '[data-automation-id="questionTitle"]',
    "[data-question-title]",
    "legend",
    '[role="heading"]',
  ];
  const DESCRIPTION_SELECTORS = [
    '[data-automation-id="questionSubtitle"]',
    "[data-question-description]",
  ];
  const RAW_TYPE_MAP = {
    text: core.QUESTION_TYPES.SHORT_TEXT,
    short_text: core.QUESTION_TYPES.SHORT_TEXT,
    long_text: core.QUESTION_TYPES.LONG_TEXT,
    paragraph: core.QUESTION_TYPES.LONG_TEXT,
    choice: core.QUESTION_TYPES.RADIO,
    single_choice: core.QUESTION_TYPES.RADIO,
    multiple_choice: core.QUESTION_TYPES.CHECKBOX,
    checkbox: core.QUESTION_TYPES.CHECKBOX,
    dropdown: core.QUESTION_TYPES.DROPDOWN,
  };

  class MicrosoftFormsAdapter {
    constructor(document, location) {
      this.document = document;
      this.location = location;
      this.platform = "microsoft";
      this.root = null;
      this.bindings = new Map();
    }

    static detect(document, location) {
      return (
        MicrosoftFormsAdapter.supportsLocation(location) &&
        Boolean(core.queryFirst(document, ROOT_SELECTORS))
      );
    }

    static supportsLocation(location) {
      return ["forms.office.com", "forms.microsoft.com", "forms.cloud.microsoft"].includes(
        location?.hostname,
      );
    }

    static supportsBodyFallback(location) {
      return location?.hostname === "forms.cloud.microsoft";
    }

    async waitForReady({ timeoutMs = 8000 } = {}) {
      if (MicrosoftFormsAdapter.supportsBodyFallback(this.location)) {
        this.root =
          core.queryFirst(this.document, ROOT_SELECTORS) || this.document.body;
        return this.root;
      }

      this.root = await core.waitForElement(this.document, ROOT_SELECTORS, timeoutMs);
      return this.root;
    }

    extractQuestions() {
      const root =
        this.root ||
        core.queryFirst(this.document, ROOT_SELECTORS) ||
        (MicrosoftFormsAdapter.supportsBodyFallback(this.location)
          ? this.document.body
          : null);
      if (!root) {
        throw new core.FormAdapterError(
          "FORM_NOT_READY",
          "Microsoft Form root was not found",
        );
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
        this.findNearbyQuestionText(container) ||
        core.getAccessibleText(initialControl);
      if (!text) {
        throw new Error("Question title was not found");
      }

      const occurrence = occurrences.get(text) ?? 0;
      occurrences.set(text, occurrence + 1);
      const nativeId =
        container.getAttribute("data-question-id") ||
        container.getAttribute("data-automation-key") ||
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
          container.getAttribute("data-automation-type") ||
          this.findPrimaryControl(container)?.getAttribute("type") ||
          "unknown",
      ).toLowerCase();
    }

    findNearbyQuestionText(container) {
      if (!this.canUseNearbyQuestionText(container)) {
        return "";
      }

      const labelledByText = core.getAccessibleText(container);
      if (labelledByText) {
        return labelledByText;
      }

      let sibling = container.previousElementSibling;
      while (sibling) {
        const text = core.getVisibleText(sibling);
        if (text && !this.looksLikeOptionText(sibling)) {
          return text;
        }
        sibling = sibling.previousElementSibling;
      }

      const parent = container.parentElement;
      if (!parent) {
        return "";
      }

      const candidates = [
        ...parent.querySelectorAll(
          '[id], [role="heading"], [data-automation-id="questionTitle"]',
        ),
      ];
      const candidate = candidates.find(
        (element) =>
          element !== container &&
          !container.contains(element) &&
          core.getVisibleText(element) &&
          !this.looksLikeOptionText(element),
      );

      return core.getVisibleText(candidate);
    }

    canUseNearbyQuestionText(container) {
      if (
        container.getAttribute("data-automation-id") ||
        container.getAttribute("data-question-id") ||
        container.getAttribute("data-question-type")
      ) {
        return false;
      }

      return ["group", "radiogroup"].includes(container.getAttribute("role"));
    }

    looksLikeOptionText(element) {
      return Boolean(
        element.matches?.('[role="radio"], [role="checkbox"], label') ||
          element.querySelector?.('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'),
      );
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

      const checkboxes = container.querySelectorAll(
        'input[type="checkbox"], [role="checkbox"]',
      );
      if (checkboxes.length > 0) {
        return core.QUESTION_TYPES.CHECKBOX;
      }

      const radios = container.querySelectorAll('input[type="radio"], [role="radio"]');
      if (radios.length > 0) {
        return core.QUESTION_TYPES.RADIO;
      }

      if (container.getAttribute("role") === "radiogroup") {
        return core.QUESTION_TYPES.RADIO;
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

  namespace.MicrosoftFormsAdapter = MicrosoftFormsAdapter;
})(globalThis);
