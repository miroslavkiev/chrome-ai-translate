import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as shared from "../shared.js";

const source = (await readFile(new URL("../settings.js", import.meta.url), "utf8"))
  .replace(/^import \{[\s\S]*?\} from "\.\/shared.js";\r?\n/, "")
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

function setup({ apiKey = null, accepted = true, sync = {}, failRead, runtimeReady, runtimeState, models, failWrite, afterRead, beforeKeyWrite } = {}) {
  const elements = new Map();
  const writes = [];
  const reads = [];
  const messages = [];
  const changeListeners = [];
  const windowListeners = new Map();
  const data = { local: {}, sync: { ...sync } };
  const credentials = { apiKey, revision: apiKey ? "revision-1" : null, accepted };
  let revision = 1;
  let reloads = 0;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const emit = (area, values) => {
    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: value }]));
    Object.assign(data[area], values);
    for (const listener of changeListeners) listener(changes, area);
  };
  const replaceCredential = (value, notify = true) => {
    credentials.apiKey = value;
    credentials.revision = `revision-${++revision}`;
    if (notify) emit("local", { credentialVersion: credentials.revision });
  };
  const state = () => ({ ok: true, apiKey: credentials.apiKey, credentialRevision: credentials.revision,
    dataSharingAccepted: credentials.accepted, apiKeyStatus: credentials.apiKey ? "saved" : "missing",
    configured: Boolean(credentials.apiKey && credentials.accepted && shared.isSupportedLanguage(data.sync.targetLanguage)), ...runtimeState });
  const storageArea = (area) => ({
    async get(keys) {
      assert.equal(area, "sync", "Settings must not read plaintext local credentials");
      assert.ok(!keys.includes(shared.STORAGE_KEYS.apiKey));
      reads.push(area);
      if (failRead === area) throw new Error("Fake read failure");
      const snapshot = { ...data[area] };
      if (afterRead) await afterRead(area);
      return snapshot;
    },
    async set(values) {
      assert.equal(area, "sync", "Settings must not write plaintext local credentials");
      assert.ok(!Object.hasOwn(values, shared.STORAGE_KEYS.apiKey));
      if (failWrite === area) throw new Error("Fake write failure");
      writes.push([area, { ...values }]);
      emit(area, values);
    },
  });
  const context = vm.createContext({
    ...shared,
    Intl, setTimeout, clearTimeout,
    navigator: { platform: "Mac" },
    window: { addEventListener: (name, listener) => windowListeners.set(name, listener), location: { reload() { reloads += 1; } } },
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
          if (message.action === "getSettingsState" || message.action === "getRuntimeState") {
            if (runtimeReady) await runtimeReady;
            if (failRead === "credential") throw new Error("Fake credential read failure");
            return state();
          }
          if (message.action === "setApiKey") {
            if (beforeKeyWrite) await beforeKeyWrite(credentials);
            if (message.expectedRevision !== credentials.revision) return { ok: false, error: { code: "credential_conflict" } };
            if (failWrite === "credential") throw new Error("Fake credential write failure");
            if (message.apiKey && !credentials.accepted) return { ok: false, error: { code: "agreement_required" } };
            writes.push(["credential", { apiKey: message.apiKey }]);
            replaceCredential(message.apiKey);
            return state();
          }
          if (message.action === "setDataSharing") {
            credentials.accepted = message.accepted;
            writes.push(["agreement", { accepted: message.accepted }]);
            emit("local", { dataSharingAgreement: message.accepted ? { version: 1 } : undefined });
            return state();
          }
          if (message.action === "resetDamagedKey") {
            if (failWrite === "credential") return { ok: false, error: { code: "credential_storage_error", message: "Saved key cannot be opened." } };
            writes.push(["credential", { apiKey: null }]);
            replaceCredential(null);
            return { ok: true, apiKey: null, credentialRevision: credentials.revision, dataSharingAccepted: credentials.accepted };
          }
          assert.equal(message.action, "listModels");
          assert.equal(credentials.accepted, true, "No model request before agreement");
          if (models) return models(message);
          return { ok: true, source: "live", models: [{ id: shared.DEFAULTS.aiModel }, { id: "other-model" }] };
        },
      },
    },
  });
  vm.runInContext(source, context);
  return { context, element, data, credentials, replaceCredential, emit, writes, reads, messages, windowListeners, get reloads() { return reloads; }, ready: context.initialization };
}

