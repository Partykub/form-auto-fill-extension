/**
 * Fill Engine — กรอกคำตอบลงในฟอร์ม
 *
 * ใช้ adapter bindings (จาก Phase 3) เพื่อหา DOM element
 * ตรวจสอบว่าฟิลด์มีค่าอยู่แล้วหรือไม่ → ถ้ามีให้ skip
 * Dispatch events (input, change, blur, click) เพื่อให้ framework รับรู้
 */
(function initializeFillEngine(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});
  const core = namespace.core;

  /**
   * Fill engine class — จัดการการกรอกคำตอบทุก input type
   */
  class FillEngine {
    constructor() {
      this.stats = { filled: 0, skipped: 0, failed: 0, details: [] };
    }

    /**
     * กรอกคำตอบทั้งหมดจาก matches
     *
     * @param {Array<object>} questions — คำถามจาก adapter
     * @param {Array<object>} matches — ผล match จาก backend
     * @returns {object} สรุปผล { filled, skipped, failed, details, message }
     */
    fillAll(questions, matches, bindings = new Map()) {
      this.stats = { filled: 0, skipped: 0, failed: 0, details: [] };

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const match = matches[i];

        if (!match || !match.value) {
          this.stats.skipped++;
          this.stats.details.push({
            id: question.id,
            text: question.text,
            status: "skipped",
            reason: match ? "No value in match" : "No match found",
          });
          continue;
        }

        const binding = bindings.get(question.id) || this.findBinding(question);
        if (!binding) {
          this.stats.failed++;
          this.stats.details.push({
            id: question.id,
            text: question.text,
            status: "failed",
            reason: "Element not found",
          });
          continue;
        }

        try {
          const filled = this.fillField(binding.control, question.type, match.value, binding.container);
          if (filled) {
            this.stats.filled++;
            this.stats.details.push({
              id: question.id,
              text: question.text,
              status: "filled",
              field: match.field,
            });
          } else {
            this.stats.skipped++;
            this.stats.details.push({
              id: question.id,
              text: question.text,
              status: "skipped",
              reason: "Field already has a value",
            });
          }
        } catch (error) {
          this.stats.failed++;
          this.stats.details.push({
            id: question.id,
            text: question.text,
            status: "failed",
            reason: error.message,
          });
        }
      }

      const message = `Filled ${this.stats.filled}, Skipped ${this.stats.skipped}, Failed ${this.stats.failed}`;
      return {
        ...this.stats,
        message,
      };
    }

    /**
     * หา binding จาก question id
     *
     * @param {object} question — คำถามที่มี id
     * @returns {object|null} binding { control, container } หรือ null
     */
    findBinding(question) {
      const doc = global.document;
      if (!doc || !question?.id) {
        return null;
      }

      const escapedText = this.escapeAttribute(question.text);
      const candidates = [
        `[data-question-id="${this.escapeAttribute(question.id.replace(/^[^:]+:/, ""))}"]`,
        '[role="listitem"]',
        "section",
      ];

      for (const selector of candidates) {
        for (const container of doc.querySelectorAll(selector)) {
          const heading = container.querySelector(
            '[data-question-title], [role="heading"], legend',
          );
          const containerText = core.normalizeText(
            core.getVisibleText(heading) ||
              core.getAccessibleText(container) ||
              "",
          );

          if (selector === '[role="listitem"]' || selector === "section") {
            if (!escapedText || containerText !== core.normalizeText(question.text)) {
              continue;
            }
          }

          const control = container.querySelector(
            'input, textarea, select, [role="radio"], [role="checkbox"], [role="combobox"], [role="listbox"]',
          );

          if (control) {
            return { container, control };
          }
        }
      }

      return null;
    }

    escapeAttribute(value) {
      return String(value ?? "").replace(/["\\]/g, "\\$&");
    }

    /**
     * เลือก method ตาม input type
     */
    fillField(control, type, value, container) {
      switch (type) {
        case core.QUESTION_TYPES.SHORT_TEXT:
        case core.QUESTION_TYPES.EMAIL:
        case core.QUESTION_TYPES.PHONE:
          return this.fillText(control, value);

        case core.QUESTION_TYPES.LONG_TEXT:
          return this.fillTextarea(control, value);

        case core.QUESTION_TYPES.RADIO:
          return this.fillRadio(control, value, container);

        case core.QUESTION_TYPES.CHECKBOX:
          return this.fillCheckbox(control, value, container);

        case core.QUESTION_TYPES.DROPDOWN:
          return this.fillDropdown(control, value);

        default:
          throw new Error(`Unsupported type: ${type}`);
      }
    }

    /**
     * กรอกข้อความลงใน text/email/phone input
     */
    fillText(control, value) {
      if (!control || control.tagName !== "INPUT") {
        return false;
      }

      if (this.hasExistingValue(control)) {
        return false;
      }

      this.setValue(control, value);
      this.dispatchEvents(control, ["input", "change", "blur"]);
      return true;
    }

    /**
     * กรอกข้อความลงใน textarea
     */
    fillTextarea(control, value) {
      if (!control || control.tagName !== "TEXTAREA") {
        return false;
      }

      if (this.hasExistingValue(control)) {
        return false;
      }

      this.setValue(control, value);
      this.dispatchEvents(control, ["input", "change", "blur"]);
      return true;
    }

    /**
     * เลือกรadio button
     */
    fillRadio(control, value, container) {
      if (!control || !container) {
        return false;
      }

      const radios = [
        ...container.querySelectorAll('input[type="radio"]'),
        ...container.querySelectorAll('[role="radio"]'),
      ];

      for (const radio of radios) {
        const radioValue = radio.value || radio.getAttribute("data-value") || "";
        if (this.valuesMatch(radioValue, value)) {
          if (!radio.checked) {
            radio.checked = true;
            this.dispatchEvents(radio, ["change", "click"]);
          }
          return true;
        }
      }

      return false;
    }

    /**
     * เลือก checkbox
     */
    fillCheckbox(control, value, container) {
      if (!control || !container) {
        return false;
      }

      const checkboxes = [
        ...container.querySelectorAll('input[type="checkbox"]'),
        ...container.querySelectorAll('[role="checkbox"]'),
      ];

      for (const checkbox of checkboxes) {
        const checkboxValue =
          checkbox.value || checkbox.getAttribute("data-value") || "";
        if (this.valuesMatch(checkboxValue, value)) {
          if (!checkbox.checked) {
            checkbox.checked = true;
            this.dispatchEvents(checkbox, ["change", "click"]);
          }
          return true;
        }
      }

      return false;
    }

    /**
     * เลือก dropdown option
     */
    fillDropdown(control, value) {
      if (!control || control.tagName !== "SELECT") {
        return false;
      }

      for (let i = 0; i < control.options.length; i++) {
        const option = control.options[i];
        if (
          this.valuesMatch(option.value, value) ||
          this.valuesMatch(option.textContent, value)
        ) {
          control.selectedIndex = i;
          this.dispatchEvents(control, ["change"]);
          return true;
        }
      }

      return false;
    }

    /**
     * ตรวจสอบว่ามีค่าอยู่แล้วหรือไม่
     */
    hasExistingValue(control) {
      if (!control) return false;

      if (control.tagName === "SELECT") {
        const selected = control.options[control.selectedIndex];
        return selected && selected.value && selected.value !== "";
      }

      const value = control.value || "";
      return value.trim().length > 0;
    }

    /**
     * ตั้งค่า value — ใช้ descriptor เพื่อให้ React/Vue รับรู้
     */
    setValue(element, value) {
      if (!element) return;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        element.ownerDocument?.defaultView?.HTMLInputElement.prototype || {},
        "value",
      )?.set || Object.getOwnPropertyDescriptor(
        element.ownerDocument?.defaultView?.HTMLTextAreaElement.prototype || {},
        "value",
      )?.set;

      if (nativeSetter) {
        nativeSetter.call(element, value);
      } else {
        element.value = value;
      }
    }

    /**
     * Dispatch events หลายตัวพร้อมกัน
     */
    dispatchEvents(element, eventTypes) {
      if (!element) return;

      for (const eventType of eventTypes) {
        element.dispatchEvent(
          new Event(eventType, { bubbles: true, cancelable: true }),
        );
      }
    }

    /**
     * เปรียบเทียบค่า — normalize ทั้งสองด้านก่อนเปรียบเทียบ
     */
    valuesMatch(a, b) {
      return core.normalizeText(a) === core.normalizeText(b);
    }
  }

  namespace.fillEngine = new FillEngine();
})(globalThis);
