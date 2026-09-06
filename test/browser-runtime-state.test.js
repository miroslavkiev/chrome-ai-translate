import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { findExtensionWorker } from "../scripts/browser-runtime-state.mjs";

test("worker discovery bounds setup, commands and cleanup, and wakes one registration", { timeout: 2_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const never = new Promise(() => {});
  const worker = { url: () => "chrome-extension://fixture/dist/background.js" };
  for (const stalled of ["page", "session", "enable", "registration"]) {
    let detached = 0, closed = 0;
    const cdp = Object.assign(new EventEmitter(), {
      send: () => stalled === "enable" ? never : Promise.resolve(),
      detach: () => { detached++; return never; },
    });
    const context = Object.assign(new EventEmitter(), {
      serviceWorkers: () => [],
      newPage: () => stalled === "page" ? never : Promise.resolve({ close: () => { closed++; return never; } }),
      newCDPSession: () => stalled === "session" ? never : Promise.resolve(cdp),
    });
    const pending = findExtensionWorker(context, "nb");
    const rejected = assert.rejects(pending, /timed out/i);
    await setImmediate();
    if (stalled === "enable") context.emit("serviceworker", worker);
    await setImmediate();
    t.mock.timers.tick(10_001);
    await rejected;
    await setImmediate();
    assert.equal(context.listenerCount("serviceworker"), 0);
    assert.equal(cdp.eventNames().length, 0);
    assert.equal(closed, stalled === "page" ? 0 : 1);
    assert.equal(detached, ["page", "session"].includes(stalled) ? 0 : 1);
  }

  let wakeCount = 0;
  const cdp = Object.assign(new EventEmitter(), { detach: async () => {} });
  const context = Object.assign(new EventEmitter(), {
    serviceWorkers: () => [],
    newPage: async () => ({ close: async () => {} }),
    newCDPSession: async () => cdp,
  });
  cdp.send = async (method) => {
    if (method === "ServiceWorker.startWorker") {
      wakeCount++;
      queueMicrotask(() => context.emit("serviceworker", worker));
    } else {
      const state = { versions: [{ scriptURL: worker.url(), status: "activated", runningStatus: "stopped" }] };
      cdp.emit("ServiceWorker.workerVersionUpdated", state);
      cdp.emit("ServiceWorker.workerVersionUpdated", state);
    }
  };
  assert.equal(await findExtensionWorker(context, "nb"), worker);
  assert.equal(wakeCount, 1);
  assert.equal(context.listenerCount("serviceworker"), 0);
});
