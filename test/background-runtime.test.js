import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DEFAULTS, DATA_SHARING_VERSION, RECOMMENDED_MODEL, LIMITS, STORAGE_KEYS, normalizeApiKey, stableTextHash } from "../shared.js";
import { MAX_RESPONSE_BYTES } from "../request-policy.js";
import { loadBackground } from "./helpers/background-module.js";

const extensionId = "runtime-test-extension";
const apiKey = "test-api-key-value";
const contentSender = {
  id: extensionId,
  url: "https://example.com/page",
  tab: { id: 7 },
  frameId: 0,
  documentId: "document-one",
};
const uiSender = { id: extensionId, url: `chrome-extension://${extensionId}/settings.html` };
const models = [{ id: DEFAULTS.aiModel, displayName: "Test model", outputTokenLimit: 8192, thinking: false }];
const modelPayload = { models: models.map(({ id, ...model }) => ({ ...model, name: `models/${id}`, supportedGenerationMethods: ["generateContent"] })) };
const translationPayload = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Translation" }] } }] };
let requestId = 0;

function event() {
  const listeners = [];
  return {
    addListener: (listener) => listeners.push(listener),
    emit: (...args) => listeners.map((listener) => listener(...args)),
    clear: () => { listeners.length = 0; },
  };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function pendingFetch(init) {
  let resolve;
  const promise = new Promise((done, reject) => {
    resolve = done;
    if (init.signal.aborted) reject(new DOMException("Aborted", "AbortError"));
    else init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  return { promise, resolve };
}

async function until(predicate) {
  for (let turn = 0; turn < 200; turn += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Expected runtime state was not reached");
}

async function runtime(t, seed = {}) {
  const original = { chrome: globalThis.chrome, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout };
  const changed = event();
  const state = {
    local: {
      [STORAGE_KEYS.apiKey]: apiKey,
      [STORAGE_KEYS.modelCatalog]: { models, fetchedAt: Date.now(), apiKeyHash: stableTextHash(apiKey) },
      [STORAGE_KEYS.dataSharingAgreement]: { version: DATA_SHARING_VERSION, acceptedAt: Date.now() },
      ...seed.local,
    },
    sync: { ...(seed.fresh ? {} : { [STORAGE_KEYS.triggerKey]: "Off" }), ...seed.sync },
    session: { ...seed.session },
  };
  const env = {
    state, calls: [], writes: [], beforeGet: seed.beforeGet, beforeSet: seed.beforeSet,
    beforeRemove: seed.beforeRemove, beforeSetAccessLevel: seed.beforeSetAccessLevel,
    beforeVaultRead: seed.beforeVaultRead, beforeVaultWrite: seed.beforeVaultWrite,
    beforeVaultVerify: seed.beforeVaultVerify, openedSettings: 0, migrations: 0,
    tabMessages: [], tabQueries: [], tabs: seed.tabs ?? [{ id: 7 }, { id: 8 }],
    vault: { apiKey: null, revision: null, ...seed.vault }, corruptVault: seed.corruptVault === true,
  };
  const fakeStore = {
    async readState() {
      if (env.beforeVaultRead) await env.beforeVaultRead();
      if (env.corruptVault) throw new Error("Fake damaged vault");
      return { ...env.vault };
    },
    async write(value) {
      if (env.beforeVaultWrite) await env.beforeVaultWrite(value);
      env.vault = { apiKey: value, revision: randomUUID() };
      env.corruptVault = false;
      if (env.beforeVaultVerify) await env.beforeVaultVerify();
      return fakeStore.readState();
    },
    async remove() { return fakeStore.write(null); },
    async migrate({ localKey, syncKey }) {
      env.migrations += 1;
      const current = await fakeStore.readState();
      if (current.revision !== null) return current;
      const value = normalizeApiKey(localKey) || normalizeApiKey(syncKey);
      return value ? fakeStore.write(value) : current;
    },
  };
  const area = (name) => ({
    setAccessLevel: async (options) => {
      if (env.beforeSetAccessLevel) await env.beforeSetAccessLevel(name, options);
    },
    get: async (keys) => {
      if (env.beforeGet) await env.beforeGet(name, keys);
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter((key) => Object.hasOwn(state[name], key))
        .map((key) => [key, structuredClone(state[name][key])]));
    },
    set: async (values) => {
      if (env.beforeSet) await env.beforeSet(name, values);
      env.writes.push({ area: name, values: structuredClone(values) });
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        if (JSON.stringify(state[name][key]) !== JSON.stringify(value)) {
          changes[key] = { oldValue: state[name][key], newValue: value };
        }
        state[name][key] = structuredClone(value);
      }
      if (Object.keys(changes).length) changed.emit(changes, name);
    },
    remove: async (keys) => {
      if (env.beforeRemove) await env.beforeRemove(name, keys);
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(state[name], key)) changes[key] = { oldValue: state[name][key] };
        delete state[name][key];
      }
      if (Object.keys(changes).length) changed.emit(changes, name);
    },
  });
  globalThis.chrome = {
    storage: { local: area("local"), sync: area("sync"), session: area("session"), onChanged: changed },
    runtime: {
      id: extensionId,
      onMessage: event(),
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      openOptionsPage: async () => { env.openedSettings += 1; },
    },
    contextMenus: { onClicked: event() },
    tabs: {
      query: async (query) => {
        env.tabQueries.push(structuredClone(query));
        return env.tabs;
      },
      sendMessage: async (...args) => {
        env.tabMessages.push(structuredClone(args));
        return env.sendTabMessage ? env.sendTabMessage(...args) : undefined;
      },
    },
  };
  env.chrome = globalThis.chrome;
  env.provider = async (url) => json(url.includes(":generateContent") ? translationPayload : modelPayload);
  globalThis.fetch = async (url, init) => {
    env.calls.push({ url, init });
    return env.provider(url, init);
  };
  env.message = (message, sender = uiSender) => new Promise((resolve) => {
    const handled = env.chrome.runtime.onMessage.emit(message, sender, resolve);
    if (!handled.includes(true)) resolve(undefined);
  });
  env.status = () => env.message({ action: "getRuntimeState" });
  env.settings = () => env.message({ action: "getSettingsState" });
  env.setKey = (value, revision = env.vault.revision) => env.message({ action: "setApiKey", apiKey: value, expectedRevision: revision });
  env.contextClick = (overrides = {}, tab = { id: 7 }) => env.chrome.contextMenus.onClicked.emit({
    menuItemId: "translateText",
    selectionText: "Selected text",
    ...overrides,
  }, tab);
  env.translate = (overrides = {}, sender = contentSender) => {
    let complete;
    const port = {
      name: "translation",
      sender,
      onMessage: event(),
      onDisconnect: event(),
      posts: [],
      disconnected: false,
      done: new Promise((resolve) => { complete = resolve; }),
      postMessage: (message) => { port.posts.push(message); complete(message); },
      disconnect: () => { port.disconnected = true; port.onDisconnect.emit(); },
    };
    env.chrome.runtime.onConnect.emit(port);
    port.onMessage.emit({ action: "translate", requestId: `123e4567-e89b-42d3-a456-${String(++requestId).padStart(12, "0")}`, text: "Hello", ...overrides });
    return port;
  };
  env.reload = async (waitForReady = true) => {
    changed.clear();
    env.chrome.runtime.onMessage = event();
    env.chrome.runtime.onConnect = event();
    await loadBackground(() => fakeStore);
    return waitForReady ? env.status() : null;
  };
  t.after(() => {
    globalThis.chrome = original.chrome;
    globalThis.fetch = original.fetch;
    globalThis.setTimeout = original.setTimeout;
  });
  env.ready = await env.reload(seed.waitForReady !== false);
  return env;
}

test("runtime readiness waits for migration, keeps Off, and limits Settings access", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.apiKey]: null }, sync: { [STORAGE_KEYS.apiKey]: apiKey } });
  assert.equal(env.ready.ok, true);
  assert.equal(env.ready.hasApiKey, true);
  assert.equal(env.ready.triggerKey, null);
  assert.equal(env.vault.apiKey, apiKey);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal(await env.message({ action: "getRuntimeState" }, contentSender), undefined);
  assert.deepEqual(await env.message({ action: "openSettings" }, contentSender), { ok: true });
  assert.equal(await env.message({ action: "openSettings" }, { ...contentSender, id: "other" }), undefined);
  assert.equal(await env.message({ action: "openSettings" }, { ...contentSender, url: "chrome://settings" }), undefined);
  assert.equal(env.openedSettings, 1);
});

