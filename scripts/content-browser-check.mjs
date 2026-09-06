import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, stableTextHash } from "../shared.js";
import { setTestApiKey, waitForRuntimeState } from "./browser-runtime-state.mjs";

// Use only a temporary profile, fixture pages, fake credentials, and fake provider replies.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const sourceRoot = process.argv.includes("--source");
const extension = sourceRoot ? fileURLToPath(new URL("..", import.meta.url))
  : process.env.EXTENSION_PATH || fileURLToPath(new URL("../dist", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "ai-translator-browser-"));
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
    // Keep extension APIs available in the browser's modern headless mode.
    headless: false,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--headless=new", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--disable-background-networking"],
    viewport: { width: 1100, height: 800 },
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const startupPage = await context.newPage();
    // Older Chrome exposes the worker before its module imports and bindings finish.
    const deadline = Date.now() + 10_000;
    await startupPage.goto(`chrome-extension://${extensionId}/settings.html`, { timeout: 10_000 });
    await waitForRuntimeState(startupPage, undefined, { allowStartup: true, timeout: Math.max(1, deadline - Date.now()) });
  await worker.evaluate(async ({ model, hash }) => {
    globalThis.probe = { starts: 0, delay: 0, failure: null, status: 503 };
    globalThis.fetch = async (url, options = {}) => {
      if (!String(url).includes(":generateContent")) {
        return new Response(JSON.stringify({ models: [{ name: `models/${model}`, outputTokenLimit: 8192,
          supportedGenerationMethods: ["generateContent"] }] }));
      }
      probe.starts += 1;
      if (probe.delay) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, probe.delay);
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
      if (probe.failure) return new Response(JSON.stringify({ error: { status: probe.failure } }), { status: probe.status, headers: probe.status === 429 ? { "Retry-After": "1" } : {} });
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Переклад" }] } }] }));
    };
    await chrome.storage.local.set({ modelCatalog: { apiKeyHash: hash, fetchedAt: Date.now(),
      models: [{ id: model, displayName: "Test model", outputTokenLimit: 8192, thinking: false }] } });
    await chrome.storage.sync.set({ triggerKey: "Control", targetLanguage: "uk", aiModel: model });
  }, { model: DEFAULTS.aiModel, hash: stableTextHash("browser-check-fake-key") });
  await setTestApiKey(startupPage, "browser-check-fake-key");
  await waitForRuntimeState(startupPage, (state) => state.configured);

  const html = `<!doctype html><html lang="de"><body>
    <p id="one">First sample paragraph.</p><p id="two">Second sample paragraph.</p>
    <a id="link" href="#one">Page link</a><textarea id="plain">Native textarea</textarea><div id="shadow"></div>
    <dialog id="dialog"><p id="modaltext">Modal sample text.</p><button id="dialog-button">Page dialog action</button></dialog>
    <div id="full"><p id="fulltext">Fullscreen text.</p><button id="fullscreen">Fullscreen</button></div>
    <script>document.querySelector('#fullscreen').onclick=()=>document.querySelector('#full').requestFullscreen();</script>
    </body></html>`;
  await context.route("**/*", (route) => /^https?:/.test(route.request().url())
    ? route.fulfill({ status: 200, contentType: "text/html", body: html }) : route.continue());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let contentContext;
  const exceptions = [];
  cdp.on("Runtime.executionContextCreated", ({ context: current }) => {
    if (current.name === "AI Translator") contentContext = current.id;
  });
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => exceptions.push(
    exceptionDetails.exception?.description || exceptionDetails.text,
  ));
  await cdp.send("Runtime.enable");
  const pause = () => page.waitForTimeout(100);
  async function load(suffix = "plain", scheme = "https") {
    contentContext = null;
    await page.goto(`${scheme}://browser-check.test/${suffix}`);
    await pause();
  }
  async function select(selector) {
    await page.evaluate((selector) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(selector));
      const selection = getSelection();
      selection.removeAllRanges(); selection.addRange(range);
    }, selector);
    await pause();
  }
  async function trigger(expected = "success") {
    const previousId = (await roots()).length ? (await state()).id : null;
    await page.keyboard.press("Control");
    // Negative checks allow pending key events to settle without inventing a result.
    if (expected === "none") return pause();
    return waitForCard(expected, { previousId });
  }
  async function roots() {
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const found = [];
    function visit(node) {
      if (node.nodeName === "AI-TRANSLATOR-CARD") found.push(node.shadowRoots[0]);
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) visit(child);
    }
    visit(root);
    return found;
  }
  async function inCard(fn, argument) {
    const shadow = (await roots()).at(-1);
    assert.ok(shadow, "Expected an open card");
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: shadow.backendNodeId });
    const response = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId,
      functionDeclaration: fn.toString(), arguments: [{ value: argument }], returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async function state() {
    return inCard(function () {
      const output = this.querySelector(".output");
      const visualStatus = this.querySelector(".state");
      return { id: this.querySelector(".title").id,
        phase: visualStatus.classList.contains("loading") ? "loading"
          : visualStatus.classList.contains("error") ? "error" : output.hidden ? "new" : "success",
        text: output.textContent, hidden: output.hidden, lang: output.lang, shellLang: this.host.lang,
        status: this.querySelector(".state").textContent, active: this.activeElement?.className,
        languageDisabled: this.querySelector("select").disabled,
        retryDisabled: [...this.querySelectorAll("button")].find((button) => button.textContent === "Retry").disabled,
        buttons: [...this.querySelectorAll("button")].filter((button) => !button.hidden).map((button) => button.textContent) };
    });
  }
  async function diagnostics() {
    const details = { url: page.url(), browser: context.browser()?.version(), exceptions };
    for (const [name, read] of Object.entries({
      card: async () => (await roots()).length ? state() : null,
      runtime: () => worker.evaluate(async () => {
        const session = await chrome.storage.session.get(["latestResult", "activeRequestCount"]);
        const latest = session.latestResult;
        return { fakeProvider: globalThis.probe, activeRequestCount: session.activeRequestCount,
          latest: latest && { status: latest.status, requestId: latest.requestId, error: latest.error } };
      }),
      storageApis: () => worker.evaluate(async () => {
        const checks = {};
        // Repeat only the access restrictions and reads, in this disposable profile.
        // Record no storage values, credentials, or source text.
        for (const [areaName, method, argument] of [
          ["local", "setAccessLevel", { accessLevel: "TRUSTED_CONTEXTS" }],
          ["session", "setAccessLevel", { accessLevel: "TRUSTED_CONTEXTS" }],
          ["local", "get", "geminiApiKey"],
          ["sync", "get", "geminiApiKey"],
        ]) {
          const area = chrome.storage[areaName];
          const check = { type: typeof area?.[method], error: null };
          try { await area[method](argument); }
          catch (error) { check.error = error.message; }
          checks[`${areaName}.${method}`] = check;
        }
        return checks;
      }),
      trustedRuntimeState: async () => {
        const diagnosticPage = await context.newPage();
        try {
          await diagnosticPage.goto(`chrome-extension://${extensionId}/popup.html`);
          return await diagnosticPage.evaluate(async () => {
            const result = await chrome.runtime.sendMessage({ action: "getRuntimeState" });
            return { ok: result?.ok, error: result?.error && {
              code: result.error.code, message: result.error.message,
            } };
          });
        } finally {
          await diagnosticPage.close();
        }
      },
      contentApis: () => cdp.send("Runtime.evaluate", { contextId: contentContext, returnByValue: true,
        expression: "({ secure: isSecureContext, randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues, showPopover: typeof HTMLElement.prototype.showPopover, runtimeConnect: typeof chrome.runtime.connect })" }),
    })) {
      try { details[name] = await read(); }
      catch (error) { details[name] = { unavailable: error.message }; }
    }
    return JSON.stringify(details, null, 2);
  }
  async function waitUntil(description, read, matches, { reject } = {}) {
    const deadline = Date.now() + 10_000;
    let current;
    while (Date.now() < deadline) {
      current = await read();
      if (matches(current)) return current;
      if (reject?.(current)) break;
      await page.waitForTimeout(50);
    }
    throw new Error(`Expected ${description}. Last value: ${JSON.stringify(current)}\n${await diagnostics()}`);
  }
  async function waitForCard(expected, { previousId } = {}) {
    return waitUntil(`a ${expected} card`, async () => (await roots()).length ? state() : null,
      (card) => card && card.id !== previousId && card.phase === expected,
      { reject: (card) => card && card.id !== previousId && expected === "success" && card.phase === "error" });
  }
  async function click(text, expected = text === "Retry" ? "success" : null) {
    const previousStarts = text === "Retry" && expected === "success"
      ? await worker.evaluate(() => probe.starts) : null;
    const rect = await inCard(function (text) {
      const button = [...this.querySelectorAll("button")].find((item) => item.textContent === text && !item.hidden);
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, text);
    await page.mouse.click(rect.x, rect.y);
    if (previousStarts !== null) {
      await waitUntil("Retry to start exactly one new request", () => worker.evaluate(() => probe.starts),
        (starts) => starts === previousStarts + 1);
    }
    if (expected) await waitForCard(expected);
    else await pause();
  }
  async function stubClipboard(success) {
    await cdp.send("Runtime.evaluate", { contextId: contentContext, expression:
      `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => {
        if (!${success}) throw new Error('Clipboard denied'); globalThis.copiedProbeText = text;
      } } });` });
  }

  async function sendContextMenu(text) {
    // The extension no longer has permission to read arbitrary tab URLs.
    await page.bringToFront();
    return worker.evaluate(async (text) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(tab?.id)) throw new Error("The test page is not the active tab");
      return chrome.tabs.sendMessage(tab.id, { action: "contextMenuTranslate", selectionText: text }, { frameId: 0 });
    }, text);
  }

  await load("http", "http"); await select("#one"); await trigger();
  assert.equal((await state()).text, "Переклад");
  await click("Copy"); assert.match((await state()).status, /Copy failed/);
  await page.keyboard.press("Escape"); assert.equal((await roots()).length, 0);

  await load("context-menu"); await select("#one");
  const beforeMenu = await worker.evaluate(async () => ({ starts: probe.starts,
    requestId: (await chrome.storage.session.get("latestResult")).latestResult?.requestId }));
  const delivered = await sendContextMenu(await page.evaluate(() => getSelection().toString()));
  assert.equal(delivered.accepted, true);
  await waitForCard("success");
  assert.equal((await state()).text, "Переклад");
  const afterMenu = await worker.evaluate(async () => ({ starts: probe.starts,
    latest: (await chrome.storage.session.get("latestResult")).latestResult }));
  assert.equal(afterMenu.starts, beforeMenu.starts + 1);
  assert.equal(afterMenu.latest.status, "success");
  assert.notEqual(afterMenu.latest.requestId, beforeMenu.requestId);
  await page.keyboard.press("Escape"); assert.equal((await roots()).length, 0);

  await load(); await select("#one"); await trigger();
  await page.keyboard.press("Escape"); assert.equal((await roots()).length, 0);
  await select("#one"); await trigger();
  assert.equal((await state()).lang, "uk");
  assert.equal((await state()).shellLang, await worker.evaluate(() => chrome.i18n.getMessage("ui_locale")));
  await page.keyboard.press("Tab"); assert.equal((await state()).active, "output");
  await page.keyboard.press("Tab"); assert.notEqual((await state()).active, "output");
  await stubClipboard(true); await click("Copy"); assert.equal((await state()).status, "Copied.");
  await stubClipboard(false); await click("Copy"); assert.match((await state()).status, /Copy failed/);

  await worker.evaluate(() => { probe.delay = 300; });
  const beforeLanguage = await worker.evaluate(() => probe.starts);
  await inCard(function () { const select = this.querySelector("select"); select.value = "fr"; select.dispatchEvent(new Event("change")); });
  assert.equal((await state()).text, ""); assert.equal((await state()).hidden, true);
  await waitForCard("success"); assert.equal(await worker.evaluate(() => probe.starts), beforeLanguage + 1);
  await worker.evaluate(() => { probe.delay = 0; });
  assert.equal((await state()).lang, "fr");
  assert.equal(await worker.evaluate(async () => (await chrome.storage.sync.get("targetLanguage")).targetLanguage), "uk");

  await worker.evaluate(() => { probe.delay = 600; probe.failure = "UNAVAILABLE"; });
  await click("Retry", "loading"); assert.equal((await state()).text, ""); assert.equal((await state()).hidden, true);
  await waitForCard("error"); assert.equal((await state()).text, ""); assert.match((await state()).status, /could not|reached/);
  await worker.evaluate(() => { probe.failure = null; });
  await click("Retry", "loading");
  await waitUntil("an active fake provider request", () => worker.evaluate(() => chrome.storage.session.get("activeRequestCount")),
    (session) => session.activeRequestCount === 1);
  await page.click("#two");
  assert.equal((await roots()).length, 0);
  const cancelled = await waitUntil("the cancelled request to finish", () => worker.evaluate(() => chrome.storage.session.get(["latestResult", "activeRequestCount"])),
    (session) => session.activeRequestCount === 0 && session.latestResult?.error?.code === "cancelled");
  assert.equal(cancelled.activeRequestCount, 0); assert.equal(cancelled.latestResult.error.code, "cancelled");
  await worker.evaluate(() => { probe.delay = 0; });

  await load("completed-cap"); await select("#one");
  for (let index = 0; index < 6; index += 1) await trigger();
  assert.equal((await roots()).length, 5);
  await page.mouse.click(1095, 795); assert.equal((await roots()).length, 0);

  await load("native-textarea");
  await page.locator("#plain").focus(); await page.locator("#plain").evaluate((input) => input.select());
  await pause(); await trigger(); assert.equal((await state()).text, "Переклад");

  await load("shadow");
  await page.evaluate(() => {
    const outer = document.querySelector("#shadow").attachShadow({ mode: "open" });
    const host = document.createElement("div"); outer.append(host);
    const root = host.attachShadow({ mode: "open" }); const input = document.createElement("textarea");
    input.value = "Nested selection"; root.append(input); input.focus(); input.select();
  });
  await pause(); await trigger(); assert.equal((await state()).text, "Переклад");
  await page.keyboard.press("Escape");
  const starts = await worker.evaluate(() => probe.starts);
  await page.evaluate(() => {
    const root = document.querySelector("#shadow").shadowRoot.firstChild.shadowRoot;
    const password = document.createElement("input"); password.type = "password"; password.value = "fake-secret";
    root.replaceChildren(password); password.focus(); password.select();
  });
  await pause(); await trigger("none"); assert.equal((await roots()).length, 0); assert.equal(await worker.evaluate(() => probe.starts), starts);

  await load("oversize"); await page.evaluate(() => { document.querySelector("#one").textContent = "x".repeat(10001); });
  await select("#one"); await trigger("error"); assert.match((await state()).status, /10,000/); assert.ok(!(await state()).buttons.includes("Retry"));
  await page.keyboard.press("Escape");
  assert.equal((await sendContextMenu("x".repeat(10001))).accepted, true, "Oversize error was not displayed");
  assert.match((await state()).status, /10,000/); assert.equal(await worker.evaluate(() => probe.starts), starts);

  await load("modal"); await page.evaluate(() => document.querySelector("#dialog").showModal());
  await select("#modaltext"); await trigger();
  assert.equal(await page.evaluate(() => document.querySelector("ai-translator-card").parentElement.id), "dialog");
  assert.equal(await page.evaluate(() => { const host = document.querySelector("ai-translator-card"); const rect = host.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.tagName; }), "AI-TRANSLATOR-CARD");
  await page.keyboard.press("Escape"); assert.equal((await roots()).length, 0); assert.equal(await page.locator("#dialog").evaluate((dialog) => dialog.open), true);
  await select("#modaltext"); await trigger();
  await page.keyboard.press("Tab"); assert.equal((await state()).active, "output");
  await inCard(function () { this.querySelector("select").focus(); });
  const beforeModalLanguage = await worker.evaluate(() => probe.starts);
  await page.keyboard.press("e");
  await waitUntil("the modal language change to start exactly one new request", () => worker.evaluate(() => probe.starts),
    (starts) => starts === beforeModalLanguage + 1);
  await waitForCard("success");
  assert.equal(await worker.evaluate(() => probe.starts), beforeModalLanguage + 1);
  assert.equal((await state()).lang, "en");
  await click("Retry"); assert.equal((await state()).text, "Переклад");
  await click("×"); assert.equal((await roots()).length, 0); assert.equal(await page.locator("#dialog").evaluate((dialog) => dialog.open), true);

  await load("fullscreen"); await page.click("#fullscreen"); await page.waitForFunction(() => document.fullscreenElement);
  await select("#fulltext"); await trigger();
  assert.equal(await page.evaluate(() => document.querySelector("ai-translator-card").parentElement.id), "full");
  await click("×"); assert.equal((await roots()).length, 0); await page.evaluate(() => document.exitFullscreen());

  await load("rate-delay");
  await worker.evaluate(() => { probe.failure = "RESOURCE_EXHAUSTED"; probe.status = 429; });
  await select("#one"); await trigger("error");
  assert.match((await state()).status, /Try again in 1 seconds/);
  assert.equal((await state()).retryDisabled, true); assert.equal((await state()).languageDisabled, true);
  await waitUntil("Retry to become available after the rate delay", state, (card) => !card.retryDisabled);
  await worker.evaluate(() => { probe.failure = null; probe.status = 503; });

  await load("settings-action"); await setTestApiKey(startupPage, null);
  await startupPage.close();
  await select("#one"); await trigger("error"); assert.ok((await state()).buttons.includes("Settings")); assert.ok(!(await state()).buttons.includes("Retry"));
  const settingsPage = context.waitForEvent("page"); await click("Settings"); const opened = await settingsPage;
  await opened.waitForURL(`chrome-extension://${extensionId}/settings.html`);
  assert.equal(exceptions.length, 0, exceptions.join("\n"));
  console.log(`Content browser checks passed (${sourceRoot ? "source root" : "built extension"}): HTTP, context-menu delivery, shadow/password, size errors, modal/fullscreen, keyboard, Copy/Settings, and unchanged cancellation/result clearing.`);
} finally {
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
