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
