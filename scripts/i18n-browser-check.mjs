import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { RECOMMENDED_MODEL } from "../shared.js";
import { findExtensionWorker, waitForRuntimeState } from "./browser-runtime-state.mjs";
import { SUPPORTED_LOCALES } from "./locales.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const extension = process.env.EXTENSION_PATH || fileURLToPath(new URL("../dist", import.meta.url));
const locales = (process.env.I18N_TEST_LOCALES || "en,en_AU,de,ar,ja,nb,uk,zh_CN,ur").split(",");


for (const locale of locales) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "ai-translator-locale-"));
  // The tested macOS Chrome maps Australian English to en-GB; Linux keeps en-AU.
  const language = locale === "en" ? "en-US" : locale.replaceAll("_", "-");
  const catalogLocale = locale === "en" ? "en_US" : locale === "en_AU" && process.platform === "darwin" ? "en_GB"
    : SUPPORTED_LOCALES.includes(locale) ? locale : "en";
  const catalog = JSON.parse(await readFile(path.join(extension, "_locales", catalogLocale, "messages.json"), "utf8"));
  // macOS needs a process-only Apple language override for real Chrome message selection.
  // Playwright's locale option changes web APIs but does not select extension catalogs.
  const child = spawn(process.env.CHROME_PATH || chromium.executablePath(), [
    "--headless=new", "--no-sandbox", `--user-data-dir=${profile}`, "--remote-debugging-port=0",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-extensions-with-background-pages", "--use-mock-keychain",
    `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, `--lang=${language}`,
    ...(process.platform === "darwin" ? ["-AppleLanguages", `(${language})`] : []),
  ], { env: { ...process.env, LANGUAGE: language }, stdio: "ignore" });
  let browser;
  let launchError;
  child.on("error", (error) => { launchError = error; });
  try {
    let port;
    const deadline = Date.now() + 15_000;
    while (!port && Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Chrome exited: ${child.exitCode}`);
      try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
      catch { await delay(50); }
    }
    assert.ok(port, "Chrome must open a debugging port");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const worker = await findExtensionWorker(context, locale);
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    const errors = [];
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 800 });
    await worker.evaluate((model) => {
      globalThis.providerCalls = 0;
      globalThis.translationCalls = 0;
      globalThis.fetch = async (url, options) => {
        globalThis.providerCalls += 1;
        if (String(url).includes(":generateContent")) {
          globalThis.translationCalls += 1;
          globalThis.translationPrompt = JSON.parse(options.body).systemInstruction.parts[0].text;
          return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Приклад перекладу" }] } }] }));
        }
        return new Response(JSON.stringify({ models: [{ name: `models/${model}`, displayName: model,
          outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] }] }));
      };
    }, RECOMMENDED_MODEL);
    await page.goto(`${base}/settings.html`);
    await waitForRuntimeState(page, undefined, { allowStartup: true });
    for (const route of ["help", "about", "popup", "settings"]) {
      await page.goto(`${base}/${route}.html`);
      if (route === "settings") await waitForRuntimeState(page);
      const result = await page.evaluate(() => ({
        direction: document.documentElement.dir,
        language: document.documentElement.lang,
        agreement: chrome.i18n.getMessage("html_agree_and_connect_to_google"),
        description: chrome.runtime.getManifest().description,
        locale: chrome.i18n.getMessage("@@ui_locale"),
        overflow: document.documentElement.scrollWidth > innerWidth,
        links: [...document.querySelectorAll("[data-i18n] a")].every((link) => /^https?:|\.html(?:#|$)/.test(link.getAttribute("href"))),
        markers: /<\/?\d+>/.test(document.body.textContent),
      }));
      assert.equal(result.description, catalog.extDescription.message, `${locale}: native manifest localization`);
      assert.equal(result.language, catalog.ui_locale.message);
      assert.equal(result.direction, ["ar", "fa", "he"].includes(catalogLocale) ? "rtl" : "ltr");
      assert.equal(result.overflow, false, `${locale}/${route}: horizontal overflow`);
      assert.equal(result.markers, false, `${locale}/${route}: leaked translation markers`);
      assert.equal(result.links, true, `${locale}/${route}: trusted links preserved`);
      if (route === "help") {
        assert.equal(await page.locator("#faq h3").first().textContent(), catalog.refresh_faq_question.message);
        assert.equal(await page.locator('[data-i18n="refresh_faq_answer"] strong').count(), 1);
      }
    }
    assert.equal(await worker.evaluate(() => globalThis.providerCalls), 0);
    assert.equal(await page.locator("#apiKey").isDisabled(), true);
    assert.equal(await page.locator("#agreeDataSharing").textContent(), catalog.html_agree_and_connect_to_google.message);
    await page.locator("#agreeDataSharing").click();
    await page.locator("#apiKey").fill("locale-test-fake-key");
    await page.locator("#apiKey").blur();
    await page.locator("#refreshPagesDialog[open]").waitFor();
    assert.equal(await page.locator("#refreshPagesHeading").textContent(), catalog.refresh_heading.message);
    assert.equal(await page.locator("#refreshPagesHeading").evaluate((element) => getComputedStyle(element).fontWeight), "700");
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      const fits = await page.locator("#refreshPagesDialog").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth;
      });
      assert.equal(fits, true, `${locale}: dialog fits narrow screens`);
      if (process.env.BROWSER_EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.BROWSER_EVIDENCE_DIR, `refresh-${locale}-${colorScheme}.png`) });
    }
    await page.locator("#refreshPagesDismiss").click();
    await page.locator("#targetLanguage").selectOption("uk");
    await page.locator("#saveButton").click();
    await waitForRuntimeState(page, (state) => state.configured);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#targetLanguage").value === "uk");
    assert.equal(await page.locator("#refreshPagesDialog").isVisible(), false);
    await context.route("https://example.test/localization", (route) => route.fulfill({ contentType: "text/html",
      body: '<!doctype html><html lang="fr" dir="ltr"><p id="sample">A short example to translate.</p></html>' }));
    await page.goto("https://example.test/localization");
    await page.locator("#sample").click();
    await page.evaluate(async () => {
      const settled = new Promise((resolve) => document.addEventListener("selectionchange", resolve, { once: true }));
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("sample"));
      getSelection().removeAllRanges(); getSelection().addRange(range);
      await settled;
    });
    // The shortcut becomes available after the content script reads saved settings.
    // A card is created synchronously by a handled key release. Retry only while
    // no card exists, without reaching into the extension's private state.
    const cardDeadline = Date.now() + 10_000;
    while (await page.locator("ai-translator-card").count() === 0 && Date.now() < cardDeadline) {
      await page.keyboard.press("Control");
      if (await page.locator("ai-translator-card").count() === 0) await delay(50);
    }
    assert.equal(await page.locator("ai-translator-card").count(), 1, `${locale}: keyboard translation creates one card`);
    const popup = await context.newPage();
    await popup.goto(`${base}/popup.html`);
    await waitForRuntimeState(popup, (state) => state.latestResult?.status === "success");
    assert.equal(await worker.evaluate(() => globalThis.translationCalls), 1, `${locale}: one translation request`);
    assert.match(await worker.evaluate(() => globalThis.translationPrompt), /Translate the user text to Ukrainian\./);
    const cdp = await context.newCDPSession(page);
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const findCard = (node) => node.nodeName === "AI-TRANSLATOR-CARD" ? node
      : [...(node.children || []), ...(node.shadowRoots || [])].map(findCard).find(Boolean);
    const card = findCard(root);
    assert.ok(card?.shadowRoots?.[0], `${locale}: translation card has an isolated root`);
    const { object } = await cdp.send("DOM.resolveNode", { nodeId: card.shadowRoots[0].nodeId });
    const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true,
      functionDeclaration: 'function () { return { lang: this.host.lang, dir: this.host.dir, close: this.querySelector(".close").getAttribute("aria-label") }; }' });
    assert.equal(result.value.lang, catalog.ui_locale.message);
    assert.equal(result.value.dir, ["ar", "fa", "he"].includes(catalogLocale) ? "rtl" : "ltr");
    assert.equal(result.value.close, catalog.runtime_close_card.message);
    await cdp.detach();
    assert.deepEqual(errors, []);
    console.log(`Native locale ${locale}, displayed catalog ${catalogLocale}: four pages, setup, refresh dialog, narrow layout, saved target and translation card passed (${browser.version()}).`);
  } finally {
    await browser?.close();
    if (child.exitCode === null) child.kill("SIGTERM");
    const deadline = Date.now() + 5_000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(50);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
