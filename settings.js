import {
  DEFAULTS,
  LANGUAGES,
  LIMITS,
  STORAGE_KEYS,
  SUPPORTED_TRIGGER_KEYS,
  getStoredTriggerKey,
  formatTriggerKey,
  isSupportedLanguage,
  isSupportedTriggerKey,
  isValidModelId,
  normalizeApiKey,
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
  reloadSettings: document.getElementById("reloadSettings"),
  setupStatus: document.getElementById("setupStatus"),
  parallelLimits: document.getElementById("parallelLimits"),
  timeoutLimit: document.getElementById("timeoutLimit"),
};

let initialized = false;
let startupChanges = { local: {}, sync: {} };
let storedApiKey = "";
let apiKeyStatus = "missing";
let keyConflict = false;
const preferenceConflicts = new Set();
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

function currentPreferences() {
  return {
    targetLanguage: elements.targetLanguage.value,
    aiModel: elements.aiModel.value,
    triggerKey,
  };
}

function hasConflicts() {
  return keyConflict || preferenceConflicts.size > 0;
}

function markDirty(message = "Unsaved changes.") {
  dirty = elements.targetLanguage.value !== savedPreferences.targetLanguage
    || elements.aiModel.value !== savedPreferences.aiModel
    || triggerKey !== savedPreferences.triggerKey
    || elements.apiKey.value.trim() !== storedApiKey;
  elements.saveButton.disabled = !initialized || saving || savingKey || !dirty || hasConflicts();
  if (hasConflicts()) {
    setSaveStatus("Settings changed in another page. Your edits are kept here. Reload saved settings to discard your edits and use the saved values.", "error");
  } else {
    setSaveStatus(dirty ? message : "Preferences are up to date.");
  }
  elements.reloadSettings.hidden = !hasConflicts();
  renderSetupStatus();
}

function renderApiKeyStatus() {
  const status = keyConflict
    ? "The API key changed in another page. Reload saved settings before saving a key."
    : apiKeyStatus === "rejected"
      ? "Gemini rejected this saved key. Replace it or use Refresh models to check it again."
      : !storedApiKey
        ? "Paste an API key to connect Gemini."
        : apiKeyStatus === "checked"
          ? "API key saved. Gemini accepted it at the last model-list check."
          : "API key saved on this device. Refresh models to check it with Gemini.";
  setTextStatus(elements.apiKeyStatus, status, keyConflict || apiKeyStatus === "rejected" ? "error" : "");
}

function renderSetupStatus() {
  let message = "Add an API key, check the model list, and save your model choice.";
  if (hasConflicts()) message = "Resolve the settings conflict before translating.";
  else if (elements.apiKey.value.trim() !== storedApiKey) message = "Finish saving the API key before checking setup.";
  else if (apiKeyStatus === "rejected") message = "Setup needs attention: Gemini rejected the saved API key.";
  else if (storedApiKey && catalogLoaded) {
    message = elements.aiModel.selectedOptions[0]?.dataset.unavailable
      ? "Choose an available model and save preferences."
      : elements.aiModel.value !== savedPreferences.aiModel
        ? "Model selected. Save preferences to use it."
        : "Ready to try a translation. The saved model is in the checked model list; request access and quota can still change.";
  } else if (storedApiKey) message = "Key saved. Refresh models to check the key and selected model.";
  elements.setupStatus.textContent = message;
}

function renderTriggerKey() {
  elements.shortcutValue.textContent = formatTriggerKey(triggerKey);
  elements.disableKey.setAttribute("aria-pressed", String(triggerKey === null));
}

