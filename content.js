import {
  DEFAULTS,
  LANGUAGES,
  LIMITS,
  PUBLIC_ERROR_MESSAGES,
  STORAGE_KEYS,
  getStoredTriggerKey,
  isSupportedLanguage,
  normalizeTriggerKey,
  validateSourceText,
} from "./shared.js";
import { createCleanKeyReleaseTrigger } from "./trigger.js";

const PORT_NAME = "translation";
const CONTEXT_MENU_ACTION = "contextMenuTranslate";
const CARD_MARGIN = 12;
const TEXT_INPUT_TYPES = new Set(["email", "password", "search", "tel", "text", "url"]);

const CARD_CSS = `
  :host {
    color-scheme: light dark;
  }
  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(360px, calc(100vw - 8px));
    max-height: min(480px, calc(100vh - 8px));
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 16px;
    background: rgba(250, 250, 252, 0.96);
    color: #1d1d1f;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
  }
  .title {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 650;
  }
  .language {
    min-width: 108px;
    max-width: 150px;
    height: 32px;
    border: 1px solid rgba(0, 0, 0, 0.16);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.82);
    color: inherit;
    padding: 0 26px 0 9px;
    font: inherit;
  }
  button {
    min-width: 32px;
    min-height: 32px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #0066cc;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer;
  }
  button:hover {
    background: rgba(0, 102, 204, 0.1);
  }
  button:disabled,
  select:disabled {
    cursor: default;
    opacity: 0.55;
  }
  button:focus-visible,
  select:focus-visible,
  .output:focus-visible {
    outline: 3px solid #007aff;
    outline-offset: 2px;
  }
  .close {
    color: inherit;
    font-size: 20px;
    font-weight: 400;
  }
  .body {
    min-height: 0;
    overflow: auto;
    padding: 4px 14px 14px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 2px 0 0;
    color: #6e6e73;
  }
  .state.loading::before {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    border: 2px solid rgba(0, 102, 204, 0.2);
    border-top-color: #007aff;
    border-radius: 50%;
    content: "";
    animation: spin 0.8s linear infinite;
  }
  .state.error {
    color: #b42318;
  }
  .output {
    max-height: 330px;
    overflow: auto;
    margin-top: 4px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: plaintext;
    text-align: start;
    user-select: text;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }
  .retry {
    padding: 0 10px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-color-scheme: dark) {
    .card {
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(35, 35, 38, 0.96);
      color: #f5f5f7;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
    }
    .language {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(70, 70, 73, 0.9);
    }
    .state { color: #a1a1a6; }
    .state.error { color: #ff9f92; }
    button { color: #64a9ff; }
    button:hover { background: rgba(100, 169, 255, 0.14); }
  }
  @media (prefers-contrast: more) {
    .card, .language { border-width: 2px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .state.loading::before { animation: none; }
  }
  @media (forced-colors: active) {
    .card, .language, button {
      border: 1px solid ButtonText;
      background: Canvas;
      color: CanvasText;
      box-shadow: none;
      forced-color-adjust: auto;
    }
    .state, .state.error { color: CanvasText; }
    .state.loading::before { border-color: ButtonText; }
  }
`;

const cards = new Set();
const completedCards = [];
let defaultTargetLanguage = DEFAULTS.targetLanguage;
let keyTrigger = null;

function makeElement(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function centerAnchor() {
  return {
    left: window.innerWidth / 2,
    right: window.innerWidth / 2,
    top: window.innerHeight / 2,
    bottom: window.innerHeight / 2,
  };
}

function anchorFromRect(rect) {
  if (!rect || ![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) {
    return centerAnchor();
  }
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
}

function elementAnchor(element) {
  return element?.getBoundingClientRect
    ? anchorFromRect(element.getBoundingClientRect())
    : centerAnchor();
}

function rangeAnchor(range, direction) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width || rect.height);
  const edgeRect = direction === "backward" ? rects[0] : rects.at(-1);
  return anchorFromRect(edgeRect ?? range.getBoundingClientRect());
}

