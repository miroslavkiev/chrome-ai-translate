import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as shared from "../shared.js";

const source = (await readFile(new URL("../settings.js", import.meta.url), "utf8"))
  .replace(/^import \{[\s\S]*?\} from "\.\/shared.js";\n/, "")
  .replace(/initialize\(\);\s*$/, "globalThis.initialization = initialize();");

class Element {
  constructor() {
    this.value = "";
    this.type = "password";
    this.textContent = "";
    this.dataset = {};
    this.childNodes = [];
    this.listeners = new Map();
    this.classList = { add() {}, remove() {} };
  }
  get options() { return this.childNodes; }
  get selectedOptions() { return this.childNodes.filter((item) => item.value === this.value); }
  append(...items) { this.childNodes.push(...items); }
  replaceChildren(fragment) { this.childNodes = [...fragment.childNodes]; }
  setAttribute() {}
  focus() {}
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  dispatch(name, values = {}) { return this.listeners.get(name)?.({ preventDefault() {}, ...values }); }
}

function setup({ local = {}, sync = {}, failRead, runtimeReady, runtimeState, models, failWrite, afterRead } = {}) {
  const elements = new Map();
  const writes = [];
  const reads = [];
  const messages = [];
  const changeListeners = [];
  const data = { local: { ...local }, sync: { ...sync } };
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const emit = (area, values) => {
    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: value }]));
    Object.assign(data[area], values);
    for (const listener of changeListeners) listener(changes, area);
  };
  const storageArea = (area) => ({
    async get() {
      reads.push(area);
      if (failRead === area) throw new Error("Fake read failure");
      const snapshot = { ...data[area] };
      if (afterRead) await afterRead(area);
      return snapshot;
    },
    async set(values) {
      if (failWrite === area) throw new Error("Fake write failure");
      writes.push([area, { ...values }]);
      emit(area, values);
    },
    async remove(key) {
      if (failWrite === area) throw new Error("Fake write failure");
      writes.push([area, { [key]: undefined }]);
      emit(area, { [key]: undefined });
    },
  });
  const context = vm.createContext({
    ...shared,
    Intl, setTimeout, clearTimeout,
    navigator: { platform: "Mac" },
    window: { addEventListener() {}, location: { reload() {} } },
    document: {
      getElementById: element,
      createDocumentFragment: () => new Element(),
      createElement: () => new Element(),
      addEventListener() {},
    },
    chrome: {
      storage: { local: storageArea("local"), sync: storageArea("sync"), onChanged: { addListener: (listener) => changeListeners.push(listener) } },
      runtime: {
        async sendMessage(message) {
          messages.push(message);
          if (message.action === "getRuntimeState") {
            if (runtimeReady) await runtimeReady;
            return runtimeState || { ok: true, apiKeyStatus: data.local.geminiApiKey ? "saved" : "missing" };
          }
          if (models) return models(message);
          return { ok: true, source: "live", models: [{ id: shared.DEFAULTS.aiModel }, { id: "other-model" }] };
        },
      },
    },
  });
  vm.runInContext(source, context);
  return { context, element, data, emit, writes, reads, messages, ready: context.initialization };
}

async function flush() { await new Promise((resolve) => setImmediate(resolve)); }
const submit = (page) => page.element("settingsForm").dispatch("submit");
const change = (page, id, value) => {
  page.element(id).value = value;
  return page.element(id).dispatch("change");
};

test("Settings never writes after either initial read fails", async () => {
  for (const failRead of ["local", "sync"]) {
    const page = setup({ failRead, sync: { targetLanguage: "de", aiModel: "saved-model", triggerKey: null } });
    await page.ready;
    assert.equal(page.element("saveButton").disabled, true);
    assert.equal(page.element("apiKey").disabled, true);
    assert.match(page.element("saveStatus").textContent, /Saving is disabled/);
    await submit(page);
    await change(page, "apiKey", "replacement-fake-key");
    assert.deepEqual(page.writes, []);
    assert.equal(page.data.sync.triggerKey, null);
  }
});

test("Settings waits for runtime migration before storage reads", async () => {
  let release;
  const runtimeReady = new Promise((resolve) => { release = resolve; });
  const page = setup({ runtimeReady, sync: { triggerKey: null, targetLanguage: "de" } });
  await flush();
  assert.deepEqual(page.reads, []);
  page.data.local.geminiApiKey = "migrated-fake-key";
  release();
  await page.ready;
  assert.equal(page.element("apiKey").value, "migrated-fake-key");
  assert.equal(page.element("shortcutValue").textContent, "Off");
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
  assert.deepEqual(page.writes, []);
});

