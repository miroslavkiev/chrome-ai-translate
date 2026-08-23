import assert from "node:assert/strict";
import test from "node:test";

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
    await import(`../background.js?startup-test=${Date.now()}`);
    assert.equal(listeners.connect.length, 1);
    assert.equal(listeners.message.length, 1);
    installed();
    assert.deepEqual(menu.documentUrlPatterns, ["http://*/*", "https://*/*", "file://*/*"]);
  } finally {
    delete globalThis.chrome;
  }
});