function selectionSnapshot(text, anchor, identity) {
  const validation = validateSourceText(text);
  if (!validation.ok) return { ok: false, code: validation.code, anchor, identity };
  return { ok: true, text: validation.text, anchor, identity };
}

function captureControlSelection(element) {
  if (element instanceof HTMLInputElement && element.type === "password") {
    return {
      ok: false,
      code: "unsupported_selection",
      sensitive: true,
      anchor: elementAnchor(element),
      identity: { kind: "password", document, element },
    };
  }

  const start = element.selectionStart;
  const end = element.selectionEnd;
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return {
      ok: false,
      code: "unsupported_selection",
      anchor: elementAnchor(element),
      identity: { kind: "unsupported-control", document, element },
    };
  }

  const text = element.value.slice(start, end);
  return selectionSnapshot(text, elementAnchor(element), {
    kind: "control",
    document,
    element,
    start,
    end,
    direction: element.selectionDirection,
    text,
  });
}

function captureSelection() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement
      || (activeElement instanceof HTMLInputElement
        && TEXT_INPUT_TYPES.has(activeElement.type))) {
    return captureControlSelection(activeElement);
  }

  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const text = selection.toString();
    const anchorElement = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    return selectionSnapshot(text, rangeAnchor(range, selection.direction), {
      kind: anchorElement?.isContentEditable ? "contenteditable" : "document",
      document,
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
      direction: selection.direction,
      text,
    });
  }

  return {
    ok: false,
    code: "no_selection",
    anchor: centerAnchor(),
    identity: { kind: "none", document, activeElement },
  };
}

function isSameSelection(first, second) {
  const left = first?.identity;
  const right = second?.identity;
  if (!left || !right || left.kind !== right.kind || left.document !== right.document) return false;
  if (left.kind === "control") {
    return left.element === right.element
      && left.start === right.start
      && left.end === right.end
      && left.direction === right.direction
      && left.text === right.text;
  }
  if (left.kind === "document" || left.kind === "contenteditable") {
    return left.anchorNode === right.anchorNode
      && left.anchorOffset === right.anchorOffset
      && left.focusNode === right.focusNode
      && left.focusOffset === right.focusOffset
      && left.direction === right.direction
      && left.text === right.text;
  }
  return left.element === right.element && left.activeElement === right.activeElement;
}

function contextMenuSnapshot(selectionText) {
  const current = captureSelection();
  if (current.sensitive) return current;
  const validation = validateSourceText(selectionText);
  if (!validation.ok) return { ...current, ok: false, code: validation.code };
  if (!current.ok || current.text.trim() !== validation.text.trim()) {
    return { ...current, ok: false, code: "no_selection" };
  }
  return current;
}

function isOverlayEvent(event) {
  const path = event.composedPath();
  return [...cards].some((card) => path.includes(card.host));
}

function closeCardsOutside(event) {
  if (isOverlayEvent(event)) return;
  for (const card of [...cards]) closeCard(card, { restoreFocus: false });
}

function viewportMargin() {
  return Math.min(CARD_MARGIN, Math.max(2, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 20)));
}

function setHostStyles(host) {
  const margin = viewportMargin();
  const styles = {
    all: "initial",
    display: "block",
    position: "fixed",
    left: `${margin}px`,
    top: `${margin}px`,
    width: "max-content",
    height: "auto",
    margin: "0",
    padding: "0",
    border: "0",
    "z-index": "2147483647",
    "pointer-events": "none",
  };
  for (const [property, value] of Object.entries(styles)) {
    host.style.setProperty(property, value, "important");
  }
}