test("Settings refreshes untouched fields and writes only the edited preference", async () => {
  const page = setup();
  await page.ready;
  page.emit("sync", { aiModel: "other-model", triggerKey: null });
  assert.equal(page.element("aiModel").value, "other-model");
  assert.equal(page.element("shortcutValue").textContent, "Off");
  change(page, "targetLanguage", "de");
  await submit(page);
  assert.deepEqual(page.writes, [["sync", { targetLanguage: "de" }]]);
  assert.equal(page.data.sync.triggerKey, null);
  assert.equal(page.data.sync.aiModel, "other-model");
});

test("Settings rechecks storage before saving when a change event was missed", async () => {
  const page = setup();
  await page.ready;
  change(page, "targetLanguage", "de");
  page.data.sync.aiModel = "other-model";
  page.data.sync.triggerKey = null;
  await submit(page);
  assert.deepEqual(page.writes, [["sync", { targetLanguage: "de" }]]);
  assert.equal(page.element("shortcutValue").textContent, "Off");
});

test("Settings keeps local conflicting edits and blocks preference or API-key overwrites", async () => {
  const page = setup({ local: { geminiApiKey: "original-fake-key" } });
  await page.ready;
  change(page, "targetLanguage", "de");
  page.emit("sync", { targetLanguage: "fr" });
  assert.equal(page.element("targetLanguage").value, "de");
  assert.equal(page.element("reloadSettings").hidden, false);
  assert.equal(page.element("saveButton").disabled, true);
  await submit(page);
  page.element("apiKey").value = "my-draft-fake-key";
  page.emit("local", { geminiApiKey: "newer-fake-key" });
  await page.element("apiKey").dispatch("change");
  assert.equal(page.element("apiKey").value, "my-draft-fake-key");
  assert.match(page.element("apiKeyStatus").textContent, /changed in another page/);
  assert.deepEqual(page.writes, []);
});

test("API-key failures keep the typed value and clean external replacement/removal updates the field", async () => {
  const failed = setup({ failWrite: "local" });
  await failed.ready;
  failed.element("apiKey").value = "new-fake-key";
  failed.element("apiKey").dispatch("input");
  await failed.element("apiKey").dispatch("change");
  await flush();
  assert.equal(failed.element("apiKey").value, "new-fake-key");
  assert.match(failed.element("apiKeyStatus").textContent, /could not be read or saved/);
  assert.deepEqual(failed.writes, []);
  assert.equal(failed.element("saveButton").disabled, false);
  const page = setup();
  await page.ready;
  page.emit("local", { geminiApiKey: "external-fake-key" });
  await flush();
  assert.equal(page.element("apiKey").value, "external-fake-key");
  page.emit("local", { geminiApiKey: undefined });
  assert.equal(page.element("apiKey").value, "");
  assert.match(page.element("modelStatus").textContent, /Add an API key/);
});

test("A late model response for a removed key cannot restore setup readiness", async () => {
  let release;
  const result = new Promise((resolve) => { release = resolve; });
  const page = setup({ local: { geminiApiKey: "original-fake-key" }, models: () => result });
  await flush();
  page.emit("local", { geminiApiKey: undefined });
  release({ ok: true, source: "live", models: [{ id: shared.DEFAULTS.aiModel }] });
  await page.ready;
  assert.equal(page.element("apiKey").value, "");
  assert.match(page.element("setupStatus").textContent, /Add an API key/);
  assert.match(page.element("modelStatus").textContent, /Add an API key/);
  assert.deepEqual(page.writes, []);
});


test("Runtime failure keeps Settings locked; a rejected key stays visible without cached success", async () => {
  const failed = setup({ runtimeState: { ok: false, error: { code: "service_error" } } });
  await failed.ready;
  assert.equal(failed.element("apiKey").disabled, true);
  assert.equal(failed.element("saveButton").disabled, true);
  await submit(failed);
  assert.deepEqual(failed.reads, []);
  assert.deepEqual(failed.writes, []);
  const rejected = setup({
    local: { geminiApiKey: "rejected-fake-key" },
    runtimeState: { ok: true, apiKeyStatus: "rejected" },
    models: () => ({ ok: false, error: { code: "invalid_api_key", message: "Gemini rejected the saved key." } }),
  });
  await rejected.ready;
  assert.match(rejected.element("apiKeyStatus").textContent, /rejected/);
  assert.match(rejected.element("setupStatus").textContent, /rejected/);
  assert.equal(rejected.element("refreshModels").disabled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(rejected.messages.at(-1))), { action: "listModels", forceRefresh: false });
});

