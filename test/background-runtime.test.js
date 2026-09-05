import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS, RECOMMENDED_MODEL, LIMITS, STORAGE_KEYS, stableTextHash } from "../shared.js";

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
let importId = 0;
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
      ...seed.local,
    },
    sync: { ...(seed.fresh ? {} : { [STORAGE_KEYS.triggerKey]: "Off" }), ...seed.sync },
    session: { ...seed.session },
  };
  const env = { state, calls: [], writes: [], beforeGet: seed.beforeGet, beforeSet: seed.beforeSet, openedSettings: 0 };
  const area = (name) => ({
    setAccessLevel: async () => undefined,
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
      openOptionsPage: async () => { env.openedSettings += 1; },
    },
    contextMenus: { onClicked: event() },
    tabs: { sendMessage: async () => undefined },
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
  env.reload = async () => {
    changed.clear();
    env.chrome.runtime.onMessage = event();
    env.chrome.runtime.onConnect = event();
    await import(`../background.js?runtime-test=${++importId}`);
    return env.status();
  };
  t.after(() => {
    globalThis.chrome = original.chrome;
    globalThis.fetch = original.fetch;
    globalThis.setTimeout = original.setTimeout;
  });
  env.ready = await env.reload();
  return env;
}

test("runtime readiness waits for migration, keeps Off, and limits Settings access", async (t) => {
  const env = await runtime(t, { local: { [STORAGE_KEYS.apiKey]: null }, sync: { [STORAGE_KEYS.apiKey]: apiKey } });
  assert.equal(env.ready.ok, true);
  assert.equal(env.ready.hasApiKey, true);
  assert.equal(env.ready.triggerKey, null);
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(Object.hasOwn(env.state.sync, STORAGE_KEYS.apiKey), false);
  assert.equal(await env.message({ action: "getRuntimeState" }, contentSender), undefined);
  assert.deepEqual(await env.message({ action: "openSettings" }, contentSender), { ok: true });
  assert.equal(await env.message({ action: "openSettings" }, { ...contentSender, id: "other" }), undefined);
  assert.equal(await env.message({ action: "openSettings" }, { ...contentSender, url: "chrome://settings" }), undefined);
  assert.equal(env.openedSettings, 1);
});

test("migration storage failure reports startup failure and preserves the old key", async (t) => {
  const env = await runtime(t, {
    local: { [STORAGE_KEYS.apiKey]: null },
    sync: { [STORAGE_KEYS.apiKey]: apiKey },
    beforeSet: async (area, values) => {
      if (area === "local" && values[STORAGE_KEYS.apiKey]) throw new Error("Cannot save key");
    },
  });
  assert.equal(env.ready.ok, false);
  assert.equal(env.ready.error.code, "service_error");
  assert.equal(env.state.sync[STORAGE_KEYS.apiKey], apiKey);
  assert.equal(env.state.local[STORAGE_KEYS.apiKey], null);
  assert.equal((await env.translate().done).error.code, "service_error");
  assert.equal(env.calls.length, 0);
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
  await env.chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: replacement });
  assert.equal((await env.message({ action: "listModels", forceRefresh: true })).ok, true);
  oldRequest.resolve(json({}, 401));
  assert.equal((await old.done).error.code, "invalid_api_key");
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
  await env.chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: replacement });
  const refreshed = env.message({ action: "listModels", forceRefresh: true });
  releaseWrite();
  assert.equal((await old.done).error.code, "invalid_api_key");
  assert.equal((await refreshed).ok, true);
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
    env.beforeGet = async (area, keys) => {
      if (!failed && area === "local" && keys === STORAGE_KEYS.apiKey) {
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

test("invalid sender, ID and selection fail before provider access or rate writes", async (t) => {
  const env = await runtime(t);
  assert.equal((await env.translate({}, { ...contentSender, id: "foreign" }).done).error.code, "unsupported_page");
  assert.equal((await env.translate({ requestId: "bad-id" }).done).error.code, "service_error");
  assert.equal((await env.translate({ text: "x".repeat(LIMITS.maxInputCodePoints + 1) }).done).error.code, "selection_too_large");
  assert.equal((await env.translate({ targetLanguage: "unknown" }).done).error.code, "service_error");
  assert.equal(env.calls.length, 0);
  assert.equal(env.state.session[STORAGE_KEYS.rateStarts], undefined);
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
  assert.equal(env.state.session[STORAGE_KEYS.activeRequestCount], 0);
  assert.equal(env.state.session[STORAGE_KEYS.latestResult].error.code, "timeout");
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
  await env.chrome.storage.local.set({ geminiApiKey: apiKey });
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