test("content preferences stay narrow and available when credential migration fails", async (t) => {
  const env = await runtime(t, {
    local: { [STORAGE_KEYS.apiKey]: null },
    sync: {
      [STORAGE_KEYS.apiKey]: apiKey,
      [STORAGE_KEYS.targetLanguage]: "fr",
      [STORAGE_KEYS.triggerKey]: "Alt",
      [STORAGE_KEYS.aiModel]: "private-model-value",
    },
    beforeVaultWrite: async () => { throw new Error("Cannot save key"); },
  });
  assert.equal(env.ready.error.code, "credential_storage_error");
  const preferences = await env.message({
    action: "getContentPreferences",
    keys: [STORAGE_KEYS.apiKey, STORAGE_KEYS.aiModel, STORAGE_KEYS.dataSharingAgreement],
  }, contentSender);
  assert.deepEqual(preferences, { ok: true, targetLanguage: "fr", triggerKey: "Alt" });
  assert.deepEqual(Object.keys(preferences), ["ok", "targetLanguage", "triggerKey"]);
  assert.equal(await env.message({ action: "getContentPreferences" }, uiSender), undefined);
  assert.equal(env.calls.length, 0);
});

test("sync preference changes broadcast one narrow refresh message to every tab", async (t) => {
  const env = await runtime(t, { tabs: [{ id: 7 }, { id: 8 }, {}, { id: -1 }] });
  env.tabMessages.length = 0;
  env.tabQueries.length = 0;
  env.sendTabMessage = async (tabId) => {
    if (tabId === 8) throw new Error("No content script");
  };
  await env.chrome.storage.sync.set({
    [STORAGE_KEYS.targetLanguage]: "fr",
    [STORAGE_KEYS.triggerKey]: "Control",
  });
  await until(() => env.tabMessages.length === 2);
  assert.deepEqual(env.tabQueries, [{}]);
  assert.deepEqual(env.tabMessages, [
    [7, { action: "contentPreferencesChanged" }],
    [8, { action: "contentPreferencesChanged" }],
  ]);
  await env.chrome.storage.sync.set({ [STORAGE_KEYS.aiModel]: "another-model" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.tabQueries.length, 1);
  assert.equal(env.tabMessages.length, 2);
});

test("migration storage failure reports startup failure and preserves the old key", async (t) => {
  const env = await runtime(t, {
    local: { [STORAGE_KEYS.apiKey]: null },
    sync: { [STORAGE_KEYS.apiKey]: apiKey },
    beforeVaultWrite: async () => { throw new Error("Cannot save key"); },
  });
  assert.equal(env.ready.ok, false);
  assert.equal(env.ready.error.code, "credential_storage_error");
  assert.equal(env.state.sync[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], null);
  assert.equal((await env.translate().done).error.code, "credential_storage_error");
  assert.equal(env.calls.length, 0);
});

test("invalid persisted model blocks configuration and translation before catalog access", async (t) => {
  const env = await runtime(t, {
    local: { [STORAGE_KEYS.modelCatalog]: undefined },
    sync: {
      [STORAGE_KEYS.targetLanguage]: "fr",
      [STORAGE_KEYS.aiModel]: "models/not-allowed",
    },
  });
  assert.equal(env.ready.aiModel, null);
  assert.equal(env.ready.configured, false);
  assert.equal(env.ready.configurationError.code, "invalid_model");
  assert.equal((await env.translate().done).error.code, "invalid_model");
  assert.equal(env.calls.length, 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts], undefined);
});

test("rejected model refresh stays rejected across cache reads and worker restart until live recovery", async (t) => {
  const env = await runtime(t);
  env.provider = async () => json({ error: { details: [{ reason: "API_KEY_INVALID" }] } }, 400);
  const rejected = await env.message({ action: "listModels", forceRefresh: true });
  assert.equal(rejected.error.code, "invalid_api_key");
  assert.equal((await env.message({ action: "listModels" })).error.code, "invalid_api_key");
  assert.equal(env.calls.length, 1);
  assert.equal((await env.status()).apiKeyStatus, "rejected");
  const restarted = await env.reload();
  assert.equal(restarted.configured, false);
  assert.equal(restarted.configurationError.code, "invalid_api_key");
  env.provider = async () => json({}, 503);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).error.code, "invalid_api_key");
  env.provider = async () => json(modelPayload);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).source, "live");
  assert.equal((await env.status()).configured, true);
  assert.equal((await env.status()).apiKeyStatus, "checked");
  assert.equal((await env.status()).configurationError, null);
});

test("translation authentication failures disable readiness and cached paid retries", async (t) => {
  const env = await runtime(t);
  env.provider = async () => json({ error: { status: "UNAUTHENTICATED" } }, 401);
  assert.equal((await env.translate().done).error.code, "invalid_api_key");
  assert.equal((await env.translate({ text: "Next" }).done).error.code, "invalid_api_key");
  assert.equal(env.calls.length, 1);
  assert.equal((await env.status()).configured, false);
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts].length, 1);
});

test("a rejected translation model stays unavailable across cache reads and restart", async (t) => {
  const env = await runtime(t);
  env.provider = async () => json({}, 404);
  assert.equal((await env.translate().done).error.code, "invalid_model");
  assert.equal((await env.status()).configured, false);
  assert.equal((await env.status()).configurationError.code, "invalid_model");
  assert.equal((await env.message({ action: "listModels" })).error.code, "invalid_model");
  assert.equal((await env.translate({ text: "Next" }).done).error.code, "invalid_model");
  assert.equal(env.calls.length, 1);
  assert.equal((await env.reload()).configurationError.code, "invalid_model");
  env.provider = async () => json(modelPayload);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  assert.equal((await env.status()).configured, true);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog].unavailableModels, undefined);
});

test("a failed model refresh cannot restore a model rejected while refresh was pending", async (t) => {
  const env = await runtime(t);
  let translation;
  let refresh;
  env.provider = async (url, init) => {
    const request = pendingFetch(init);
    if (url.includes(":generateContent")) translation = request;
    else refresh = request;
    return request.promise;
  };
  const pendingTranslation = env.translate();
  await until(() => translation);
  const pendingRefresh = env.message({ action: "listModels", forceRefresh: true });
  await until(() => refresh);
  translation.resolve(json({}, 404));
  assert.equal((await pendingTranslation.done).error.code, "invalid_model");
  refresh.resolve(json({}, 503));
  assert.equal((await pendingRefresh).error.code, "invalid_model");
  assert.equal((await env.status()).configured, false);
  assert.equal((await env.status()).configurationError.code, "invalid_model");
  assert.equal(env.calls.length, 2);
});

test("a model rejection keeps other models available and cannot undo a newer catalog check", async (t) => {
  const otherModel = { ...models[0], id: "gemini-2.5-flash" };
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: {
    models: [...models, otherModel], fetchedAt: Date.now(), apiKeyHash: stableTextHash(apiKey),
  } } });
  env.provider = async () => json({}, 404);
  await env.translate().done;
  assert.deepEqual((await env.message({ action: "listModels" })).models.map((model) => model.id), [otherModel.id]);
  await env.chrome.storage.sync.set({ [STORAGE_KEYS.aiModel]: otherModel.id });
  assert.equal((await env.status()).configured, true);
  let oldRequest;
  env.provider = async (url, init) => {
    if (!url.includes(":generateContent")) return json({ models: [...modelPayload.models, {
      name: `models/${otherModel.id}`, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"],
    }] });
    oldRequest = pendingFetch(init);
    return oldRequest.promise;
  };
  const old = env.translate();
  await until(() => oldRequest);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  oldRequest.resolve(json({}, 404));
  assert.equal((await old.done).error.code, "invalid_model");
  assert.equal((await env.status()).configured, true);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog].unavailableModels, undefined);
});

test("a newer successful translation recovers a model rejected by an older in-flight request", async (t) => {
  const env = await runtime(t);
  const requests = [];
  env.provider = async (_url, init) => {
    const request = pendingFetch(init);
    requests.push(request);
    return request.promise;
  };
  const old = env.translate({ text: "old" });
  const newer = env.translate({ text: "newer" });
  await until(() => requests.length === 2);
  requests[0].resolve(json({}, 404));
  await old.done;
  assert.equal((await env.status()).configured, false);
  requests[1].resolve(json(translationPayload));
  assert.equal((await newer.done).ok, true);
  assert.equal((await env.status()).configured, true);
});

