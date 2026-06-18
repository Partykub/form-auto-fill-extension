import assert from "node:assert/strict";
import test from "node:test";

import { createExtensionDom } from "./helpers/load-extension.js";

function createStorage(initial = {}) {
  const data = { ...initial };

  return {
    api: {
      get(defaults, callback) {
        const keys = Object.keys(defaults || {});
        const result = { ...defaults };
        keys.forEach((key) => {
          if (Object.hasOwn(data, key)) {
            result[key] = data[key];
          }
        });
        callback(result);
      },
      set(values, callback) {
        Object.assign(data, values);
        callback?.();
      },
    },
    snapshot() {
      return structuredClone(data);
    },
  };
}

test("mapping store saves, loads, and removes manual mappings", async () => {
  const dom = await createExtensionDom({ loadMappingStore: true });
  const storage = createStorage();
  dom.window.chrome.storage.local = storage.api;

  const store = dom.window.FormAutoFill.mappingStore;
  await store.saveMapping("ชื่อผู้สมัคร", "full_name");

  assert.equal(await store.getMappedField("ชื่อผู้สมัคร"), "full_name");
  assert.deepEqual(storage.snapshot().manualMappings, {
    [store.normalize("ชื่อผู้สมัคร")]: "full_name",
  });

  await store.removeMapping("ชื่อผู้สมัคร");
  assert.equal(await store.getMappedField("ชื่อผู้สมัคร"), null);
  dom.window.close();
});

test("mapping store normalizes filler, punctuation, and case consistently", async () => {
  const dom = await createExtensionDom({ loadMappingStore: true });
  const store = dom.window.FormAutoFill.mappingStore;

  assert.equal(
    store.normalize("1. กรุณาระบุชื่อ-นามสกุล *"),
    store.normalize("ชื่อนามสกุล"),
  );
  assert.equal(
    store.normalize("PLEASE ENTER Email"),
    store.normalize("email"),
  );
  dom.window.close();
});
