import assert from "node:assert/strict";
import test from "node:test";
import { parseRichMessage, t, uiDirection, uiLocale } from "../i18n.js";
import { preferredTargetLanguage } from "../shared.js";

test("target suggestion respects ranked Chrome languages and regional scripts", () => {
  for (const [languages, expected] of [
    [["de-DE", "uk"], "de"], [["xx-invalid", "pt-BR"], "pt"],
    [["zh-TW"], "zh-Hant"], [["zh-CN"], "zh-Hans"], [["zh-Hant-CN"], "zh-Hant"],
    [["nb-NO"], "no"], [["iw"], "he"], [["tl"], "fil"], [[], "en"],
    [["mni-Mtei-IN"], "mni-Mtei"],
  ]) assert.equal(preferredTargetLanguage(languages), expected);
});

test("localization uses native messages and safely falls back to English", () => {
  const previous = globalThis.chrome;
  try {
    globalThis.chrome = { i18n: {
      getUILanguage: () => "ar",
      getMessage: (id) => ({ error_timeout: "انتهت المهلة", ui_locale: "ar" }[id] || ""),
    } };
    assert.equal(uiLocale(), "ar");
    assert.equal(preferredTargetLanguage([]), "ar");
    assert.equal(uiDirection(), "rtl");
    assert.equal(t("error_timeout"), "انتهت المهلة");
    assert.equal(t("error_retry_delay", [2]), " Try again in 2 seconds.");
    globalThis.chrome.i18n = {
      getUILanguage: () => "ur",
      getMessage: (id) => ({ ui_locale: "en", "@@bidi_dir": "rtl" }[id] || ""),
    };
    assert.equal(uiLocale(), "en");
    assert.equal(uiDirection(), "ltr");
    assert.equal(preferredTargetLanguage([]), "ur", "Target fallback uses the browser language, not the English catalog");
    delete globalThis.chrome;
    assert.equal(uiLocale(), "en");
    assert.equal(t("error_timeout"), "Translation took too long. You can retry it.");
  } finally {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  }
});

test("rich translations allow reordered trusted slots and reject malformed slot structure", () => {
  const text = '<img src=x onerror="alert(1)">';
  assert.deepEqual(parseRichMessage(text, 0), [text]);
  assert.deepEqual(parseRichMessage("<2>Second</2> then <1>first</1>", 2), [
    "", { slot: 2, children: ["Second"] }, " then ", { slot: 1, children: ["first"] }, "",
  ]);
  for (const invalid of ["Missing link", "<1>Open", "<1>One</2>", "<2>Unknown</2>", "<1>One</1><1>Again</1>"]) {
    assert.equal(parseRichMessage(invalid, 1), null, invalid);
  }
  assert.equal(parseRichMessage("<1><2>Nested</1></2>", 2), null);
});
