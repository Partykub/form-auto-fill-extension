/**
 * Mapping Store
 * จัดการเซฟและโหลดข้อมูล Manual Mapping เข้า/ออกจาก chrome.storage.local
 */
(function initializeMappingStore(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});
  const STORAGE_KEY = "manualMappings";
  const FILLER_PATTERNS = [
    /กรุณา(?:ระบุ|กรอก|ตอบ)/gu,
    /โปรด(?:กรอก|ระบุ|ตอบ)/gu,
    /กรุณา/gu,
    /โปรด/gu,
    /กรุณา(?:ที่อยู่|เบอร์)/gu,
    /โปรด(?:กรอก|ระบุ)/gu,
    /please\s+(?:enter|provide|fill\s+in|type|specify)/gi,
    /please\s+(?:enter|provide)/gi,
    /please\s+enter/gi,
    /please/gi,
    /required/gi,
    /\s*\(required\)/gi,
    /\s*\*$/gu,
  ];
  const ORDINAL_PATTERN = /^(?:\d+[\.\)\-]|\d{2}[\.\-]|[ก-๛][\.])\s*/gu;
  const PUNCTUATION_PATTERN = /[*\-_\[\]{}<>—…~`"'()]/gu;

  /**
   * Mirror ของ backend text normalizer สำหรับใช้เป็น key ของ manual mapping
   * ถ้ามีการเปลี่ยน backend/src/text-normalizer.js ต้องอัปเดตไฟล์นี้คู่กัน
   */
  function normalizeKey(text) {
    if (typeof text !== "string" || !text) {
      return "";
    }

    let result = text.trim();
    result = result.replace(ORDINAL_PATTERN, "");

    for (const pattern of FILLER_PATTERNS) {
      result = result.replace(pattern, "");
    }

    result = result.replace(PUNCTUATION_PATTERN, "");
    result = result.replace(/\s+/gu, " ").trim();
    return result.toLocaleLowerCase();
  }

  class MappingStore {
    async getAll() {
      return new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
          resolve(result[STORAGE_KEY]);
        });
      });
    }

    async saveMapping(questionText, profileFieldKey) {
      const mappings = await this.getAll();
      const key = normalizeKey(questionText);
      if (!key || !profileFieldKey) return;

      mappings[key] = profileFieldKey;

      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: mappings }, () => {
          resolve();
        });
      });
    }

    async removeMapping(questionText) {
      const mappings = await this.getAll();
      const key = normalizeKey(questionText);

      if (mappings[key]) {
        delete mappings[key];
        return new Promise((resolve) => {
          chrome.storage.local.set({ [STORAGE_KEY]: mappings }, () => {
            resolve();
          });
        });
      }
    }

    async getMappedField(questionText) {
      const mappings = await this.getAll();
      const key = normalizeKey(questionText);
      return mappings[key] || null;
    }

    normalize(text) {
      return normalizeKey(text);
    }
  }

  namespace.mappingStore = new MappingStore();
})(globalThis);
