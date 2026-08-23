import {
  LIMITS,
  codePointLength,
  getLanguage,
  isSupportedPageUrl,
  isSupportedLanguage,
  isValidModelId,
  isValidRequestId,
  normalizeApiKey,
  publicError,
} from "./shared.js";

export { normalizeApiKey };

export function validateContentSender(sender, extensionId) {
  if (!sender || sender.id !== extensionId || !sender.tab
      || !Number.isInteger(sender.tab.id) || sender.tab.id < 0
      || !Number.isInteger(sender.frameId) || sender.frameId < 0
      || (!isSupportedPageUrl(sender.url) && !isSupportedPageUrl(sender.origin))) {
    return { ok: false, error: publicError("unsupported_page") };
  }
  return {
    ok: true,
    tabId: sender.tab.id,
    frameId: sender.frameId,
    documentId: typeof sender.documentId === "string" && sender.documentId
      ? sender.documentId
      : `${sender.tab.id}:${sender.frameId}:${sender.url}`,
  };
}

export function validateTranslationEnvelope({ message, sender, extensionId }) {
  const source = validateContentSender(sender, extensionId);
  if (!source.ok) return source;
  if (!message || message.action !== "translate" || !isValidRequestId(message.requestId)) {
    return { ok: false, error: publicError("service_error") };
  }
  if (typeof message.text !== "string" || !message.text.trim()) {
    return { ok: false, error: publicError("no_selection") };
  }
  if (message.text.length > LIMITS.maxInputCodePoints * 2
      || codePointLength(message.text) > LIMITS.maxInputCodePoints) {
    return { ok: false, error: publicError("selection_too_large") };
  }
  if (message.targetLanguage !== undefined && !isSupportedLanguage(message.targetLanguage)) {
    return { ok: false, error: publicError("service_error") };
  }
  return {
    ok: true,
    requestId: message.requestId,
    text: message.text,
    targetLanguage: message.targetLanguage,
    ...source,
  };
}

export function validateTranslateRequest({
  message,
  sender,
  extensionId,
  defaultLanguage,
  selectedModel,
  models,
}) {
  const envelope = validateTranslationEnvelope({ message, sender, extensionId });
  if (!envelope.ok) return envelope;

  const targetLanguage = message.targetLanguage ?? defaultLanguage;
  if (!isSupportedLanguage(targetLanguage)) {
    return { ok: false, error: publicError("service_error") };
  }
  const model = Array.isArray(models)
    ? models.find(({ id }) => id === selectedModel)
    : null;
  if (!isValidModelId(selectedModel) || !model) {
    return { ok: false, error: publicError("invalid_model") };
  }

  return {
    ok: true,
    requestId: message.requestId,
    text: message.text,
    targetLanguage,
    targetLanguageName: getLanguage(targetLanguage).name,
    model: selectedModel,
    generationConfig: getTranslationGenerationConfig(model),
    tabId: envelope.tabId,
    frameId: envelope.frameId,
    documentId: envelope.documentId,
  };
}

export function pruneRateStarts(starts, now = Date.now()) {
  if (!Array.isArray(starts)) return [];
  const cutoff = now - LIMITS.rateWindowMs;
  return starts
    .filter((value) => Number.isFinite(value) && value > cutoff && value <= now)
    .sort((left, right) => left - right)
    .slice(-LIMITS.maxStartsPerWindow);
}

export function checkRequestGate({
  starts,
  tabActive,
  globalActive,
  duplicate,
  now = Date.now(),
}) {
  const currentStarts = pruneRateStarts(starts, now);
  if (duplicate) {
    return { ok: false, error: publicError("duplicate_request"), starts: currentStarts };
  }
  if (tabActive >= LIMITS.maxActivePerTab || globalActive >= LIMITS.maxActiveGlobal) {
    return { ok: false, error: publicError("busy"), starts: currentStarts };
  }
  if (currentStarts.length >= LIMITS.maxStartsPerWindow) {
    const retryAfterMs = Math.max(1, currentStarts[0] + LIMITS.rateWindowMs - now);
    return {
      ok: false,
      error: publicError("rate_limited", { retryAfterMs }),
      starts: currentStarts,
    };
  }
  return { ok: true, starts: [...currentStarts, now] };
}

export function makeDuplicateKey({ documentId, text, targetLanguage }) {
  return JSON.stringify([documentId, targetLanguage, text]);
}