test("an old key failure cannot invalidate a replacement key or its catalog", async (t) => {
  const env = await runtime(t);
  let oldRequest;
  env.provider = async (url, init) => {
    if (!url.includes(":generateContent")) return json(modelPayload);
    oldRequest = pendingFetch(init);
    return oldRequest.promise;
  };
  const old = env.translate();
  await until(() => oldRequest);
  const replacement = "replacement-api-key";
  assert.equal((await env.setKey(replacement)).ok, true);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  oldRequest.resolve(json({}, 401));
  assert.equal((await old.done).error.code, "cancelled");
  assert.equal((await env.status()).configured, true);
  assert.equal((await env.status()).configurationError, null);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog].apiKeyHash, stableTextHash(replacement));
  assert.equal(env.state.local[STORAGE_KEYS.apiKeyStatus].status, "checked");
});

test("a late old authentication result cannot replace a newer successful key check", async (t) => {
  const env = await runtime(t);
  let oldRequest;
  env.provider = async (url, init) => {
    if (!url.includes(":generateContent")) return json(modelPayload);
    oldRequest = pendingFetch(init);
    return oldRequest.promise;
  };
  const old = env.translate();
  await until(() => oldRequest);
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  oldRequest.resolve(json({}, 401));
  await old.done;
  assert.equal((await env.status()).configured, true);
});

test("delayed old rejection persistence is cleared before replacement-key validation", async (t) => {
  const env = await runtime(t);
  let releaseWrite;
  let waiting = false;
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.apiKeyStatus]?.status === "rejected") {
      waiting = true;
      await new Promise((resolve) => { releaseWrite = resolve; });
    }
  };
  env.provider = async (url) => json(url.includes(":generateContent") ? {} : modelPayload,
    url.includes(":generateContent") ? 401 : 200);
  const old = env.translate();
  await until(() => waiting);
  const replacement = "replacement-api-key";
  const replacementWrite = env.setKey(replacement);
  releaseWrite();
  assert.equal((await replacementWrite).ok, true);
  assert.equal((await old.done).error.code, "cancelled");
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  assert.equal((await env.status()).configured, true);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog].apiKeyHash, stableTextHash(replacement));
});

test("failed rejection persistence still disables cache readiness in the current worker", async (t) => {
  const env = await runtime(t);
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.apiKeyStatus]?.status === "rejected") {
      throw new Error("Temporary storage failure");
    }
  };
  env.provider = async () => json({}, 401);
  assert.equal((await env.translate().done).error.code, "invalid_api_key");
  assert.equal((await env.status()).apiKeyStatus, "rejected");
  assert.equal((await env.message({ action: "listModels" })).error.code, "invalid_api_key");
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog], undefined);
  assert.equal(env.calls.length, 1);
});

test("an authentication response keeps its error when the key-state read temporarily fails", async (t) => {
  const env = await runtime(t);
  env.provider = async () => {
    let failed = false;
    env.beforeVaultRead = async () => {
      if (!failed) {
        failed = true;
        throw new Error("Temporary read failure");
      }
    };
    return json({}, 401);
  };
  assert.equal((await env.translate().done).error.code, "invalid_api_key");
  assert.equal((await env.status()).configured, false);
  assert.equal((await env.status()).apiKeyStatus, "rejected");
});

test("temporary catalog failures retain valid cache and provider delays remain safe", async (t) => {
  const env = await runtime(t);
  env.provider = async () => json({ error: { message: "private provider text" } }, 503);
  const fallback = await env.message({ action: "listModels", forceRefresh: true });
  assert.equal(fallback.source, "cache");
  assert.equal(fallback.stale, true);
  assert.equal((await env.status()).configured, true);
  env.provider = async () => json({ error: { message: "private provider text" } }, 429, { "Retry-After": "2" });
  const result = await env.translate().done;
  assert.equal(result.error.code, "quota_exceeded");
  assert.equal(result.error.retryAfterMs, 2000);
  assert.equal(JSON.stringify(result).includes("private provider text"), false);
  assert.equal(env.calls.length, 2);
});

for (const [status, code] of [[200, "invalid_response"], [401, "invalid_api_key"],
  [403, "service_error"], [429, "quota_exceeded"]]) {
  test(`oversized provider body keeps safe HTTP ${status} handling`, async (t) => {
    const env = await runtime(t);
    env.provider = async () => new Response("untrusted body", {
      status, headers: { "Content-Length": String(MAX_RESPONSE_BYTES + 1), "Retry-After": "2" },
    });
    const result = await env.translate().done;
    assert.equal(result.error.code, code);
    if (status === 403) assert.equal(result.error.retryable, false);
    if (status === 429) assert.equal(result.error.retryAfterMs, 2000);
    assert.equal(JSON.stringify(result).includes("untrusted body"), false);
    assert.equal(env.calls.length, 1);
  });
}

for (const action of ["translate", "listModels", "withdraw"]) {
  test(`a stalled provider body has correct ${action} cancellation`, { timeout: 2_000 }, async (t) => {
    const env = await runtime(t, { local: action === "listModels" ? { [STORAGE_KEYS.modelCatalog]: undefined } : {} });
    let reading = false, cancelled = false;
    env.provider = async () => new Response(new ReadableStream({
      pull() { reading = true; return new Promise(() => {}); },
      cancel() { cancelled = true; return new Promise(() => {}); },
    }));
    const nativeTimeout = globalThis.setTimeout;
    if (action !== "withdraw") globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
      callback, delay === LIMITS.requestTimeoutMs ? 20 : delay, ...args,
    );
    const port = action === "listModels" ? null : env.translate();
    const pending = port?.done || env.message({ action: "listModels", forceRefresh: true });
    await until(() => reading);
    if (action === "withdraw") assert.equal((await env.message({ action: "setDataSharing", accepted: false })).ok, true);
    const result = await pending;
    assert.equal(result.error.code, action === "withdraw" ? "cancelled" : "timeout");
    await until(() => cancelled);
    if (port) assert.equal(port.posts.length, 1);
    assert.equal(env.calls.length, 1);
    assert.notEqual(env.state.session[STORAGE_KEYS.latestResult]?.status, "success");
  });
}

test("model pages retain only bounded normalized fields with the last duplicate winning", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: undefined } });
  env.provider = async (url) => {
    const second = new URL(url).searchParams.get("pageToken") === "next";
    const raw = { ...modelPayload.models[0], displayName: (second ? "b" : "a").repeat(300),
      description: "d".repeat(2000), unusedProviderField: "private unused metadata" };
    return json({ models: second ? [raw, { ...raw, name: "models/gemini-2.5-flash" }] : [raw],
      ...(second ? {} : { nextPageToken: "next" }) });
  };
  const result = await env.message({ action: "listModels", forceRefresh: true });
  assert.equal(result.ok, true);
  assert.equal(result.models.length, 2);
  assert.equal(env.calls.length, 2);
  for (const model of result.models) {
    assert.equal(model.displayName, "b".repeat(200));
    assert.equal(model.description.length, 1000);
    assert.equal(Object.hasOwn(model, "unusedProviderField"), false);
    assert.equal(Object.hasOwn(model, "supportedGenerationMethods"), false);
  }
  assert.equal(JSON.stringify(env.state.local[STORAGE_KEYS.modelCatalog]).includes("private unused metadata"), false);
});

test("model pagination counts rejected entries toward its total limit", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: undefined } });
  let page = 0;
  env.provider = async () => json({
    models: [modelPayload.models[0], ...Array.from({ length: 1000 }, () => ({ name: "unsupported" }))],
    nextPageToken: String(++page),
  });
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).error.code, "invalid_response");
  assert.equal(env.calls.length, 5);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog], undefined);
});

