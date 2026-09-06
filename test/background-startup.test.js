import assert from "node:assert/strict";
import test from "node:test";
import { loadBackground } from "./helpers/background-module.js";

test("background starts when Chrome has no contextMenus.onShown event", async () => {
  const listeners = { connect: [], message: [] };
  let installed;
  let startup;
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
      onStartup: { addListener: (listener) => { startup = listener; } },
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
    assert.equal(menu.title, "Translate Selected Text");
    chrome.i18n = { getMessage: () => "Ausgewählten Text übersetzen" };
    startup();
    assert.equal(menu.title, "Ausgewählten Text übersetzen", "Browser startup refreshes the menu language");
  } finally {
    delete globalThis.chrome;
  }
});

test("every storage area is protected before migration and any protection failure blocks runtime", async () => {
  for (const failedArea of ["local", "sync", "session"]) {
    const listeners = { message: [] };
    const protectedAreas = [];
    let migrations = 0;
    const area = (name) => ({
      get: async () => ({}),
      remove: async () => undefined,
      set: async () => undefined,
      setAccessLevel: async (options) => {
        protectedAreas.push([name, options.accessLevel]);
        if (name === failedArea) throw new Error("Cannot protect storage");
      },
    });
    globalThis.chrome = {
      contextMenus: {
        create: () => undefined,
        onClicked: { addListener: () => undefined },
        removeAll: (callback) => callback(),
      },
      runtime: {
        id: "test-extension",
        lastError: null,
        onConnect: { addListener: () => undefined },
        onInstalled: { addListener: () => undefined },
        onStartup: { addListener: () => undefined },
        onMessage: { addListener: (listener) => listeners.message.push(listener) },
      },
      storage: {
        local: area("local"),
        onChanged: { addListener: () => undefined },
        session: area("session"),
        sync: area("sync"),
      },
      tabs: {},
    };

    try {
      await loadBackground(() => ({
        readState: async () => ({ apiKey: null, revision: null }),
        migrate: async () => {
          migrations += 1;
          return { apiKey: null, revision: null };
        },
      }));
      const state = await new Promise((resolve) => listeners.message[0]({ action: "getRuntimeState" }, {
        id: "test-extension", url: "chrome-extension://test-extension/popup.html",
      }, resolve));
      assert.equal(state.ok, false);
      assert.equal(state.error.code, "service_error");
      assert.equal(migrations, 0);
      assert.deepEqual(protectedAreas.sort(), [
        ["local", "TRUSTED_CONTEXTS"],
        ["session", "TRUSTED_CONTEXTS"],
        ["sync", "TRUSTED_CONTEXTS"],
      ]);
    } finally {
      delete globalThis.chrome;
    }
  }
});