function positionCard(card) {
  if (card.closed) return;
  const margin = viewportMargin();
  const rect = card.host.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const anchorLeft = Math.min(Math.max(card.anchor.left, margin), maxLeft);
  const below = card.anchor.bottom + 8;
  const above = card.anchor.top - rect.height - 8;
  const desiredTop = below + rect.height <= window.innerHeight - margin ? below : above;
  const occupied = [...cards]
    .filter((other) => other !== card && !other.closed)
    .map((other) => other.host.getBoundingClientRect())
    .filter((other) => other.width && other.height);
  const candidates = [
    { left: anchorLeft, top: desiredTop },
    { left: anchorLeft, top: above },
    ...occupied.flatMap((other) => [
      { left: anchorLeft, top: other.bottom + 8 },
      { left: anchorLeft, top: other.top - rect.height - 8 },
      { left: other.right + 8, top: other.top },
      { left: other.left - rect.width - 8, top: other.top },
    ]),
  ];
  const clamp = (candidate) => ({
    left: Math.min(Math.max(candidate.left, margin), maxLeft),
    top: Math.min(Math.max(candidate.top, margin), maxTop),
  });
  const overlaps = (candidate, other) => candidate.left < other.right + 8
    && candidate.left + rect.width + 8 > other.left
    && candidate.top < other.bottom + 8
    && candidate.top + rect.height + 8 > other.top;
  const position = candidates.map(clamp).find((candidate) => (
    occupied.every((other) => !overlaps(candidate, other))
  )) ?? clamp(candidates[0]);
  card.host.style.setProperty("left", `${position.left}px`, "important");
  card.host.style.setProperty("top", `${position.top}px`, "important");
}

function removeCompleted(card) {
  const index = completedCards.indexOf(card);
  if (index !== -1) completedCards.splice(index, 1);
}

function closeCard(card, { restoreFocus = true } = {}) {
  if (card.closed) return;
  card.closed = true;
  removeCompleted(card);
  cards.delete(card);
  if (card.port) {
    card.port.disconnect();
    card.port = null;
  }
  const shouldRestoreFocus = restoreFocus && card.shadow.activeElement !== null;
  card.host.remove();
  requestAnimationFrame(() => {
    for (const openCard of cards) positionCard(openCard);
  });
  if (shouldRestoreFocus && card.returnFocus?.isConnected) {
    card.returnFocus.focus?.({ preventScroll: true });
  }
}

function markCompleted(card) {
  removeCompleted(card);
  completedCards.push(card);
  while (completedCards.length > LIMITS.maxCompletedOverlays) closeCard(completedCards[0]);
}

function errorMessage(error) {
  const code = typeof error?.code === "string" ? error.code : "service_error";
  let message = Object.hasOwn(PUBLIC_ERROR_MESSAGES, code)
    ? PUBLIC_ERROR_MESSAGES[code]
    : PUBLIC_ERROR_MESSAGES.service_error;
  if (code === "rate_limited" && Number.isFinite(error?.retryAfterMs)) {
    const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
    message += ` Try again in ${seconds} seconds.`;
  }
  return { code, message };
}

function announce(card, message, error = false) {
  for (const other of cards) {
    if (other !== card) other.liveStatus.setAttribute("aria-live", "off");
  }
  card.liveStatus.setAttribute("role", error ? "alert" : "status");
  card.liveStatus.setAttribute("aria-live", error ? "assertive" : "polite");
  card.liveStatus.textContent = message;
}

function renderLoading(card) {
  removeCompleted(card);
  card.state = "loading";
  card.languageSelect.disabled = true;
  card.retryButton.hidden = true;
  card.output.hidden = true;
  card.output.textContent = "";
  card.visualStatus.className = "state loading";
  card.visualStatus.textContent = "Translating...";
  announce(card, "Translation started.");
  requestAnimationFrame(() => positionCard(card));
}

function renderSuccess(card, translatedText, targetLanguage) {
  card.state = "success";
  if (isSupportedLanguage(targetLanguage)) card.language = targetLanguage;
  card.languageSelect.value = card.language;
  card.languageSelect.disabled = false;
  card.retryButton.hidden = false;
  card.output.hidden = false;
  card.output.textContent = translatedText;
  card.visualStatus.className = "state";
  card.visualStatus.textContent = "Translation complete.";
  announce(card, "Translation complete. Use the result text or card controls.");
  markCompleted(card);
  requestAnimationFrame(() => positionCard(card));
}