test("translation validates its envelope and captures its ID before stalled startup", async (t) => {
  let releaseStartup;
  let startupBlocked = false;
  const env = await runtime(t, {
    waitForReady: false,
    beforeVaultRead: async () => {
      if (startupBlocked) return;
      startupBlocked = true;
      await new Promise((resolve) => { releaseStartup = resolve; });
    },
  });
  await until(() => startupBlocked);
  const nativeTimeout = globalThis.setTimeout;
  const invalid = env.translate({ requestId: "bad-id" });
  const invalidResult = await Promise.race([
    invalid.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args,
  );
  const validId = "123e4567-e89b-42d3-a456-426614174999";
  const valid = env.translate({ requestId: validId });
  const timeout = await Promise.race([
    valid.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  env.beforeVaultRead = null;
  releaseStartup();
  assert.equal(invalidResult?.error.code, "service_error");
  assert.equal(timeout.requestId, validId);
  assert.equal(timeout.error.code, "timeout");
  assert.equal(valid.posts.length, 1);
  assert.equal(env.calls.length, 0);
  await until(async () => (await env.status()).ok === true);
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.error?.code === "timeout");
  assert.equal(valid.posts.length, 1);
  assert.equal(env.calls.length, 0);
});

test("invalid sender, ID and selection fail before provider access or rate writes", async (t) => {
  const env = await runtime(t);
  assert.equal((await env.translate({}, { ...contentSender, id: "foreign" }).done).error.code, "unsupported_page");
  assert.equal((await env.translate({ requestId: "bad-id" }).done).error.code, "service_error");
  assert.equal((await env.translate({ text: "x".repeat(LIMITS.maxInputCodePoints + 1) }).done).error.code, "selection_too_large");
  assert.equal((await env.translate({ targetLanguage: "unknown" }).done).error.code, "service_error");
  assert.equal(env.calls.length, 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts], undefined);
});

test("context menu handles an exact negative reply and rejected delivery", async (t) => {
  const env = await runtime(t);
  env.sendTabMessage = async (_tabId, message) => {
    if (message.action === "contextMenuTranslate") return { accepted: false };
    return undefined;
  };
  env.contextClick();
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.error?.code === "no_selection");
  assert.equal(env.tabMessages.find((args) => args[1].action === "contextMenuTranslate").length, 3);

  env.sendTabMessage = async () => ({ accepted: true });
  const previous = structuredClone(env.state.session[STORAGE_KEYS.latestResult]);
  env.contextClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(env.state.session[STORAGE_KEYS.latestResult], previous);

  env.sendTabMessage = async () => { throw new Error("Frame closed"); };
  env.contextClick();
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.error?.code === "frame_unavailable");
});

test("Ports enforce duplicate, per-tab and global limits and release cancellation slots", async (t) => {
  const env = await runtime(t);
  env.provider = async (_url, init) => pendingFetch(init).promise;
  const ports = [env.translate({ text: "one" }), env.translate({ text: "two" }), env.translate({ text: "three" })];
  await until(() => env.calls.length === 3);
  assert.equal((await env.translate({ text: "one" }).done).error.code, "duplicate_request");
  assert.equal((await env.translate({ text: "four" }).done).error.code, "busy");
  for (let index = 0; index < 3; index += 1) {
    ports.push(env.translate({ text: `other ${index}` }, { ...contentSender, tab: { id: 8 }, documentId: "other-document" }));
  }
  await until(() => env.calls.length === 6);
  assert.equal((await env.translate({}, { ...contentSender, tab: { id: 9 }, documentId: "third-document" }).done).error.code, "busy");
  ports.forEach((port) => port.disconnect());
  await until(async () => (await env.status()).activeRequestCount === 0);
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts].length, 6);
  assert.equal(env.state.session[STORAGE_KEYS.latestResult].error.code, "cancelled");
  assert.equal(ports.every((port) => port.posts.length === 0), true);
  env.provider = async () => json(translationPayload);
  assert.equal((await env.translate({ text: "one" }).done).ok, true);
});

test("rate limits survive a service worker restart while active counts reset", async (t) => {
  const env = await runtime(t, { session: {
    [STORAGE_KEYS.activeRequestCount]: 6,
    [STORAGE_KEYS.rateStarts]: Array.from({ length: LIMITS.maxStartsPerWindow }, () => Date.now()),
  } });
  assert.equal(env.ready.activeRequestCount, 0);
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
  assert.equal((await env.translate().done).error.code, "rate_limited");
  await env.reload();
  assert.equal((await env.translate().done).error.code, "rate_limited");
  assert.equal(env.calls.length, 0);
});

test("storage reservation failure stops payment and timeout releases the slot", async (t) => {
  const env = await runtime(t);
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.rateStarts]) throw new Error("storage unavailable");
  };
  assert.equal((await env.translate().done).error.code, "service_error");
  assert.equal(env.calls.length, 0);
  assert.equal((await env.status()).activeRequestCount, 0);
  env.beforeSet = null;
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args);
  env.provider = async (_url, init) => pendingFetch(init).promise;
  const result = await env.translate().done;
  assert.equal(result.error.code, "timeout");
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 0);
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.error?.code === "timeout");
  assert.equal(env.state.session[STORAGE_KEYS.latestResult].error.code, "timeout");
});

test("deadline posts once while a credential read is stalled and prevents provider access", async (t) => {
  const env = await runtime(t);
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args,
  );
  let releaseRead;
  let readStarted = false;
  env.beforeVaultRead = async () => {
    env.beforeVaultRead = null;
    readStarted = true;
    await new Promise((resolve) => { releaseRead = resolve; });
  };
  const port = env.translate();
  await until(() => readStarted);
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  releaseRead();
  assert.equal(result?.error.code, "timeout");
  assert.equal(port.posts.length, 1);
  assert.equal(env.calls.length, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.calls.length, 0);
});

test("a late reservation read keeps the rate budget and releases its slot once", async (t) => {
  const env = await runtime(t);
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args,
  );
  let releaseRead;
  let readStarted = false;
  env.beforeGet = async (area, keys) => {
    if (area === "session" && keys === STORAGE_KEYS.rateStarts) {
      env.beforeGet = null;
      readStarted = true;
      await new Promise((resolve) => { releaseRead = resolve; });
    }
  };
  const writeStart = env.writes.length;
  const port = env.translate();
  await until(() => readStarted);
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  releaseRead();
  assert.equal(result?.error.code, "timeout");
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 0
    && env.state.session[STORAGE_KEYS.rateStarts]?.length === 1);
  const releaseWrites = env.writes.slice(writeStart).filter(({ area, values }) => area === "session"
    && values[STORAGE_KEYS.activeRequestCount] === 0);
  assert.equal(releaseWrites.length, 1);
  assert.equal(port.posts.length, 1);
  assert.equal(env.calls.length, 0);
});

test("a late reservation write keeps the rate budget and releases its slot once", async (t) => {
  const env = await runtime(t);
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args,
  );
  let releaseWrite;
  let writeStarted = false;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.rateStarts]) {
      env.beforeSet = null;
      writeStarted = true;
      await new Promise((resolve) => { releaseWrite = resolve; });
    }
  };
  const writeStart = env.writes.length;
  const port = env.translate();
  await until(() => writeStarted);
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  releaseWrite();
  assert.equal(result?.error.code, "timeout");
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 0
    && env.state.session[STORAGE_KEYS.rateStarts]?.length === 1);
  const releaseWrites = env.writes.slice(writeStart).filter(({ area, values }) => area === "session"
    && values[STORAGE_KEYS.activeRequestCount] === 0);
  assert.equal(releaseWrites.length, 1);
  assert.equal(port.posts.length, 1);
  assert.equal(env.calls.length, 0);
});

test("valid success is delivered before provider status bookkeeping can stall", async (t) => {
  const env = await runtime(t);
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 20 : delay, ...args,
  );
  let releaseStatus;
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.apiKeyStatus]?.status === "checked") {
      env.beforeSet = null;
      await new Promise((resolve) => { releaseStatus = resolve; });
    }
  };
  const port = env.translate();
  await until(() => releaseStatus);
  const result = await port.done;
  await new Promise((resolve) => nativeTimeout(resolve, 30));
  releaseStatus();
  assert.equal(result.ok, true);
  assert.equal(port.posts.length, 1);
  await env.status();
  assert.equal(env.state.session[STORAGE_KEYS.latestResult].status, "success");
});

