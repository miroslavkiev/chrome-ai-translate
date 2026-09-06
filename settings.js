import {
  t,
  localizeDocument,
  uiLocale,
  languageDisplayName,
  preferredTargetLanguage,
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

localizeDocument();

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
  refreshPagesDialog: document.getElementById("refreshPagesDialog"),
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

function markDirty(message = t("runtime_unsaved_changes")) {
  dirty = preferencesAreDirty() || elements.apiKey.value.trim() !== storedApiKey;
  updateSaveButton();
  if (hasConflicts()) {
    setSaveStatus(t("runtime_settings_conflict"), "error");
  } else {
    setSaveStatus(dirty ? message : t("runtime_preferences_current"));
  }
  elements.reloadSettings.hidden = !hasConflicts();
  renderSetupStatus();
}

function renderApiKeyStatus() {
  const status = damagedKey
    ? t("runtime_key_cannot_open")
    : keyConflict
    ? t("runtime_key_conflict")
    : !dataSharingAccepted
      ? storedApiKey ? t("runtime_saved_key_needs_agreement") : t("runtime_key_entry_needs_agreement")
    : apiKeyStatus === "rejected"
      ? t("runtime_key_rejected_refresh")
      : !storedApiKey
        ? t("runtime_paste_key")
        : apiKeyStatus === "checked"
          ? t("runtime_key_checked")
          : t("runtime_key_saved_check");
  setTextStatus(elements.apiKeyStatus, status, damagedKey || keyConflict || apiKeyStatus === "rejected" ? "error" : "");
}

function renderAgreement() {
  elements.agreeDataSharing.hidden = dataSharingAccepted || withdrawalFailed;
  elements.withdrawDataSharing.hidden = !dataSharingAccepted && !withdrawalFailed;
  elements.withdrawDataSharing.textContent = withdrawalFailed ? t("runtime_retry_withdrawal") : t("runtime_withdraw_agreement");
  if (withdrawalFailed) {
    setTextStatus(elements.agreementStatus, t("runtime_withdrawal_unconfirmed"), "error");
    return;
  }
  setTextStatus(elements.agreementStatus, dataSharingAccepted
    ? t("runtime_agreement_saved")
    : t("runtime_agreement_not_saved"));
}

function renderSetupStatus() {
  if (initialized && (!dataSharingAccepted || !storedApiKey || !savedPreferences.targetLanguage)) setupGuideVisible = true;
  elements.setupGuide.hidden = !setupGuideVisible;
  elements.setupKeyStep.textContent = apiKeyStatus === "rejected"
    ? t("runtime_setup_key_rejected")
    : storedApiKey ? t("runtime_setup_key_saved") : t("runtime_setup_create_key");
  elements.setupLanguageStep.textContent = isSupportedLanguage(elements.targetLanguage.value)
    ? t("runtime_setup_language_selected")
    : t("runtime_setup_choose_language");
  if (!saving) elements.saveButton.textContent = setupGuideVisible ? t("runtime_finish_setup") : t("runtime_save_preferences");
  let message = t("runtime_setup_add_key_model");
  if (hasConflicts()) message = t("runtime_setup_resolve_conflict");
  else if (!dataSharingAccepted) message = t("runtime_setup_agreement_required");
  else if (elements.apiKey.value.trim() !== storedApiKey) message = t("runtime_setup_finish_key_save");
  else if (apiKeyStatus === "rejected") message = t("runtime_setup_key_needs_attention");
  else if (storedApiKey && !isSupportedLanguage(elements.targetLanguage.value)) message = t("runtime_setup_saved_choose_language");
  else if (storedApiKey && catalogLoaded) {
    message = elements.aiModel.selectedOptions[0]?.dataset.unavailable
      ? t("runtime_setup_choose_available_model")
      : elements.aiModel.value !== savedPreferences.aiModel
        ? t("runtime_setup_model_selected")
        : setupGuideVisible
          ? t("runtime_setup_ready_finish")
          : t("runtime_setup_ready_translate");
  } else if (storedApiKey) message = t("runtime_setup_refresh_models");
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
  elements.revealKey.textContent = t("runtime_show_key");
  elements.revealKey.setAttribute("aria-pressed", "false");
}

function populateLanguages(selectedCode) {
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("runtime_choose_target_language");
  placeholder.disabled = true;
  fragment.append(placeholder);
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = languageDisplayName(language.code);
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
    unavailable.textContent = models.length ? t("runtime_model_unlisted", [selectedModel]) : t("runtime_model_unchecked", [selectedModel]);
    unavailable.dataset.unavailable = "true";
    fragment.append(unavailable);
  }
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.displayName === model.id
      ? model.id
      : t("runtime_model_label", [model.displayName, model.id]);
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
  return new Intl.DateTimeFormat(uiLocale(), {
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
          reject(new Error(t("runtime_background_no_response")));
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
  elements.refreshModels.textContent = t("runtime_refresh_models");
  setTextStatus(elements.modelStatus, message);
  updateKeyControls();
  renderSetupStatus();
}

async function loadModels(forceRefresh) {
  if (!initialized || !dataSharingAccepted || keyConflict || !storedApiKey || elements.apiKey.value.trim() !== storedApiKey) {
    setTextStatus(elements.modelStatus, !dataSharingAccepted ? t("runtime_models_need_agreement") : t("runtime_models_finish_key_save"));
    return false;
  }

  elements.refreshModels.disabled = true;
  elements.recommendedModel.disabled = true;
  elements.refreshModels.textContent = forceRefresh ? t("runtime_refreshing") : t("runtime_loading");
  const sequence = ++modelLoadSequence;
  setTextStatus(elements.modelStatus, forceRefresh
    ? t("runtime_models_checking")
    : t("runtime_models_loading"));

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
      throw new Error(response?.error?.message || t("runtime_models_load_failed"));
    }

    const models = normalizeModelOptions(response.models);
    if (!models.length) throw new Error(t("runtime_models_empty"));
    const selectedModel = elements.aiModel.value || DEFAULTS.aiModel;
    renderModels(models, selectedModel);
    catalogLoaded = true;
    apiKeyStatus = "checked";
    renderApiKeyStatus();

    const fetchedAt = formatCatalogTime(response.fetchedAt);
    if (elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
      setTextStatus(elements.modelStatus, t("runtime_model_not_available"), "error");
    } else if (response.source === "cache") {
      const message = response.stale
        ? fetchedAt ? t("runtime_models_cache_stale_at", [fetchedAt]) : t("runtime_models_cache_stale")
        : fetchedAt ? t("runtime_models_cache_at", [fetchedAt]) : t("runtime_models_cache");
      setTextStatus(elements.modelStatus, message);
    } else {
      setTextStatus(elements.modelStatus, fetchedAt ? t("runtime_models_updated_at", [fetchedAt]) : t("runtime_models_updated"), "success");
    }
    return true;
  } catch (error) {
    if (sequence !== modelLoadSequence) return false;
    const message = error instanceof Error ? error.message : t("runtime_models_load_failed");
    setTextStatus(elements.modelStatus, message, "error");
    return false;
  } finally {
    if (sequence === modelLoadSequence) {
      elements.refreshModels.textContent = t("runtime_refresh_models");
      updateKeyControls();
      renderSetupStatus();
    }
  }
}

