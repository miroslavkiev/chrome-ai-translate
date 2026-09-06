import assert from "node:assert/strict";

// Use the same trusted Settings route as a user, with fixture credentials only.
export async function setTestApiKey(settings, apiKey, { acceptDataSharing = true } = {}) {
  const state = await settings.evaluate(async ({ apiKey, acceptDataSharing }) => {
    if (acceptDataSharing) {
      const accepted = await chrome.runtime.sendMessage({ action: "setDataSharing", accepted: true });
      if (!accepted?.ok) return accepted;
    }
    const current = await chrome.runtime.sendMessage({ action: "getSettingsState" });
    if (!current?.ok) return current;
    return chrome.runtime.sendMessage({ action: "setApiKey", apiKey, expectedRevision: current.credentialRevision });
  }, { apiKey, acceptDataSharing });
  assert.equal(state?.ok, true, `Fixture key setup failed: ${JSON.stringify(state?.error)}`);
  return state;
}

export async function waitForRuntimeState(page, accept = () => true, { timeout = 10_000, allowStartup = false } = {}) {
  let stopped = false;
  let timer;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for the extension runtime state")), timeout);
      }),
      (async () => {
        while (!stopped) {
          let reply;
          try {
            reply = await page.evaluate(async () => {
              if (typeof globalThis.chrome?.runtime?.sendMessage !== "function") return { startupPending: true };
              return { state: await chrome.runtime.sendMessage({ action: "getRuntimeState" }) };
            });
          } catch (error) {
            if (!allowStartup || !error.message.includes("Receiving end does not exist")) throw error;
            reply = { startupPending: true };
          }
          if (reply.startupPending) {
            assert.ok(allowStartup, "Extension runtime APIs are unavailable");
          } else {
            assert.equal(reply.state?.ok, true, `Extension runtime failed: ${JSON.stringify(reply.state?.error)}`);
            if (accept(reply.state)) return reply.state;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      })(),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
}