test("success posts before latest-result storage finishes", async (t) => {
  const env = await runtime(t);
  let releaseWrite;
  let writeStarted = false;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.latestResult]?.status === "success") {
      env.beforeSet = null;
      writeStarted = true;
      await new Promise((resolve) => { releaseWrite = resolve; });
    }
  };
  const port = env.translate();
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  await until(() => writeStarted);
  releaseWrite();
  assert.equal(result?.ok, true);
  assert.equal(port.posts.length, 1);
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.status === "success");
  await until(async () => (await env.status()).activeRequestCount === 0);
});

test("success posts before the final active-count write finishes", async (t) => {
  const env = await runtime(t);
  let releaseWrite;
  let writeStarted = false;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.activeRequestCount] === 0) {
      env.beforeSet = null;
      writeStarted = true;
      await new Promise((resolve) => { releaseWrite = resolve; });
    }
  };
  const port = env.translate();
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  await until(() => writeStarted);
  const activeRequestCount = (await env.status()).activeRequestCount;
  const storedActiveRequestCount = env.state.session[STORAGE_KEYS.activeRequestCount];
  releaseWrite();
  assert.equal(result?.ok, true);
  assert.equal(activeRequestCount, 0);
  assert.equal(storedActiveRequestCount, 1);
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 0);
  assert.equal(port.posts.length, 1);
});

test("a stalled active-count write cannot block another paid request or restore an old count", async (t) => {
  const env = await runtime(t);
  let releaseCount;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.activeRequestCount] === 0) {
      env.beforeSet = null;
      await new Promise((resolve) => { releaseCount = resolve; });
    }
  };
  assert.equal((await env.translate().done).ok, true);
  await until(() => releaseCount);
  let provider;
  env.provider = (_url, init) => {
    provider = pendingFetch(init);
    return provider.promise;
  };
  const next = env.translate({ text: "A different selection" });
  await until(() => provider);
  assert.equal((await env.status()).activeRequestCount, 1);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts].length, 2);
  releaseCount();
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 1);
  provider.resolve(json(translationPayload));
  assert.equal((await next.done).ok, true);
  await until(() => env.state.session[STORAGE_KEYS.activeRequestCount] === 0);
  assert.equal(next.posts.length, 1);
});

test("catalog persistence cannot start after its last waiter times out", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: undefined } });
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 20 : delay, ...args,
  );
  let releaseRead;
  env.beforeGet = async (area, keys) => {
    if (area === "local" && keys === STORAGE_KEYS.apiKeyStatus) {
      env.beforeGet = null;
      await new Promise((resolve) => { releaseRead = resolve; });
    }
  };
  const request = env.translate();
  await until(() => releaseRead);
  assert.equal((await request.done).error.code, "timeout");
  const writeCount = env.writes.length;
  releaseRead();
  await env.status();
  assert.equal(env.writes.slice(writeCount).some(({ values }) => Object.hasOwn(values, STORAGE_KEYS.modelCatalog)), false);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog], undefined);
  assert.equal(env.calls.length, 1);
  assert.equal(request.posts.length, 1);
});

test("late provider completion cannot replace timeout or hold a reservation", async (t) => {
  const env = await runtime(t);
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(
    callback, delay === LIMITS.requestTimeoutMs ? 10 : delay, ...args,
  );
  let resolveProvider;
  env.provider = async () => new Promise((resolve) => { resolveProvider = resolve; });
  const port = env.translate();
  await until(() => resolveProvider);
  const result = await Promise.race([
    port.done,
    new Promise((resolve) => nativeTimeout(() => resolve(null), 100)),
  ]);
  resolveProvider(json(translationPayload));
  assert.equal(result.error.code, "timeout");
  await until(async () => (await env.status()).activeRequestCount === 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts].length, 1);
  await until(() => env.state.session[STORAGE_KEYS.latestResult]?.error?.code === "timeout");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(port.posts.length, 1);
  assert.equal(env.state.session[STORAGE_KEYS.latestResult].status, "error");
});

test("failed active-count persistence is repaired after request completion", async (t) => {
  const env = await runtime(t);
  let failures = 0;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.activeRequestCount] === 0 && failures++ === 0) {
      throw new Error("Temporary storage failure");
    }
  };
  assert.equal((await env.translate().done).ok, true);
  assert.equal((await env.status()).activeRequestCount, 0);
  await new Promise((resolve) => setTimeout(resolve, 275));
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
});

test("one cancelled catalog waiter does not cancel another active translation", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: null } });
  let catalog;
  env.provider = async (url, init) => {
    if (url.includes(":generateContent")) return json(translationPayload);
    catalog = pendingFetch(init);
    return catalog.promise;
  };
  const first = env.translate({ text: "first" });
  const second = env.translate({ text: "second" });
  await until(() => env.calls.length === 1);
  first.disconnect();
  catalog.resolve(json(modelPayload));
  assert.equal((await second.done).ok, true);
  assert.equal(env.calls.length, 2);
  assert.equal(first.posts.length, 0);
  assert.equal((await env.status()).activeRequestCount, 0);
});

test("new setup requires a saved language even after key save and worker restart", async (t) => {
  const env = await runtime(t, { fresh: true, local: { geminiApiKey: null, modelCatalog: null } });
  assert.equal(env.ready.hasApiKey, false);
  assert.equal(env.state.sync.targetLanguage, null);
  assert.equal(env.state.sync.aiModel, RECOMMENDED_MODEL);
  assert.equal((await env.setKey(apiKey)).ok, true);
  const reopened = await env.reload();
  assert.equal(reopened.hasApiKey, true);
  assert.equal(reopened.configured, false);
  assert.equal(reopened.configurationError.code, "missing_target_language");
  assert.equal((await env.translate({ targetLanguage: "fr" }).done).error.code, "missing_target_language");
  assert.equal(env.calls.length, 0);
  await env.chrome.storage.sync.set({ targetLanguage: "he", aiModel: DEFAULTS.aiModel });
  assert.equal((await env.translate().done).ok, true);
  assert.equal(env.state.sync.targetLanguage, "he");
});

test("existing profiles keep legacy defaults and incoming synced preferences", async (t) => {
  const env = await runtime(t, { local: { geminiApiKey: null }, sync: { targetLanguage: "fr" } });
  assert.equal(env.state.sync.targetLanguage, "fr");
  assert.equal(env.state.sync.aiModel, DEFAULTS.aiModel);
  assert.equal(env.state.sync.triggerKey, "Off");
  await env.chrome.storage.sync.remove(["aiModel", "targetLanguage"]);
  let preferenceReads = 0;
  env.beforeGet = async (area, keys) => {
    if (area === "sync" && Array.isArray(keys) && keys.includes("targetLanguage") && ++preferenceReads === 2) {
      env.state.sync.targetLanguage = "es";
      env.state.sync.aiModel = "gemini-chosen-model";
    }
  };
  await env.reload();
  assert.equal(env.state.sync.targetLanguage, "es");
  assert.equal(env.state.sync.aiModel, "gemini-chosen-model");
});

for (const [label, agreement] of [
  ["missing", undefined],
  ["outdated", { version: DATA_SHARING_VERSION - 1, acceptedAt: Date.now() }],
  ["invalid", { version: DATA_SHARING_VERSION, acceptedAt: "not-a-date" }],
]) {
  test(`${label} agreement blocks saved keys and cached models without provider calls`, async (t) => {
    const env = await runtime(t, { local: { [STORAGE_KEYS.dataSharingAgreement]: agreement } });
    assert.equal(env.ready.ok, true);
    assert.equal(env.ready.hasApiKey, true);
    assert.equal(env.ready.configured, false);
    assert.equal(env.ready.configurationError.code, "agreement_required");
    assert.equal((await env.message({ action: "listModels" })).error.code, "agreement_required");
    assert.equal((await env.message({ action: "listModels", forceRefresh: true })).error.code, "agreement_required");
    assert.equal((await env.translate().done).error.code, "agreement_required");
    assert.equal((await env.setKey("replacement-test-key")).error.code, "agreement_required");
    assert.equal(env.calls.length, 0);
    assert.equal(env.vault.apiKey, apiKey);
    assert.equal(env.state.session[STORAGE_KEYS.rateStarts], undefined);
    if (label === "outdated") {
      const credential = { ...env.vault };
      const preferences = { ...env.state.sync };
      assert.equal((await env.reload()).configurationError.code, "agreement_required");
      assert.equal(env.calls.length, 0);
      const before = Date.now();
      assert.equal((await env.message({ action: "setDataSharing", accepted: true })).configured, true);
      const accepted = { ...env.state.local[STORAGE_KEYS.dataSharingAgreement] };
      assert.equal(accepted.version, DATA_SHARING_VERSION);
      assert.ok(accepted.acceptedAt >= before && accepted.acceptedAt <= Date.now());
      assert.deepEqual(env.vault, credential);
      assert.deepEqual(env.state.sync, preferences);
      assert.equal((await env.reload()).configured, true);
      assert.deepEqual(env.state.local[STORAGE_KEYS.dataSharingAgreement], accepted);
      assert.equal((await env.message({ action: "listModels" })).ok, true);
      assert.equal((await env.translate().done).ok, true);
    }
  });
}

