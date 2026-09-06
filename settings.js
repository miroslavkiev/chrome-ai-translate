import {
  DEFAULTS,
  LANGUAGES,
  LIMITS,
  RECOMMENDED_MODEL,
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
  removeKey: document.getElementById("removeKey"),
  agreeDataSharing: document.getElementById("agreeDataSharing"),
  withdrawDataSharing: document.getElementById("withdrawDataSharing"),
  agreementStatus: document.getElementById("agreementStatus"),
  apiKeyStatus: document.getElementById("apiKeyStatus"),
  aiModel: document.getElementById("aiModel"),
  refreshModels: document.getElementById("refreshModels"),
  recommendedModel: document.getElementById("recommendedModel"),
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
  setupGuide: document.getElementById("setupGuide"),
  setupKeyStep: document.getElementById("setupKeyStep"),
  setupLanguageStep: document.getElementById("setupLanguageStep"),
  parallelLimits: document.getElementById("parallelLimits"),
  timeoutLimit: document.getElementById("timeoutLimit"),
};

let initialized = false;
let startupChanges = { local: {}, sync: {} };
let storedApiKey = "";
let credentialRevision = null;
let dataSharingAccepted = false;
let savingAgreement = false;
let withdrawalFailed = false;
let agreementChangeVersion = 0;
let damagedKey = false;
let settingsReadSequence = 0;
let settingsChangeVersion = 0;
let pendingSettingsRefresh = false;
let apiKeyStatus = "missing";
let keyConflict = false;
const preferenceConflicts = new Set();
let triggerKey = DEFAULTS.triggerKey;
let recordingKey = false;
let catalogLoaded = false;
let dirty = false;
let saving = false;
let savingKey = false;
let setupGuideVisible = false;
let modelLoadSequence = 0;
let savedPreferences = {
  targetLanguage: DEFAULTS.targetLanguage,
  aiModel: DEFAULTS.aiModel,
  triggerKey: DEFAULTS.triggerKey,
};

