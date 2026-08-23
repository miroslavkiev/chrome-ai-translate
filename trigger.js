function isAltGraph(event) {
  return event.getModifierState?.("AltGraph") === true;
}

function hasOtherModifier(event, key) {
  return (event.ctrlKey && key !== "Control")
    || (event.altKey && key !== "Alt")
    || (event.shiftKey && key !== "Shift")
    || (event.metaKey && key !== "Meta");
}

export function createCleanKeyReleaseTrigger({
  key,
  holdMs,
  capture,
  isSame,
  onTrigger,
  now = Date.now,
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let pending = null;
  let holdTimer = null;

  function cancel() {
    pending = null;
    if (holdTimer !== null) {
      unschedule(holdTimer);
      holdTimer = null;
    }
  }

  function isClean(event) {
    return event.isTrusted
      && !event.repeat
      && !event.isComposing
      && !isAltGraph(event)
      && !hasOtherModifier(event, key);
  }

  function keydown(event) {
    if (!key) return;
    if (event.key !== key) {
      cancel();
      return;
    }
    if (pending || !isClean(event)) {
      cancel();
      return;
    }

    const snapshot = capture();
    if (!snapshot?.ok) {
      cancel();
      return;
    }
    pending = {
      key,
      startedAt: now(),
      snapshot,
    };
    holdTimer = schedule(cancel, holdMs);
  }

  function keyup(event) {
    if (!pending) return;
    const candidate = pending;
    cancel();
    if (event.key !== candidate.key
        || !isClean(event)
        || now() - candidate.startedAt > holdMs) return;

    const current = capture();
    if (isSame(candidate.snapshot, current)) onTrigger(candidate.snapshot);
  }

  return {
    cancel,
    keydown,
    keyup,
    isPending: () => pending !== null,
  };
}
