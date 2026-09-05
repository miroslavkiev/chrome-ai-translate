import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULTS,
  LIMITS,
  STORAGE_KEYS,
  getStoredTriggerKey,
} from "../shared.js";
import {
  checkRequestGate,
  classifyProviderError,
  extractTranslation,
  getTranslationGenerationConfig,
  normalizeApiKey,
  normalizeModels,
  pruneRateStarts,
  validateContentSender,
  validateModelCache,
  validateTranslateRequest,
  validateTranslationEnvelope,
} from "../request-policy.js";

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
  assert.equal(classifyProviderError(403, {}, undefined).code, "service_error");
  assert.equal(classifyProviderError(403, { error: { details: [{ reason: "API_KEY_INVALID" }] } }, undefined).code, "invalid_api_key");
  assert.equal(classifyProviderError(404, {}, undefined).code, "invalid_model");
  assert.equal(classifyProviderError(429, {}, 500).code, "quota_exceeded");
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
