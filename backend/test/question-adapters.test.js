import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createExtensionDom } from "./helpers/load-extension.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.join(currentDirectory, "fixtures");

async function loadFixture(name) {
  return readFile(path.join(fixturesDirectory, name), "utf8");
}

function summarize(questions) {
  return Array.from(questions, ({ id, text, type, required, supported }) => ({
    id,
    text,
    type,
    required,
    supported,
  }));
}

test("Google adapter extracts current visible MVP questions and warnings", async () => {
  const dom = await createExtensionDom({
    html: await loadFixture("google-form.html"),
    url: "https://docs.google.com/forms/d/e/example/viewform",
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );

  await adapter.waitForReady();
  const { questions, warnings } = adapter.extractQuestions();

  assert.equal(adapter.platform, "google");
  assert.deepEqual(
    Array.from(questions, (question) => question.type),
    [
      "short_text",
      "long_text",
      "email",
      "phone",
      "radio",
      "checkbox",
      "dropdown",
      "unsupported",
      "short_text",
      "short_text",
    ],
  );
  assert.equal(questions[0].required, true);
  assert.equal(questions[0].description, "กรอกตามบัตรประชาชน");
  assert.equal(questions[4].options.length, 2);
  assert.equal(questions[4].options[1].disabled, true);
  assert.equal(questions[6].options[0].value, "engineering");
  assert.equal(questions[7].supported, false);
  assert.notEqual(questions[8].id, questions[9].id);
  assert.equal(questions.some((question) => question.text === "Registration Form"), false);
  assert.equal(questions.some((question) => question.text === "Hidden question"), false);
  assert.equal(warnings.length, 1);
  assert.equal(adapter.bindings.size, questions.length);
  assert.deepEqual(summarize(adapter.extractQuestions().questions), summarize(questions));

  dom.window.close();
});

test("Microsoft adapter extracts current visible MVP questions and warnings", async () => {
  const dom = await createExtensionDom({
    html: await loadFixture("microsoft-form.html"),
    url: "https://forms.office.com/Pages/ResponsePage.aspx?id=example",
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );

  await adapter.waitForReady();
  const { questions, warnings } = adapter.extractQuestions();

  assert.equal(adapter.platform, "microsoft");
  assert.deepEqual(
    Array.from(questions, (question) => question.type),
    [
      "short_text",
      "long_text",
      "email",
      "phone",
      "radio",
      "checkbox",
      "dropdown",
      "unsupported",
    ],
  );
  assert.equal(questions[0].required, true);
  assert.equal(questions[0].description, "ชื่อที่ใช้ในระบบ");
  assert.equal(questions[5].options[1].disabled, true);
  assert.equal(questions[7].supported, false);
  assert.equal(questions.some((question) => question.text === "Employee Survey"), false);
  assert.equal(questions.some((question) => question.text === "Hidden question"), false);
  assert.equal(warnings.length, 1);
  assert.equal(adapter.bindings.size, questions.length);
  assert.throws(
    () => adapter.fillAnswer(questions[0].id, "Example"),
    (error) => error.code === "FEATURE_NOT_IMPLEMENTED",
  );
  assert.throws(
    () => adapter.submit(),
    (error) => error.code === "FEATURE_NOT_IMPLEMENTED",
  );

  dom.window.close();
});

test("registry rejects unknown pages and recognizes supported locations before render", async () => {
  const unknownDom = await createExtensionDom({
    url: "https://example.com/form",
  });
  assert.equal(
    unknownDom.window.FormAutoFill.adapterRegistry.isSupportedLocation(
      unknownDom.window.location,
    ),
    false,
  );
  assert.throws(
    () =>
      unknownDom.window.FormAutoFill.adapterRegistry.createAdapter(
        unknownDom.window.document,
        unknownDom.window.location,
      ),
    (error) => error.code === "UNSUPPORTED_FORM",
  );
  unknownDom.window.close();

  const googleDom = await createExtensionDom({
    url: "https://docs.google.com/forms/d/e/example/viewform",
  });
  assert.equal(
    googleDom.window.FormAutoFill.adapterRegistry.isSupportedLocation(
      googleDom.window.location,
    ),
    true,
  );
  assert.equal(
    googleDom.window.FormAutoFill.adapterRegistry.isSupportedForm(
      googleDom.window.document,
      googleDom.window.location,
    ),
    false,
  );
  googleDom.window.close();
});

test("waitForReady supports dynamically rendered forms", async () => {
  const dom = await createExtensionDom({
    url: "https://docs.google.com/forms/d/e/example/viewform",
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );
  const ready = adapter.waitForReady({ timeoutMs: 500 });

  setTimeout(() => {
    dom.window.document.body.insertAdjacentHTML(
      "beforeend",
      `
        <form data-google-form>
          <section data-question-id="late" data-question-type="text">
            <div data-question-title>Late question</div>
            <input type="text">
          </section>
        </form>
      `,
    );
  }, 20);

  await ready;
  assert.equal(adapter.extractQuestions().questions[0].text, "Late question");
  dom.window.close();
});

test("adapters can use aria-labelledby when a dedicated title element is absent", async () => {
  const dom = await createExtensionDom({
    html: `
      <form data-google-form>
        <section data-question-id="accessible" data-question-type="text">
          <span id="accessible-title">Accessible question</span>
          <input type="text" aria-labelledby="accessible-title">
        </section>
      </form>
    `,
    url: "https://docs.google.com/forms/d/e/example/viewform",
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );

  await adapter.waitForReady();
  const result = adapter.extractQuestions();

  assert.equal(result.questions[0].text, "Accessible question");
  assert.equal(result.warnings.length, 0);
  dom.window.close();
});

test("observeChanges debounces mutations and detects a section update", async () => {
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
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );
  await adapter.waitForReady();

  let calls = 0;
  const changed = new Promise((resolve) => {
    const stop = adapter.observeChanges(() => {
      calls += 1;
      stop();
      resolve();
    });
  });
  adapter.root.insertAdjacentHTML(
    "beforeend",
    `
      <section data-question-id="second" data-question-type="text">
        <div data-question-title>Second</div>
        <input type="text">
      </section>
    `,
  );
  adapter.root.setAttribute("data-render-version", "2");

  await changed;
  assert.equal(calls, 1);
  assert.equal(adapter.extractQuestions().questions.length, 2);
  dom.window.close();
});

test("waitForReady returns FORM_NOT_READY after timeout", async () => {
  const dom = await createExtensionDom({
    url: "https://forms.microsoft.com/Pages/ResponsePage.aspx?id=missing",
  });
  const adapter = dom.window.FormAutoFill.adapterRegistry.createAdapter(
    dom.window.document,
    dom.window.location,
  );

  await assert.rejects(
    () => adapter.waitForReady({ timeoutMs: 20 }),
    (error) => error.code === "FORM_NOT_READY",
  );
  dom.window.close();
});
