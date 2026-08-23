import {
  DEFAULTS,
  LANGUAGES,
  LIMITS,
  STORAGE_KEYS,
  SUPPORTED_TRIGGER_KEYS,
  getStoredTriggerKey,
  isSupportedLanguage,
  isSupportedTriggerKey,
  isValidModelId,
  normalizeApiKey,
  normalizeTriggerKey,
} from "./shared.js";

const elements = {
  form: document.getElementById("settingsForm"),
  apiKey: document.getElementById("apiKey"),
  revealKey: document.getElementById("revealKey"),
  apiKeyStatus: document.getElementById("apiKeyStatus"),
  aiModel: document.getElementById("aiModel"),
  refreshModels: document.getElementById("refreshModels"),
  modelStatus: document.getElementById("modelStatus"),
  targetLanguage: document.getElementById("targetLanguage"),
  shortcutValue: document.getElementById("shortcutValue"),
  recordKey: document.getElementById("recordKey"),
  disableKey: document.getElementById("disableKey"),
  keyStatus: document.getElementById("keyStatus"),
  saveStatus: document.getElementById("saveStatus"),
  saveButton: document.getElementById("saveButton"),
};

let storedApiKey = "";
let triggerKey = DEFAULTS.triggerKey;
let recordingKey = false;
let catalogLoaded = false;
let dirty = false;
let saving = false;
let savingKey = false;
let modelLoadSequence = 0;
let savedPreferences = {
  targetLanguage: DEFAULTS.targetLanguage,
  aiModel: DEFAULTS.aiModel,
  triggerKey: DEFAULTS.triggerKey,
};

const mutableControls = [
  elements.apiKey,
  elements.revealKey,
  elements.aiModel,
  elements.refreshModels,
  elements.targetLanguage,
  elements.recordKey,
  elements.disableKey,
];

function setTextStatus(element, message, kind = "") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function setSaveStatus(message, kind = "") {
  setTextStatus(elements.saveStatus, message, kind);
}

function markDirty(message = "Unsaved preference changes.") {
  dirty = elements.targetLanguage.value !== savedPreferences.targetLanguage
    || elements.aiModel.value !== savedPreferences.aiModel
    || triggerKey !== savedPreferences.triggerKey;
  elements.saveButton.disabled = saving || savingKey || !dirty;
  setSaveStatus(dirty ? message : "Preferences are up to date.");
}

function formatTriggerKey(key) {
  if (key === null) return "Off";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/mac/i.test(platform)) {
    if (key === "Meta") return "Command";
    if (key === "Alt") return "Option";
  }
  return key;
}

function renderTriggerKey() {
  elements.shortcutValue.textContent = formatTriggerKey(triggerKey);
  elements.disableKey.setAttribute("aria-pressed", String(triggerKey === null));
}

function updateKeyControls() {
  if (saving) {
    for (const control of mutableControls) control.disabled = true;
    return;
  }
  elements.apiKey.disabled = false;
  elements.aiModel.disabled = false;
  elements.targetLanguage.disabled = false;
  elements.recordKey.disabled = false;
  elements.disableKey.disabled = false;
  const hasInput = Boolean(elements.apiKey.value);
  elements.apiKey.disabled = savingKey;
  elements.revealKey.disabled = savingKey || !hasInput;
  elements.refreshModels.disabled = savingKey
    || !storedApiKey
    || elements.apiKey.value.trim() !== storedApiKey;
}

function setSaving(value) {
  saving = value;
  elements.form.setAttribute("aria-busy", String(value));
  if (value) {
    for (const control of mutableControls) control.disabled = true;
    elements.saveButton.disabled = true;
  } else {
    updateKeyControls();
  }
}

function setKeySaving(value) {
  savingKey = value;
  elements.apiKey.setAttribute("aria-busy", String(value));
  updateKeyControls();
  elements.saveButton.disabled = saving || savingKey || !dirty;
}

function maskApiKey() {
  elements.apiKey.type = "password";
  elements.revealKey.textContent = "Show";
  elements.revealKey.setAttribute("aria-pressed", "false");
}