const mutableControls = [
  elements.apiKey,
  elements.revealKey,
  elements.removeKey,
  elements.agreeDataSharing,
  elements.withdrawDataSharing,
  elements.aiModel,
  elements.refreshModels,
  elements.recommendedModel,
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

function preferencesAreDirty() {
  return Object.entries(currentPreferences()).some(([name, value]) => value !== savedPreferences[name]);
}

function updateSaveButton() {
  const canFinish = setupGuideVisible && dataSharingAccepted && storedApiKey && isSupportedLanguage(elements.targetLanguage.value);
  elements.saveButton.disabled = !initialized || saving || savingKey || savingAgreement || (!dirty && !canFinish) || hasConflicts();
}

function markDirty(message = "Unsaved changes.") {
  dirty = preferencesAreDirty() || elements.apiKey.value.trim() !== storedApiKey;
  updateSaveButton();
  if (hasConflicts()) {
    setSaveStatus("Settings changed in another page. Your edits are kept here. Reload saved settings to discard your edits and use the saved values.", "error");
  } else {
    setSaveStatus(dirty ? message : "Preferences are up to date.");
  }
  elements.reloadSettings.hidden = !hasConflicts();
  renderSetupStatus();
}

function renderApiKeyStatus() {
  const status = damagedKey
    ? "Saved key cannot be opened. Try reopening Settings, or remove it and enter it again."
    : keyConflict
    ? "The API key changed in another page. Reload saved settings before saving a key."
    : !dataSharingAccepted
      ? storedApiKey ? "Your key is saved encrypted. Agree to data sharing before connecting to Google." : "Agree to data sharing above before adding your API key."
    : apiKeyStatus === "rejected"
      ? "Gemini rejected this saved key. Replace it or use Refresh models to check it again."
      : !storedApiKey
        ? "Paste an API key to connect Gemini."
        : apiKeyStatus === "checked"
          ? "API key saved. Gemini accepted it at the last model-list check."
          : "API key saved encrypted on this device. Refresh models to check it with Gemini.";
  setTextStatus(elements.apiKeyStatus, status, damagedKey || keyConflict || apiKeyStatus === "rejected" ? "error" : "");
}

function renderAgreement() {
  elements.agreeDataSharing.hidden = dataSharingAccepted || withdrawalFailed;
  elements.withdrawDataSharing.hidden = !dataSharingAccepted && !withdrawalFailed;
  elements.withdrawDataSharing.textContent = withdrawalFailed ? "Retry withdrawal" : "Withdraw data agreement";
  if (withdrawalFailed) {
    setTextStatus(elements.agreementStatus, "Your withdrawal is not confirmed. Retry withdrawal to save your choice.", "error");
    return;
  }
  setTextStatus(elements.agreementStatus, dataSharingAccepted
    ? "Data sharing agreed for this Chrome profile. You can withdraw at any time."
    : "No connection to Google until you agree. Your saved key is kept if you withdraw.");
}

function renderSetupStatus() {
  if (initialized && (!dataSharingAccepted || !storedApiKey || !savedPreferences.targetLanguage)) setupGuideVisible = true;
  elements.setupGuide.hidden = !setupGuideVisible;
  elements.setupKeyStep.textContent = apiKeyStatus === "rejected"
    ? "Gemini rejected the saved key. Replace it below."
    : storedApiKey ? "Your key is saved encrypted on this device." : "Create your own key in Google AI Studio.";
  elements.setupLanguageStep.textContent = isSupportedLanguage(elements.targetLanguage.value)
    ? "Language selected. Finish setup to save your choices."
    : "Choose a target language below.";
  if (!saving) elements.saveButton.textContent = setupGuideVisible ? "Finish setup" : "Save Preferences";
  let message = "Add an API key, check the model list, and save your model choice.";
  if (hasConflicts()) message = "Resolve the settings conflict before translating.";
  else if (!dataSharingAccepted) message = "Review data sharing and agree before connecting to Google.";
  else if (elements.apiKey.value.trim() !== storedApiKey) message = "Finish saving the API key before checking setup.";
  else if (apiKeyStatus === "rejected") message = "Setup needs attention: Gemini rejected the saved API key.";
  else if (storedApiKey && !isSupportedLanguage(elements.targetLanguage.value)) message = "Key saved. Choose a target language, then finish setup.";
  else if (storedApiKey && catalogLoaded) {
    message = elements.aiModel.selectedOptions[0]?.dataset.unavailable
      ? "Choose an available model and save preferences."
      : elements.aiModel.value !== savedPreferences.aiModel
        ? "Model selected. Save preferences to use it."
        : setupGuideVisible
          ? "Key and language are ready. Finish setup to save your choices, then try a translation. Model access and quota can still change."
          : "Ready to try a translation. The saved model is in the checked model list; request access and quota can still change.";
  } else if (storedApiKey) message = "Key saved. Refresh models to check the key and selected model.";
  elements.setupStatus.textContent = message;
  updateSaveButton();
}

function renderTriggerKey() {
  elements.shortcutValue.textContent = formatTriggerKey(triggerKey);
  elements.disableKey.setAttribute("aria-pressed", String(triggerKey === null));
}

function updateKeyControls() {
  if (!initialized || saving || savingAgreement) {
    for (const control of mutableControls) control.disabled = true;
    elements.withdrawDataSharing.disabled = !initialized || (!dataSharingAccepted && !withdrawalFailed) || savingAgreement;
    elements.removeKey.hidden = !damagedKey && !storedApiKey;
    elements.removeKey.disabled = !damagedKey || savingKey || keyConflict;
    return;
  }
  elements.apiKey.disabled = false;
  elements.aiModel.disabled = false;
  elements.targetLanguage.disabled = false;
  elements.recordKey.disabled = false;
  elements.disableKey.disabled = false;
  const hasInput = Boolean(elements.apiKey.value);
  elements.apiKey.disabled = savingKey || !dataSharingAccepted;
  elements.revealKey.disabled = savingKey || !hasInput;
  elements.removeKey.hidden = !storedApiKey;
  elements.removeKey.disabled = savingKey || !storedApiKey || keyConflict;
  elements.agreeDataSharing.disabled = savingKey;
  elements.withdrawDataSharing.disabled = false;
  elements.refreshModels.disabled = savingKey
    || !dataSharingAccepted
    || !storedApiKey
    || elements.apiKey.value.trim() !== storedApiKey
    || keyConflict;
  elements.recommendedModel.disabled = elements.refreshModels.disabled || !catalogLoaded
    || !Array.from(elements.aiModel.options).some((option) => option.value === RECOMMENDED_MODEL && !option.dataset.unavailable);
}

function setSaving(value) {
  saving = value;
  elements.form.setAttribute("aria-busy", String(value));
  if (value) {
    for (const control of mutableControls) control.disabled = true;
    elements.withdrawDataSharing.disabled = !initialized || (!dataSharingAccepted && !withdrawalFailed) || savingAgreement;
    elements.saveButton.disabled = true;
  } else {
    updateKeyControls();
  }
}

function setKeySaving(value) {
  savingKey = value;
  elements.apiKey.setAttribute("aria-busy", String(value));
  updateKeyControls();
  updateSaveButton();
}

function maskApiKey() {
  elements.apiKey.type = "password";
  elements.revealKey.textContent = "Show";
  elements.revealKey.setAttribute("aria-pressed", "false");
}

function populateLanguages(selectedCode) {
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a target language";
  placeholder.disabled = true;
  fragment.append(placeholder);
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.name;
    fragment.append(option);
  }
  elements.targetLanguage.replaceChildren(fragment);
  elements.targetLanguage.value = languageSelection(selectedCode);
}

