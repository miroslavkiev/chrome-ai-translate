import assert from "node:assert/strict";

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