export function normalizeModels(payload) {
  if (!payload || !Array.isArray(payload.models)) return [];
  const models = new Map();
  for (const model of payload.models) {
    if (!model || !Array.isArray(model.supportedGenerationMethods)
        || !model.supportedGenerationMethods.includes("generateContent")) continue;
    const id = typeof model.name === "string" && model.name.startsWith("models/")
      ? model.name.slice(7)
      : "";
    const outputTokenLimit = model.outputTokenLimit;
    if (!isValidModelId(id) || !supportsTranslationContract(id)
        || !Number.isSafeInteger(outputTokenLimit) || outputTokenLimit < 1) continue;
    models.set(id, {
      id,
      outputTokenLimit,
      thinking: model.thinking === true,
      displayName: typeof model.displayName === "string" && model.displayName.trim()
        ? model.displayName.trim().slice(0, 200)
        : id,
      ...(typeof model.description === "string" && model.description.trim()
        ? { description: model.description.trim().slice(0, 1_000) }
        : {}),
    });
  }
  return [...models.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function validateModelCache(value, apiKeyHash) {
  if (!value || !Number.isFinite(value.fetchedAt) || !Array.isArray(value.models)) return null;
  if (typeof apiKeyHash === "string" && value.apiKeyHash !== apiKeyHash) return null;
  const models = value.models.filter((model) => model && isValidModelId(model.id)
    && supportsTranslationContract(model.id)
    && typeof model.displayName === "string"
    && typeof model.thinking === "boolean"
    && Number.isSafeInteger(model.outputTokenLimit) && model.outputTokenLimit > 0);
  if (!models.length || models.length !== value.models.length) return null;
  return { models, fetchedAt: value.fetchedAt };
}

export function extractTranslation(payload) {
  const candidate = payload?.candidates?.[0];
  if (candidate?.finishReason !== "STOP") {
    return { ok: false, error: publicError("invalid_response") };
  }
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) return { ok: false, error: publicError("invalid_response") };
  const text = parts
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("");
  if (!text.trim() || text.length > LIMITS.maxOutputCodePoints * 2
      || codePointLength(text) > LIMITS.maxOutputCodePoints) {
    return { ok: false, error: publicError("invalid_response") };
  }
  return { ok: true, text };
}

export function classifyProviderError(status, payload, retryAfterMs) {
  const providerStatus = typeof payload?.error?.status === "string" ? payload.error.status : "";
  const providerReasons = Array.isArray(payload?.error?.details)
    ? payload.error.details.map((detail) => detail?.reason).filter((reason) => typeof reason === "string")
    : [];
  const details = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? { retryAfterMs } : {};
  if (status === 401 || providerStatus === "UNAUTHENTICATED"
      || providerReasons.includes("API_KEY_INVALID")) {
    return publicError("invalid_api_key");
  }
  if (status === 404) return publicError("invalid_model");
  if (status === 408 || providerStatus === "DEADLINE_EXCEEDED") return publicError("timeout");
  if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return publicError("quota_exceeded", details);
  }
  return publicError("service_error", status >= 500 ? details : {});
}

export function supportsTranslationContract(id) {
  if (!isValidModelId(id)) return false;
  const gemmaVersion = /^gemma-(\d+)(?:-|$)/i.exec(id)?.[1];
  if (gemmaVersion) return Number(gemmaVersion) >= 4;
  if (!id.startsWith("gemini-")) return false;
  return !/(?:embedding|image|tts|speech|live|audio|robotics|computer-use)/i.test(id);
}

export function getTranslationGenerationConfig(model) {
  const id = model?.id;
  const config = {
    maxOutputTokens: Math.min(LIMITS.maxOutputTokens, model?.outputTokenLimit),
  };
  const version = /^gemini-(\d+)(?:\.(\d+))?(?:-|$)/i.exec(id ?? "");
  const major = version ? Number(version[1]) : null;
  if (!id?.startsWith("gemini-") || (major !== null && major < 3)) {
    config.temperature = 0;
  }
  if (model?.thinking !== true) return config;

  if (/^gemini-(?:flash|flash-lite)-latest$/i.test(id)
      || /^gemini-2\.5-flash(?:-lite)?(?:-|$)/i.test(id)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  } else if (/^gemini-pro-latest$/i.test(id)
      || /^gemini-2\.5-pro(?:-|$)/i.test(id)) {
    config.thinkingConfig = { thinkingBudget: 128 };
  } else if (major !== null && major >= 3) {
    const supportsMinimal = /^gemini-(?:3-flash|3\.1-flash-lite|3\.5-flash|3\.5-flash-lite|3\.6-flash)(?:-|$)/i.test(id);
    config.thinkingConfig = { thinkingLevel: supportsMinimal ? "MINIMAL" : "LOW" };
  }
  return config;
}
