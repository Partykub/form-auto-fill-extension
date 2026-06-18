import assert from "node:assert/strict";
import test from "node:test";

import {
  createExtensionDom,
  sendContentMessage,
} from "./helpers/load-extension.js";

test("content script exposes extraction and autofill-summary messages", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="name" data-question-type="text">
          <div data-question-title>Name</div>
          <input type="text">
        </section>
        <section data-question-id="date" data-question-type="date">
          <div data-question-title>Date</div>
          <input type="date">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadContentScript: true,
  });

  const status = await sendContentMessage(dom.window, {
    type: "GET_PAGE_STATUS",
  });
  const extracted = await sendContentMessage(dom.window, {
    type: "EXTRACT_QUESTIONS",
  });
  const autofill = await sendContentMessage(dom.window, {
    type: "RUN_AUTOFILL",
  });

  assert.equal(status.supported, true);
  assert.equal(status.detected, true);
  assert.equal(extracted.ok, true);
  assert.equal(extracted.questions.length, 2);
  assert.equal(extracted.unsupportedCount, 1);
  assert.match(autofill.message, /Extracted 2 questions/);
  dom.window.close();
});

test("content script returns structured errors on unsupported pages", async () => {
  const dom = await createExtensionDom({
    url: "https://example.com/",
    loadContentScript: true,
  });

  const result = await sendContentMessage(dom.window, {
    type: "EXTRACT_QUESTIONS",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNSUPPORTED_FORM");
  dom.window.close();
});

test("content script invalidates cached questions after a debounced DOM change", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="first" data-question-type="text">
          <div data-question-title>First</div>
          <input type="text">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadContentScript: true,
  });

  const first = await sendContentMessage(dom.window, {
    type: "EXTRACT_QUESTIONS",
  });
  dom.window.document.querySelector("form").insertAdjacentHTML(
    "beforeend",
    `
      <section data-question-id="second" data-question-type="text">
        <div data-question-title>Second</div>
        <input type="text">
      </section>
    `,
  );

  const cached = await sendContentMessage(dom.window, {
    type: "EXTRACT_QUESTIONS",
  });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const refreshed = await sendContentMessage(dom.window, {
    type: "EXTRACT_QUESTIONS",
  });

  assert.equal(first.questions.length, 1);
  assert.equal(cached.questions.length, 1);
  assert.equal(refreshed.questions.length, 2);
  dom.window.close();
});

test("start autofill fills supported Google Form inputs using extracted bindings", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="name" data-question-type="text">
          <div data-question-title>ชื่อ นามสกุล</div>
          <input type="text">
        </section>
        <section data-question-id="email" data-question-type="text">
          <div data-question-title>Email</div>
          <input type="email">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadFillEngine: true,
    loadMappingStore: true,
    loadContentScript: true,
  });

  dom.window.chrome.storage = {
    local: {
      get(_defaults, callback) {
        callback({ backendUrl: "http://localhost:3000" });
      },
    },
  };
  dom.window.chrome.runtime.sendMessage = async (message) => {
    assert.equal(message.type, "MATCH_QUESTIONS");
    return {
      ok: true,
      matches: [
        { field: "fullName", value: "Party Kub" },
        { field: "email", value: "party@example.com" },
      ],
    };
  };

  const result = await sendContentMessage(dom.window, {
    type: "START_AUTOFILL",
  });

  assert.equal(result.ok, true);
  assert.equal(result.autofill.filled, 2);
  assert.equal(
    dom.window.document.querySelector('section[data-question-id="name"] input').value,
    "Party Kub",
  );
  assert.equal(
    dom.window.document.querySelector('section[data-question-id="email"] input').value,
    "party@example.com",
  );
  dom.window.close();
});

test("start autofill uses saved manual mappings before sending unmatched questions to backend", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="name" data-question-type="text">
          <div data-question-title>ชื่อผู้สมัคร</div>
          <input type="text">
        </section>
        <section data-question-id="email" data-question-type="text">
          <div data-question-title>Email</div>
          <input type="email">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadFillEngine: true,
    loadMappingStore: true,
    loadContentScript: true,
  });

  const profile = {
    fields: [
      { key: "full_name", value: "Party Kub" },
      { key: "email", value: "party@example.com" },
    ],
  };
  const manualMappings = {
    [dom.window.FormAutoFill.mappingStore.normalize("ชื่อผู้สมัคร")]: "full_name",
  };

  dom.window.chrome.storage.local.get = (defaults, callback) => {
    callback({
      ...defaults,
      backendUrl: "http://localhost:3000",
      profile,
      manualMappings,
    });
  };

  dom.window.chrome.runtime.sendMessage = async (message) => {
    assert.equal(message.type, "MATCH_QUESTIONS");
    assert.equal(message.questions.length, 1);
    assert.equal(message.questions[0].text, "Email");
    return {
      ok: true,
      matches: [{ field: "email", value: "party@example.com" }],
    };
  };

  const result = await sendContentMessage(dom.window, {
    type: "START_AUTOFILL",
  });

  assert.equal(result.ok, true);
  assert.equal(result.autofill.filled, 2);
  dom.window.close();
});

test("start autofill returns manual mapping payload for unresolved questions", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="ambiguous" data-question-type="text">
          <div data-question-title>ข้อ 1</div>
          <input type="text">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadFillEngine: true,
    loadMappingStore: true,
    loadContentScript: true,
  });

  dom.window.chrome.storage.local.get = (defaults, callback) => {
    callback({
      ...defaults,
      backendUrl: "http://localhost:3000",
      profile: { fields: [] },
      manualMappings: {},
    });
  };
  dom.window.chrome.runtime.sendMessage = async () => ({
    ok: true,
    matches: [null],
  });

  const result = await sendContentMessage(dom.window, {
    type: "START_AUTOFILL",
  });

  assert.equal(result.ok, true);
  assert.equal(result.manualMappingRequired.questions.length, 1);
  assert.equal(result.manualMappingRequired.questions[0].text, "ข้อ 1");
  assert.equal(
    dom.window.document.querySelector('section[data-question-id="ambiguous"] input').value,
    "",
  );
  dom.window.close();
});

test("invalid saved manual mappings are ignored and fall back to backend matching", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="name" data-question-type="text">
          <div data-question-title>ชื่อผู้สมัคร</div>
          <input type="text">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
    loadFillEngine: true,
    loadMappingStore: true,
    loadContentScript: true,
  });

  const mappingKey = dom.window.FormAutoFill.mappingStore.normalize("ชื่อผู้สมัคร");
  dom.window.chrome.storage.local.get = (defaults, callback) => {
    callback({
      ...defaults,
      backendUrl: "http://localhost:3000",
      profile: { fields: [{ key: "email", value: "party@example.com" }] },
      manualMappings: { [mappingKey]: "deleted_field" },
    });
  };

  let backendCalls = 0;
  dom.window.chrome.runtime.sendMessage = async (message) => {
    backendCalls += 1;
    assert.equal(message.questions.length, 1);
    return {
      ok: true,
      matches: [{ field: "full_name", value: "Party Kub" }],
    };
  };

  const result = await sendContentMessage(dom.window, {
    type: "START_AUTOFILL",
  });

  assert.equal(backendCalls, 1);
  assert.equal(result.autofill.filled, 1);
  dom.window.close();
});
