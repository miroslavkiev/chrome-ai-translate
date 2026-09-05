import {
  DEFAULTS,
  copyText,
  formatTriggerKey,
  getErrorPresentation,
  getLanguage,
  isSupportedLanguage,
  isValidModelId,
  normalizeTriggerKey,
} from "./shared.js";

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
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(completedAt)
      : "";
    return {
      kind: "success",
      text: value.translatedText,
      language: value.targetLanguage,
      meta: [getLanguage(value.targetLanguage).name, when].filter(Boolean).join(" · "),
    };
  }
  if (value?.status === "error") {
    return { kind: "error", text: getErrorPresentation(value.error).message };
  }
  return { kind: "empty", text: "No translation yet." };
}

function setStatus(state, label) {
  elements.status.dataset.state = state;
  elements.status.textContent = label;
}

function showResult(result) {
  elements.latestResult.dataset.kind = result.kind;
  elements.latestResult.textContent = result.text;
  elements.latestResult.lang = result.language ?? "en";
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
  elements.openSettings.textContent = needsKey ? "Start setup"
    : response.configurationError?.code === "missing_target_language" ? "Finish setup" : "Settings";
  const configured = response.configured === true
    && isSupportedLanguage(response.targetLanguage)
    && isValidModelId(response.aiModel ?? DEFAULTS.aiModel);
  const activeCount = Number.isSafeInteger(response.activeRequestCount) && response.activeRequestCount > 0
    ? response.activeRequestCount : 0;
  elements.shortcut.textContent = formatTriggerKey(normalizeTriggerKey(
    Object.hasOwn(response, "triggerKey") ? response.triggerKey : DEFAULTS.triggerKey,
  ));
  elements.activeCount.textContent = String(activeCount);
  const latest = readLatestResult(response.latestResult);
  if (response.configurationError) {
    showResult({ kind: "error", text: getErrorPresentation(response.configurationError).message });
    setStatus("setup", response.apiKeyStatus === "rejected" ? "Key rejected" : "Setup required");
  } else if (!response.hasApiKey) {
    showResult({ kind: "empty", text: "Add an API key in Settings to start translating." });
    setStatus("setup", "Add API key");
  } else if (!configured) {
    showResult({ kind: "empty", text: "The key is saved. Open Settings to check the model and finish your language choice." });
    setStatus("setup", "Check setup");
  } else {
    showResult(latest);
    setStatus(activeCount > 0 ? "translating" : latest.kind === "error" ? "error" : "ready",
      activeCount > 0 ? "Translating" : latest.kind === "error" ? "Error" : "Ready");
  }
}

async function loadState() {
  const sequence = ++loadSequence;
  try {
    const response = await chrome.runtime.sendMessage({ action: "getRuntimeState" });
    if (sequence !== loadSequence) return;
    if (!response?.ok) throw new Error("Runtime state is unavailable.");
    render(response);
  } catch {
    if (sequence !== loadSequence) return;
    elements.welcome.hidden = true;
    elements.statusCard.hidden = false;
    elements.latestCard.hidden = false;
    showResult({ kind: "error", text: "Extension status could not be loaded. Reload the extension, then refresh the page." });
    setStatus("error", "Error");
  }
}

elements.copyResult.addEventListener("click", async () => {
  const text = copyValue;
  if (!text) return;
  const copied = await copyText(text);
  if (text !== copyValue) return;
  elements.copyStatus.textContent = copied ? "Copied." : "Copy was blocked. Select the result text and copy it.";
});

elements.openSettings.addEventListener("click", async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch {
    elements.latestCard.hidden = false;
    showResult({ kind: "error", text: "Settings could not be opened. Try again." });
    setStatus("error", "Error");
  }
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (["local", "sync", "session"].includes(areaName)) void loadState();
});

void loadState();