test("Repeated form submission has one preference write", async () => {
  const page = setup();
  await page.ready;
  change(page, "targetLanguage", "de");
  await Promise.all([submit(page), submit(page)]);
  assert.deepEqual(page.writes, [["sync", { targetLanguage: "de" }]]);
});


test("Settings replays key and preference changes received during initial reads", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const page = setup({
    local: { geminiApiKey: "original-fake-key" },
    sync: { targetLanguage: "de", triggerKey: "Control" },
    afterRead: () => gate,
  });
  await flush();
  assert.equal(page.reads.length, 2);
  page.emit("local", { geminiApiKey: "replacement-fake-key" });
  page.emit("sync", { targetLanguage: "fr", triggerKey: null });
  release();
  await page.ready;
  assert.equal(page.element("apiKey").value, "replacement-fake-key");
  assert.equal(page.element("targetLanguage").value, "fr");
  assert.equal(page.element("shortcutValue").textContent, "Off");
  assert.equal(page.element("saveButton").disabled, true);
  assert.equal(page.element("reloadSettings").hidden, true);
  assert.deepEqual(page.writes, []);
});

test("An older rejected-key handshake cannot hide a replacement key's model check", async () => {
  const page = setup({ local: { geminiApiKey: "replacement-fake-key" }, runtimeState: { ok: true, apiKeyStatus: "rejected" } });
  await page.ready;
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
  assert.match(page.element("apiKeyStatus").textContent, /accepted/);
  assert.match(page.element("setupStatus").textContent, /Ready to try/);
  assert.deepEqual(page.writes, []);
});


test("Catalog changes refresh open Settings, preserve model edits, and recover after a sibling refresh", async () => {
  let availableModels = [{ id: shared.DEFAULTS.aiModel }, { id: "other-model" }];
  const page = setup({
    local: { geminiApiKey: "saved-fake-key" },
    models: () => ({ ok: true, source: "cache", models: availableModels }),
  });
  await page.ready;
  change(page, "aiModel", "other-model");
  availableModels = [{ id: shared.DEFAULTS.aiModel }];
  page.emit("local", { modelCatalog: { unavailableModels: ["other-model"] } });
  await flush();
  assert.equal(page.element("aiModel").value, "other-model");
  assert.equal(page.element("aiModel").selectedOptions[0].dataset.unavailable, "true");
  assert.match(page.element("modelStatus").textContent, /selected model is not/);
  assert.match(page.element("setupStatus").textContent, /Choose an available model/);
  assert.equal(page.element("saveButton").disabled, false);
  availableModels = [{ id: shared.DEFAULTS.aiModel }, { id: "other-model" }];
  page.emit("local", { modelCatalog: { unavailableModels: [] } });
  await flush();
  assert.equal(page.element("aiModel").value, "other-model");
  assert.notEqual(page.element("aiModel").selectedOptions[0].dataset.unavailable, "true");
  assert.match(page.element("setupStatus").textContent, /Model selected/);
  change(page, "aiModel", shared.DEFAULTS.aiModel);
  assert.match(page.element("setupStatus").textContent, /Ready to try/);
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 3);
  assert.deepEqual(page.writes, []);
});


test("A quick rejection status keeps Refresh usable when an older model request ends later", async () => {
  const status = { ok: true, apiKeyStatus: "checked" };
  let calls = 0;
  let release;
  const page = setup({
    local: { geminiApiKey: "saved-fake-key" },
    runtimeState: status,
    models: () => {
      calls += 1;
      if (calls === 2) return new Promise((resolve) => { release = resolve; });
      return { ok: true, source: "cache", models: [{ id: shared.DEFAULTS.aiModel }] };
    },
  });
  await page.ready;
  status.apiKeyStatus = "rejected";
  page.emit("local", { apiKeyStatus: { status: "rejected" }, modelCatalog: null });
  await flush();
  assert.equal(page.element("refreshModels").disabled, false);
  release({ ok: false, error: { code: "invalid_api_key", message: "Rejected" } });
  await flush();
  assert.equal(page.element("refreshModels").disabled, false);
  assert.match(page.element("setupStatus").textContent, /rejected/);
  status.apiKeyStatus = "checked";
  await page.element("refreshModels").dispatch("click");
  assert.match(page.element("setupStatus").textContent, /Ready to try/);
  assert.equal(calls, 3);
  assert.deepEqual(page.writes, []);
});
