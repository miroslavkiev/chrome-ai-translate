import {
  t,
  localizeDocument,
  uiLocale,
  languageDisplayName,
  DEFAULTS,
  copyText,
  formatTriggerKey,
  getErrorPresentation,
  isSupportedLanguage,
  isValidModelId,
  normalizeTriggerKey,
} from "./shared.js";

localizeDocument();

const elements = Object.fromEntries([
  "status", "shortcut", "activeCount", "latestResult", "latestMeta", "copyResult", "copyStatus", "openSettings",
  "welcome", "statusCard", "latestCard",
].map((id) => [id, document.getElementById(id)]));

let loadSequence = 0;
let copyValue = "";

function readLatestResult(value) {
  if (value?.status === "success" && typeof value.translatedText === "string"
      && value.translatedText.trim() && isSupportedLanguage(value.targetLanguage)) {
    const completedAt = Number.isFinite(value.completedAt) && value.completedAt > 0
      ? new Date(value.completedAt) : null;
    const when = completedAt && !Number.isNaN(completedAt.getTime())
      ? new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short" }).format(completedAt)
      : "";
    return {
      kind: "success",
      text: value.translatedText,
      language: value.targetLanguage,
      meta: [languageDisplayName(value.targetLanguage), when].filter(Boolean).join(" · "),
    };
  }
  if (value?.status === "error") {
    return { kind: "error", text: getErrorPresentation(value.error).message };
  }
  return { kind: "empty", text: t("runtime_no_translation") };
}

function setStatus(state, label) {
  elements.status.dataset.state = state;
  elements.status.textContent = label;
}

function showResult(result) {
  elements.latestResult.dataset.kind = result.kind;
  elements.latestResult.textContent = result.text;
  elements.latestResult.lang = result.language ?? uiLocale();
  elements.latestMeta.textContent = result.meta ?? "";
  elements.latestMeta.hidden = !result.meta;
  copyValue = result.kind === "success" ? result.text : "";
  elements.copyResult.hidden = !copyValue;
  elements.copyStatus.textContent = "";
}

function render(response) {
  const needsKey = response.hasApiKey === false;
  elements.welcome.hidden = !needsKey;
  elements.statusCard.hidden = needsKey;
  elements.latestCard.hidden = needsKey;
  elements.openSettings.textContent = needsKey ? t("runtime_start_setup")
    : ["missing_target_language", "agreement_required"].includes(response.configurationError?.code) ? t("runtime_finish_setup") : t("runtime_settings");
  const configured = response.configured === true
    && isSupportedLanguage(response.targetLanguage)
    && isValidModelId(response.aiModel ?? DEFAULTS.aiModel);
  const activeCount = Number.isSafeInteger(response.activeRequestCount) && response.activeRequestCount > 0
    ? response.activeRequestCount : 0;
  elements.shortcut.textContent = formatTriggerKey(normalizeTriggerKey(
    Object.hasOwn(response, "triggerKey") ? response.triggerKey : DEFAULTS.triggerKey,
  ));
  elements.activeCount.textContent = new Intl.NumberFormat(uiLocale()).format(activeCount);
  const latest = readLatestResult(response.latestResult);
  if (response.configurationError) {
    showResult({ kind: "error", text: getErrorPresentation(response.configurationError).message });
    setStatus("setup", response.apiKeyStatus === "rejected" ? t("runtime_key_rejected") : t("runtime_setup_required"));
  } else if (!response.hasApiKey) {
    showResult({ kind: "empty", text: t("runtime_add_key_to_translate") });
    setStatus("setup", t("runtime_add_key"));
  } else if (!configured) {
    showResult({ kind: "empty", text: t("runtime_finish_model_language") });
    setStatus("setup", t("runtime_check_setup"));
  } else {
    showResult(latest);
    setStatus(activeCount > 0 ? "translating" : latest.kind === "error" ? "error" : "ready",
      activeCount > 0 ? t("runtime_translating") : latest.kind === "error" ? t("runtime_error") : t("runtime_ready"));
  }
}

async function loadState() {
  const sequence = ++loadSequence;
  try {
    const response = await chrome.runtime.sendMessage({ action: "getRuntimeState" });
    if (sequence !== loadSequence) return;
    if (!response?.ok) {
      if (response?.error?.code === "credential_storage_error") {
        render({ ...response, configurationError: response.error });
        return;
      }
      throw new Error("Runtime state is unavailable.");
    }
    render(response);
  } catch {
    if (sequence !== loadSequence) return;
    elements.welcome.hidden = true;
    elements.statusCard.hidden = false;
    elements.latestCard.hidden = false;
    showResult({ kind: "error", text: t("runtime_status_load_failed") });
    setStatus("error", t("runtime_error"));
  }
}

elements.copyResult.addEventListener("click", async () => {
  const text = copyValue;
  if (!text) return;
  const copied = await copyText(text);
  if (text !== copyValue) return;
  elements.copyStatus.textContent = copied ? t("runtime_copied") : t("runtime_copy_blocked");
});

elements.openSettings.addEventListener("click", async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch {
    elements.latestCard.hidden = false;
    showResult({ kind: "error", text: t("runtime_settings_open_failed") });
    setStatus("error", t("runtime_error"));
  }
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (["local", "sync", "session"].includes(areaName)) void loadState();
});

void loadState();
