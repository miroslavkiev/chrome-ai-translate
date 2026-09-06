import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECOMMENDED_MODEL, stableTextHash } from "../shared.js";
import { setTestApiKey, waitForRuntimeState } from "./browser-runtime-state.mjs";

// Capture real extension UI using only a disposable profile and offline example data.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const extension = process.env.EXTENSION_PATH || path.join(root, "dist");
const output = path.join(root, "store", "assets");
const temporary = await mkdtemp(path.join(os.tmpdir(), "ai-translator-store-"));
const sample = "A short walk can help you see familiar places in a new way. Leave your phone in your pocket and notice the colors, sounds, and small details around you.";
const translation = "Коротка прогулянка допоможе побачити знайомі місця по-новому. Залиште телефон у кишені та зверніть увагу на кольори, звуки й дрібні деталі навколо вас.";
const fakeKey = "store-artwork-example-not-a-real-key";
const blockedRequests = [];
let context;
try {
  await mkdir(output, { recursive: true });
  context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
    headless: false,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--headless=new", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--disable-background-networking"],
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light",
    locale: "en-US", timezoneId: "UTC",
  });
  await context.route("**/*", (route) => {
    if (/^https?:/.test(route.request().url())) {
      blockedRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/settings.html`);
  await waitForRuntimeState(settings, undefined, { allowStartup: true });
  await settings.locator("#setupGuide").waitFor({ state: "visible" });
  assert.equal(await settings.locator("#apiKey").inputValue(), "");
  assert.equal(await settings.locator("#targetLanguage").inputValue(), "");
  await settings.locator("section[aria-labelledby='api-heading']").evaluate((element) => {
    window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 24);
  });
  const keyBounds = await settings.locator("#apiKey").boundingBox();
  assert.ok(keyBounds && keyBounds.y >= 0 && keyBounds.y + keyBounds.height <= 800, "The empty key field must fit in the setup screenshot");
  const keyRowBounds = await settings.locator(".row").filter({ has: settings.locator("#apiKey") }).boundingBox();
  const headerBounds = await settings.locator("#api-heading").boundingBox();
  const agreementBounds = await settings.locator("#dataAgreement").boundingBox();
  assert.ok(headerBounds && headerBounds.y >= 0, "The Gemini heading must remain visible");
  assert.ok(agreementBounds && agreementBounds.y >= 0 && agreementBounds.y + agreementBounds.height <= 800, "The complete agreement must remain visible");
  assert.ok(keyRowBounds && keyRowBounds.y + keyRowBounds.height <= 800, "The full API key row must fit in the setup screenshot");
  await settings.screenshot({ path: path.join(output, "03-guided-setup.png"), scale: "css" });

  await worker.evaluate(async ({ model, translatedText, key, hash }) => {
    globalThis.storeArtworkCalls = 0;
    globalThis.fetch = async (url) => {
      globalThis.storeArtworkCalls += 1;
      return new Response(JSON.stringify(String(url).includes(":generateContent")
        ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: translatedText }] } }] }
        : { models: [{ name: `models/${model}`, displayName: "Gemini 3.5 Flash-Lite", outputTokenLimit: 8192,
          supportedGenerationMethods: ["generateContent"] }] }));
    };
    await chrome.storage.local.set({ modelCatalog: { apiKeyHash: hash, fetchedAt: Date.now(),
      models: [{ id: model, displayName: "Gemini 3.5 Flash-Lite", outputTokenLimit: 8192, thinking: false }] } });
    await chrome.storage.sync.set({ triggerKey: "Control", targetLanguage: "uk", aiModel: model });
  }, { model: RECOMMENDED_MODEL, translatedText: translation, key: fakeKey, hash: stableTextHash(fakeKey) });
  await setTestApiKey(settings, fakeKey);
  await waitForRuntimeState(settings, (state) => state.configured);

  const icon = `data:image/png;base64,${(await readFile(path.join(root, "icon.png"))).toString("base64")}`;
  const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><title>A fresh view | Example document</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#faf9fd;color:#2c2439;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    header{height:130px;padding:34px 70px;display:flex;align-items:center;gap:20px;border-bottom:1px solid #e7e0f1;background:#f2edf9}
    header img{width:52px;height:52px}header strong{font-size:27px}header span{margin-left:auto;font-size:20px;color:#614887}
    main{width:680px;margin:62px 0 0 95px}small{font-size:14px;letter-spacing:1.8px;text-transform:uppercase;color:#786a8b}
    h1{font-size:52px;letter-spacing:-1.8px;margin:16px 0 22px}p{font-size:23px;line-height:1.62;margin:0 0 22px}
    .follow{color:#81768d;font-size:19px;max-width:620px}::selection{background:#dcc9fa;color:#2c2439}
    footer{position:fixed;bottom:28px;left:70px;font-size:14px;color:#796d87}</style>
    <header><img src="${icon}" alt=""><strong>AI Translator</strong><span>Select text. Press Control.</span></header>
    <main><small>Example document</small><h1>A fresh view</h1><p id="sample">${sample}</p>
    <p class="follow">Try a different route next time. Even a familiar street can offer something new to notice.</p></main>
    <footer>Example text and translation shown for this preview. Your own Gemini API key is required.</footer></html>`;
  await context.route("https://example.test/store-preview", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  const article = await context.newPage();
  await article.goto("https://example.test/store-preview");
  await article.locator("#sample").click();
  await article.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.getElementById("sample"));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await article.waitForTimeout(100);
  await article.keyboard.press("Control");
  await article.locator("ai-translator-card").waitFor();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 800 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitForRuntimeState(popup, (state) => state.latestResult?.status === "success" && state.activeRequestCount === 0);
  await popup.waitForFunction((text) => document.getElementById("latestResult").textContent === text, translation);
  await article.screenshot({ path: path.join(output, "01-select-and-translate.png"), scale: "css" });

  // A fixed example date keeps the public artwork repeatable without changing the captured UI.
  await worker.evaluate(async () => {
    const { latestResult } = await chrome.storage.session.get("latestResult");
    await chrome.storage.session.set({ latestResult: { ...latestResult, completedAt: Date.UTC(2026, 8, 5, 12, 30) } });
  });
  await popup.waitForFunction(() => document.getElementById("latestMeta").textContent.includes("12:30"));
  const popupHeight = Math.ceil(await popup.locator("main").evaluate((element) => element.getBoundingClientRect().height));
  await popup.setViewportSize({ width: 360, height: popupHeight });
  assert.equal(await popup.locator("#copyResult").isVisible(), true);
  const popupImage = `data:image/png;base64,${(await popup.screenshot()).toString("base64")}`;
  const layout = await context.newPage();
  await layout.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Latest translation</title>
    <style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f2edf9;color:#2c2439}
    main{height:800px;padding:64px 76px;display:grid;grid-template-columns:1fr 450px;gap:60px;align-items:center}
    .brand{display:flex;gap:16px;align-items:center;font-size:24px;font-weight:650;margin-bottom:50px}.brand img{width:48px;height:48px}
    small{color:#705b8c;font-size:14px;letter-spacing:1.5px;text-transform:uppercase}h1{font-size:56px;line-height:1.1;letter-spacing:-2px;margin:18px 0 24px}
    p{font-size:23px;line-height:1.5;color:#675775;max-width:510px}.source{padding-top:23px;border-top:1px solid #d8cee4;margin-top:30px;font-size:18px}
    figure{margin:0}figure img{display:block;width:450px;height:auto;box-shadow:0 16px 50px #35224b24;border:1px solid #ddd3e8;border-radius:8px}
    figcaption{font-size:14px;color:#766586;text-align:center;margin-top:16px}footer{position:absolute;bottom:28px;left:76px;color:#796d87;font-size:14px}</style>
    <main><section><div class="brand"><img src="${icon}" alt="">AI Translator</div><small>Latest translation</small>
    <h1>Read it again.<br>Copy when you need it.</h1><p>Open the extension to find the latest result from this browser session.</p>
    <p class="source"><strong>Example source</strong><br>${sample}</p></section>
    <figure><img src="${popupImage}" alt="Actual AI Translator popup with an example translation"><figcaption>Actual extension popup with example content</figcaption></figure></main>
    <footer>Your own Gemini API key is required. Tested on Mac.</footer></html>`);
  await layout.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await layout.screenshot({ path: path.join(output, "02-latest-result.png"), scale: "css" });

  const master = `data:image/png;base64,${(await readFile(path.join(root, "store", "source", "icon-master.png"))).toString("base64")}`;
  const artwork = await layout.evaluate(async ({ master, icon }) => {
    const source = new Image(); source.src = master; await source.decode();
    const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = source.width, top = source.height, right = 0, bottom = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (pixels[(y * source.width + x) * 4 + 3] >= 128) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    // Reuse the approved artwork at full quality, without generating a replacement mark.
    canvas.width = 1024; canvas.height = 1024;
    ctx.drawImage(source, left + 1, top + 1, right - left - 1, bottom - top - 1, 0, 0, 1024, 1024);
    const promoIcon = canvas.toDataURL("image/png");
    const square = new Image(); square.src = icon; await square.decode();
    canvas.width = 128; canvas.height = 128;
    ctx.drawImage(square, 16, 16, 96, 96);
    return { promoIcon, storeIcon: canvas.toDataURL("image/png") };
  }, { master, icon });
  await writeFile(path.join(output, "store-icon-128.png"), Buffer.from(artwork.storeIcon.split(",")[1], "base64"));
  for (const [name, width, height] of [["promo-small", 440, 280], ["promo-marquee", 1400, 560]]) {
    const small = width === 440;
    await layout.setViewportSize({ width, height });
    await layout.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>AI Translator</title>
      <style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:radial-gradient(ellipse at 18% 20%,#58317e 0,#291440 60%,#211033 100%);color:#fff}
      main{height:${height}px;display:flex;align-items:center;justify-content:center;gap:${small ? 26 : 92}px;padding:${small ? 28 : 72}px}
      img{width:${small ? 136 : 304}px;height:${small ? 136 : 304}px;filter:drop-shadow(0 20px 32px #14052355)}
      .brand{font-size:${small ? 18 : 27}px;color:#cbb4e7;font-weight:600;margin:0 0 ${small ? 12 : 22}px}
      h1{font-size:${small ? 29 : 70}px;line-height:1.14;letter-spacing:${small ? -1 : -2.5}px;margin:0;font-weight:650}
      .note{font-size:${small ? 11 : 21}px;color:#cbb4e7;margin:${small ? 16 : 28}px 0 0;line-height:1.5}</style>
      <main><img src="${artwork.promoIcon}" alt="AI Translator icon"><section><p class="brand">AI Translator</p>
      <h1>Select text.<br>Press Control.</h1><p class="note">Bring your own Gemini API key${small ? "" : ".<br>Tested on Mac."}</p></section></main></html>`);
    await layout.locator("img").evaluate((image) => image.decode());
    assert.equal(await layout.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await layout.screenshot({ path: path.join(output, `${name}.png`), scale: "css" });
  }
  assert.equal(blockedRequests.length, 0, "An unexpected external page request was blocked");
  assert.ok(await worker.evaluate(() => storeArtworkCalls >= 1));
  for (const [file, width, height] of [
    ["01-select-and-translate.png", 1280, 800], ["02-latest-result.png", 1280, 800], ["03-guided-setup.png", 1280, 800],
    ["promo-small.png", 440, 280], ["promo-marquee.png", 1400, 560], ["store-icon-128.png", 128, 128],
  ]) {
    const png = await readFile(path.join(output, file));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
  }
  console.log("Rendered six draft Store assets from the actual extension UI. No external request or real key was used.");
} finally {
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
