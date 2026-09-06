import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  DEFAULTS,
  LIMITS,
  STORAGE_KEYS,
  getStoredTriggerKey,
} from "../shared.js";
import {
  MAX_RESPONSE_BYTES,
  checkRequestGate,
  classifyProviderError,
  extractTranslation,
  getTranslationGenerationConfig,
  normalizeApiKey,
  normalizeModels,
  pruneRateStarts,
  readResponseJson,
  validateContentSender,
  validateModelCache,
  validateTranslateRequest,
  validateTranslationEnvelope,
} from "../request-policy.js";

const encoder = new TextEncoder();

function makeStreamResponse(chunks, {
  contentLength,
  keepOpen = false,
  status = 200,
  cancelResult,
} = {}) {
  const state = { cancelled: false };
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else if (!keepOpen) {
        controller.close();
      }
    },
    cancel() {
      state.cancelled = true;
      return cancelResult;
    },
  });
  const headers = contentLength === undefined
    ? undefined
    : { "Content-Length": String(contentLength) };
  return { response: new Response(body, { headers, status }), state };
}

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const sender = {
  id: "extension-id",
  url: "https://example.com/page",
  tab: { id: 7 },
  frameId: 2,
  documentId: "document-1",
};

test("content senders and translation requests are validated at the trust boundary", () => {
  assert.equal(validateContentSender(sender, "extension-id").ok, true);
  assert.equal(validateContentSender({ ...sender, url: "about:blank", origin: "https://example.com" }, "extension-id").ok, true);
  assert.equal(validateContentSender({ ...sender, url: "file:///tmp/example.html", origin: "null" }, "extension-id").ok, true);
  assert.equal(validateContentSender({ ...sender, url: "chrome://settings" }, "extension-id").ok, false);
  assert.equal(validateContentSender({ ...sender, id: "other" }, "extension-id").ok, false);

  const message = { action: "translate", requestId, text: "Hello" };
  assert.equal(validateTranslationEnvelope({ message, sender, extensionId: "extension-id" }).ok, true);
  assert.equal(validateTranslationEnvelope({ message: { ...message, text: " " }, sender, extensionId: "extension-id" }).error.code, "no_selection");
  assert.equal(validateTranslationEnvelope({ message: { ...message, targetLanguage: "bad" }, sender, extensionId: "extension-id" }).ok, false);

  const valid = validateTranslateRequest({
    message,
    sender,
    extensionId: "extension-id",
    defaultLanguage: "uk",
    selectedModel: "gemma-4-26b-a4b-it",
    models: [{ id: "gemma-4-26b-a4b-it", outputTokenLimit: 4_096, thinking: true }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.targetLanguageName, "Ukrainian");
  assert.deepEqual(valid.generationConfig, { maxOutputTokens: 4_096, temperature: 0 });
  assert.equal(validateTranslateRequest({
    message,
    sender,
    extensionId: "extension-id",
    defaultLanguage: "uk",
    selectedModel: "removed-model",
    models: [{ id: "gemma-4-26b-a4b-it", outputTokenLimit: 4_096 }],
  }).error.code, "invalid_model");
});

test("request gate enforces duplicate, concurrency, and rolling rate limits", () => {
  const now = 100_000;
  assert.deepEqual(pruneRateStarts([0, now - 1, now + 1, "bad"], now), [now - 1]);
  assert.equal(checkRequestGate({ starts: [], tabActive: 0, globalActive: 0, duplicate: true, now }).error.code, "duplicate_request");
  assert.equal(checkRequestGate({ starts: [], tabActive: LIMITS.maxActivePerTab, globalActive: 0, duplicate: false, now }).error.code, "busy");
  assert.equal(checkRequestGate({ starts: [], tabActive: 0, globalActive: LIMITS.maxActiveGlobal, duplicate: false, now }).error.code, "busy");

  const starts = Array.from({ length: LIMITS.maxStartsPerWindow }, (_, index) => now - index);
  const limited = checkRequestGate({ starts, tabActive: 0, globalActive: 0, duplicate: false, now });
  assert.equal(limited.error.code, "rate_limited");
  assert(limited.error.retryAfterMs > 0);

  const accepted = checkRequestGate({ starts: [], tabActive: 0, globalActive: 0, duplicate: false, now });
  assert.deepEqual(accepted, { ok: true, starts: [now] });
});

test("response JSON reader accepts exactly the byte cap and rejects one byte more", async () => {
  const exactJson = encoder.encode(`"${"a".repeat(MAX_RESPONSE_BYTES - 2)}"`);
  const exact = makeStreamResponse([exactJson], { contentLength: MAX_RESPONSE_BYTES });
  const value = await readResponseJson(exact.response);
  assert.equal(value.length, MAX_RESPONSE_BYTES - 2);
  assert.equal(exact.response.body.locked, false);

  const tooLargeJson = encoder.encode(`"${"a".repeat(MAX_RESPONSE_BYTES - 1)}"`);
  const tooLarge = makeStreamResponse([
    tooLargeJson.subarray(0, MAX_RESPONSE_BYTES),
    tooLargeJson.subarray(MAX_RESPONSE_BYTES),
  ], { keepOpen: true });
  await assert.rejects(readResponseJson(tooLarge.response), RangeError);
  assert.equal(tooLarge.state.cancelled, true);
  assert.equal(tooLarge.response.body.locked, false);
});

test("response JSON reader preserves UTF-8 characters split across chunks", async () => {
  const encoded = encoder.encode(JSON.stringify({ text: "A🙂B" }));
  const emojiStart = encoded.indexOf(0xf0);
  const split = makeStreamResponse([
    encoded.subarray(0, emojiStart + 2),
    encoded.subarray(emojiStart + 2),
  ]);
  assert.deepEqual(await readResponseJson(split.response), { text: "A🙂B" });
  assert.equal(split.response.body.locked, false);
});

test("response JSON reader rejects oversized advertised bodies for success and error responses", async () => {
  for (const status of [200, 401, 429]) {
    const oversized = makeStreamResponse([encoder.encode("{}")], {
      contentLength: MAX_RESPONSE_BYTES + 1,
      keepOpen: true,
      status,
    });
    await assert.rejects(readResponseJson(oversized.response), RangeError);
    assert.equal(oversized.state.cancelled, true);
    assert.equal(oversized.response.body.locked, false);
  }
});

test("response JSON reader caps chunked bodies with missing or dishonest lengths", async () => {
  const oversizedJson = encoder.encode(`"${"a".repeat(MAX_RESPONSE_BYTES - 1)}"`);
  for (const options of [
    { status: 200 },
    { contentLength: 2, status: 401 },
    { status: 429 },
  ]) {
    const oversized = makeStreamResponse([
      oversizedJson.subarray(0, MAX_RESPONSE_BYTES),
      oversizedJson.subarray(MAX_RESPONSE_BYTES),
    ], { ...options, keepOpen: true });
    await assert.rejects(readResponseJson(oversized.response), RangeError);
    assert.equal(oversized.state.cancelled, true);
    assert.equal(oversized.response.body.locked, false);
  }
});

test("response JSON reader keeps memory bounded across many small chunks", (t) => {
  const probe = async () => {
    const controller = new AbortController();
    const chunkCount = 100_002;
    const quote = Uint8Array.of(34);
    const letter = Uint8Array.of(97);
    let sent = 0;
    let baseline;
    let heapGrowth;
    let listenersDuringRead;
    const body = new ReadableStream({
      pull(source) {
        if (sent < chunkCount) {
          source.enqueue(sent === 0 || sent === chunkCount - 1 ? quote : letter);
          sent += 1;
          return;
        }
        return new Promise((resolve) => setImmediate(() => {
          // Measure while the read is pending, before completion can free handlers.
          global.gc();
          heapGrowth = process.memoryUsage().heapUsed - baseline;
          listenersDuringRead = getEventListeners(controller.signal, "abort").length;
          source.close();
          resolve();
        }));
      },
    }, { highWaterMark: 0 });
    const response = new Response(body);
    global.gc();
    baseline = process.memoryUsage().heapUsed;
    const value = await readResponseJson(response, controller.signal);
    process.stdout.write(JSON.stringify({
      length: value.length,
      heapGrowth,
      listenersDuringRead,
      listenersAfterRead: getEventListeners(controller.signal, "abort").length,
      locked: body.locked,
    }));
  };
  const result = JSON.parse(execFileSync(process.execPath, [
    "--expose-gc", "--input-type=module", "--eval",
    `import { getEventListeners } from "node:events";
import { readResponseJson } from ${JSON.stringify(new URL("../request-policy.js", import.meta.url).href)};
await (${probe.toString()})();`,
  ], { encoding: "utf8", timeout: 10_000 }));
  t.diagnostic(`100,002 one-byte chunks retained ${result.heapGrowth} extra heap bytes during the read.`);
  assert.equal(result.length, 100_000);
  assert(result.heapGrowth < 16 * 1024 * 1024,
    `Tiny chunks retained ${result.heapGrowth} extra heap bytes.`);
  assert.equal(result.listenersDuringRead, 1);
  assert.equal(result.listenersAfterRead, 0);
  assert.equal(result.locked, false);
});

for (const [label, reason] of [
  ["default reason", undefined],
  ["custom reason", new Error("Reader cancelled.")],
  ["null reason", null],
]) {
  test(`response JSON reader aborts a stalled body without waiting for source cleanup (${label})`, { timeout: 2_000 }, async () => {
    let markStalled;
    const stalled = new Promise((resolve) => {
      markStalled = resolve;
    });
    const neverSettles = new Promise(() => {});
    let sentFirstChunk = false;
    const state = { cancelled: false };
    const body = new ReadableStream({
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true;
          controller.enqueue(encoder.encode('{"value":'));
          return;
        }
        markStalled();
        return neverSettles;
      },
      cancel(abortReason) {
        state.cancelled = true;
        state.reason = abortReason;
        return neverSettles;
      },
    });
    const response = new Response(body);
    const controller = new AbortController();
    const pending = readResponseJson(response, controller.signal);
    await stalled;
    controller.abort(reason);

    let timeoutId;
    try {
      await assert.rejects(Promise.race([
        pending,
        new Promise((resolve, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Response reader did not abort.")), 500);
        }),
      ]), (error) => error === controller.signal.reason);
    } finally {
      clearTimeout(timeoutId);
    }
    assert.equal(state.cancelled, true);
    assert.equal(state.reason, controller.signal.reason);
    assert.equal(response.body.locked, false);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
}

test("model catalog and provider responses are normalized without raw errors", () => {
  const models = normalizeModels({ models: [
    { name: "models/gemma-4-26b-a4b-it", displayName: "Gemma", outputTokenLimit: 8_192, supportedGenerationMethods: ["generateContent"], thinking: true },
    { name: "models/gemma-3-27b-it", outputTokenLimit: 8_192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-image", outputTokenLimit: 8_192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-computer-use-preview", outputTokenLimit: 8_192, supportedGenerationMethods: ["generateContent"] },
    { name: "models/embed", displayName: "Embed", supportedGenerationMethods: ["embedContent"] },
    { name: "bad/model", supportedGenerationMethods: ["generateContent"] },
  ] });
  assert.deepEqual(models.map(({ id }) => id), ["gemma-4-26b-a4b-it"]);
  assert.equal(validateModelCache({ models, fetchedAt: 1, apiKeyHash: "hash" }, "hash").models.length, 1);
  assert.equal(validateModelCache({ models, fetchedAt: 1, apiKeyHash: "other" }, "hash"), null);
  assert.deepEqual(validateModelCache({ models, fetchedAt: 1, apiKeyHash: "hash", unavailableModels: [models[0].id] }, "hash").models, []);
  assert.equal(validateModelCache({ models, fetchedAt: 1, unavailableModels: ["unknown-model"] }), null);

  assert.deepEqual(extractTranslation({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Hello" }, { text: "!" }] } }] }), { ok: true, text: "Hello!" });
  assert.equal(extractTranslation({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Partial" }] } }] }).error.code, "output_too_large");
  for (const reason of ["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "ESCALATION"]) {
    assert.equal(extractTranslation({ candidates: [{ finishReason: reason }] }).error.code, "content_blocked");
  }
  assert.equal(extractTranslation({ promptFeedback: { blockReason: "SAFETY" } }).error.code, "content_blocked");
  assert.equal(extractTranslation({ promptFeedback: { blockReason: "BLOCK_REASON_UNSPECIFIED" } }).error.code, "invalid_response");
  assert.deepEqual(extractTranslation({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "private reasoning", thought: true }, { text: "Final" }] } }] }), { ok: true, text: "Final" });
  assert.equal(extractTranslation({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "reasoning only", thought: true }] } }] }).error.code, "invalid_response");
  assert.equal(extractTranslation({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "a".repeat(LIMITS.maxOutputCodePoints + 1) }] } }] }).error.code, "output_too_large");
  assert.equal(extractTranslation({ candidates: [] }).error.code, "invalid_response");
  const genericForbidden = classifyProviderError(403, null, 500);
  assert.equal(genericForbidden.code, "service_error");
  assert.equal(genericForbidden.retryable, false);
  assert.equal(genericForbidden.retryAfterMs, undefined);
  assert.equal(classifyProviderError(401, null, undefined).code, "invalid_api_key");
  const invalidKeyForbidden = classifyProviderError(403, {
    error: { details: [{ reason: "API_KEY_INVALID" }] },
  }, undefined);
  assert.equal(invalidKeyForbidden.code, "invalid_api_key");
  assert.equal(invalidKeyForbidden.retryable, undefined);
  const quotaForbidden = classifyProviderError(403, {
    error: { status: "RESOURCE_EXHAUSTED" },
  }, 500);
  assert.equal(quotaForbidden.code, "quota_exceeded");
  assert.equal(quotaForbidden.retryAfterMs, 500);
  assert.equal(quotaForbidden.retryable, undefined);
  assert.equal(classifyProviderError(404, {}, undefined).code, "invalid_model");
  const quotaWithoutPayload = classifyProviderError(429, null, 500);
  assert.equal(quotaWithoutPayload.code, "quota_exceeded");
  assert.equal(quotaWithoutPayload.retryAfterMs, 500);
  assert.equal(classifyProviderError(500, { error: { message: "secret" } }, undefined).message.includes("secret"), false);
  assert.equal(normalizeApiKey("  valid-key-value  "), "valid-key-value");
  assert.equal(normalizeApiKey("short"), null);
});

