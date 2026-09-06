import { t } from "./i18n.js";
export { t, localizeDocument, uiLocale, uiDirection, languageDisplayName } from "./i18n.js";

export const RECOMMENDED_MODEL = "gemini-3.5-flash-lite";
export const DATA_SHARING_VERSION = 2;

export function preferredTargetLanguage(languages = []) {
  for (const language of [...languages, globalThis.chrome?.i18n?.getUILanguage?.() || "en", "en"]) {
    try {
      const locale = new Intl.Locale(language.replaceAll("_", "-"));
      const scriptCode = `${locale.language}-${locale.script}`;
      const code = locale.language === "zh"
        ? `zh-${locale.maximize().script}`
        : isSupportedLanguage(scriptCode) ? scriptCode
          : ({ nb: "no", nn: "no" }[locale.language] || locale.language);
      if (isSupportedLanguage(code)) return code;
    } catch { /* Skip language tags that Chrome cannot resolve. */ }
  }
  return "en";
}

// Legacy defaults remain for existing profiles. New setup requires a language choice.
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
  credentialVersion: "credentialVersion",
  dataSharingAgreement: "dataSharingAgreement",
  dataSharingDenied: "dataSharingDenied",
  apiKeyStatus: "apiKeyStatus",
  modelCatalog: "modelCatalog",
  targetLanguage: "targetLanguage",
  aiModel: "aiModel",
  triggerKey: "triggerKey",
  rateStarts: "rateStarts",
  latestResult: "latestResult",
  activeRequestCount: "activeRequestCount",
});