function populateLanguages(selectedCode) {
  const fragment = document.createDocumentFragment();
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.code === DEFAULTS.targetLanguage
      ? `${language.name} (Default)`
      : language.name;
    fragment.append(option);
  }
  elements.targetLanguage.replaceChildren(fragment);
  elements.targetLanguage.value = isSupportedLanguage(selectedCode)
    ? selectedCode
    : DEFAULTS.targetLanguage;
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  return models.flatMap((model) => {
    if (!model || !isValidModelId(model.id) || seen.has(model.id)) return [];
    seen.add(model.id);
    return [{
      id: model.id,
      displayName: typeof model.displayName === "string" && model.displayName.trim()
        ? model.displayName.trim()
        : model.id,
      description: typeof model.description === "string" ? model.description.trim() : "",
    }];
  });
}

function renderModels(models, selectedModel) {
  const fragment = document.createDocumentFragment();
  const modelIds = new Set(models.map(({ id }) => id));
  if (isValidModelId(selectedModel) && !modelIds.has(selectedModel)) {
    const unavailable = document.createElement("option");
    unavailable.value = selectedModel;
    unavailable.textContent = `${selectedModel} (Not in current list)`;
    unavailable.dataset.unavailable = "true";
    fragment.append(unavailable);
  }
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.displayName === model.id
      ? model.id
      : `${model.displayName} (${model.id})`;
    if (model.description) option.title = model.description;
    fragment.append(option);
  }
  if (!fragment.childNodes.length) {
    const option = document.createElement("option");
    option.value = selectedModel;
    option.textContent = selectedModel;
    fragment.append(option);
  }
  elements.aiModel.replaceChildren(fragment);
  elements.aiModel.value = selectedModel;
}

function formatCatalogTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function sendRuntimeMessage(message) {
  let timer;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("The extension background did not respond. Reload the extension and try again."));
        }, LIMITS.requestTimeoutMs + 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function invalidateModelLoad(message) {
  modelLoadSequence += 1;
  catalogLoaded = false;
  renderModels([], elements.aiModel.value || DEFAULTS.aiModel);
  elements.refreshModels.textContent = "Refresh models";
  setTextStatus(elements.modelStatus, message);
}

async function loadModels(forceRefresh) {
  if (!storedApiKey || elements.apiKey.value.trim() !== storedApiKey) {
    setTextStatus(elements.modelStatus, "Finish saving the API key before refreshing models.");
    return false;
  }

  elements.refreshModels.disabled = true;
  elements.refreshModels.textContent = forceRefresh ? "Refreshing..." : "Loading...";
  const sequence = ++modelLoadSequence;
  setTextStatus(elements.modelStatus, forceRefresh
    ? "Checking Gemini for compatible models..."
    : "Loading compatible models...");

  try {
    const response = await sendRuntimeMessage({
      action: "listModels",
      forceRefresh,
    });
    if (sequence !== modelLoadSequence) return false;
    if (!response?.ok) {
      throw new Error(response?.error?.message || "Compatible models could not be loaded.");
    }

    const models = normalizeModels(response.models);
    if (!models.length) throw new Error("Gemini returned no compatible models.");
    const selectedModel = elements.aiModel.value || DEFAULTS.aiModel;
    renderModels(models, selectedModel);
    catalogLoaded = true;

    const fetchedAt = formatCatalogTime(response.fetchedAt);
    const when = fetchedAt ? ` from ${fetchedAt}` : "";
    if (elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
      setTextStatus(elements.modelStatus, "The saved model is not in the compatible list. Choose another model.", "error");
    } else if (response.source === "cache") {
      const stale = response.stale ? " Live refresh failed. Try again later." : "";
      setTextStatus(elements.modelStatus, `Using cached model list${when}.${stale}`);
    } else {
      setTextStatus(elements.modelStatus, `Model list updated${when}.`, "success");
    }
    return true;
  } catch (error) {
    if (sequence !== modelLoadSequence) return false;
    const message = error instanceof Error ? error.message : "Compatible models could not be loaded.";
    setTextStatus(elements.modelStatus, message, "error");
    return false;
  } finally {
    if (sequence === modelLoadSequence) {
      elements.refreshModels.textContent = "Refresh models";
      updateKeyControls();
    }
  }
}

function stopKeyRecording(message = "") {
  recordingKey = false;
  elements.recordKey.classList.remove("recording");
  elements.recordKey.textContent = "Record key";
  elements.recordKey.setAttribute("aria-pressed", "false");
  if (message) setTextStatus(elements.keyStatus, message);
}

