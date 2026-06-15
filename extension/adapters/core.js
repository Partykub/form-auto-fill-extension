(function initializeAdapterCore(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});

  const QUESTION_TYPES = Object.freeze({
    SHORT_TEXT: "short_text",
    LONG_TEXT: "long_text",
    EMAIL: "email",
    PHONE: "phone",
    RADIO: "radio",
    CHECKBOX: "checkbox",
    DROPDOWN: "dropdown",
    UNSUPPORTED: "unsupported",
  });

  const EMAIL_HINTS = [
    /\be-?mail\b/i,
    /อีเมล/u,
    /อีเมล์/u,
    /ที่อยู่อีเมล/u,
  ];
  const PHONE_HINTS = [
    /\bphone\b/i,
    /\bmobile\b/i,
    /\btel(?:ephone)?\b/i,
    /เบอร์(?:โทร|ติดต่อ)/u,
    /หมายเลขโทรศัพท์/u,
    /โทรศัพท์/u,
  ];

  class FormAdapterError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "FormAdapterError";
      this.code = code;
      this.details = details;
    }
  }

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\s+/gu, " ")
      .trim();
  }

  function getVisibleText(element) {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone
      .querySelectorAll('[aria-hidden="true"], [hidden]')
      .forEach((hiddenElement) => hiddenElement.remove());
    return normalizeText(clone.textContent);
  }

  function createStableId(platform, nativeId, text, occurrence) {
    if (normalizeText(nativeId)) {
      return `${platform}:${normalizeText(nativeId)}`;
    }

    const source = `${platform}|${normalizeText(text).toLocaleLowerCase()}|${occurrence}`;
    let hash = 2166136261;

    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `${platform}:generated-${(hash >>> 0).toString(36)}`;
  }

  function isElementVisible(element) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    if (
      element.hidden ||
      element.getAttribute("aria-hidden") === "true" ||
      element.closest("[hidden], [aria-hidden='true']")
    ) {
      return false;
    }

    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    return style?.display !== "none" && style?.visibility !== "hidden";
  }

  function queryFirst(container, selectors) {
    for (const selector of selectors) {
      const element = container.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function parseBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    return String(value ?? "").toLocaleLowerCase() === "true";
  }

  function inferTextType(control, text) {
    const nativeType = normalizeText(control?.getAttribute("type") || "text").toLowerCase();
    const inputMode = normalizeText(control?.getAttribute("inputmode")).toLowerCase();
    const autocomplete = normalizeText(control?.getAttribute("autocomplete")).toLowerCase();

    if (
      nativeType === "email" ||
      autocomplete === "email" ||
      inputMode === "email"
    ) {
      return QUESTION_TYPES.EMAIL;
    }

    if (
      nativeType === "tel" ||
      autocomplete === "tel" ||
      inputMode === "tel"
    ) {
      return QUESTION_TYPES.PHONE;
    }

    if (EMAIL_HINTS.some((pattern) => pattern.test(text))) {
      return QUESTION_TYPES.EMAIL;
    }

    if (PHONE_HINTS.some((pattern) => pattern.test(text))) {
      return QUESTION_TYPES.PHONE;
    }

    return QUESTION_TYPES.SHORT_TEXT;
  }

  function getControlLabel(control, container) {
    const ariaLabel = normalizeText(control.getAttribute("aria-label"));
    if (ariaLabel) {
      return ariaLabel;
    }

    const labelledBy = normalizeText(control.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const label = labelledBy
        .split(" ")
        .map((id) => control.ownerDocument.getElementById(id)?.textContent)
        .filter(Boolean)
        .join(" ");
      if (normalizeText(label)) {
        return normalizeText(label);
      }
    }

    if (control.id) {
      const escapedId = global.CSS?.escape
        ? global.CSS.escape(control.id)
        : control.id.replace(/["\\]/g, "\\$&");
      const label = container.querySelector(`label[for="${escapedId}"]`);
      if (normalizeText(label?.textContent)) {
        return normalizeText(label.textContent);
      }
    }

    const wrappingLabel = control.closest("label");
    if (normalizeText(wrappingLabel?.textContent)) {
      return normalizeText(wrappingLabel.textContent);
    }

    return normalizeText(control.value || control.textContent);
  }

  function getAccessibleText(element) {
    if (!element) {
      return "";
    }

    const labelledBy = normalizeText(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(" ")
        .map((id) => element.ownerDocument.getElementById(id)?.textContent)
        .filter(Boolean)
        .join(" ");
      if (normalizeText(text)) {
        return normalizeText(text);
      }
    }

    return normalizeText(element.getAttribute("aria-label"));
  }

  function extractOptions(container, type) {
    let controls = [];

    if (type === QUESTION_TYPES.RADIO) {
      controls = [...container.querySelectorAll('input[type="radio"], [role="radio"]')];
    } else if (type === QUESTION_TYPES.CHECKBOX) {
      controls = [
        ...container.querySelectorAll('input[type="checkbox"], [role="checkbox"]'),
      ];
    } else if (type === QUESTION_TYPES.DROPDOWN) {
      const select = container.querySelector("select");
      if (select) {
        controls = [...select.options];
      } else {
        controls = [
          ...container.querySelectorAll(
            '[role="option"], [data-option-id], [data-automation-id="choiceOption"]',
          ),
        ];
      }
    }

    return controls
      .filter(isElementVisible)
      .map((control, index) => {
        const label = getControlLabel(control, container);
        const nativeId =
          control.getAttribute("data-option-id") ||
          control.id ||
          control.getAttribute("data-value") ||
          control.value;

        return {
          id: normalizeText(nativeId) || `option-${index + 1}`,
          label,
          value: normalizeText(control.value || control.getAttribute("data-value") || label),
          disabled:
            Boolean(control.disabled) ||
            control.getAttribute("aria-disabled") === "true",
        };
      })
      .filter((option) => option.label);
  }

  function waitForElement(document, selectors, timeoutMs = 8000) {
    const findElement = () => queryFirst(document, selectors);
    const current = findElement();
    if (current) {
      return Promise.resolve(current);
    }

    return new Promise((resolve, reject) => {
      const observer = new document.defaultView.MutationObserver(() => {
        const element = findElement();
        if (element) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve(element);
        }
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(
          new FormAdapterError(
            "FORM_NOT_READY",
            "The supported form did not become ready in time",
          ),
        );
      }, timeoutMs);

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  function createDebouncedObserver(document, root, callback, delayMs = 150) {
    let timer;
    const observer = new document.defaultView.MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(callback, delayMs);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "aria-required", "disabled"],
    });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }

  function notImplemented(feature) {
    throw new FormAdapterError(
      "FEATURE_NOT_IMPLEMENTED",
      `${feature} is not implemented in the question extraction phase`,
    );
  }

  namespace.core = {
    QUESTION_TYPES,
    FormAdapterError,
    createDebouncedObserver,
    createStableId,
    extractOptions,
    getAccessibleText,
    getVisibleText,
    inferTextType,
    isElementVisible,
    normalizeText,
    notImplemented,
    parseBoolean,
    queryFirst,
    waitForElement,
  };
})(globalThis);