function stopKeyRecording(message = "") {
  recordingKey = false;
  elements.recordKey.classList.remove("recording");
  elements.recordKey.textContent = t("runtime_record_key");
  elements.recordKey.setAttribute("aria-pressed", "false");
  if (message) setTextStatus(elements.keyStatus, message);
}

function recordKey(event) {
  if (!recordingKey || event.isComposing || event.repeat) return;
  if (event.key === "Tab") {
    stopKeyRecording(t("runtime_recording_cancelled"));
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopKeyRecording(t("runtime_recording_cancelled"));
    return;
  }
  if (!SUPPORTED_TRIGGER_KEYS.includes(event.key)) {
    setTextStatus(elements.keyStatus, t("runtime_key_not_supported", [event.key || t("runtime_unknown_key")]), "error");
    return;
  }
  triggerKey = event.key;
  renderTriggerKey();
  stopKeyRecording(t("runtime_key_will_use", [formatTriggerKey(triggerKey)]));
  markDirty();
}

function startKeyRecording() {
  recordingKey = true;
  elements.recordKey.classList.add("recording");
  elements.recordKey.textContent = t("runtime_press_key");
  elements.recordKey.setAttribute("aria-pressed", "true");
  setTextStatus(elements.keyStatus, t("runtime_record_key_instruction"));
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
        option.textContent = t("runtime_model_unlisted", [value]);
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
  invalidateModelLoad(nextKey ? t("runtime_refresh_saved_key") : t("runtime_models_add_key"));
  renderApiKeyStatus();
  updateKeyControls();
  markDirty();
}