function renderError(card, error) {
  const failure = errorMessage(error);
  card.state = "error";
  card.languageSelect.disabled = false;
  card.retryButton.hidden = false;
  card.output.hidden = true;
  card.output.textContent = "";
  card.visualStatus.className = "state error";
  card.visualStatus.textContent = failure.message;
  announce(card, `Translation failed. ${failure.message}`, true);
  markCompleted(card);
  requestAnimationFrame(() => positionCard(card));
}

function handlePortResult(card, port, message) {
  if (card.closed || card.port !== port) return;
  if (message?.action !== "result" || message.requestId !== card.requestId) return;
  card.port = null;
  if (message.ok === true
      && typeof message.translatedText === "string"
      && message.translatedText.trim()) {
    renderSuccess(card, message.translatedText, message.targetLanguage);
    return;
  }
  if (message.ok === false) {
    renderError(card, message.error);
    return;
  }
  renderError(card, { code: "invalid_response" });
}

function startCardRequest(card, targetLanguage) {
  if (card.closed || card.port) return;
  if (!card.text) {
    const fresh = captureSelection();
    card.anchor = fresh.anchor;
    if (!fresh.ok) {
      renderError(card, { code: fresh.code });
      return;
    }
    card.text = fresh.text;
  }

  const languageOverride = isSupportedLanguage(targetLanguage) ? targetLanguage : undefined;
  card.language = languageOverride ?? defaultTargetLanguage;
  card.languageSelect.value = card.language;
  card.requestId = crypto.randomUUID();
  if ([card.retryButton, card.languageSelect].includes(card.shadow.activeElement)) {
    card.closeButton.focus({ preventScroll: true });
  }
  renderLoading(card);

  let port;
  try {
    port = chrome.runtime.connect({ name: PORT_NAME });
  } catch {
    renderError(card, { code: "service_error" });
    return;
  }

  card.port = port;
  port.onMessage.addListener((message) => handlePortResult(card, port, message));
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (card.closed || card.port !== port) return;
    card.port = null;
    renderError(card, { code: "service_error" });
  });

  try {
    const request = {
      action: "translate",
      requestId: card.requestId,
      text: card.text,
    };
    if (languageOverride) request.targetLanguage = languageOverride;
    port.postMessage(request);
  } catch {
    card.port = null;
    port.disconnect();
    renderError(card, { code: "service_error" });
  }
}

function createCard(snapshot) {
  const host = document.createElement("ai-translator-card");
  setHostStyles(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CARD_CSS;

  const titleId = `ai-translator-${crypto.randomUUID()}`;
  const section = makeElement("section", "card");
  section.setAttribute("role", "region");
  section.setAttribute("aria-labelledby", titleId);

  const header = makeElement("div", "header");
  const title = makeElement("h2", "title", "Translation");
  title.id = titleId;
  const languageLabel = makeElement("label", "language-label");
  languageLabel.append(makeElement("span", "sr-only", "Target language"));
  const languageSelect = makeElement("select", "language");
  languageSelect.setAttribute("aria-label", "Target language for this card");
  for (const language of LANGUAGES) {
    const option = makeElement("option", "", language.name);
    option.value = language.code;
    languageSelect.append(option);
  }
  const closeButton = makeElement("button", "close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close translation card");
  languageLabel.append(languageSelect);
  header.append(title, languageLabel, closeButton);

  const body = makeElement("div", "body");
  const visualStatus = makeElement("p", "state");
  const output = makeElement("div", "output");
  output.hidden = true;
  output.tabIndex = 0;
  output.dir = "auto";
  output.setAttribute("aria-label", "Translated text");
  const actions = makeElement("div", "actions");
  const retryButton = makeElement("button", "retry", "Retry");
  retryButton.type = "button";
  retryButton.hidden = true;
  actions.append(retryButton);
  body.append(visualStatus, output, actions);

  const liveStatus = makeElement("div", "sr-only");
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  liveStatus.setAttribute("aria-atomic", "true");
  section.append(header, body, liveStatus);
  shadow.append(style, section);

  const card = {
    host,
    shadow,
    anchor: snapshot.anchor,
    text: snapshot.ok ? snapshot.text : "",
    language: defaultTargetLanguage,
    languageSelect,
    closeButton,
    visualStatus,
    liveStatus,
    output,
    retryButton,
    port: null,
    requestId: null,
    state: "new",
    closed: false,
    returnFocus: document.activeElement,
  };

  closeButton.addEventListener("click", () => closeCard(card));
  retryButton.addEventListener("click", () => startCardRequest(card, card.language));
  languageSelect.addEventListener("change", () => {
    if (languageSelect.value !== card.language && isSupportedLanguage(languageSelect.value)) {
      startCardRequest(card, languageSelect.value);
    }
  });
  shadow.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeCard(card);
  });

  cards.add(card);
  (document.documentElement ?? document.body).append(host);
  requestAnimationFrame(() => positionCard(card));
  return card;
}

