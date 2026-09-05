import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULTS, LANGUAGES, RECOMMENDED_MODEL } from "../shared.js";
import { waitForRuntimeState } from "./browser-runtime-state.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const extension = process.env.EXTENSION_PATH || fileURLToPath(new URL("../dist", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "ai-translator-pages-"));
// Only the temporary browser profile contains these fake credentials and replies.
let context;
try {
context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
  headless: false,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chromium" }),
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--headless=new", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--disable-background-networking"],
});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(({ model, recommended }) => {
    globalThis.probe = { calls: 0, reject: false };
    globalThis.fetch = async (url) => {
      probe.calls += 1;
      if (probe.reject) return new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), { status: 401 });
      return new Response(JSON.stringify(String(url).includes(":generateContent")
        ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Sample translation" }] } }] }
        : { models: [model, recommended, "gemini-test-model"].map((id) => ({ name: `models/${id}`, displayName: id,
          outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] })) }));
    };
  }, { model: DEFAULTS.aiModel, recommended: RECOMMENDED_MODEL });
  const exceptions = [];
  context.on("page", (page) => page.on("pageerror", (error) => exceptions.push(error.message)));
  async function open(name) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${name}.html`);
    return page;
  }
  async function textIs(page, id, text) {
    await page.waitForFunction(({ id, text }) => document.getElementById(id).textContent.includes(text), { id, text });
  }
  const popup = await open("popup");
  await textIs(popup, "openSettings", "Start setup");
  assert.equal(await popup.locator("#welcome").isVisible(), true);
  await popup.evaluate(() => {
    globalThis.originalOpenOptions = chrome.runtime.openOptionsPage;
    chrome.runtime.openOptionsPage = async () => { throw new Error("Test options failure"); };
  });
  await popup.locator("#openSettings").click();
  await textIs(popup, "latestResult", "Settings could not be opened");
  assert.equal(await popup.locator("#latestResult").isVisible(), true);
  await popup.reload();
  await textIs(popup, "openSettings", "Start setup");
  const first = await open("settings");
  await textIs(first, "setupStatus", "Add an API key");
  assert.equal(await first.locator("#setupGuide").isVisible(), true);
  assert.equal(await first.locator("#targetLanguage").inputValue(), "");
  assert.equal(await first.locator("#targetLanguage option").count(), LANGUAGES.length + 1);
  assert.equal(await first.locator("#aiModel").inputValue(), RECOMMENDED_MODEL);
  assert.equal(await first.getByText(/demo key/i).count(), 0);
  if (process.env.BROWSER_EVIDENCE_DIR) {
    await first.screenshot({ path: path.join(process.env.BROWSER_EVIDENCE_DIR, "setup-no-key.png"), fullPage: true });
    for (const [heading, file] of [["api-heading", "setup-key.png"], ["translation-heading", "setup-language.png"]]) {
      await first.locator(`section[aria-labelledby='${heading}']`).screenshot({ path: path.join(process.env.BROWSER_EVIDENCE_DIR, file) });
    }
  }
  await first.locator("#apiKey").fill("browser-ui-fake-key");
  await first.locator("#apiKey").blur();
  await textIs(first, "setupStatus", "Choose a target language");
  await textIs(popup, "openSettings", "Finish setup");
  assert.equal(await popup.locator("#welcome").isVisible(), false);
  await first.reload();
  await textIs(first, "setupStatus", "Choose a target language");
  assert.equal(await first.locator("#targetLanguage").inputValue(), "");
  await first.locator("#targetLanguage").selectOption("en");
  await first.locator("#saveButton").click();
  await textIs(first, "setupStatus", "Ready");
  await textIs(popup, "status", "Ready");
  assert.equal(await first.locator("#setupGuide").isVisible(), false);
  await first.locator("#aiModel").selectOption("gemini-test-model");
  await first.locator("#recommendedModel").click();
  assert.equal(await first.locator("#aiModel").inputValue(), RECOMMENDED_MODEL);
  const second = await open("settings");
  await textIs(second, "setupStatus", "Ready");
  await first.locator("#targetLanguage").selectOption("de");
  await second.locator("#disableKey").click();
  await second.locator("#aiModel").selectOption("gemini-test-model");
  await second.locator("#saveButton").click();
  await textIs(first, "shortcutValue", "Off");
  await first.locator("#saveButton").click();
  await textIs(first, "saveStatus", "Preferences saved.");
  const saved = await worker.evaluate(() => chrome.storage.sync.get(["targetLanguage", "triggerKey", "aiModel"]));
  assert.deepEqual(saved, { targetLanguage: "de", triggerKey: null, aiModel: "gemini-test-model" });

  await first.locator("#targetLanguage").selectOption("fr");
  await second.locator("#targetLanguage").selectOption("es");
  await second.locator("#saveButton").click();
  await first.locator("#reloadSettings").waitFor({ state: "visible" });
  assert.equal(await first.locator("#targetLanguage").inputValue(), "fr");
  assert.equal(await first.locator("#saveButton").isDisabled(), true);
  await first.locator("#reloadSettings").click();
  await first.waitForFunction(() => document.querySelector("#targetLanguage").value === "es");

  await textIs(popup, "status", "Ready");
  for (const language of LANGUAGES) {
    await worker.evaluate(async (language) => chrome.storage.session.set({ latestResult: {
      status: "success", translatedText: `Sample ${language.code}`, targetLanguage: language.code,
      completedAt: Date.UTC(2026, 8, 5, 12, 30),
    } }), language);
    await textIs(popup, "latestResult", `Sample ${language.code}`);
    assert.equal(await popup.locator("#latestResult").getAttribute("lang"), language.code);
    const metadata = await popup.locator("#latestMeta").textContent();
    assert(metadata.startsWith(language.name) && metadata.includes("2026"));
  }
  await popup.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: async (text) => { globalThis.copiedText = text; } } }));
  await popup.locator("#copyResult").click(); await textIs(popup, "copyStatus", "Copied.");
  assert.equal(await popup.evaluate(() => copiedText), `Sample ${LANGUAGES.at(-1).code}`);
  await popup.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: async () => { throw new Error("Denied"); } } }));
  await popup.locator("#copyResult").click(); await textIs(popup, "copyStatus", "Copy was blocked");
  await worker.evaluate(() => chrome.storage.session.set({ latestResult: {
    status: "success", translatedText: "Long result line\n".repeat(100), targetLanguage: "en", completedAt: Date.now(),
  } }));
  await textIs(popup, "latestResult", "Long result line");
  await popup.locator("#latestResult").focus(); await popup.keyboard.press("ArrowDown");
  await popup.waitForFunction(() => document.getElementById("latestResult").scrollTop > 0);
  assert.equal(await popup.locator("#latestResult").getAttribute("tabindex"), "0");

  await worker.evaluate(() => { probe.reject = true; });
  await first.locator("#refreshModels").click();
  await textIs(first, "setupStatus", "rejected");
  await textIs(popup, "status", "Key rejected");
  await second.reload(); await textIs(second, "setupStatus", "rejected");
  const rejectedCalls = await worker.evaluate(() => probe.calls);
  await popup.reload(); await textIs(popup, "status", "Key rejected");
  assert.equal(await worker.evaluate(() => probe.calls), rejectedCalls);
  await worker.evaluate(() => { probe.reject = false; });
  await second.locator("#refreshModels").click();
  await textIs(second, "setupStatus", "Ready"); await textIs(first, "setupStatus", "Ready");
  await textIs(popup, "status", "Ready");

  // An unavailable model remains selected until the user chooses its replacement.
  await worker.evaluate(() => chrome.storage.sync.set({ aiModel: "gemini-unavailable-model" }));
  await first.reload();
  await textIs(first, "setupStatus", "Choose an available model");
  assert.equal(await first.locator("#aiModel").inputValue(), "gemini-unavailable-model");
  await first.locator("#recommendedModel").click();
  await first.locator("#saveButton").click();
  await textIs(popup, "status", "Ready");

  const help = await open("help");
  const about = await open("about");
  assert.equal(await help.locator("a[href='https://aistudio.google.com/apikey']").count(), 1);
  assert.equal(await about.locator("a[href='https://www.sternenkofund.org/en/donate']").count(), 1);
  assert.equal(await first.locator("a[href='https://www.sternenkofund.org/en/donate']").count(), 0);
  for (const page of [help, about]) {
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 320, height: 760 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.close();
  }

  for (const page of [first, popup]) {
    await page.setViewportSize({ width: 320, height: 760 });
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator("link[href='ui.css']").count(), 1);
      if (process.env.BROWSER_EVIDENCE_DIR) await page.screenshot({
        path: path.join(process.env.BROWSER_EVIDENCE_DIR, `${page === first ? "settings" : "popup"}-${colorScheme}.png`), fullPage: true,
      });
    }
  }

  await worker.evaluate(() => chrome.storage.sync.set({ triggerKey: "Control", targetLanguage: "uk" }));
  const fixture = "<!doctype html><p id='text'>Sample selection.</p><iframe srcdoc=\"<p id='text'>Frame selection.</p>\"></iframe>";
  await context.route("https://browser-check.test/**", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  const page = await context.newPage();
  async function translate(frame) {
    const before = await worker.evaluate(async () => (await chrome.storage.session.get("latestResult")).latestResult?.requestId);
    await frame.locator("#text").click();
    await frame.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector("#text"));
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.waitForTimeout(100); await page.keyboard.press("Control");
    await frame.locator("ai-translator-card").waitFor();
    await waitForRuntimeState(popup, (state) => state.latestResult?.status === "success" && state.latestResult.requestId
      && state.latestResult.requestId !== before && state.activeRequestCount === 0);
    await popup.waitForFunction(() => document.querySelector("#latestResult").textContent === "Sample translation");
  }
  await page.goto("https://browser-check.test/frames");
  const frame = await page.frameLocator("iframe").locator("#text").elementHandle();
  await translate(await frame.ownerFrame());
  assert.equal(await page.locator("ai-translator-card").count(), 0);
  assert.equal(await worker.evaluate(() => chrome.extension.isAllowedFileSchemeAccess()), true);
  const localFile = path.join(temporary, "sample.html"); await writeFile(localFile, fixture);
  await page.goto(pathToFileURL(localFile).href); await translate(page);
  await page.goto("chrome://version");
  await page.keyboard.press("Control");
  assert.equal(await page.locator("ai-translator-card").count(), 0);

  // Stop only the fixture worker, with no provider key, and check real session survival.
  await first.close(); await second.close(); await popup.close();
  await worker.evaluate(() => chrome.storage.local.remove("geminiApiKey"));
  const beforeRestart = await worker.evaluate(async () => {
    await chrome.storage.session.set({ activeRequestCount: 9 });
    return chrome.storage.session.get(["latestResult", "rateStarts"]);
  });
  assert.ok(beforeRestart.rateStarts.length >= 2);
  const management = await context.newPage(); await management.goto("chrome://extensions");
  const cdp = await context.newCDPSession(management);
  let version;
  const workerVersion = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The extension worker was not reported by Chrome")), 10_000);
    cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
      version = versions.find((item) => item.scriptURL === worker.url()) || version;
      if (version) { clearTimeout(timer); resolve(version); }
    });
  });
  await cdp.send("ServiceWorker.enable");
  const currentVersion = await workerVersion;
  await cdp.send("ServiceWorker.stopWorker", { versionId: currentVersion.versionId });
  await cdp.send("ServiceWorker.startWorker", { scopeURL: `chrome-extension://${extensionId}/` });
  const restartedPopup = await open("popup"); await textIs(restartedPopup, "status", "Add API key");
  const afterRestart = await restartedPopup.evaluate(() => chrome.storage.session.get(["latestResult", "rateStarts", "activeRequestCount"]));
  assert.deepEqual(afterRestart.latestResult, beforeRestart.latestResult);
  assert.deepEqual(afterRestart.rateStarts, beforeRestart.rateStarts);
  assert.equal(afterRestart.activeRequestCount, 0);
  await restartedPopup.close();

  await management.evaluate((extensionId) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, fileAccess: false }), extensionId);
  assert.equal(await management.evaluate(async (id) => (await chrome.developerPrivate.getExtensionInfo(id)).fileAccess.isActive, extensionId), false);
  await page.goto(pathToFileURL(localFile).href);
  await page.locator("#text").click();
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#text"));
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.waitForTimeout(100); await page.keyboard.press("Control"); await page.waitForTimeout(100);
  assert.equal(await page.locator("ai-translator-card").count(), 0);
  assert.equal(exceptions.length, 0, exceptions.join("\n"));
  console.log(`Extension page checks passed on Chrome ${context.browser().version()}: setup, stale/conflicting tabs, key recovery, popup languages/Copy, narrow layouts, frames, file access on/off, and worker restart.`);
} finally {
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
