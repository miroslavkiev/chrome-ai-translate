import assert from "node:assert/strict";
import test from "node:test";
import { createCleanKeyReleaseTrigger } from "../trigger.js";

function keyboardEvent(overrides = {}) {
  return {
    key: "Control",
    isTrusted: true,
    repeat: false,
    isComposing: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    getModifierState: () => false,
    ...overrides,
  };
}

function harness(snapshot = { ok: true, text: "hello" }) {
  let current = snapshot;
  let now = 1_000;
  let timer = null;
  const triggered = [];
  const trigger = createCleanKeyReleaseTrigger({
    key: "Control",
    holdMs: 1_500,
    capture: () => current,
    isSame: (left, right) => left === right,
    onTrigger: (value) => triggered.push(value),
    now: () => now,
    schedule: (callback) => {
      timer = callback;
      return 1;
    },
    unschedule: () => {
      timer = null;
    },
  });
  return {
    trigger,
    triggered,
    setCurrent: (value) => { current = value; },
    advance: (milliseconds) => { now += milliseconds; },
    expire: () => timer?.(),
  };
}

test("a trusted clean key release triggers exactly once", () => {
  const state = harness();
  state.trigger.keydown(keyboardEvent());
  assert.equal(state.trigger.isPending(), true);
  state.trigger.keyup(keyboardEvent());
  state.trigger.keyup(keyboardEvent());
  assert.equal(state.trigger.isPending(), false);
  assert.equal(state.triggered.length, 1);
});

test("synthetic, repeated, modified, changed, and long key sequences do not trigger", () => {
  const cases = [
    keyboardEvent({ isTrusted: false }),
    keyboardEvent({ repeat: true }),
    keyboardEvent({ altKey: true }),
    keyboardEvent({ getModifierState: (name) => name === "AltGraph" }),
  ];
  for (const event of cases) {
    const state = harness();
    state.trigger.keydown(event);
    state.trigger.keyup(keyboardEvent());
    assert.equal(state.triggered.length, 0);
  }

  const changed = harness();
  changed.trigger.keydown(keyboardEvent());
  changed.setCurrent({ ok: true, text: "different" });
  changed.trigger.keyup(keyboardEvent());
  assert.equal(changed.triggered.length, 0);

  const interrupted = harness();
  interrupted.trigger.keydown(keyboardEvent());
  interrupted.trigger.keydown(keyboardEvent({ key: "x", ctrlKey: true }));
  interrupted.trigger.keyup(keyboardEvent());
  assert.equal(interrupted.triggered.length, 0);

  const expired = harness();
  expired.trigger.keydown(keyboardEvent());
  expired.advance(1_501);
  expired.trigger.keyup(keyboardEvent());
  assert.equal(expired.triggered.length, 0);
});

test("an empty or unsupported selection does not arm the trigger", () => {
  const state = harness({ ok: false, code: "no_selection" });
  state.trigger.keydown(keyboardEvent());
  assert.equal(state.trigger.isPending(), false);
  state.trigger.keyup(keyboardEvent());
  assert.equal(state.triggered.length, 0);
});

test("the hold timer cancels a pending trigger", () => {
  const state = harness();
  state.trigger.keydown(keyboardEvent());
  state.expire();
  state.trigger.keyup(keyboardEvent());
  assert.equal(state.triggered.length, 0);
});