async function flush() { await new Promise((resolve) => setImmediate(resolve)); }
const submit = (page) => page.element("settingsForm").dispatch("submit");
const change = (page, id, value) => {
  page.element(id).value = value;
  return page.element(id).dispatch(id == "apiKey" ? "blur" : "change");
};

test("Settings never writes after either initial read fails", async () => {
  for (const failRead of ["credential", "sync"]) {
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

test("An invalid saved language requires a real choice instead of a silent default", async () => {
  const page = setup({ apiKey: "saved-fake-key", sync: { targetLanguage: "unknown-language" } });
  await page.ready;
  assert.equal(page.element("targetLanguage").value, "");
  assert.equal(page.element("setupGuide").hidden, false);
  change(page, "targetLanguage", "uk");
  await submit(page);
  assert.equal(page.data.sync.targetLanguage, "uk");
  assert.equal(page.element("setupGuide").hidden, true);
});

test("Settings waits for runtime migration before storage reads", async () => {
  let release;
  const runtimeReady = new Promise((resolve) => { release = resolve; });
  const page = setup({ runtimeReady, sync: { triggerKey: null, targetLanguage: "de" } });
  await flush();
  assert.deepEqual(page.reads, []);
  page.replaceCredential("migrated-fake-key", false);
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
  const page = setup({ apiKey: "original-fake-key" });
  await page.ready;
  change(page, "targetLanguage", "de");
  page.emit("sync", { targetLanguage: "fr" });
  assert.equal(page.element("targetLanguage").value, "de");
  assert.equal(page.element("reloadSettings").hidden, false);
  assert.equal(page.element("saveButton").disabled, true);
  await submit(page);
  page.element("apiKey").value = "my-draft-fake-key";
  page.replaceCredential("newer-fake-key");
  await flush();
  await page.element("apiKey").dispatch("blur");
  assert.equal(page.element("apiKey").value, "my-draft-fake-key");
  assert.match(page.element("apiKeyStatus").textContent, /changed in another page/);
  assert.deepEqual(page.writes, []);
});

test("API-key failures keep the typed value and clean external replacement/removal updates the field", async () => {
  const failed = setup({ failWrite: "credential" });
  await failed.ready;
  failed.element("apiKey").value = "new-fake-key";
  failed.element("apiKey").dispatch("input");
  await failed.element("apiKey").dispatch("blur");
  await flush();
  assert.equal(failed.element("apiKey").value, "new-fake-key");
  assert.match(failed.element("apiKeyStatus").textContent, /could not be read or saved/);
  assert.deepEqual(failed.writes, []);
  assert.equal(failed.element("saveButton").disabled, false);
  const page = setup();
  await page.ready;
  page.replaceCredential("external-fake-key");
  await flush();
  assert.equal(page.element("apiKey").value, "external-fake-key");
  page.replaceCredential(undefined);
  await flush();
  assert.equal(page.element("apiKey").value, "");
  assert.match(page.element("modelStatus").textContent, /Add an API key/);
});

test("A late model response for a removed key cannot restore setup readiness", async () => {
  let release;
  const result = new Promise((resolve) => { release = resolve; });
  const page = setup({ apiKey: "original-fake-key", models: () => result });
  await flush();
  page.replaceCredential(undefined);
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
    apiKey: "rejected-fake-key",
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
    apiKey: "original-fake-key",
    sync: { targetLanguage: "de", triggerKey: "Control" },
    afterRead: () => gate,
  });
  await flush();
  assert.equal(page.reads.length, 1);
  page.replaceCredential("replacement-fake-key");
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
  const page = setup({ apiKey: "replacement-fake-key", runtimeState: { ok: true, apiKeyStatus: "rejected" } });
  await page.ready;
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
  assert.match(page.element("apiKeyStatus").textContent, /accepted/);
  assert.match(page.element("setupStatus").textContent, /Ready to try/);
  assert.deepEqual(page.writes, []);
});


test("Catalog changes refresh open Settings, preserve model edits, and recover after a sibling refresh", async () => {
  let availableModels = [{ id: shared.DEFAULTS.aiModel }, { id: "other-model" }];
  const page = setup({
    apiKey: "saved-fake-key",
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
    apiKey: "saved-fake-key",
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

test("New setup keeps a language placeholder and stays open after key autosave until preferences are saved", async () => {
  const page = setup({
    sync: { targetLanguage: null, aiModel: shared.RECOMMENDED_MODEL },
    models: () => ({ ok: true, source: "live", models: [{ id: shared.RECOMMENDED_MODEL }] }),
  });
  await page.ready;
  assert.equal(page.element("setupGuide").hidden, false);
  assert.equal(page.element("targetLanguage").value, "");
  assert.equal(page.element("targetLanguage").options.length, shared.LANGUAGES.length + 1);
  await submit(page);
  assert.deepEqual(page.writes, []);
  assert.match(page.element("saveStatus").textContent, /Choose a valid language/);

  page.element("apiKey").value = "own-fake-key";
  page.element("apiKey").dispatch("input", { inputType: "insertFromPaste" });
  await flush();
  assert.equal(page.credentials.apiKey, "own-fake-key");
  assert.equal(page.element("setupGuide").hidden, false);
  assert.equal(page.element("saveButton").disabled, true);
  assert.match(page.element("setupStatus").textContent, /Choose a target language/);
  const reopened = setup({ apiKey: page.credentials.apiKey, sync: page.data.sync });
  await reopened.ready;
  assert.equal(reopened.element("setupGuide").hidden, false);
  assert.equal(reopened.element("targetLanguage").value, "");

  change(page, "targetLanguage", "de");
  assert.equal(page.element("saveButton").textContent, "Finish setup");
  assert.equal(page.element("saveButton").disabled, false);
  await submit(page);
  assert.equal(page.data.sync.targetLanguage, "de");
  assert.equal(page.element("setupGuide").hidden, true);
  assert.equal(page.element("saveButton").textContent, "Save Preferences");
  assert.match(page.element("setupStatus").textContent, /Ready to try/);
  assert.deepEqual(page.writes, [["credential", { apiKey: "own-fake-key" }], ["sync", { targetLanguage: "de" }]]);
});

test("Setup permits preference changes without a key and can finish later without rewriting preferences", async () => {
  const page = setup({ sync: { targetLanguage: null } });
  await page.ready;
  change(page, "targetLanguage", "fr");
  await submit(page);
  assert.equal(page.data.sync.targetLanguage, "fr");
  assert.equal(page.element("setupGuide").hidden, false);
  assert.match(page.element("saveStatus").textContent, /Add your API key/);
  page.element("apiKey").value = "own-fake-key";
  page.element("apiKey").dispatch("input", { inputType: "insertFromPaste" });
  await flush();
  assert.equal(page.element("saveButton").disabled, false);
  assert.equal(page.element("setupGuide").hidden, false);
  await submit(page);
  assert.equal(page.element("setupGuide").hidden, true);
  assert.deepEqual(page.writes, [["sync", { targetLanguage: "fr" }], ["credential", { apiKey: "own-fake-key" }]]);
});

test("Recommended model is an explicit choice, available only when returned in the checked list", async () => {
  let models = [{ id: shared.DEFAULTS.aiModel }, { id: shared.RECOMMENDED_MODEL }];
  const page = setup({
    apiKey: "saved-fake-key",
    sync: { targetLanguage: "de", aiModel: shared.DEFAULTS.aiModel },
    models: () => ({ ok: true, source: "live", models }),
  });
  await page.ready;
  assert.equal(page.element("setupGuide").hidden, true);
  assert.equal(page.element("aiModel").value, shared.DEFAULTS.aiModel);
  assert.equal(page.element("recommendedModel").disabled, false);
  page.element("recommendedModel").dispatch("click");
  assert.equal(page.element("aiModel").value, shared.RECOMMENDED_MODEL);
  assert.deepEqual(page.writes, []);
  await submit(page);
  assert.deepEqual(page.writes, [["sync", { aiModel: shared.RECOMMENDED_MODEL }]]);
  models = [{ id: shared.DEFAULTS.aiModel }];
  await page.element("refreshModels").dispatch("click");
  assert.equal(page.element("recommendedModel").disabled, true);
  change(page, "aiModel", shared.DEFAULTS.aiModel);
  page.element("recommendedModel").dispatch("click");
  assert.equal(page.element("aiModel").value, shared.DEFAULTS.aiModel);
  assert.equal(page.data.sync.aiModel, shared.RECOMMENDED_MODEL);
});

test("Agreement is required before key entry or model requests, including a migrated saved key", async () => {
  for (const apiKey of [null, "migrated-fake-key"]) {
    const page = setup({ apiKey, accepted: false });
    await page.ready;
    assert.equal(page.element("apiKey").disabled, true);
    assert.equal(page.element("refreshModels").disabled, true);
    assert.equal(page.element("agreeDataSharing").hidden, false);
    assert.equal(page.element("apiKey").value, apiKey || "");
    assert.equal(page.messages.filter((message) => message.action === "listModels").length, 0);
    if (!apiKey) {
      page.element("apiKey").value = "typed-fake-key";
      page.element("apiKey").dispatch("input", { inputType: "insertFromPaste" });
      await change(page, "apiKey", "typed-fake-key");
      assert.equal(page.messages.filter((message) => message.action === "setApiKey").length, 0);
      page.element("apiKey").value = "";
    }
    await page.element("agreeDataSharing").dispatch("click");
    await flush();
    assert.equal(page.credentials.accepted, true);
    assert.equal(page.element("apiKey").disabled, false);
    assert.equal(page.element("agreeDataSharing").hidden, true);
    assert.equal(page.element("withdrawDataSharing").hidden, false);
    assert.equal(page.messages.filter((message) => message.action === "listModels").length, apiKey ? 1 : 0);
    const reopened = setup({ apiKey, accepted: page.credentials.accepted });
    await reopened.ready;
    assert.equal(reopened.element("apiKey").disabled, false);
  }
});

test("Withdrawing agreement keeps the saved key and ignores an older model response", async () => {
  let release;
  let calls = 0;
  const page = setup({ apiKey: "saved-fake-key", models: () => {
    calls += 1;
    if (calls === 2) return new Promise((resolve) => { release = resolve; });
    return { ok: true, models: [{ id: shared.DEFAULTS.aiModel }] };
  } });
  await page.ready;
  const refresh = page.element("refreshModels").dispatch("click");
  await flush();
  await page.element("withdrawDataSharing").dispatch("click");
  release({ ok: true, models: [{ id: shared.DEFAULTS.aiModel }] });
  await refresh;
  await flush();
  assert.equal(page.credentials.apiKey, "saved-fake-key");
  assert.equal(page.credentials.accepted, false);
  assert.equal(page.element("apiKey").disabled, true);
  assert.equal(page.element("refreshModels").disabled, true);
  assert.match(page.element("setupStatus").textContent, /agree before connecting/);
  await page.element("refreshModels").dispatch("click");
  assert.equal(calls, 2);
  assert.deepEqual(page.writes, [["agreement", { accepted: false }]]);
});

test("A blank key draft does not delete the saved key; explicit removal works without agreement", async () => {
  const page = setup({ apiKey: "saved-fake-key" });
  await page.ready;
  await change(page, "apiKey", "");
  assert.equal(page.credentials.apiKey, "saved-fake-key");
  assert.match(page.element("apiKeyStatus").textContent, /Use Remove saved key/);
  assert.deepEqual(page.writes, []);
  await page.element("removeKey").dispatch("click");
  await flush();
  assert.equal(page.credentials.apiKey, null);
  assert.equal(page.element("apiKey").value, "");
  const unagreed = setup({ apiKey: "saved-fake-key", accepted: false });
  await unagreed.ready;
  assert.equal(unagreed.element("removeKey").disabled, false);
  await unagreed.element("removeKey").dispatch("click");
  assert.equal(unagreed.credentials.apiKey, null);
  assert.equal(unagreed.messages.filter((message) => message.action === "listModels").length, 0);
});

test("A key changed during saving fails its revision check and keeps the local draft", async () => {
  const page = setup({ apiKey: "original-fake-key", beforeKeyWrite(credentials) {
    credentials.apiKey = "sibling-fake-key";
    credentials.revision = "sibling-revision";
  } });
  await page.ready;
  await change(page, "apiKey", "my-draft-fake-key");
  assert.equal(page.credentials.apiKey, "sibling-fake-key");
  assert.equal(page.element("apiKey").value, "my-draft-fake-key");
  assert.equal(page.element("saveButton").disabled, true);
  assert.equal(page.element("reloadSettings").hidden, false);
  assert.match(page.element("apiKeyStatus").textContent, /changed in another page/);
  assert.deepEqual(page.writes, []);
});

test("Focus refresh finds missed credential and preference changes without losing local edits", async () => {
  const page = setup({ apiKey: "original-fake-key" });
  await page.ready;
  change(page, "targetLanguage", "fr");
  page.element("apiKey").value = "my-draft-fake-key";
  page.replaceCredential("sibling-fake-key", false);
  page.data.sync.targetLanguage = "de";
  page.data.sync.triggerKey = null;
  page.windowListeners.get("focus")();
  await flush();
  assert.equal(page.element("targetLanguage").value, "fr");
  assert.equal(page.element("apiKey").value, "my-draft-fake-key");
  assert.equal(page.element("shortcutValue").textContent, "Off");
  assert.equal(page.element("saveButton").disabled, true);
  assert.equal(page.element("reloadSettings").hidden, false);
});

test("A damaged saved key is never removed automatically and only the explicit recovery button resets it", async () => {
  const page = setup({ runtimeState: { ok: false, error: { code: "credential_storage_error" }, canRemoveKey: true } });
  await page.ready;
  assert.equal(page.element("apiKey").disabled, true);
  assert.equal(page.element("saveButton").disabled, true);
  assert.equal(page.element("removeKey").hidden, false);
  assert.equal(page.element("removeKey").disabled, false);
  assert.match(page.element("apiKeyStatus").textContent, /cannot be opened/);
  assert.deepEqual(page.writes, []);
  await page.element("removeKey").dispatch("click");
  assert.equal(page.messages.at(-1).action, "resetDamagedKey");
  assert.deepEqual(page.writes, [["credential", { apiKey: null }]]);
  assert.equal(page.reloads, 1);
  const failed = setup({ failWrite: "credential", runtimeState: { ok: false, error: { code: "credential_storage_error" }, canRemoveKey: true } });
  await failed.ready;
  await failed.element("removeKey").dispatch("click");
  assert.equal(failed.reloads, 0);
  assert.equal(failed.element("removeKey").disabled, false);
  assert.deepEqual(failed.writes, []);
});

test("Removing and adding the same key in another page still conflicts with a local replacement draft", async () => {
  for (const notify of [true, false]) {
    const page = setup({ apiKey: "original-fake-key" });
    await page.ready;
    page.element("apiKey").value = "my-draft-fake-key";
    page.element("apiKey").dispatch("input");
    page.replaceCredential(null, false);
    page.replaceCredential("original-fake-key", notify);
    if (notify) await flush();
    await page.element("apiKey").dispatch("blur");
    assert.equal(page.credentials.apiKey, "original-fake-key");
    assert.equal(page.element("apiKey").value, "my-draft-fake-key");
    assert.equal(page.element("saveButton").disabled, true);
    assert.equal(page.element("reloadSettings").hidden, false);
    assert.match(page.element("apiKeyStatus").textContent, /changed in another page/);
    assert.equal(page.messages.some((message) => message.action === "setApiKey"), false);
  }
  const ownSave = setup({ apiKey: "original-fake-key" });
  await ownSave.ready;
  await change(ownSave, "apiKey", "replacement-fake-key");
  await flush();
  assert.equal(ownSave.credentials.apiKey, "replacement-fake-key");
  assert.equal(ownSave.element("reloadSettings").hidden, true);
});

test("Agreeing again restores the normal UI for saved configuration but preserves unfinished preference choices", async () => {
  const configured = setup({ apiKey: "saved-fake-key", sync: { targetLanguage: "de" } });
  await configured.ready;
  assert.equal(configured.element("setupGuide").hidden, true);
  await configured.element("withdrawDataSharing").dispatch("click");
  const reopened = setup({ apiKey: configured.credentials.apiKey, accepted: false, sync: configured.data.sync });
  await reopened.ready;
  assert.equal(reopened.element("setupGuide").hidden, false);
  await reopened.element("agreeDataSharing").dispatch("click");
  await flush();
  assert.equal(reopened.element("setupGuide").hidden, true);
  assert.match(reopened.element("setupStatus").textContent, /Ready to try/);
  assert.equal(reopened.element("saveButton").disabled, true);
  assert.deepEqual(reopened.writes, [["agreement", { accepted: true }]]);

  const draft = setup({ apiKey: "saved-fake-key", accepted: false, sync: { targetLanguage: "de" } });
  await draft.ready;
  change(draft, "targetLanguage", "fr");
  change(draft, "aiModel", "other-model");
  await draft.element("agreeDataSharing").dispatch("click");
  assert.equal(draft.element("setupGuide").hidden, false);
  assert.equal(draft.element("targetLanguage").value, "fr");
  assert.equal(draft.element("aiModel").value, "other-model");
  assert.equal(draft.element("saveButton").disabled, false);
  assert.equal(draft.data.sync.targetLanguage, "de");
  await submit(draft);
  assert.equal(draft.element("setupGuide").hidden, true);
  assert.equal(draft.data.sync.targetLanguage, "fr");
  assert.equal(draft.data.sync.aiModel, "other-model");
});

test("Moving focus from a key draft to Withdraw or Remove does not autosave the draft", async () => {
  for (const button of ["withdrawDataSharing", "removeKey"]) {
    const page = setup({ apiKey: "saved-fake-key" });
    await page.ready;
    page.element("apiKey").value = "unsaved-draft-fake-key";
    page.element("apiKey").dispatch("input");
    page.element("apiKey").dispatch("change");
    await page.element("apiKey").dispatch("blur", { relatedTarget: page.element(button) });
    assert.equal(page.element(button).disabled, false);
    assert.equal(page.messages.some((message) => message.action === "setApiKey"), false);
    await page.element(button).dispatch("click");
    await flush();
    assert.equal(page.messages.some((message) => message.action === "setApiKey" && message.apiKey), false);
    assert.equal(page.credentials.apiKey, button === "removeKey" ? null : "saved-fake-key");
    assert.equal(page.credentials.accepted, button === "removeKey");
    assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
  }
});

test("Withdrawal stays available during an existing key save and prevents a model check afterward", async () => {
  let release;
  const pendingWrite = new Promise((resolve) => { release = resolve; });
  const page = setup({ apiKey: "saved-fake-key", beforeKeyWrite: () => pendingWrite });
  await page.ready;
  const save = change(page, "apiKey", "replacement-fake-key");
  await flush();
  assert.equal(page.element("apiKey").disabled, true);
  assert.equal(page.element("withdrawDataSharing").disabled, false);
  await page.element("withdrawDataSharing").dispatch("click");
  assert.equal(page.credentials.accepted, false);
  release();
  await save;
  await flush();
  assert.equal(page.element("apiKey").disabled, true);
  assert.equal(page.element("refreshModels").disabled, true);
  assert.equal(page.element("agreeDataSharing").hidden, false);
  assert.equal(page.credentials.apiKey, "saved-fake-key");
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
});

test("An older successful key-save reply cannot restore agreement after withdrawal", async () => {
  let release;
  const pendingReply = new Promise((resolve) => { release = resolve; });
  const page = setup({ apiKey: "saved-fake-key" });
  await page.ready;
  const send = page.context.chrome.runtime.sendMessage;
  page.context.chrome.runtime.sendMessage = async (message) => {
    const response = await send(message);
    if (message.action === "setApiKey") await pendingReply;
    return response;
  };
  const save = change(page, "apiKey", "replacement-fake-key");
  await flush();
  assert.equal(page.credentials.apiKey, "replacement-fake-key");
  await page.element("withdrawDataSharing").dispatch("click");
  release();
  await save;
  await flush();
  assert.equal(page.credentials.accepted, false);
  assert.equal(page.element("agreeDataSharing").hidden, false);
  assert.equal(page.element("apiKey").disabled, true);
  assert.equal(page.element("refreshModels").disabled, true);
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
});

test("An unchanged key does not autosave on blur or disable the next action", async () => {
  const page = setup({ apiKey: "saved-fake-key", sync: { targetLanguage: "de" } });
  await page.ready;
  change(page, "targetLanguage", "fr");
  const before = page.messages.length;
  for (const button of ["revealKey", "refreshModels", "saveButton"]) {
    await page.element("apiKey").dispatch("blur", { relatedTarget: page.element(button) });
    assert.equal(page.element(button).disabled, false);
  }
  await page.element("apiKey").dispatch("blur");
  assert.equal(page.messages.length, before);
  assert.deepEqual(page.writes, []);
});

test("A dirty key keeps Show usable and lets Finish setup handle its own save", async () => {
  const page = setup({ apiKey: "saved-fake-key", sync: { targetLanguage: "de" } });
  await page.ready;
  page.element("apiKey").value = "replacement-fake-key";
  page.element("apiKey").dispatch("input");
  const before = page.messages.length;
  await page.element("apiKey").dispatch("blur", { relatedTarget: page.element("revealKey") });
  assert.equal(page.element("revealKey").disabled, false);
  page.element("revealKey").dispatch("click");
  assert.equal(page.element("apiKey").type, "text");
  await page.element("apiKey").dispatch("blur", { relatedTarget: page.element("saveButton") });
  assert.equal(page.element("saveButton").disabled, false);
  assert.equal(page.messages.length, before);
  await submit(page);
  assert.equal(page.credentials.apiKey, "replacement-fake-key");
  assert.equal(page.messages.filter((message) => message.action === "setApiKey").length, 1);
});

test("A failed withdrawal keeps an explicit retry even when runtime state is already denied", async () => {
  const page = setup({ apiKey: "saved-fake-key", sync: { targetLanguage: "de" } });
  await page.ready;
  const send = page.context.chrome.runtime.sendMessage;
  let failWithdrawal = true;
  page.context.chrome.runtime.sendMessage = async (message) => {
    if (message.action === "setDataSharing" && !message.accepted && failWithdrawal) {
      page.credentials.accepted = false;
      return { ok: false, error: { code: "service_error", message: "Agreement removal failed." } };
    }
    return send(message);
  };
  await page.element("withdrawDataSharing").dispatch("click");
  assert.equal(page.credentials.accepted, false);
  assert.equal(page.element("withdrawDataSharing").hidden, false);
  assert.equal(page.element("withdrawDataSharing").disabled, false);
  assert.equal(page.element("withdrawDataSharing").textContent, "Retry withdrawal");
  assert.equal(page.element("agreeDataSharing").hidden, true);
  assert.match(page.element("agreementStatus").textContent, /not confirmed/);
  page.windowListeners.get("focus")();
  await flush();
  assert.equal(page.element("withdrawDataSharing").hidden, false);
  assert.match(page.element("agreementStatus").textContent, /not confirmed/);
  failWithdrawal = false;
  await page.element("withdrawDataSharing").dispatch("click");
  await flush();
  assert.equal(page.element("withdrawDataSharing").hidden, true);
  assert.equal(page.element("agreeDataSharing").hidden, false);
  assert.doesNotMatch(page.element("agreementStatus").textContent, /not confirmed/);
  assert.deepEqual(page.writes, [["agreement", { accepted: false }]]);
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 1);
});

test("Reloaded Settings retains withdrawal retry when the background reports unfinished persistence", async () => {
  const runtimeState = { dataSharingWithdrawalPending: true };
  const page = setup({ apiKey: "saved-fake-key", accepted: false, runtimeState });
  await page.ready;
  assert.equal(page.element("withdrawDataSharing").hidden, false);
  assert.equal(page.element("withdrawDataSharing").disabled, false);
  assert.equal(page.element("withdrawDataSharing").textContent, "Retry withdrawal");
  assert.equal(page.element("agreeDataSharing").hidden, true);
  assert.match(page.element("agreementStatus").textContent, /not confirmed/);
  assert.equal(page.messages.filter((message) => message.action === "listModels").length, 0);
  runtimeState.dataSharingWithdrawalPending = false;
  await page.element("withdrawDataSharing").dispatch("click");
  await flush();
  assert.equal(page.element("withdrawDataSharing").hidden, true);
  assert.equal(page.element("agreeDataSharing").hidden, false);
});