function recordKey(event) {
  if (!recordingKey || event.isComposing || event.repeat) return;
  if (event.key === "Tab") {
    stopKeyRecording("Recording cancelled.");
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopKeyRecording("Recording cancelled.");
    return;
  }
  if (!SUPPORTED_TRIGGER_KEYS.includes(event.key)) {
    setTextStatus(elements.keyStatus, `${event.key || "That key"} is not supported. Press another key or Escape to cancel.`, "error");
    return;
  }
  triggerKey = event.key;
  renderTriggerKey();
  stopKeyRecording(`${formatTriggerKey(triggerKey)} will be used after you save.`);
  markDirty();
}

function startKeyRecording() {
  recordingKey = true;
  elements.recordKey.classList.add("recording");
  elements.recordKey.textContent = "Press a key...";
  elements.recordKey.setAttribute("aria-pressed", "true");
  setTextStatus(elements.keyStatus, "Press one supported non-printable key. Press Escape to cancel.");
}

async function saveApiKey({ refreshModels = true } = {}) {
  if (savingKey) return { ok: false, changed: false };
  const value = elements.apiKey.value.trim();
  const normalizedApiKey = normalizeApiKey(value);
  if (value && !normalizedApiKey) {
    setTextStatus(elements.apiKeyStatus, "Enter a complete API key with no spaces.", "error");
    updateKeyControls();
    return { ok: false, changed: false };
  }

  if ((normalizedApiKey || "") === storedApiKey) {
    setTextStatus(
      elements.apiKeyStatus,
      storedApiKey ? "API key is saved on this device." : "Paste an API key to connect Gemini.",
      storedApiKey ? "success" : "",
    );
    if (refreshModels && storedApiKey && !catalogLoaded) await loadModels(false);
    return { ok: true, changed: false };
  }

  setKeySaving(true);
  try {
    if (normalizedApiKey) {
      setTextStatus(elements.apiKeyStatus, "Saving API key...");
      await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: normalizedApiKey });
      storedApiKey = normalizedApiKey;
      elements.apiKey.value = normalizedApiKey;
      maskApiKey();
      setTextStatus(elements.apiKeyStatus, "API key saved on this device.", "success");
    } else {
      setTextStatus(elements.apiKeyStatus, "Removing API key...");
      await chrome.storage.local.remove(STORAGE_KEYS.apiKey);
      storedApiKey = "";
      catalogLoaded = false;
      renderModels([], elements.aiModel.value || DEFAULTS.aiModel);
      setTextStatus(elements.modelStatus, "Add an API key to load compatible models.");
      setTextStatus(elements.apiKeyStatus, "API key removed.", "success");
    }
  } catch {
    setTextStatus(elements.apiKeyStatus, "API key could not be saved. Try again.", "error");
    return { ok: false, changed: false };
  } finally {
    setKeySaving(false);
  }
  if (normalizedApiKey && refreshModels) await loadModels(true);
  return { ok: true, changed: true };
}

async function saveSettings(event) {
  event.preventDefault();
  if (recordingKey) stopKeyRecording("Recording cancelled.");
  const keyResult = await saveApiKey({ refreshModels: false });
  if (!keyResult.ok) {
    elements.apiKey.focus();
    return;
  }
  const targetLanguage = elements.targetLanguage.value;
  const aiModel = elements.aiModel.value;

  if (!isSupportedLanguage(targetLanguage) || !isValidModelId(aiModel)) {
    setSaveStatus("Choose a valid language and model.", "error");
    return;
  }
  if (!isSupportedTriggerKey(triggerKey)) {
    setSaveStatus("Choose a supported trigger key or Off.", "error");
    return;
  }
  const selectedOption = elements.aiModel.selectedOptions[0];
  if (catalogLoaded && selectedOption?.dataset.unavailable) {
    setSaveStatus("Choose a model from the current compatible list.", "error");
    elements.aiModel.focus();
    return;
  }

  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "Saving...";
  setSaving(true);
  setSaveStatus("Saving preferences...");

  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.targetLanguage]: targetLanguage,
      [STORAGE_KEYS.aiModel]: aiModel,
      [STORAGE_KEYS.triggerKey]: normalizeTriggerKey(triggerKey),
    });

    savedPreferences = { targetLanguage, aiModel, triggerKey };
    dirty = false;
    setSaveStatus("Preferences saved.", "success");
    updateKeyControls();

    if (keyResult.changed && storedApiKey) {
      const refreshed = await loadModels(true);
      if (!refreshed) {
        setSaveStatus("Preferences and API key saved. Refresh models when Gemini is available.");
      } else if (elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
        setSaveStatus("Choose a compatible model, then save preferences.");
      }
    }
  } catch {
    setSaveStatus("Preferences could not be saved. Try again.", "error");
    elements.saveButton.disabled = false;
  } finally {
    elements.saveButton.textContent = "Save Preferences";
    setSaving(false);
    if (!dirty && elements.saveStatus.dataset.kind !== "error") elements.saveButton.disabled = true;
  }
}

