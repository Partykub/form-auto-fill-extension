import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.resolve(currentDirectory, "../../../extension");
const adapterScripts = [
  "adapters/core.js",
  "adapters/google-forms.js",
  "adapters/microsoft-forms.js",
  "adapters/registry.js",
];

export async function createExtensionDom({
  html = "<!doctype html><html><body></body></html>",
  url = "https://example.com/",
  loadContentScript = false,
  loadFillEngine = false,
  loadMappingStore = false,
} = {}) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });

  dom.window.chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          callback(defaults);
        },
        set(_values, callback) {
          callback?.();
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          dom.window.__messageListener = listener;
        },
      },
    },
  };

  for (const relativePath of adapterScripts) {
    const source = await readFile(path.join(extensionDirectory, relativePath), "utf8");
    dom.window.eval(source);
  }

  if (loadFillEngine) {
    const source = await readFile(path.join(extensionDirectory, "fill-engine.js"), "utf8");
    dom.window.eval(source);
  }

  if (loadMappingStore) {
    const source = await readFile(path.join(extensionDirectory, "mapping-store.js"), "utf8");
    dom.window.eval(source);
  }

  if (loadContentScript) {
    const source = await readFile(path.join(extensionDirectory, "content.js"), "utf8");
    dom.window.eval(source);
  }

  return dom;
}

export async function sendContentMessage(window, message) {
  return new Promise((resolve) => {
    window.__messageListener(message, {}, resolve);
  });
}