test("only Settings can read or change the credential and agreement; acceptance persists locally", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.dataSharingAgreement]: undefined } });
  const deniedSenders = [
    contentSender,
    { id: extensionId, url: `chrome-extension://${extensionId}/popup.html` },
    { id: extensionId, url: `chrome-extension://${extensionId}/help.html` },
    { ...uiSender, id: "foreign" },
    { ...uiSender, url: `${uiSender.url}?pretend=settings` },
    { ...uiSender, url: `${uiSender.url}#pretend` },
    { ...uiSender, url: `${uiSender.url}/extra` },
  ];
  for (const sender of deniedSenders) {
    for (const message of [
      { action: "getSettingsState" },
      { action: "setApiKey", apiKey: null, expectedRevision: env.vault.revision },
      { action: "setDataSharing", accepted: true },
      { action: "setDataSharing", accepted: false },
      { action: "resetDamagedKey" },
    ]) assert.equal(await env.message(message, sender), undefined);
  }
  const publicState = await env.status();
  assert.equal(Object.hasOwn(publicState, "apiKey"), false);
  assert.equal(Object.hasOwn(publicState, "credentialRevision"), false);
  assert.equal((await env.settings()).apiKey, apiKey);
  assert.equal(env.vault.apiKey, apiKey);
  assert.equal(env.calls.length, 0);
  const before = Date.now();
  const accepted = await env.message({ action: "setDataSharing", accepted: true, version: 999, acceptedAt: 1 });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.configured, true);
  const record = { ...env.state.local[STORAGE_KEYS.dataSharingAgreement] };
  assert.equal(record.version, DATA_SHARING_VERSION);
  assert.ok(record.acceptedAt >= before && record.acceptedAt <= Date.now());
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.dataSharingAgreement), false);
  assert.equal((await env.reload()).dataSharingAccepted, true);
  assert.equal((await env.setKey("replacement-test-key")).ok, true);
  assert.deepEqual(env.state.local[STORAGE_KEYS.dataSharingAgreement], record);
  assert.equal((await env.reload()).dataSharingAccepted, true);
  assert.equal(env.calls.length, 0);
});

test("a failed agreement save leaves Google access blocked", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.dataSharingAgreement]: undefined } });
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.dataSharingAgreement]) throw new Error("Cannot save agreement");
  };
  assert.equal((await env.message({ action: "setDataSharing", accepted: true })).ok, false);
  assert.equal((await env.status()).dataSharingAccepted, false);
  assert.equal((await env.translate().done).error.code, "agreement_required");
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).error.code, "agreement_required");
  assert.equal(env.calls.length, 0);
  assert.equal(env.vault.apiKey, apiKey);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
});

test("new setup accepts data sharing once before saving a key or loading models", async (t) => {
  const env = await runtime(t, { fresh: true, local: {
    [STORAGE_KEYS.apiKey]: null, [STORAGE_KEYS.modelCatalog]: null,
    [STORAGE_KEYS.dataSharingAgreement]: undefined,
  } });
  assert.equal(env.ready.hasApiKey, false);
  assert.equal(env.ready.dataSharingAccepted, false);
  assert.equal((await env.setKey(apiKey)).error.code, "agreement_required");
  assert.equal(env.vault.apiKey, null);
  assert.equal((await env.message({ action: "setDataSharing", accepted: true })).ok, true);
  const agreement = { ...env.state.local[STORAGE_KEYS.dataSharingAgreement] };
  assert.equal((await env.setKey(apiKey)).ok, true);
  assert.equal(env.calls.length, 0);
  assert.equal((await env.message({ action: "listModels" })).ok, true);
  assert.equal((await env.status()).configurationError.code, "missing_target_language");
  await env.chrome.storage.sync.set({ targetLanguage: "fr", aiModel: DEFAULTS.aiModel });
  assert.equal((await env.reload()).configured, true);
  assert.deepEqual(env.state.local[STORAGE_KEYS.dataSharingAgreement], agreement);
  assert.equal(env.calls.length, 1);
});

test("withdrawal cancels requests, rejects late results and caches, and keeps the saved key", async (t) => {
  const env = await runtime(t);
  const originalCredential = { ...env.vault };
  const originalCatalog = structuredClone(env.state.local[STORAGE_KEYS.modelCatalog]);
  const pending = [];
  env.provider = (url, init) => new Promise((resolve) => pending.push({ url, init, resolve }));
  const translation = env.translate();
  const modelsRequest = env.message({ action: "listModels", forceRefresh: true });
  await until(() => pending.length === 2);
  const withdrawn = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.withdrawn, true);
  assert.equal((await env.status()).configured, false);
  assert.ok(pending.every(({ init }) => init.signal.aborted));
  for (const request of pending) request.resolve(json(request.url.includes(":generateContent") ? translationPayload : modelPayload));
  assert.equal((await translation.done).error.code, "cancelled");
  assert.equal((await modelsRequest).error.code, "cancelled");
  assert.deepEqual(env.state.local[STORAGE_KEYS.modelCatalog], originalCatalog);
  assert.deepEqual(env.vault, originalCredential);
  assert.notEqual(env.state.session[STORAGE_KEYS.latestResult]?.status, "success");
  assert.equal(env.state.local[STORAGE_KEYS.apiKeyStatus], undefined);
  assert.equal((await env.translate({ text: "after withdrawal" }).done).error.code, "agreement_required");
  assert.equal(env.calls.length, 2);
  assert.equal((await env.reload()).dataSharingAccepted, false);
});

test("withdrawal before the final success checks prevents a late success", async (t) => {
  const env = await runtime(t);
  let providerReturned = false;
  let agreementReadsAfterProvider = 0;
  let finalCheckBlocked = false;
  let releaseFinalCheck;
  env.provider = async () => {
    providerReturned = true;
    return json(translationPayload);
  };
  env.beforeGet = async (area, keys) => {
    if (area === "local" && keys === STORAGE_KEYS.dataSharingAgreement && providerReturned
        && ++agreementReadsAfterProvider === 2) {
      env.beforeGet = null;
      finalCheckBlocked = true;
      await new Promise((resolve) => { releaseFinalCheck = resolve; });
    }
  };
  const translation = env.translate();
  await until(() => finalCheckBlocked);
  const withdrawn = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(withdrawn.ok, true);
  releaseFinalCheck();
  assert.equal((await translation.done).error.code, "cancelled");
  assert.equal(translation.posts.length, 1);
  assert.notEqual(env.state.session[STORAGE_KEYS.latestResult]?.status, "success");
});

test("withdrawal between model pages prevents the next provider request", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.modelCatalog]: undefined } });
  env.provider = async () => {
    assert.equal((await env.message({ action: "setDataSharing", accepted: false })).ok, true);
    return json({ ...modelPayload, nextPageToken: "second-page" });
  };
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).error.code, "cancelled");
  assert.equal(env.calls.length, 1);
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog], undefined);
});

test("withdrawal stops requests before a pending credential read and skips an older queued acceptance", async (t) => {
  const env = await runtime(t);
  let request;
  env.provider = async (_url, init) => {
    request = { init, ...pendingFetch(init) };
    return request.promise;
  };
  const translation = env.translate();
  await until(() => request);
  let releaseRead;
  let readStarted = false;
  env.beforeVaultRead = async () => {
    env.beforeVaultRead = null;
    readStarted = true;
    await new Promise((resolve) => { releaseRead = resolve; });
  };
  const save = env.setKey("replacement-test-key");
  await until(() => readStarted);
  const acceptance = env.message({ action: "setDataSharing", accepted: true });
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(request.init.signal.aborted, true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined, "Local withdrawal does not wait for a key operation");
  assert.equal((await env.translate({ text: "after withdrawal" }).done).error.code, "agreement_required");
  assert.equal(env.calls.length, 1);
  releaseRead();
  assert.equal((await save).error.code, "agreement_required");
  assert.equal((await acceptance).dataSharingAccepted, false);
  assert.equal((await withdrawal).withdrawn, true);
  assert.equal((await translation.done).error.code, "cancelled");
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  assert.equal(env.writes.some(({ values }) => Object.hasOwn(values, STORAGE_KEYS.dataSharingAgreement)), false);
  assert.equal(env.vault.apiKey, apiKey);
});