test("translation generation uses the lowest safe thinking mode for each model family", () => {
  assert.deepEqual(getTranslationGenerationConfig({
    id: "gemini-3.7-flash",
    outputTokenLimit: 65_536,
    thinking: true,
  }), {
    maxOutputTokens: LIMITS.maxOutputTokens,
    thinkingConfig: { thinkingLevel: "LOW" },
  });
  assert.deepEqual(getTranslationGenerationConfig({
    id: "gemini-3.6-flash",
    outputTokenLimit: 65_536,
    thinking: true,
  }).thinkingConfig, { thinkingLevel: "MINIMAL" });
  assert.deepEqual(getTranslationGenerationConfig({
    id: "gemini-2.5-flash",
    outputTokenLimit: 65_536,
    thinking: true,
  }), {
    maxOutputTokens: LIMITS.maxOutputTokens,
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
  });
  assert.deepEqual(getTranslationGenerationConfig({
    id: "gemini-pro-latest",
    outputTokenLimit: 65_536,
    thinking: true,
  }).thinkingConfig, { thinkingBudget: 128 });
  assert.deepEqual(getTranslationGenerationConfig({
    id: "gemma-4-26b-a4b-it",
    outputTokenLimit: 32_768,
    thinking: true,
  }), {
    maxOutputTokens: LIMITS.maxOutputTokens,
    temperature: 0,
  });
});

test("stored trigger distinguishes Off from a missing preference", () => {
  assert.equal(getStoredTriggerKey({ [STORAGE_KEYS.triggerKey]: null }), null);
  assert.equal(getStoredTriggerKey({ [STORAGE_KEYS.triggerKey]: "Off" }), null);
  assert.equal(getStoredTriggerKey({}), DEFAULTS.triggerKey);
  assert.equal(getStoredTriggerKey({ [STORAGE_KEYS.triggerKey]: "F8" }), "F8");
});
