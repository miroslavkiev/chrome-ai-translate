export const DEFAULTS = Object.freeze({
  targetLanguage: "uk",
  aiModel: "gemma-4-26b-a4b-it",
  triggerKey: "Control",
});

export const LIMITS = Object.freeze({
  maxInputCodePoints: 10_000,
  maxOutputCodePoints: 40_000,
  maxOutputTokens: 8_192,
  requestTimeoutMs: 25_000,
  keyHoldMs: 1_500,
  maxActivePerTab: 3,
  maxActiveGlobal: 6,
  maxStartsPerWindow: 30,
  rateWindowMs: 60_000,
  modelCacheMs: 24 * 60 * 60 * 1_000,
  maxCompletedOverlays: 5,
});

export const STORAGE_KEYS = Object.freeze({
  apiKey: "geminiApiKey",
  apiKeyStatus: "apiKeyStatus",
  modelCatalog: "modelCatalog",
  targetLanguage: "targetLanguage",
  aiModel: "aiModel",
  triggerKey: "triggerKey",
  rateStarts: "rateStarts",
  latestResult: "latestResult",
  activeRequestCount: "activeRequestCount",
});

export const LANGUAGES = Object.freeze([
  Object.freeze({ code: "uk", name: "Ukrainian" }),
  Object.freeze({ code: "en", name: "English" }),
  Object.freeze({ code: "es", name: "Spanish" }),
  Object.freeze({ code: "fr", name: "French" }),
  Object.freeze({ code: "de", name: "German" }),
  Object.freeze({ code: "ru", name: "Russian" }),
]);

export const SUPPORTED_TRIGGER_KEYS = Object.freeze([
  "Control",
  "Alt",
  "Shift",
  "Meta",
  "CapsLock",
  "Insert",
  "Pause",
  "ScrollLock",
  ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
]);

export const PUBLIC_ERROR_MESSAGES = Object.freeze({
  no_selection: "Select some text and try again.",
  unsupported_selection: "This text selection is not supported.",
  selection_too_large: "The selection is longer than 10,000 characters. Select less text and try again.",
  missing_api_key: "Add your Gemini API key in Settings.",
  invalid_api_key: "Gemini rejected the API key. Check it in Settings.",
  invalid_model: "This model is no longer available. Choose another model in Settings.",
  busy: "Too many translations are active. Try again when one finishes.",
  duplicate_request: "This selection is already being translated.",
  rate_limited: "The request limit was reached. Try again shortly.",
  timeout: "Translation took too long. You can retry it.",
  offline: "You appear to be offline. Check your connection and retry.",
  network_error: "Gemini could not be reached. Check your connection and retry.",
  quota_exceeded: "Gemini quota was reached. Check your account and retry later.",
  service_error: "Gemini could not complete the translation. Try again later.",
  invalid_response: "Gemini returned an unreadable response. You can retry it.",
  output_too_large: "The translation exceeded the output limit. Select less text and try again.",
  content_blocked: "Gemini blocked this text. Try a different selection.",
  unsupported_page: "Translation is not available on this page.",
  frame_unavailable: "The selected frame is no longer available.",
  cancelled: "Translation was cancelled.",
});

const languageCodes = new Set(LANGUAGES.map(({ code }) => code));
const triggerKeys = new Set(SUPPORTED_TRIGGER_KEYS);

export function getLanguage(code) {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

export function isSupportedLanguage(code) {
  return typeof code === "string" && languageCodes.has(code);
}

export function isSupportedTriggerKey(key) {
  return key === null || (typeof key === "string" && triggerKeys.has(key));
}

export function normalizeTriggerKey(key) {
  if (key === null || key === "Off") return null;
  return isSupportedTriggerKey(key) ? key : DEFAULTS.triggerKey;
}

export function getStoredTriggerKey(record) {
  return Object.hasOwn(record, STORAGE_KEYS.triggerKey)
    ? normalizeTriggerKey(record[STORAGE_KEYS.triggerKey])
    : DEFAULTS.triggerKey;
}

export function formatTriggerKey(key, platform = globalThis.navigator?.userAgentData?.platform
  || globalThis.navigator?.platform || "") {
  if (key === null) return "Off";
  if (/mac/i.test(platform)) {
    if (key === "Meta") return "Command";
    if (key === "Alt") return "Option";
  }
  return key;
}

export function createRequestId(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource.randomUUID === "function") return cryptoSource.randomUUID();
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  if (typeof text !== "string" || !text.trim() || !clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function isSupportedPageUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

export function isValidRequestId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isValidModelId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && /^[a-zA-Z0-9._-]+$/.test(value);
}

export function normalizeApiKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length >= 8 && key.length <= 256 && !/\s/.test(key) ? key : null;
}

export function codePointLength(value) {
  return Array.from(value).length;
}

export function validateSourceText(value) {
  if (typeof value !== "string" || !value.trim()) return { ok: false, code: "no_selection" };
  if (value.length > LIMITS.maxInputCodePoints * 2
      || codePointLength(value) > LIMITS.maxInputCodePoints) {
    return { ok: false, code: "selection_too_large" };
  }
  return { ok: true, text: value };
}

export function publicError(code, details = {}) {
  const safeCode = Object.hasOwn(PUBLIC_ERROR_MESSAGES, code) ? code : "service_error";
  return {
    ...details,
    code: safeCode,
    message: PUBLIC_ERROR_MESSAGES[safeCode],
  };
}

export function getErrorPresentation(error) {
  const { code, message } = publicError(error?.code);
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0
    ? Math.min(error.retryAfterMs, 3_600_000)
    : 0;
  const delay = retryAfterMs ? ` Try again in ${Math.ceil(retryAfterMs / 1_000)} seconds.` : "";
  const action = ["missing_api_key", "invalid_api_key", "invalid_model"].includes(code)
    ? "settings"
    : ["busy", "rate_limited", "timeout", "offline", "network_error", "quota_exceeded",
      "service_error", "invalid_response", "cancelled"].includes(code) ? "retry" : null;
  return { code, message: message + delay, action, retryAfterMs };
}

export function stableTextHash(value) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