test("an older acceptance write and its change event cannot reopen a pending withdrawal", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.dataSharingAgreement]: undefined } });
  let releaseAcceptance;
  let acceptanceStarted = false;
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.dataSharingAgreement]) {
      acceptanceStarted = true;
      await new Promise((resolve) => { releaseAcceptance = resolve; });
    }
  };
  let releaseWithdrawal;
  let withdrawalStarted = false;
  env.beforeRemove = async (area, keys) => {
    if (area === "local" && keys === STORAGE_KEYS.dataSharingAgreement) {
      withdrawalStarted = true;
      await new Promise((resolve) => { releaseWithdrawal = resolve; });
    }
  };
  const acceptance = env.message({ action: "setDataSharing", accepted: true });
  await until(() => acceptanceStarted);
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  releaseAcceptance();
  await until(() => withdrawalStarted);
  assert.ok(env.state.local[STORAGE_KEYS.dataSharingAgreement], "The older acceptance event has been delivered");
  assert.equal((await env.translate().done).error.code, "agreement_required");
  assert.equal(env.calls.length, 0);
  releaseWithdrawal();
  assert.equal((await acceptance).dataSharingAccepted, false);
  assert.equal((await withdrawal).withdrawn, true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  env.beforeSet = null;
  env.beforeRemove = null;
  assert.equal((await env.message({ action: "setDataSharing", accepted: true })).dataSharingAccepted, true);
  assert.equal((await env.translate().done).ok, true);
});

test("an older acceptance clear cannot erase a newer denial when later persistence fails", async (t) => {
  const env = await runtime(t, { session: { [STORAGE_KEYS.dataSharingDenied]: true } });
  let releaseClear;
  let denialWrites = 0;
  env.beforeRemove = async (area, key) => {
    if (area === "session" && key === STORAGE_KEYS.dataSharingDenied) {
      await new Promise((resolve) => { releaseClear = resolve; });
    }
    if (area === "local" && key === STORAGE_KEYS.dataSharingAgreement) throw new Error("Local removal failed");
  };
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.dataSharingDenied] && ++denialWrites > 1) {
      throw new Error("Repeated denial write failed");
    }
    if (area === "local" && values[STORAGE_KEYS.dataSharingAgreement]?.revokedAt) throw new Error("Local revocation failed");
  };
  const acceptance = env.message({ action: "setDataSharing", accepted: true });
  await until(() => releaseClear);
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await env.translate().done).error.code, "agreement_required");
  releaseClear();
  assert.equal((await withdrawal).ok, false);
  await acceptance;
  env.beforeRemove = null;
  env.beforeSet = null;
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], true);
  assert.equal((await env.reload()).dataSharingAccepted, false);
  assert.equal((await env.translate().done).error.code, "agreement_required");
  assert.equal(env.calls.length, 0);
});

test("an older withdrawal marker cannot survive a newer accepted intent", async (t) => {
  const env = await runtime(t);
  let releaseRead;
  let readStarted = false;
  env.beforeVaultRead = async () => {
    env.beforeVaultRead = null;
    readStarted = true;
    await new Promise((resolve) => { releaseRead = resolve; });
  };
  const keyChange = env.setKey("replacement-test-key");
  await until(() => readStarted);
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  const acceptance = env.message({ action: "setDataSharing", accepted: true });
  await until(() => env.state.session[STORAGE_KEYS.dataSharingDenied] === true);
  releaseRead();
  assert.equal((await keyChange).error.code, "agreement_required");
  assert.equal((await withdrawal).withdrawn, false);
  assert.equal((await acceptance).dataSharingAccepted, true);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], undefined);
  assert.equal((await env.reload()).dataSharingAccepted, true);
  assert.equal((await env.translate().done).ok, true);
});

test("local withdrawal survives restart while its session marker write is stalled", async (t) => {
  const env = await runtime(t);
  let releaseMarker;
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.dataSharingDenied]) {
      await new Promise((resolve) => { releaseMarker = resolve; });
    }
  };
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  await until(() => releaseMarker);
  assert.equal((await withdrawal).withdrawn, true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], undefined);
  env.beforeSet = null;
  assert.equal((await env.reload()).dataSharingAccepted, false);
  releaseMarker();
  await until(() => env.state.session[STORAGE_KEYS.dataSharingDenied] === true);
  delete env.state.session[STORAGE_KEYS.dataSharingDenied];
  assert.equal((await env.reload()).dataSharingAccepted, false);
  assert.equal((await env.translate().done).error.code, "agreement_required");
});

test("local withdrawal stays independent of an older stalled acceptance clear", async (t) => {
  const env = await runtime(t, { session: { [STORAGE_KEYS.dataSharingDenied]: true } });
  let releaseClear;
  env.beforeRemove = async (area, key) => {
    if (area === "session" && key === STORAGE_KEYS.dataSharingDenied) {
      delete env.state.session[STORAGE_KEYS.dataSharingDenied];
      await new Promise((resolve) => { releaseClear = resolve; });
    }
  };
  const acceptance = env.message({ action: "setDataSharing", accepted: true });
  await until(() => releaseClear);
  const withdrawal = env.message({ action: "setDataSharing", accepted: false });
  const acknowledgement = await Promise.race([
    withdrawal,
    new Promise((resolve) => setTimeout(() => resolve(null), 100)),
  ]);
  assert.deepEqual(acknowledgement, { ok: true, withdrawn: true });
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], undefined);
  assert.equal((await env.reload()).dataSharingAccepted, false);
  env.beforeRemove = null;
  releaseClear();
  assert.equal((await acceptance).dataSharingAccepted, false);
  assert.equal((await withdrawal).withdrawn, true);
  assert.equal((await env.translate().done).error.code, "agreement_required");
});

test("withdrawal removes the local agreement even when session marker writes fail", async (t) => {
  const env = await runtime(t);
  env.beforeSet = async (area, values) => {
    if (area === "session" && values[STORAGE_KEYS.dataSharingDenied] === true) {
      throw new Error("Cannot save session denial");
    }
  };
  const withdrawn = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.withdrawn, true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], undefined);
  assert.equal((await env.reload()).dataSharingAccepted, false);
});

test("failed agreement removal falls back to an invalid local revocation", async (t) => {
  const env = await runtime(t);
  env.beforeRemove = async (area, keys) => {
    if (area === "local" && keys === STORAGE_KEYS.dataSharingAgreement) {
      throw new Error("Cannot remove agreement");
    }
  };
  const withdrawn = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.withdrawn, true);
  assert.equal(Number.isFinite(env.state.local[STORAGE_KEYS.dataSharingAgreement].revokedAt), true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement].acceptedAt, undefined);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], true);
  assert.equal((await env.reload()).dataSharingAccepted, false);
});

test("failed local withdrawal persistence stays denied across a worker restart", async (t) => {
  const env = await runtime(t);
  const originalAgreement = { ...env.state.local[STORAGE_KEYS.dataSharingAgreement] };
  env.beforeRemove = async (area, keys) => {
    if (area === "local" && keys === STORAGE_KEYS.dataSharingAgreement) throw new Error("Cannot remove agreement");
  };
  env.beforeSet = async (area, values) => {
    if (area === "local" && values[STORAGE_KEYS.dataSharingAgreement]?.revokedAt) {
      throw new Error("Cannot save revocation");
    }
  };
  const result = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(result.ok, false);
  const pending = await env.settings();
  assert.equal(pending.dataSharingAccepted, false);
  assert.equal(pending.dataSharingWithdrawalPending, true);
  assert.deepEqual(env.state.local[STORAGE_KEYS.dataSharingAgreement], originalAgreement);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], true);
  assert.equal((await env.translate().done).error.code, "agreement_required");
  assert.equal(env.calls.length, 0);
  assert.equal((await env.reload()).dataSharingAccepted, false);
  assert.equal((await env.settings()).dataSharingWithdrawalPending, true);
  env.beforeRemove = null;
  env.beforeSet = null;
  const retried = await env.message({ action: "setDataSharing", accepted: false });
  assert.equal(retried.ok, true);
  assert.equal(retried.withdrawn, true);
  assert.equal((await env.settings()).dataSharingWithdrawalPending, false);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement], undefined);
  assert.equal((await env.reload()).dataSharingAccepted, false);
});

