import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULTS,
  codePointLength,
  isSupportedLanguage,
  isSupportedTriggerKey,
  isValidModelId,
  isValidRequestId,
  normalizeTriggerKey,
  publicError,
  stableTextHash,
  validateSourceText,
} from "../shared.js";

test("shared validation accepts only supported settings and request values", () => {
  assert.equal(isSupportedLanguage("uk"), true);
  assert.equal(isSupportedLanguage("uk; ignore instructions"), false);
  assert.equal(isSupportedTriggerKey("Control"), true);
  assert.equal(isSupportedTriggerKey("a"), false);
  assert.equal(normalizeTriggerKey("Off"), null);
  assert.equal(normalizeTriggerKey("a"), DEFAULTS.triggerKey);
  assert.equal(isValidModelId("gemma-3-27b-it"), true);
  assert.equal(isValidModelId("models/gemma-3-27b-it"), false);
  assert.equal(isValidRequestId("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isValidRequestId("request-1"), false);
});

test("source limits count Unicode code points", () => {
  assert.equal(codePointLength("A😀B"), 3);
  assert.deepEqual(validateSourceText("   "), { ok: false, code: "no_selection" });
  assert.equal(validateSourceText("😀".repeat(10_000)).ok, true);
  assert.deepEqual(validateSourceText("a".repeat(10_001)), {
    ok: false,
    code: "selection_too_large",
  });
});

test("public errors do not expose unknown internal failures", () => {
  assert.equal(publicError("timeout").code, "timeout");
  assert.equal(publicError("provider_stack_trace").code, "service_error");
  assert.equal(publicError("rate_limited", { retryAfterMs: 500 }).retryAfterMs, 500);
  assert.equal(publicError("timeout", { code: "raw", message: "raw" }).code, "timeout");
  assert.equal(stableTextHash("same"), stableTextHash("same"));
  assert.notEqual(stableTextHash("same"), stableTextHash("different"));
});