function languageSelection(value) {
  return isSupportedLanguage(value) ? value : "";
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
    unavailable.textContent = `${selectedModel} (${models.length ? "Not in current list" : "Not checked yet"})`;
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
  if (!initialized || !dataSharingAccepted || keyConflict || !storedApiKey || elements.apiKey.value.trim() !== storedApiKey) {
    setTextStatus(elements.modelStatus, !dataSharingAccepted ? "Agree to data sharing before loading models." : "Finish saving the API key before refreshing models.");
    return false;
  }

  elements.refreshModels.disabled = true;
  elements.recommendedModel.disabled = true;
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
      : name === "targetLanguage" ? languageSelection(values[name])
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

function requireSettingsState(response) {
  if (response?.ok) return response;
  const error = new Error(response?.error?.message || "The extension could not load its saved state.");
  error.code = response?.error?.code;
  error.canRemoveKey = response?.canRemoveKey === true;
  throw error;
}

function mergeSettingsState(state, { applyApiKeyStatus = true, applyAgreement = true } = {}) {
  if (state.dataSharingWithdrawalPending === true) withdrawalFailed = true;
  const nextAgreement = applyAgreement ? state.dataSharingAccepted === true : dataSharingAccepted;
  const agreementChanged = dataSharingAccepted !== nextAgreement;
  const nextRevision = state.credentialRevision ?? null;
  const nextKey = typeof state.apiKey === "string" ? state.apiKey : "";
  const input = elements.apiKey.value.trim();
  if (nextRevision !== credentialRevision && input !== storedApiKey && input !== nextKey) keyConflict = true;
  credentialRevision = nextRevision;
  dataSharingAccepted = nextAgreement;
  mergeApiKey(state.apiKey);
  if (agreementChanged && dataSharingAccepted && state.configured && !preferencesAreDirty()
      && elements.apiKey.value.trim() === storedApiKey && !hasConflicts()) setupGuideVisible = false;
  if (applyApiKeyStatus) apiKeyStatus = state.apiKeyStatus || (storedApiKey ? "saved" : "missing");
  if (agreementChanged || !dataSharingAccepted) {
    invalidateModelLoad(dataSharingAccepted ? "Refresh models to check the saved API key." : "Agree to data sharing before loading models.");
  }
  if (apiKeyStatus === "rejected") invalidateModelLoad("Gemini rejected the saved API key. Replace it or refresh models to check it again.");
  renderAgreement();
  renderApiKeyStatus();
  updateKeyControls();
  markDirty();
}

async function readSettingsState() {
  const sequence = ++settingsReadSequence;
  const modelSequence = modelLoadSequence;
  const response = await sendRuntimeMessage({ action: "getSettingsState" });
  if (sequence !== settingsReadSequence) return null;
  const state = requireSettingsState(response);
  mergeSettingsState(state, { applyApiKeyStatus: modelSequence === modelLoadSequence });
  return state;
}

function showSettingsFailure(error) {
  initialized = false;
  damagedKey = error?.canRemoveKey === true;
  invalidateModelLoad("Settings could not be loaded. Reopen Settings to try again.");
  updateKeyControls();
  renderApiKeyStatus();
  setSaveStatus("Settings could not be loaded. Reload saved settings to try again. Saving is disabled to protect your saved choices.", "error");
  elements.reloadSettings.hidden = false;
  elements.saveButton.disabled = true;
  elements.setupStatus.textContent = "Setup state could not be loaded.";
}

async function refreshSettings({ preferences = false, models = false } = {}) {
  if (!initialized) return;
  if (savingKey || savingAgreement) {
    pendingSettingsRefresh = true;
    return;
  }
  try {
    const state = await readSettingsState();
    if (!state) return;
    if (preferences) mergePreferences({ ...DEFAULTS, ...await chrome.storage.sync.get(Object.keys(savedPreferences)) });
    if (models && dataSharingAccepted && storedApiKey && !keyConflict && !catalogLoaded) await loadModels(false);
  } catch (error) {
    showSettingsFailure(error);
  }
}

function refreshAfterMutation() {
  if (!pendingSettingsRefresh) return;
  pendingSettingsRefresh = false;
  void refreshSettings();
}

async function saveApiKey({ refreshModels = true } = {}) {
  if (!initialized || savingKey || keyConflict) return { ok: false, changed: false };
  setKeySaving(true);
  let changed = false;
  try {
    if (!await readSettingsState()) return { ok: false, changed: false };
    if (keyConflict) return { ok: false, changed: false };
    const value = elements.apiKey.value.trim();
    const normalizedApiKey = normalizeApiKey(value);
    if (value && !normalizedApiKey) {
      setTextStatus(elements.apiKeyStatus, "Enter a complete API key with no spaces.", "error");
      return { ok: false, changed: false };
    }
    if ((normalizedApiKey || "") !== storedApiKey) {
      if (!normalizedApiKey) {
        setTextStatus(elements.apiKeyStatus, "Use Remove saved key to delete your saved key.");
        return { ok: false, changed: false };
      }
      if (!dataSharingAccepted) {
        setTextStatus(elements.apiKeyStatus, "Agree to data sharing above before saving an API key.", "error");
        return { ok: false, changed: false };
      }
      setTextStatus(elements.apiKeyStatus, "Saving API key encrypted...");
      settingsReadSequence += 1;
      const agreementVersion = agreementChangeVersion;
      const state = requireSettingsState(await sendRuntimeMessage({ action: "setApiKey", apiKey: normalizedApiKey, expectedRevision: credentialRevision }));
      mergeSettingsState(state, { applyAgreement: agreementVersion === agreementChangeVersion });
      elements.apiKey.value = normalizedApiKey;
      maskApiKey();
      changed = true;
    }
    renderApiKeyStatus();
  } catch (error) {
    if (error?.canRemoveKey) {
      showSettingsFailure(error);
    } else if (error?.code === "credential_conflict") {
      await readSettingsState().catch(showSettingsFailure);
      keyConflict = true;
      markDirty();
      renderApiKeyStatus();
    } else {
      setTextStatus(elements.apiKeyStatus, "API key could not be read or saved. Your entry is kept. Use Save Preferences to try again.", "error");
    }
    return { ok: false, changed: false };
  } finally {
    setKeySaving(false);
    refreshAfterMutation();
  }
  if (dataSharingAccepted && storedApiKey && refreshModels && (changed || !catalogLoaded)) await loadModels(changed);
  return { ok: true, changed };
}

async function changeDataSharing(accepted) {
  if (!initialized || savingAgreement || (accepted && (saving || savingKey))) return;
  savingAgreement = true;
  agreementChangeVersion += 1;
  if (!accepted) dataSharingAccepted = false;
  settingsReadSequence += 1;
  invalidateModelLoad(accepted ? "Connecting to Google..." : "Stopping connections to Google...");
  updateKeyControls();
  updateSaveButton();
  try {
    const state = requireSettingsState(await sendRuntimeMessage({ action: "setDataSharing", accepted }));
    withdrawalFailed = false;
    mergeSettingsState(state);
  } catch (error) {
    if (!accepted) withdrawalFailed = true;
    await readSettingsState().catch(showSettingsFailure);
    if (withdrawalFailed) renderAgreement();
    else setTextStatus(elements.agreementStatus, error?.message || "Your data agreement could not be saved. Try again.", "error");
  } finally {
    savingAgreement = false;
    updateKeyControls();
    updateSaveButton();
    refreshAfterMutation();
  }
  if (dataSharingAccepted && !storedApiKey) elements.apiKey.focus();
  if (accepted && dataSharingAccepted && storedApiKey && !keyConflict) await loadModels(false);
}

async function removeApiKey() {
  if (saving || savingKey || savingAgreement || keyConflict || (!initialized && !damagedKey) || (!storedApiKey && !damagedKey)) return;
  const resettingDamagedKey = damagedKey;
  setKeySaving(true);
  settingsReadSequence += 1;
  invalidateModelLoad("Removing saved key...");
  try {
    const response = await sendRuntimeMessage(resettingDamagedKey
      ? { action: "resetDamagedKey" }
      : { action: "setApiKey", apiKey: null, expectedRevision: credentialRevision });
    const state = requireSettingsState(response);
    if (resettingDamagedKey) {
      window.location.reload();
      return;
    }
    elements.apiKey.value = storedApiKey;
    mergeSettingsState(state);
    setTextStatus(elements.apiKeyStatus, "Saved key removed. You can add a new key after agreeing to data sharing.");
  } catch (error) {
    if (error?.code === "credential_conflict") {
      if (initialized) await readSettingsState().catch(showSettingsFailure);
      keyConflict = true;
      elements.reloadSettings.hidden = false;
    }
    setTextStatus(elements.apiKeyStatus, error?.message || "The saved key could not be removed. Try again.", "error");
  } finally {
    setKeySaving(false);
    refreshAfterMutation();
  }
}

async function saveSettings(event) {
  event.preventDefault();
  if (!initialized || saving || savingKey || savingAgreement || hasConflicts()) return;
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
    if (storedApiKey && dataSharingAccepted) setupGuideVisible = false;
    setSaveStatus(storedApiKey ? "Preferences saved." : "Preferences saved. Add your API key to finish setup.", "success");
    if (keyResult.changed && storedApiKey) await loadModels(true);
  } catch {
    setSaveStatus("Preferences could not be read or saved. Your edits are kept. Try again.", "error");
  } finally {
    elements.saveButton.textContent = "Save Preferences";
    setSaving(false);
    updateSaveButton();
    renderSetupStatus();
  }
}

