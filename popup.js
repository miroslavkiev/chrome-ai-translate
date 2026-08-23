import {
  DEFAULTS,
  PUBLIC_ERROR_MESSAGES,
  isSupportedLanguage,
  isValidModelId,
  normalizeTriggerKey,
} from "./shared.js";

const elements = {
  status: document.getElementById("status"),
  shortcut: document.getElementById("shortcut"),
  activeCount: document.getElementById("activeCount"),
  latestResult: document.getElementById("latestResult"),
  openSettings: document.getElementById("openSettings"),
};

let loadSequence = 0;

function formatTriggerKey(key) {
  if (key === null) return "Off";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/mac/i.test(platform)) {
    if (key === "Meta") return "Command";
    if (key === "Alt") return "Option";
  }
  return key;
}

function normalizeActiveCount(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function readLatestResult(value) {
  if (!value || typeof value !== "object") return { kind: "empty", text: "No translation yet." };

  const status = typeof value.status === "string" ? value.status : "";
  const translatedText = [value.text, value.translation, value.translatedText]
    .find((item) => typeof item === "string" && item.trim());
  if ((status === "success" || value.ok === true) && translatedText) {
    return { kind: "success", text: translatedText };
  }

  const code = value.error?.code || value.code;
  const knownMessage = typeof code === "string" && Object.hasOwn(PUBLIC_ERROR_MESSAGES, code)
    ? PUBLIC_ERROR_MESSAGES[code]
    : "";
  const safeMessage = value.error?.message || knownMessage;
  if (status === "error" || status === "failure" || value.ok === false || safeMessage) {
    return {
      kind: "error",
      text: typeof safeMessage === "string" && safeMessage.trim()
        ? safeMessage
        : "The latest translation failed.",
    };
  }

  if (status === "loading" || status === "translating") {
    return { kind: "empty", text: "Translation in progress..." };
  }
  return { kind: "empty", text: "No translation yet." };
}

function setStatus(state, label) {
  elements.status.dataset.state = state;
  elements.status.textContent = label;
}

function render({ hasApiKey, configured, triggerKey, activeCount, latestResult }) {
  elements.shortcut.textContent = formatTriggerKey(triggerKey);
  elements.activeCount.textContent = String(activeCount);

  const latest = readLatestResult(latestResult);
  elements.latestResult.dataset.kind = latest.kind;
  elements.latestResult.textContent = !hasApiKey
    ? "Add an API key in Settings to start translating."
    : !configured
      ? "Open Settings to validate the API key and model."
      : latest.text;

  if (!configured) {
    setStatus("setup", "Setup required");
  } else if (activeCount > 0) {
    setStatus("translating", "Translating");
  } else if (latest.kind === "error") {
    setStatus("error", "Error");
  } else {
    setStatus("ready", "Ready");
  }
}

async function loadState() {
  const sequence = ++loadSequence;
  try {
    const response = await chrome.runtime.sendMessage({ action: "getRuntimeState" });
    if (sequence !== loadSequence) return;
    if (!response?.ok) throw new Error("Runtime state is unavailable.");
    const targetLanguage = response.targetLanguage ?? DEFAULTS.targetLanguage;
    const aiModel = response.aiModel ?? DEFAULTS.aiModel;

    render({
      hasApiKey: response.hasApiKey === true,
      configured: response.configured === true
        && isSupportedLanguage(targetLanguage)
        && isValidModelId(aiModel),
      triggerKey: normalizeTriggerKey(Object.hasOwn(response, "triggerKey")
        ? response.triggerKey
        : DEFAULTS.triggerKey),
      activeCount: normalizeActiveCount(response.activeRequestCount),
      latestResult: response.latestResult,
    });
  } catch {
    if (sequence !== loadSequence) return;
    elements.latestResult.dataset.kind = "error";
    elements.latestResult.textContent = "Extension status could not be loaded.";
    setStatus("error", "Error");
  }
}

elements.openSettings.addEventListener("click", async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch {
    elements.latestResult.dataset.kind = "error";
    elements.latestResult.textContent = "Settings could not be opened.";
    setStatus("error", "Error");
  }
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local" || areaName === "sync" || areaName === "session") loadState();
});

loadState();