function startTranslation(snapshot) {
  const card = createCard(snapshot);
  if (snapshot.ok) startCardRequest(card);
  else renderError(card, { code: snapshot.code });
}

function configureTrigger(key) {
  keyTrigger?.cancel();
  const normalizedKey = normalizeTriggerKey(key);
  keyTrigger = createCleanKeyReleaseTrigger({
    key: normalizedKey,
    holdMs: LIMITS.keyHoldMs,
    capture: captureSelection,
    isSame: isSameSelection,
    onTrigger: startTranslation,
  });
}

function cancelTrigger() {
  keyTrigger?.cancel();
}

function disconnectDocumentRequests() {
  cancelTrigger();
  for (const card of cards) {
    if (!card.port) continue;
    const port = card.port;
    card.port = null;
    port.disconnect();
    renderError(card, { code: "cancelled" });
  }
}

document.addEventListener("keydown", (event) => {
  if (isOverlayEvent(event)) cancelTrigger();
  else keyTrigger?.keydown(event);
}, true);
document.addEventListener("keyup", (event) => {
  if (isOverlayEvent(event)) cancelTrigger();
  else keyTrigger?.keyup(event);
}, true);
document.addEventListener("pointerdown", closeCardsOutside, true);

for (const eventName of [
  "pointerdown",
  "wheel",
  "contextmenu",
  "beforeinput",
  "compositionstart",
  "selectionchange",
]) {
  document.addEventListener(eventName, cancelTrigger, true);
}
window.addEventListener("blur", cancelTrigger, true);
window.addEventListener("pagehide", disconnectDocumentRequests, true);
document.addEventListener("freeze", cancelTrigger, true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelTrigger();
}, true);
window.addEventListener("resize", () => {
  for (const card of cards) positionCard(card);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== CONTEXT_MENU_ACTION) return undefined;
  const snapshot = contextMenuSnapshot(message.selectionText);
  if (snapshot.ok) startTranslation(snapshot);
  sendResponse({ accepted: snapshot.ok });
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes[STORAGE_KEYS.triggerKey]) {
    const change = changes[STORAGE_KEYS.triggerKey];
    configureTrigger(getStoredTriggerKey(Object.hasOwn(change, "newValue")
      ? { [STORAGE_KEYS.triggerKey]: change.newValue }
      : {}));
  }
  if (changes[STORAGE_KEYS.targetLanguage]) {
    const language = changes[STORAGE_KEYS.targetLanguage].newValue;
    defaultTargetLanguage = isSupportedLanguage(language) ? language : DEFAULTS.targetLanguage;
  }
});

(async () => {
  try {
    const settings = await chrome.storage.sync.get([
      STORAGE_KEYS.triggerKey,
      STORAGE_KEYS.targetLanguage,
    ]);
    if (isSupportedLanguage(settings[STORAGE_KEYS.targetLanguage])) {
      defaultTargetLanguage = settings[STORAGE_KEYS.targetLanguage];
    }
    configureTrigger(getStoredTriggerKey(settings));
  } catch {
    configureTrigger(null);
  }
})();