function requireSettingsState(response) {
  if (response?.ok) return response;
  const error = new Error(response?.error?.message || t("runtime_saved_state_unavailable"));
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
    invalidateModelLoad(dataSharingAccepted ? t("runtime_refresh_saved_key") : t("runtime_models_need_agreement"));
  }
  if (apiKeyStatus === "rejected") invalidateModelLoad(t("runtime_saved_key_rejected"));
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
  invalidateModelLoad(t("runtime_settings_reopen"));
  updateKeyControls();
  renderApiKeyStatus();
  setSaveStatus(t("runtime_settings_load_failed"), "error");
  elements.reloadSettings.hidden = false;
  elements.saveButton.disabled = true;
  elements.setupStatus.textContent = t("runtime_setup_load_failed");
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
  let firstKeySaved = false;
  try {
    if (!await readSettingsState()) return { ok: false, changed: false };
    if (keyConflict) return { ok: false, changed: false };
    const value = elements.apiKey.value.trim();
    const normalizedApiKey = normalizeApiKey(value);
    if (value && !normalizedApiKey) {
      setTextStatus(elements.apiKeyStatus, t("runtime_key_no_spaces"), "error");
      return { ok: false, changed: false };
    }
    if ((normalizedApiKey || "") !== storedApiKey) {
      if (!normalizedApiKey) {
        setTextStatus(elements.apiKeyStatus, t("runtime_key_use_remove"));
        return { ok: false, changed: false };
      }
      if (!dataSharingAccepted) {
        setTextStatus(elements.apiKeyStatus, t("runtime_key_save_needs_agreement"), "error");
        return { ok: false, changed: false };
      }
      setTextStatus(elements.apiKeyStatus, t("runtime_key_saving_encrypted"));
      settingsReadSequence += 1;
      const agreementVersion = agreementChangeVersion;
      const isFirstKey = !storedApiKey && credentialRevision === null;
      const state = requireSettingsState(await sendRuntimeMessage({ action: "setApiKey", apiKey: normalizedApiKey, expectedRevision: credentialRevision }));
      mergeSettingsState(state, { applyAgreement: agreementVersion === agreementChangeVersion });
      elements.apiKey.value = normalizedApiKey;
      maskApiKey();
      changed = true;
      firstKeySaved = isFirstKey;
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
      setTextStatus(elements.apiKeyStatus, t("runtime_key_save_failed"), "error");
    }
    return { ok: false, changed: false };
  } finally {
    setKeySaving(false);
    refreshAfterMutation();
  }
  if (firstKeySaved) elements.refreshPagesDialog.showModal();
  if (dataSharingAccepted && storedApiKey && refreshModels && (changed || !catalogLoaded)) await loadModels(changed);
  return { ok: true, changed };
}

async function changeDataSharing(accepted) {
  if (!initialized || savingAgreement || (accepted && (saving || savingKey))) return;
  savingAgreement = true;
  agreementChangeVersion += 1;
  if (!accepted) dataSharingAccepted = false;
  settingsReadSequence += 1;
  invalidateModelLoad(accepted ? t("runtime_connecting_google") : t("runtime_stopping_google"));
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
    else setTextStatus(elements.agreementStatus, error?.message || t("runtime_agreement_save_failed"), "error");
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
  invalidateModelLoad(t("runtime_key_removing"));
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
    setTextStatus(elements.apiKeyStatus, t("runtime_key_removed"));
  } catch (error) {
    if (error?.code === "credential_conflict") {
      if (initialized) await readSettingsState().catch(showSettingsFailure);
      keyConflict = true;
      elements.reloadSettings.hidden = false;
    }
    setTextStatus(elements.apiKeyStatus, error?.message || t("runtime_key_remove_failed"), "error");
  } finally {
    setKeySaving(false);
    refreshAfterMutation();
  }
}

