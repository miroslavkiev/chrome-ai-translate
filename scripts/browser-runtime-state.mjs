import assert from "node:assert/strict";

export async function findExtensionWorker(context, locale, { timeout = 10_000 } = {}) {
  const matches = (worker) => worker.url().startsWith("chrome-extension://") && worker.url().endsWith("/background.js");
  const existing = context.serviceWorkers().find(matches);
  if (existing) return existing;

  let inspection, cdp, timer, onWorker, onVersions, onError;
  let expired = false;
  let settled = false;
  let wakeStarted = false;
  let latestVersion;
  const startupErrors = [];
  const failure = (reason) => new Error(`${locale}: extension worker startup failed (${latestVersion
    ? `${latestVersion.status}/${latestVersion.runningStatus}` : "no registered background worker"}): ${reason}; ${JSON.stringify(startupErrors)}`);
  function cleanup() {
    if (onWorker) context.off("serviceworker", onWorker);
    if (cdp) {
      if (onVersions) cdp.off("ServiceWorker.workerVersionUpdated", onVersions);
      if (onError) cdp.off("ServiceWorker.workerErrorReported", onError);
      const session = cdp;
      cdp = null;
      void Promise.resolve().then(() => session.detach()).catch(() => {});
    }
    if (inspection) {
      const page = inspection;
      inspection = null;
      void Promise.resolve().then(() => page.close()).catch(() => {});
    }
  }
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(failure(`Timed out after ${timeout} ms`));
    }, timeout);
  });
  const discovery = (async () => {
    inspection = await context.newPage();
    if (expired) return;
    cdp = await context.newCDPSession(inspection);
    if (expired) return;
    // A stopped worker still has a registration even if attachment missed it.
    const ready = new Promise((resolve, reject) => {
      const fail = (error) => {
        if (settled || expired) return;
        settled = true;
        reject(failure(error.message));
      };
      onWorker = (worker) => {
        if (settled || expired || !matches(worker)) return;
        settled = true;
        resolve(worker);
      };
      onVersions = ({ versions }) => {
        latestVersion = versions.find((version) => version.scriptURL.startsWith("chrome-extension://")
          && version.scriptURL.endsWith("/background.js") && version.status !== "redundant") || latestVersion;
        if (settled || expired || wakeStarted || latestVersion?.status !== "activated") return;
        const current = context.serviceWorkers().find(matches);
        if (current) return onWorker(current);
        wakeStarted = true;
        const scopeURL = `chrome-extension://${new URL(latestVersion.scriptURL).host}/`;
        void cdp.send("ServiceWorker.startWorker", { scopeURL }).catch(fail);
      };
      onError = ({ errorMessage }) => startupErrors.push(errorMessage);
      context.on("serviceworker", onWorker);
      cdp.on("ServiceWorker.workerVersionUpdated", onVersions);
      cdp.on("ServiceWorker.workerErrorReported", onError);
    });
    const [, worker] = await Promise.all([cdp.send("ServiceWorker.enable"), ready]);
    return worker;
  })().finally(() => { if (expired) cleanup(); });
  try {
    return await Promise.race([discovery, deadline]);
  } finally {
    expired = true;
    clearTimeout(timer);
    cleanup();
  }
}

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