test("acceptance stays closed when clearing the session denial marker fails", async (t) => {
  const env = await runtime(t);
  assert.equal((await env.message({ action: "setDataSharing", accepted: false })).ok, true);
  env.beforeRemove = async (area, keys) => {
    if (area === "session" && keys === STORAGE_KEYS.dataSharingDenied) {
      throw new Error("Cannot clear denial marker");
    }
  };
  const failed = await env.message({ action: "setDataSharing", accepted: true });
  assert.equal(failed.ok, false);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], true);
  assert.equal(env.state.local[STORAGE_KEYS.dataSharingAgreement].version, DATA_SHARING_VERSION);
  assert.equal((await env.status()).dataSharingAccepted, false);
  assert.equal((await env.reload()).dataSharingAccepted, false);
  env.beforeRemove = null;
  const accepted = await env.message({ action: "setDataSharing", accepted: true });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.dataSharingAccepted, true);
  assert.equal(env.state.session[STORAGE_KEYS.dataSharingDenied], undefined);
});

test("stale saves and removals stay rejected after remove, re-add and worker restart", async (t) => {
  const env = await runtime(t);
  const oldRevision = (await env.settings()).credentialRevision;
  const removed = await env.setKey(null, oldRevision);
  assert.equal(removed.ok, true);
  assert.equal(removed.hasApiKey, false);
  assert.notEqual(removed.credentialRevision, oldRevision);
  const readded = await env.setKey(apiKey, removed.credentialRevision);
  assert.equal(readded.ok, true);
  assert.notEqual(readded.credentialRevision, oldRevision);
  assert.notEqual(readded.credentialRevision, removed.credentialRevision);
  await env.reload();
  assert.equal((await env.settings()).credentialRevision, readded.credentialRevision);
  assert.equal((await env.setKey("stale-replacement-key", oldRevision)).error.code, "credential_conflict");
  assert.equal((await env.setKey(null, oldRevision)).error.code, "credential_conflict");
  assert.equal((await env.message({ action: "setApiKey", apiKey: null })).error.code, "credential_conflict");
  assert.equal(env.vault.apiKey, apiKey);
  assert.equal(env.vault.revision, readded.credentialRevision);
  assert.equal(env.calls.length, 0);
});

test("verified migration removes plaintext and a removal tombstone blocks legacy restoration", async (t) => {
  const env = await runtime(t, { sync: { [STORAGE_KEYS.apiKey]: "other-legacy-test-key" } });
  assert.equal(env.vault.apiKey, apiKey);
  assert.ok(env.vault.revision);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal(env.writes.some(({ values }) => Object.hasOwn(values, STORAGE_KEYS.apiKey)), false);
  assert.equal((await env.setKey(null)).ok, true);
  const removedRevision = env.vault.revision;
  env.state.local[STORAGE_KEYS.apiKey] = apiKey;
  env.state.sync[STORAGE_KEYS.apiKey] = "old-synced-test-key";
  assert.equal((await env.reload()).hasApiKey, false);
  assert.equal(env.vault.revision, removedRevision);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal(env.calls.length, 0);
});

test("verification failure keeps legacy keys and a later startup safely completes migration", async (t) => {
  const env = await runtime(t, {
    sync: { [STORAGE_KEYS.apiKey]: "old-synced-test-key" },
    beforeVaultVerify: async () => { throw new Error("Read-back failed after commit"); },
  });
  assert.equal(env.ready.error.code, "credential_storage_error");
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(env.state.sync[STORAGE_KEYS.apiKey], "old-synced-test-key");
  assert.equal((await env.translate().done).error.code, "credential_storage_error");
  assert.equal(env.calls.length, 0);
  env.beforeVaultVerify = null;
  assert.equal((await env.reload()).hasApiKey, true);
  assert.equal(env.vault.apiKey, apiKey);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
});

test("Settings retries a failed verification without restarting or replacing the migrated key", async (t) => {
  const env = await runtime(t, {
    sync: { [STORAGE_KEYS.apiKey]: "old-synced-test-key" },
    beforeVaultVerify: async () => { throw new Error("Read-back failed after commit"); },
  });
  assert.equal(env.ready.error.code, "credential_storage_error");
  const committed = { ...env.vault };
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(env.state.sync[STORAGE_KEYS.apiKey], "old-synced-test-key");
  const recovered = await env.settings();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.apiKey, apiKey);
  assert.equal(recovered.credentialRevision, committed.revision);
  assert.deepEqual(env.vault, committed);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal((await env.status()).configured, true);
  assert.equal(env.calls.length, 0);
});

test("late local and sync legacy keys are cleared without replacing the encrypted key or tombstone", async (t) => {
  const env = await runtime(t);
  const original = { ...env.vault };
  const originalCatalog = structuredClone(env.state.local[STORAGE_KEYS.modelCatalog]);
  await env.chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: "late-local-test-key" });
  await env.chrome.storage.sync.set({ [STORAGE_KEYS.apiKey]: "late-synced-test-key" });
  await until(() => !Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey) && !Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey));
  assert.deepEqual(env.vault, original);
  assert.deepEqual(env.state.local[STORAGE_KEYS.modelCatalog], originalCatalog);
  assert.equal((await env.status()).configured, true);

  assert.equal((await env.setKey(null)).ok, true);
  const removed = { ...env.vault };
  await env.chrome.storage.sync.set({ [STORAGE_KEYS.apiKey]: "late-synced-test-key" });
  await until(() => !Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey));
  assert.deepEqual(env.vault, removed);
  assert.equal((await env.status()).hasApiKey, false);
  assert.equal(env.calls.length, 0);
});

test("a first legacy key arriving after startup migrates without contacting Google", async (t) => {
  const env = await runtime(t, { fresh: true, local: {
    [STORAGE_KEYS.apiKey]: null, [STORAGE_KEYS.modelCatalog]: null,
    [STORAGE_KEYS.dataSharingAgreement]: undefined,
  } });
  assert.equal(env.vault.revision, null);
  await env.chrome.storage.sync.set({ [STORAGE_KEYS.apiKey]: apiKey });
  await until(() => env.vault.apiKey === apiKey && !Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey));
  assert.ok(env.vault.revision);
  const state = await env.settings();
  assert.equal(state.hasApiKey, true);
  assert.equal(state.dataSharingAccepted, false);
  assert.equal(state.configurationError.code, "agreement_required");
  assert.equal(env.state.local[STORAGE_KEYS.modelCatalog], undefined);
  assert.equal(env.calls.length, 0);
});

test("damaged storage never falls back to legacy keys and needs explicit Settings removal", async (t) => {
  const env = await runtime(t, {
    corruptVault: true, vault: { apiKey: "unreadable-test-key", revision: randomUUID() },
    sync: { [STORAGE_KEYS.apiKey]: "old-synced-test-key" },
  });
  assert.equal(env.ready.error.code, "credential_storage_error");
  assert.equal((await env.settings()).canRemoveKey, true);
  assert.equal((await env.setKey("replacement-test-key")).error.code, "credential_storage_error");
  assert.equal((await env.translate().done).error.code, "credential_storage_error");
  assert.equal(await env.message({ action: "resetDamagedKey" }, {
    id: extensionId, url: `chrome-extension://${extensionId}/popup.html`,
  }), undefined);
  assert.equal(env.corruptVault, true);
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(env.calls.length, 0);
  const recovered = await env.message({ action: "resetDamagedKey" });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.hasApiKey, false);
  assert.equal(env.vault.apiKey, null);
  assert.ok(env.vault.revision);
  assert.equal(Object.hasOwn(env.state.local, STORAGE_KEYS.apiKey), false);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal((await env.setKey("replacement-test-key")).ok, true);
  const validState = { ...env.vault };
  assert.equal((await env.message({ action: "resetDamagedKey" })).error.code, "credential_conflict");
  assert.deepEqual(env.vault, validState);
});