function bindEvents() {
  elements.form.addEventListener("submit", saveSettings);
  elements.reloadSettings.addEventListener("click", () => window.location.reload());
  elements.agreeDataSharing.addEventListener("click", () => changeDataSharing(true));
  elements.withdrawDataSharing.addEventListener("click", () => changeDataSharing(false));
  elements.removeKey.addEventListener("click", removeApiKey);
  elements.apiKey.addEventListener("input", (event) => {
    if (!initialized || !dataSharingAccepted || savingKey || keyConflict) return;
    const matchesStored = elements.apiKey.value.trim() === storedApiKey;
    if (matchesStored) {
      renderApiKeyStatus();
      if (storedApiKey && !catalogLoaded) void loadModels(false);
    } else {
      const value = elements.apiKey.value.trim();
      const message = !value
        ? "Use Remove saved key to delete your saved key."
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
  elements.apiKey.addEventListener("blur", (event) => {
    if (elements.apiKey.value.trim() === storedApiKey) return;
    if ([elements.revealKey, elements.saveButton, elements.withdrawDataSharing, elements.removeKey].includes(event.relatedTarget)) return;
    if (dataSharingAccepted) return saveApiKey();
  });
  elements.revealKey.addEventListener("click", () => {
    const revealing = elements.apiKey.type === "password";
    elements.apiKey.type = revealing ? "text" : "password";
    elements.revealKey.textContent = revealing ? "Hide" : "Show";
    elements.revealKey.setAttribute("aria-pressed", String(revealing));
  });
  elements.refreshModels.addEventListener("click", () => loadModels(true));
  elements.recommendedModel.addEventListener("click", () => {
    if (elements.recommendedModel.disabled) return;
    elements.aiModel.value = RECOMMENDED_MODEL;
    markDirty("Recommended model selected. Save your choice to use it.");
  });
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
    const credentialChanged = area === "local" && [STORAGE_KEYS.credentialVersion, STORAGE_KEYS.dataSharingAgreement]
      .some((name) => Object.hasOwn(changes, name));
    if (credentialChanged) settingsChangeVersion += 1;
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
    if (credentialChanged) {
      if (Object.hasOwn(changes, STORAGE_KEYS.dataSharingAgreement)) {
        agreementChangeVersion += 1;
        dataSharingAccepted = false;
      }
      invalidateModelLoad("Connection settings changed. Checking saved settings...");
      void refreshSettings({ models: true });
    }
    if (area === "local" && Object.hasOwn(changes, STORAGE_KEYS.modelCatalog)
        && !credentialChanged && dataSharingAccepted && storedApiKey && !keyConflict && !savingKey && !savingAgreement
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
        if (!dataSharingAccepted) return;
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
    maskApiKey();
  });
  window.addEventListener("focus", () => void refreshSettings({ preferences: true, models: true }));
}

async function initialize() {
  bindEvents();
  populateLanguages(DEFAULTS.targetLanguage);
  renderModels([], DEFAULTS.aiModel);
  elements.parallelLimits.textContent = `Up to ${LIMITS.maxActivePerTab} per tab and ${LIMITS.maxActiveGlobal} in total`;
  elements.timeoutLimit.textContent = `${LIMITS.requestTimeoutMs / 1_000} seconds`;
  setSaving(true);

  try {
    let changeVersion = settingsChangeVersion;
    let runtimeState = requireSettingsState(await sendRuntimeMessage({ action: "getSettingsState" }));
    const syncData = await chrome.storage.sync.get([
        STORAGE_KEYS.targetLanguage,
        STORAGE_KEYS.aiModel,
        STORAGE_KEYS.triggerKey,
      ]);

    while (changeVersion !== settingsChangeVersion) {
      changeVersion = settingsChangeVersion;
      runtimeState = requireSettingsState(await sendRuntimeMessage({ action: "getSettingsState" }));
    }
    for (const [name, change] of Object.entries(startupChanges.sync)) syncData[name] = change.newValue;
    startupChanges = null;
    storedApiKey = typeof runtimeState.apiKey === "string"
      ? runtimeState.apiKey
      : "";
    credentialRevision = runtimeState.credentialRevision ?? null;
    dataSharingAccepted = runtimeState.dataSharingAccepted === true;
    withdrawalFailed = runtimeState.dataSharingWithdrawalPending === true;
    elements.apiKey.value = storedApiKey;
    apiKeyStatus = runtimeState.apiKeyStatus || (storedApiKey ? "saved" : "missing");
    renderApiKeyStatus();
    renderAgreement();

    const targetLanguage = Object.hasOwn(syncData, STORAGE_KEYS.targetLanguage)
      ? syncData[STORAGE_KEYS.targetLanguage] : DEFAULTS.targetLanguage;
    const aiModel = syncData[STORAGE_KEYS.aiModel] ?? DEFAULTS.aiModel;
    triggerKey = getStoredTriggerKey(syncData);
    savedPreferences = {
      targetLanguage: languageSelection(targetLanguage),
      aiModel: isValidModelId(aiModel) ? aiModel : DEFAULTS.aiModel,
      triggerKey,
    };
    setupGuideVisible = !dataSharingAccepted || !storedApiKey || !savedPreferences.targetLanguage;

    populateLanguages(targetLanguage);
    renderModels([], isValidModelId(aiModel) ? aiModel : DEFAULTS.aiModel);
    renderTriggerKey();
    initialized = true;
    updateKeyControls();
    markDirty();

    if (storedApiKey && dataSharingAccepted) {
      await loadModels(false);
    } else {
      renderApiKeyStatus();
      setTextStatus(elements.modelStatus, dataSharingAccepted ? "Add an API key to load compatible models." : "Agree to data sharing before loading models.");
    }
    setSaving(false);
    renderSetupStatus();
    if (!dirty) setSaveStatus("Preferences are up to date.");
  } catch (error) {
    startupChanges = null;
    setSaving(false);
    showSettingsFailure(error);
  }
}

initialize();
