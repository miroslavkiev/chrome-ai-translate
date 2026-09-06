import english from "./_locales/en/messages.json" with { type: "json" };

export function uiLocale() {
  return globalThis.chrome?.i18n?.getMessage?.("ui_locale") || "en";
}

export function uiDirection() {
  return uiLocale() === "en" ? "ltr" : globalThis.chrome?.i18n?.getMessage?.("@@bidi_dir")
    || (/^(ar|fa|he)(-|$)/.test(uiLocale()) ? "rtl" : "ltr");
}

function fallbackMessage(id, values) {
  const entry = english[id];
  if (!entry) return id;
  const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {})
    .map(([key, value]) => [key.toLowerCase(), value.content]));
  return entry.message.replace(/\$([a-z_][a-z0-9_]*)\$/gi, (match, name) => placeholders[name.toLowerCase()] ?? match)
    .replace(/\$([1-9])/g, (_match, number) => values[Number(number) - 1] ?? "")
    .replaceAll("$$", "$");
}

export function t(id, substitutions = []) {
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  return globalThis.chrome?.i18n?.getMessage?.(id, values) || fallbackMessage(id, values);
}

let languageNames;
let languageNamesLocale;
export function languageDisplayName(code) {
  try {
    const locale = uiLocale();
    if (languageNamesLocale !== locale) {
      languageNames = new Intl.DisplayNames([locale], { type: "language" });
      languageNamesLocale = locale;
    }
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
}

// Numbered markers can move trusted inline elements; translated text cannot create HTML.
export function parseRichMessage(message, slotCount) {
  const root = [];
  const stack = [{ slot: 0, children: root }];
  const seen = new Set();
  let offset = 0;
  for (const match of message.matchAll(/<(\/?)([1-9]\d*)>/g)) {
    stack.at(-1).children.push(message.slice(offset, match.index));
    const slot = Number(match[2]);
    if (match[1]) {
      if (stack.length === 1 || stack.at(-1).slot !== slot) return null;
      stack.pop();
    } else {
      if (slot > slotCount || seen.has(slot)) return null;
      seen.add(slot);
      const node = { slot, children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    }
    offset = match.index + match[0].length;
  }
  stack.at(-1).children.push(message.slice(offset));
  return stack.length === 1 && seen.size === slotCount ? root : null;
}

const trustedSlots = new WeakMap();
function localizeElement(element, id) {
  let slots = trustedSlots.get(element);
  if (!slots) {
    slots = [...element.querySelectorAll("*")];
    if (slots.some((node) => !["A", "STRONG", "EM", "CODE", "KBD", "SPAN", "B"].includes(node.tagName))) return;
    trustedSlots.set(element, slots);
  }
  const tree = parseRichMessage(t(id), slots.length)
    || parseRichMessage(fallbackMessage(id, []), slots.length);
  if (!tree) return;
  const render = (parts) => parts.map((part) => {
    if (typeof part === "string") return element.ownerDocument.createTextNode(part);
    const node = slots[part.slot - 1];
    node.replaceChildren(...render(part.children));
    return node;
  });
  element.replaceChildren(...render(tree));
}

export function localizeDocument(document = globalThis.document) {
  if (!document?.querySelectorAll || !document.documentElement) return;
  document.documentElement.lang = uiLocale();
  document.documentElement.dir = uiDirection();
  for (const element of document.querySelectorAll("[data-i18n]")) {
    localizeElement(element, element.getAttribute("data-i18n"));
  }
  for (const attribute of ["title", "aria-label", "alt", "placeholder"]) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