async function saveSettings(event) {
  event.preventDefault();
  if (!initialized || saving || savingKey || savingAgreement || hasConflicts()) return;
  if (recordingKey) stopKeyRecording(t("runtime_recording_cancelled"));
  setSaving(true);
  elements.saveButton.textContent = t("runtime_saving");
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
      setSaveStatus(t("runtime_choose_valid_language_model"), "error");
      return;
    }
    if (!isSupportedTriggerKey(values.triggerKey)) {
      setSaveStatus(t("runtime_choose_valid_trigger"), "error");
      return;
    }
    if (catalogLoaded && elements.aiModel.selectedOptions[0]?.dataset.unavailable) {
      setSaveStatus(t("runtime_choose_listed_model"), "error");
      elements.aiModel.focus();
      return;
    }
    const changes = Object.fromEntries(Object.entries(values)
      .filter(([name, value]) => value !== savedPreferences[name]));
    if (Object.keys(changes).length) {
      setSaveStatus(t("runtime_preferences_saving"));
      await chrome.storage.sync.set(changes);
      mergePreferences(changes);
    }
    if (storedApiKey && dataSharingAccepted) setupGuideVisible = false;
    setSaveStatus(storedApiKey ? t("runtime_preferences_saved") : t("runtime_preferences_saved_add_key"), "success");
    if (keyResult.changed && storedApiKey) await loadModels(true);
  } catch {
    setSaveStatus(t("runtime_preferences_save_failed"), "error");
  } finally {
    elements.saveButton.textContent = t("runtime_save_preferences");
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
        ? t("runtime_key_use_remove")
        : normalizeApiKey(value)
          ? t("runtime_key_will_save")
          : t("runtime_key_finish_entry");
      setTextStatus(elements.apiKeyStatus, message);
      invalidateModelLoad(t("runtime_key_finish_save_models"));
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
    elements.revealKey.textContent = revealing ? t("runtime_hide_key") : t("runtime_show_key");
    elements.revealKey.setAttribute("aria-pressed", String(revealing));
  });
  elements.refreshModels.addEventListener("click", () => loadModels(true));
  elements.recommendedModel.addEventListener("click", () => {
    if (elements.recommendedModel.disabled) return;
    elements.aiModel.value = RECOMMENDED_MODEL;
    markDirty(t("runtime_recommended_selected"));
  });
  elements.targetLanguage.addEventListener("change", () => markDirty());
  elements.aiModel.addEventListener("change", () => markDirty());
  elements.recordKey.addEventListener("click", () => recordingKey ? stopKeyRecording(t("runtime_recording_cancelled")) : startKeyRecording());
  elements.disableKey.addEventListener("click", () => {
    stopKeyRecording();
    triggerKey = null;
    renderTriggerKey();
    setTextStatus(elements.keyStatus, t("runtime_trigger_will_disable"));
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
      invalidateModelLoad(t("runtime_connection_changed"));
      void refreshSettings({ models: true });
    }
    if (area === "local" && Object.hasOwn(changes, STORAGE_KEYS.modelCatalog)
        && !credentialChanged && dataSharingAccepted && storedApiKey && !keyConflict && !savingKey && !savingAgreement
        && elements.apiKey.value.trim() === storedApiKey) {
      invalidateModelLoad(t("runtime_models_changed"));
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
        if (apiKeyStatus === "rejected") invalidateModelLoad(t("runtime_saved_key_rejected"));
        renderApiKeyStatus();
        renderSetupStatus();
      }).catch(() => {});
    }
  });
  document.addEventListener("keydown", recordKey, true);
  window.addEventListener("blur", () => {
    if (recordingKey) stopKeyRecording(t("runtime_recording_cancelled"));
    maskApiKey();
  });
  window.addEventListener("focus", () => void refreshSettings({ preferences: true, models: true }));
}

async function initialize() {
  bindEvents();
  populateLanguages(DEFAULTS.targetLanguage);
  renderModels([], DEFAULTS.aiModel);
  elements.parallelLimits.textContent = t("runtime_parallel_limits", [new Intl.NumberFormat(uiLocale()).format(LIMITS.maxActivePerTab), new Intl.NumberFormat(uiLocale()).format(LIMITS.maxActiveGlobal)]);
  elements.timeoutLimit.textContent = t("runtime_timeout_seconds", [new Intl.NumberFormat(uiLocale()).format(LIMITS.requestTimeoutMs / 1_000)]);
  setSaving(true);

  try {
    const preferredLanguages = await chrome.i18n?.getAcceptLanguages?.().catch(() => []) || [];
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

    populateLanguages(targetLanguage === null ? preferredTargetLanguage(preferredLanguages) : targetLanguage);
    renderModels([], isValidModelId(aiModel) ? aiModel : DEFAULTS.aiModel);
    renderTriggerKey();
    initialized = true;
    updateKeyControls();
    markDirty();

    if (storedApiKey && dataSharingAccepted) {
      await loadModels(false);
    } else {
      renderApiKeyStatus();
      setTextStatus(elements.modelStatus, dataSharingAccepted ? t("runtime_models_add_key") : t("runtime_models_need_agreement"));
    }
    setSaving(false);
    renderSetupStatus();
    if (!dirty) setSaveStatus(t("runtime_preferences_current"));
  } catch (error) {
    startupChanges = null;
    setSaving(false);
    showSettingsFailure(error);
  }
}

initialize();
