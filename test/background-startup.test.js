import assert from "node:assert/strict";
import test from "node:test";
import { loadBackground } from "./helpers/background-module.js";

test("background starts when Chrome has no contextMenus.onShown event", async () => {
  const listeners = { connect: [], message: [] };
  let installed;
  let menu;
  const area = {
    get: async () => ({}),
    remove: async () => undefined,
    set: async () => undefined,
    setAccessLevel: async () => undefined,
  };
  globalThis.chrome = {
    contextMenus: {
      create: (properties) => { menu = properties; },
      onClicked: { addListener: () => undefined },
      removeAll: (callback) => callback(),
    },
    runtime: {
      id: "test-extension",
      lastError: null,
      onConnect: { addListener: (listener) => listeners.connect.push(listener) },
      onInstalled: { addListener: (listener) => { installed = listener; } },
      onMessage: { addListener: (listener) => listeners.message.push(listener) },
    },
    storage: {
      local: area,
      onChanged: { addListener: () => undefined },
      session: area,
      sync: area,
    },
    tabs: {},
  };

  try {
    await loadBackground(() => ({
      readState: async () => ({ apiKey: null, revision: null }),
      migrate: async () => ({ apiKey: null, revision: null }),
    }));
    await new Promise((resolve) => listeners.message[0]({ action: "getRuntimeState" }, {
      id: "test-extension", url: "chrome-extension://test-extension/popup.html",
    }, resolve));
    assert.equal(listeners.connect.length, 1);
    assert.equal(listeners.message.length, 1);
    installed();
    assert.deepEqual(menu.documentUrlPatterns, ["http://*/*", "https://*/*", "file://*/*"]);
  } finally {
    delete globalThis.chrome;
  }
});