// Google documents these languages for Gemini generally, not equal translation quality.
// Reviewed 2026-09-05: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models#language_support
// Chinese scripts are separate choices; Hebrew uses the canonical BCP 47 code.
export const LANGUAGES = Object.freeze([
  Object.freeze({ code: "af", name: "Afrikaans" }),
  Object.freeze({ code: "sq", name: "Albanian" }),
  Object.freeze({ code: "am", name: "Amharic" }),
  Object.freeze({ code: "ar", name: "Arabic" }),
  Object.freeze({ code: "hy", name: "Armenian" }),
  Object.freeze({ code: "as", name: "Assamese" }),
  Object.freeze({ code: "az", name: "Azerbaijani" }),
  Object.freeze({ code: "eu", name: "Basque" }),
  Object.freeze({ code: "be", name: "Belarusian" }),
  Object.freeze({ code: "bn", name: "Bengali" }),
  Object.freeze({ code: "bs", name: "Bosnian" }),
  Object.freeze({ code: "bg", name: "Bulgarian" }),
  Object.freeze({ code: "ca", name: "Catalan" }),
  Object.freeze({ code: "ceb", name: "Cebuano" }),
  Object.freeze({ code: "zh-Hans", name: "Chinese (Simplified)" }),
  Object.freeze({ code: "zh-Hant", name: "Chinese (Traditional)" }),
  Object.freeze({ code: "co", name: "Corsican" }),
  Object.freeze({ code: "hr", name: "Croatian" }),
  Object.freeze({ code: "cs", name: "Czech" }),
  Object.freeze({ code: "da", name: "Danish" }),
  Object.freeze({ code: "dv", name: "Dhivehi" }),
  Object.freeze({ code: "nl", name: "Dutch" }),
  Object.freeze({ code: "en", name: "English" }),
  Object.freeze({ code: "eo", name: "Esperanto" }),
  Object.freeze({ code: "et", name: "Estonian" }),
  Object.freeze({ code: "fil", name: "Filipino (Tagalog)" }),
  Object.freeze({ code: "fi", name: "Finnish" }),
  Object.freeze({ code: "fr", name: "French" }),
  Object.freeze({ code: "fy", name: "Frisian" }),
  Object.freeze({ code: "gl", name: "Galician" }),
  Object.freeze({ code: "ka", name: "Georgian" }),
  Object.freeze({ code: "de", name: "German" }),
  Object.freeze({ code: "el", name: "Greek" }),
  Object.freeze({ code: "gu", name: "Gujarati" }),
  Object.freeze({ code: "ht", name: "Haitian Creole" }),
  Object.freeze({ code: "ha", name: "Hausa" }),
  Object.freeze({ code: "haw", name: "Hawaiian" }),
  Object.freeze({ code: "he", name: "Hebrew" }),
  Object.freeze({ code: "hi", name: "Hindi" }),
  Object.freeze({ code: "hmn", name: "Hmong" }),
  Object.freeze({ code: "hu", name: "Hungarian" }),
  Object.freeze({ code: "is", name: "Icelandic" }),
  Object.freeze({ code: "ig", name: "Igbo" }),
  Object.freeze({ code: "id", name: "Indonesian" }),
  Object.freeze({ code: "ga", name: "Irish" }),
  Object.freeze({ code: "it", name: "Italian" }),
  Object.freeze({ code: "ja", name: "Japanese" }),
  Object.freeze({ code: "jv", name: "Javanese" }),
  Object.freeze({ code: "kn", name: "Kannada" }),
  Object.freeze({ code: "kk", name: "Kazakh" }),
  Object.freeze({ code: "km", name: "Khmer" }),
  Object.freeze({ code: "ko", name: "Korean" }),
  Object.freeze({ code: "kri", name: "Krio" }),
  Object.freeze({ code: "ku", name: "Kurdish" }),
  Object.freeze({ code: "ky", name: "Kyrgyz" }),
  Object.freeze({ code: "lo", name: "Lao" }),
  Object.freeze({ code: "la", name: "Latin" }),
  Object.freeze({ code: "lv", name: "Latvian" }),
  Object.freeze({ code: "lt", name: "Lithuanian" }),
  Object.freeze({ code: "lb", name: "Luxembourgish" }),
  Object.freeze({ code: "mk", name: "Macedonian" }),
  Object.freeze({ code: "mg", name: "Malagasy" }),
  Object.freeze({ code: "ms", name: "Malay" }),
  Object.freeze({ code: "ml", name: "Malayalam" }),
  Object.freeze({ code: "mt", name: "Maltese" }),
  Object.freeze({ code: "mi", name: "Maori" }),
  Object.freeze({ code: "mr", name: "Marathi" }),
  Object.freeze({ code: "mni-Mtei", name: "Meiteilon (Manipuri)" }),
  Object.freeze({ code: "mn", name: "Mongolian" }),
  Object.freeze({ code: "my", name: "Myanmar (Burmese)" }),
  Object.freeze({ code: "ne", name: "Nepali" }),
  Object.freeze({ code: "no", name: "Norwegian" }),
  Object.freeze({ code: "ny", name: "Nyanja (Chichewa)" }),
  Object.freeze({ code: "or", name: "Odia (Oriya)" }),
  Object.freeze({ code: "ps", name: "Pashto" }),
  Object.freeze({ code: "fa", name: "Persian" }),
  Object.freeze({ code: "pl", name: "Polish" }),
  Object.freeze({ code: "pt", name: "Portuguese" }),
  Object.freeze({ code: "pa", name: "Punjabi" }),
  Object.freeze({ code: "ro", name: "Romanian" }),
  Object.freeze({ code: "ru", name: "Russian" }),
  Object.freeze({ code: "sm", name: "Samoan" }),
  Object.freeze({ code: "gd", name: "Scots Gaelic" }),
  Object.freeze({ code: "sr", name: "Serbian" }),
  Object.freeze({ code: "st", name: "Sesotho" }),
  Object.freeze({ code: "sn", name: "Shona" }),
  Object.freeze({ code: "sd", name: "Sindhi" }),
  Object.freeze({ code: "si", name: "Sinhala (Sinhalese)" }),
  Object.freeze({ code: "sk", name: "Slovak" }),
  Object.freeze({ code: "sl", name: "Slovenian" }),
  Object.freeze({ code: "so", name: "Somali" }),
  Object.freeze({ code: "es", name: "Spanish" }),
  Object.freeze({ code: "su", name: "Sundanese" }),
  Object.freeze({ code: "sw", name: "Swahili" }),
  Object.freeze({ code: "sv", name: "Swedish" }),
  Object.freeze({ code: "tg", name: "Tajik" }),
  Object.freeze({ code: "ta", name: "Tamil" }),
  Object.freeze({ code: "te", name: "Telugu" }),
  Object.freeze({ code: "th", name: "Thai" }),
  Object.freeze({ code: "tr", name: "Turkish" }),
  Object.freeze({ code: "uk", name: "Ukrainian" }),
  Object.freeze({ code: "ur", name: "Urdu" }),
  Object.freeze({ code: "ug", name: "Uyghur" }),
  Object.freeze({ code: "uz", name: "Uzbek" }),
  Object.freeze({ code: "vi", name: "Vietnamese" }),
  Object.freeze({ code: "cy", name: "Welsh" }),
  Object.freeze({ code: "xh", name: "Xhosa" }),
  Object.freeze({ code: "yi", name: "Yiddish" }),
  Object.freeze({ code: "yo", name: "Yoruba" }),
  Object.freeze({ code: "zu", name: "Zulu" }),
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

const publicErrorCodes = new Set([
  "no_selection", "unsupported_selection", "selection_too_large", "missing_api_key",
  "agreement_required", "credential_conflict", "credential_storage_error", "missing_target_language",
  "invalid_api_key", "invalid_model", "busy", "duplicate_request",
  "rate_limited", "timeout", "offline", "network_error",
  "quota_exceeded", "service_error", "invalid_response", "output_too_large",
  "content_blocked", "unsupported_page", "frame_unavailable", "cancelled",
]);

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
  if (key === null) return t("key_Off");
  if (/mac/i.test(platform)) {
    if (key === "Meta") return t("key_Command");
    if (key === "Alt") return t("key_Option");
  }
  return /^F\d+$/.test(key) ? key : t(`key_${key}`);
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
  const safeCode = publicErrorCodes.has(code) ? code : "service_error";
  return {
    ...details,
    code: safeCode,
    message: t(`error_${safeCode}`),
  };
}

export function getErrorPresentation(error) {
  const { code, message } = publicError(error?.code);
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0
    ? Math.min(error.retryAfterMs, 3_600_000)
    : 0;
  const delay = retryAfterMs ? t("error_retry_delay", [Math.ceil(retryAfterMs / 1_000)]) : "";
  const checkSetup = error?.code === "service_error" && error?.retryable === false;
  const action = checkSetup || ["missing_api_key", "missing_target_language", "invalid_api_key", "invalid_model", "agreement_required", "credential_conflict", "credential_storage_error"].includes(code)
    ? "settings"
    : ["busy", "rate_limited", "timeout", "offline", "network_error", "quota_exceeded",
      "service_error", "invalid_response", "cancelled"].includes(code) ? "retry" : null;
  return { code, message: (checkSetup ? t("runtime_check_setup") : message) + delay, action, retryAfterMs };
}

export function stableTextHash(value) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