function updateKeyControls() {
  if (!initialized || saving) {
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
    || elements.apiKey.value.trim() !== storedApiKey
    || keyConflict;
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
  elements.saveButton.disabled = !initialized || saving || savingKey || !dirty || hasConflicts();
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

function normalizeModelOptions(models) {
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
  updateKeyControls();
  renderSetupStatus();
}

async function loadModels(forceRefresh) {
  if (!initialized || keyConflict || !storedApiKey || elements.apiKey.value.trim() !== storedApiKey) {
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
      if (response?.error?.code === "invalid_api_key") {
        apiKeyStatus = "rejected";
        catalogLoaded = false;
        renderApiKeyStatus();
      }
      throw new Error(response?.error?.message || "Compatible models could not be loaded.");
    }

    const models = normalizeModelOptions(response.models);
    if (!models.length) throw new Error("Gemini returned no compatible models.");
    const selectedModel = elements.aiModel.value || DEFAULTS.aiModel;
    renderModels(models, selectedModel);
    catalogLoaded = true;
    apiKeyStatus = "checked";
    renderApiKeyStatus();

    const fetchedAt = formatCatalogTime(response.fetchedAt);
    const when = fetchedAt ? ` from ${fetchedAt}` : "";
    if (elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
      setTextStatus(elements.modelStatus, "The selected model is not in the compatible list. Choose another model.", "error");
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
      renderSetupStatus();
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

function mergePreferences(values) {
  for (const name of Object.keys(savedPreferences)) {
    if (!Object.hasOwn(values, name)) continue;
    const value = name === "triggerKey" ? getStoredTriggerKey(values)
      : name === "targetLanguage" ? (isSupportedLanguage(values[name]) ? values[name] : DEFAULTS[name])
        : (isValidModelId(values[name]) ? values[name] : DEFAULTS[name]);
    const current = currentPreferences()[name];
    if (current === savedPreferences[name] || current === value) {
      if (name === "triggerKey") {
        triggerKey = value;
        renderTriggerKey();
      } else if (name === "aiModel" && !Array.from(elements.aiModel.options).some((option) => option.value === value)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${value} (Not in current list)`;
        option.dataset.unavailable = "true";
        elements.aiModel.append(option);
        elements.aiModel.value = value;
      } else elements[name].value = value;
      preferenceConflicts.delete(name);
    } else if (savedPreferences[name] !== value) preferenceConflicts.add(name);
    savedPreferences[name] = value;
  }
  markDirty();
}

function mergeApiKey(value) {
  const nextKey = typeof value === "string" ? value : "";
  if (nextKey === storedApiKey) return;
  const input = elements.apiKey.value.trim();
  keyConflict = input !== storedApiKey && input !== nextKey;
  if (!keyConflict) {
    elements.apiKey.value = nextKey;
    maskApiKey();
  }
  storedApiKey = nextKey;
  apiKeyStatus = nextKey ? "saved" : "missing";
  invalidateModelLoad(nextKey ? "Refresh models to check the saved API key." : "Add an API key to load compatible models.");
  renderApiKeyStatus();
  updateKeyControls();
  markDirty();
}

async function saveApiKey({ refreshModels = true } = {}) {
  if (!initialized || savingKey || keyConflict) return { ok: false, changed: false };
  setKeySaving(true);
  let changed = false;
  try {
    const localData = await chrome.storage.local.get(STORAGE_KEYS.apiKey);
    mergeApiKey(localData[STORAGE_KEYS.apiKey]);
    if (keyConflict) return { ok: false, changed: false };
    const value = elements.apiKey.value.trim();
    const normalizedApiKey = normalizeApiKey(value);
    if (value && !normalizedApiKey) {
      setTextStatus(elements.apiKeyStatus, "Enter a complete API key with no spaces.", "error");
      return { ok: false, changed: false };
    }
    if ((normalizedApiKey || "") !== storedApiKey) {
      setTextStatus(elements.apiKeyStatus, normalizedApiKey ? "Saving API key..." : "Removing API key...");
      if (normalizedApiKey) await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: normalizedApiKey });
      else await chrome.storage.local.remove(STORAGE_KEYS.apiKey);
      mergeApiKey(normalizedApiKey || "");
      elements.apiKey.value = normalizedApiKey || "";
      maskApiKey();
      changed = true;
    }
    renderApiKeyStatus();
  } catch {
    setTextStatus(elements.apiKeyStatus, "API key could not be read or saved. Your entry is kept. Use Save Preferences to try again.", "error");
    return { ok: false, changed: false };
  } finally {
    setKeySaving(false);
  }
  if (storedApiKey && refreshModels && (changed || !catalogLoaded)) await loadModels(changed);
  return { ok: true, changed };
}

async function saveSettings(event) {
  event.preventDefault();
  if (!initialized || saving || savingKey || hasConflicts()) return;
  if (recordingKey) stopKeyRecording("Recording cancelled.");
  setSaving(true);
  elements.saveButton.textContent = "Saving...";
  try {
    const keyResult = await saveApiKey({ refreshModels: false });
    if (!keyResult.ok) {
      elements.apiKey.focus();
      return;
    }
    const latest = await chrome.storage.sync.get(Object.keys(savedPreferences));
    mergePreferences({ ...DEFAULTS, ...latest });
    if (hasConflicts()) return;
    const values = currentPreferences();
    if (!isSupportedLanguage(values.targetLanguage) || !isValidModelId(values.aiModel)) {
      setSaveStatus("Choose a valid language and model.", "error");
      return;
    }
    if (!isSupportedTriggerKey(values.triggerKey)) {
      setSaveStatus("Choose a supported trigger key or Off.", "error");
      return;
    }
    if (catalogLoaded && elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
      setSaveStatus("Choose a model from the current compatible list.", "error");
      elements.aiModel.focus();
      return;
    }
    const changes = Object.fromEntries(Object.entries(values)
      .filter(([name, value]) => value !== savedPreferences[name]));
    if (Object.keys(changes).length) {
      setSaveStatus("Saving preferences...");
      await chrome.storage.sync.set(changes);
      mergePreferences(changes);
    }
    setSaveStatus("Preferences saved.", "success");
    if (keyResult.changed && storedApiKey) await loadModels(true);
  } catch {
    setSaveStatus("Preferences could not be read or saved. Your edits are kept. Try again.", "error");
  } finally {
    elements.saveButton.textContent = "Save Preferences";
    setSaving(false);
    elements.saveButton.disabled = !dirty || hasConflicts();
    renderSetupStatus();
  }
}

function bindEvents() {
  elements.form.addEventListener("submit", saveSettings);
  elements.reloadSettings.addEventListener("click", () => window.location.reload());
  elements.apiKey.addEventListener("input", (event) => {
    if (!initialized || keyConflict) return;
    const matchesStored = elements.apiKey.value.trim() === storedApiKey;
    if (matchesStored) {
      renderApiKeyStatus();
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
    markDirty();
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
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!initialized) {
      if (startupChanges && Object.hasOwn(startupChanges, area)) Object.assign(startupChanges[area], changes);
      return;
    }
    if (area === "sync") {
      const values = Object.fromEntries(Object.entries(changes)
        .filter(([name]) => Object.hasOwn(savedPreferences, name))
        .map(([name, change]) => [name, change.newValue]));
      if (Object.keys(values).length) mergePreferences(values);
    }
    if (area === "local" && Object.hasOwn(changes, STORAGE_KEYS.apiKey)) {
      mergeApiKey(changes[STORAGE_KEYS.apiKey].newValue);
      if (storedApiKey && !keyConflict && !savingKey) void loadModels(false);
    }
    if (area === "local" && Object.hasOwn(changes, STORAGE_KEYS.modelCatalog)
        && !Object.hasOwn(changes, STORAGE_KEYS.apiKey) && storedApiKey && !keyConflict
        && elements.apiKey.value.trim() === storedApiKey) {
      invalidateModelLoad("The model list changed. Checking compatible models...");
      // A non-forced read uses the updated cache and does not write it again.
      void loadModels(false);
    }
    if (area === "local" && Object.hasOwn(changes, STORAGE_KEYS.apiKeyStatus)) {
      const checkedKey = storedApiKey;
      const sequence = modelLoadSequence;
      void sendRuntimeMessage({ action: "getRuntimeState" }).then((state) => {
        if (!state?.ok || checkedKey !== storedApiKey || sequence !== modelLoadSequence) return;
        apiKeyStatus = state.apiKeyStatus || (storedApiKey ? "saved" : "missing");
        if (apiKeyStatus === "rejected") invalidateModelLoad("Gemini rejected the saved API key. Replace it or refresh models to check it again.");
        renderApiKeyStatus();
        renderSetupStatus();
      }).catch(() => {});
    }
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
  elements.parallelLimits.textContent = `Up to ${LIMITS.maxActivePerTab} per tab and ${LIMITS.maxActiveGlobal} in total`;
  elements.timeoutLimit.textContent = `${LIMITS.requestTimeoutMs / 1_000} seconds`;
  setSaving(true);

  try {
    const runtimeState = await sendRuntimeMessage({ action: "getRuntimeState" });
    if (!runtimeState?.ok) throw new Error("The extension could not load its saved state.");
    startupChanges = { local: {}, sync: {} };
    const [localData, syncData] = await Promise.all([
      chrome.storage.local.get([STORAGE_KEYS.apiKey]),
      chrome.storage.sync.get([
        STORAGE_KEYS.targetLanguage,
        STORAGE_KEYS.aiModel,
        STORAGE_KEYS.triggerKey,
      ]),
    ]);

    for (const [area, snapshot] of [["local", localData], ["sync", syncData]]) {
      for (const [name, change] of Object.entries(startupChanges[area])) snapshot[name] = change.newValue;
    }
    startupChanges = null;
    storedApiKey = typeof localData[STORAGE_KEYS.apiKey] === "string"
      ? localData[STORAGE_KEYS.apiKey]
      : "";
    elements.apiKey.value = storedApiKey;
    apiKeyStatus = runtimeState.apiKeyStatus || (storedApiKey ? "saved" : "missing");
    renderApiKeyStatus();

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
    initialized = true;
    updateKeyControls();
    markDirty();

    if (storedApiKey) {
      await loadModels(false);
    } else {
      apiKeyStatus = "missing";
      renderApiKeyStatus();
      setTextStatus(elements.modelStatus, "Add an API key to load compatible models.");
    }
    setSaving(false);
    renderSetupStatus();
    if (!dirty) setSaveStatus("Preferences are up to date.");
  } catch {
    initialized = false;
    startupChanges = null;
    setSaving(false);
    setSaveStatus("Settings could not be loaded. Reload saved settings to try again. Saving is disabled to protect your saved choices.", "error");
    elements.reloadSettings.hidden = false;
    elements.saveButton.disabled = true;
    elements.setupStatus.textContent = "Setup state could not be loaded.";
  }
}

initialize();