function bindEvents() {
  elements.form.addEventListener("submit", saveSettings);
  elements.apiKey.addEventListener("input", (event) => {
    const matchesStored = elements.apiKey.value.trim() === storedApiKey;
    if (matchesStored) {
      setTextStatus(
        elements.apiKeyStatus,
        storedApiKey ? "API key is saved on this device." : "Paste an API key to connect Gemini.",
        storedApiKey ? "success" : "",
      );
      if (storedApiKey && !catalogLoaded) void loadModels(false);
    } else {
      const value = elements.apiKey.value.trim();
      const message = !value
        ? "The API key will be removed when you leave this field."
        : normalizeApiKey(value)
          ? "The API key will save automatically."
          : "Finish entering the API key.";
      setTextStatus(elements.apiKeyStatus, message);
      invalidateModelLoad("Finish saving the API key to load compatible models.");
    }
    updateKeyControls();
    if (event.inputType === "insertFromPaste") void saveApiKey();
  });
  elements.apiKey.addEventListener("change", () => void saveApiKey());
  elements.revealKey.addEventListener("click", () => {
    const revealing = elements.apiKey.type === "password";
    elements.apiKey.type = revealing ? "text" : "password";
    elements.revealKey.textContent = revealing ? "Hide" : "Show";
    elements.revealKey.setAttribute("aria-pressed", String(revealing));
  });
  elements.refreshModels.addEventListener("click", () => loadModels(true));
  elements.targetLanguage.addEventListener("change", () => markDirty());
  elements.aiModel.addEventListener("change", () => markDirty());
  elements.recordKey.addEventListener("click", () => recordingKey ? stopKeyRecording("Recording cancelled.") : startKeyRecording());
  elements.disableKey.addEventListener("click", () => {
    stopKeyRecording();
    triggerKey = null;
    renderTriggerKey();
    setTextStatus(elements.keyStatus, "The keyboard trigger will be Off after you save.");
    markDirty();
  });
  document.addEventListener("keydown", recordKey, true);
  window.addEventListener("blur", () => {
    if (recordingKey) stopKeyRecording("Recording cancelled.");
  });
}

async function initialize() {
  bindEvents();
  populateLanguages(DEFAULTS.targetLanguage);
  renderModels([], DEFAULTS.aiModel);
  setSaving(true);

  try {
    const [localData, syncData] = await Promise.all([
      chrome.storage.local.get([STORAGE_KEYS.apiKey]),
      chrome.storage.sync.get([
        STORAGE_KEYS.targetLanguage,
        STORAGE_KEYS.aiModel,
        STORAGE_KEYS.triggerKey,
      ]),
    ]);

    storedApiKey = typeof localData[STORAGE_KEYS.apiKey] === "string"
      ? localData[STORAGE_KEYS.apiKey]
      : "";
    elements.apiKey.value = storedApiKey;
    setTextStatus(
      elements.apiKeyStatus,
      storedApiKey ? "API key is saved on this device." : "Paste an API key to connect Gemini.",
      storedApiKey ? "success" : "",
    );

    const targetLanguage = syncData[STORAGE_KEYS.targetLanguage] ?? DEFAULTS.targetLanguage;
    const aiModel = syncData[STORAGE_KEYS.aiModel] ?? DEFAULTS.aiModel;
    triggerKey = getStoredTriggerKey(syncData);
    savedPreferences = {
      targetLanguage: isSupportedLanguage(targetLanguage) ? targetLanguage : DEFAULTS.targetLanguage,
      aiModel: isValidModelId(aiModel) ? aiModel : DEFAULTS.aiModel,
      triggerKey,
    };

    populateLanguages(targetLanguage);
    renderModels([], isValidModelId(aiModel) ? aiModel : DEFAULTS.aiModel);
    renderTriggerKey();
    updateKeyControls();

    if (storedApiKey) {
      await loadModels(false);
    } else {
      setTextStatus(elements.modelStatus, "Add an API key to load compatible models.");
    }
    setSaving(false);
    if (!dirty) setSaveStatus("Preferences are up to date.");
  } catch {
    setSaving(false);
    setSaveStatus("Settings could not be loaded. Reload the page and try again.", "error");
    elements.saveButton.disabled = false;
  }
}

initialize();
