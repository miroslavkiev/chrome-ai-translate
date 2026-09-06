import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpack from "webpack";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "ai-translator-vault-"));
const extension = path.join(temporary, "extension");
let context;

async function launch() {
  context = await chromium.launchPersistentContext(path.join(temporary, "profile"), {
    headless: false,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--headless=new", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--disable-background-networking"],
  });
  await context.route("**/*", (route) => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/test.html`);
  await page.waitForFunction(async () => {
    try { return await chrome.runtime.sendMessage("testReady") === true; }
    catch { return false; }
  }, undefined, { timeout: 15_000 });
  return context.serviceWorkers().find((candidate) => candidate.url() === worker.url()) || worker;
}

function check(results) {
  for (const [name, passed] of Object.entries(results)) assert.equal(passed, true, name);
}

try {
  await mkdir(extension);
  await writeFile(path.join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "Offline credential store check", version: "1.0",
    background: { service_worker: "background.js", type: "module" },
  }));
  const entry = path.join(temporary, "entry.js");
  await writeFile(entry,
    `import { createCredentialStore } from ${JSON.stringify(path.join(root, "credential-store.js"))}; globalThis.createTestStore = createCredentialStore; chrome.runtime.onMessage.addListener((_message, _sender, reply) => reply(true));`);
  // Match production bundling: extension workers do not support native JSON imports reliably.
  await new Promise((resolve, reject) => webpack({ mode: "none", target: "webworker", entry,
    output: { path: extension, filename: "background.js" }, devtool: false,
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
  await writeFile(path.join(extension, "test.html"), '<!doctype html><title>Offline credential test</title>');

  let worker = await launch();
  const first = await worker.evaluate(async () => {
    // The temporary profile and fake values never contact a provider.
    const firstKey = "offline-test-value-one";
    const secondKey = "offline-test-value-two";
    const legacyKey = "offline-legacy-value";
    const make = (name, options = {}) => createTestStore({ databaseName: `test-${name}`, ...options });
    const raw = async (name, transform) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`test-${name}`, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction("credentials", transform ? "readwrite" : "readonly");
          const store = transaction.objectStore("credentials");
          const request = store.get("primary");
          let value;
          request.onsuccess = () => {
            value = request.result;
            if (transform) store.put(transform(value), "primary");
          };
          transaction.oncomplete = () => resolve(value);
          transaction.onerror = transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    };
    const rejectsSafely = async (operation) => {
      try { await operation(); return false; }
      catch (error) { return error.message === "Encrypted key storage could not be read or saved."; }
    };
    const results = {};
    const vault = make("persistent");
    const empty = await vault.readState();
    results.emptyVault = empty.apiKey === null && empty.revision === null;
    results.invalidInputFails = await rejectsSafely(() => vault.write("bad"));
    results.invalidInputKeepsEmpty = (await vault.readState()).revision === null;
    const initial = await vault.write(firstKey);
    const initialRecord = await raw("persistent");
    results.encryptedRecord = initialRecord.version === 1 && initialRecord.key.extractable === false
      && initialRecord.key.algorithm.name === "AES-GCM" && initialRecord.key.algorithm.length === 256
      && initialRecord.iv.length === 12 && !Object.hasOwn(initialRecord, "apiKey");
    let exportBlocked = false;
    try { await crypto.subtle.exportKey("raw", initialRecord.key); }
    catch (error) { exportBlocked = error.name === "InvalidAccessError"; }
    results.exportBlocked = exportBlocked;
    const repeated = await vault.write(firstKey);
    const repeatedRecord = await raw("persistent");
    results.freshRevisionAndIv = repeated.revision !== initial.revision
      && initialRecord.iv.some((value, index) => value !== repeatedRecord.iv[index]);

    // Force a real IDB transaction abort after put. The previous singleton must survive.
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      this.transaction.abort();
      return request;
    };
    try { results.abortedWriteFails = await rejectsSafely(() => vault.write(secondKey)); }
    finally { IDBObjectStore.prototype.put = originalPut; }
    const afterAbort = await vault.readState();
    results.abortedWritePreservesOldRecord = afterAbort.apiKey === firstKey && afterAbort.revision === repeated.revision;

    const migration = make("migration");
    const migrated = await migration.migrate({ localKey: firstKey, syncKey: secondKey });
    results.localLegacyWins = migrated.apiKey === firstKey && migrated.revision !== null;
    const preserved = await migration.migrate({ localKey: legacyKey, syncKey: secondKey });
    results.existingVaultWins = preserved.apiKey === firstKey && preserved.revision === migrated.revision;
    const syncOnly = make("sync-only");
    results.syncLegacyFallback = (await syncOnly.migrate({ localKey: "bad", syncKey: secondKey })).apiKey === secondKey;

    // A verification read can fail after the write commits. Migration must reject,
    // leaving the caller's legacy fields intact, and be safe to retry next time.
    const verifyFailure = make("verify-failure");
    await verifyFailure.readState();
    const originalTransaction = IDBDatabase.prototype.transaction;
    let readCount = 0;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = originalTransaction.apply(this, args);
      if (this.name === "test-verify-failure" && args[1] === "readonly" && ++readCount === 2) {
        queueMicrotask(() => transaction.abort());
      }
      return transaction;
    };
    const legacy = { localKey: legacyKey };
    try {
      results.failedVerificationRejectsMigration = await rejectsSafely(async () => {
        await verifyFailure.migrate(legacy);
        delete legacy.localKey;
      });
    } finally { IDBDatabase.prototype.transaction = originalTransaction; }
    results.failedVerificationKeepsLegacy = legacy.localKey === legacyKey;
    results.migrationRetryRecovers = (await verifyFailure.migrate(legacy)).apiKey === legacyKey;

    const corrupt = make("corrupt");
    await corrupt.write(firstKey);
    await raw("corrupt", (record) => {
      new Uint8Array(record.ciphertext)[0] ^= 1;
      return record;
    });
    results.corruptionFailsClosed = await rejectsSafely(() => corrupt.readState());
    results.corruptionNeverFallsBack = await rejectsSafely(() => corrupt.migrate({ localKey: legacyKey }));
    results.explicitReplacementRepairs = (await corrupt.write(secondKey)).apiKey === secondKey;
    await raw("corrupt", (record) => ({ ...record, revision: crypto.randomUUID() }));
    results.revisionTamperRejected = await rejectsSafely(() => corrupt.readState());
    await raw("corrupt", (record) => ({ ...record, version: 2 }));
    results.futureVersionRejected = await rejectsSafely(() => corrupt.migrate({ localKey: legacyKey }));

    const tombstone = await migration.remove();
    const removedRecord = await raw("migration");
    results.removalDropsAllSecretFields = tombstone.apiKey === null && tombstone.revision !== migrated.revision
      && Object.keys(removedRecord).sort().join(",") === "deleted,revision,version";
    results.removalPreventsLegacyRestore = (await migration.migrate({ localKey: legacyKey, syncKey: secondKey })).revision === tombstone.revision;
    const removedAgain = await migration.remove();
    results.repeatedRemovalChangesRevision = removedAgain.revision !== tombstone.revision;
    await Promise.all([vault, migration, syncOnly, verifyFailure, corrupt].map((store) => store.close()));
    return { results, persistentRevision: repeated.revision, removedRevision: removedAgain.revision };
  });
  check(first.results);
  const version = context.browser().version();
  await context.close(); context = null;
  worker = await launch();
  const restart = await worker.evaluate(async ({ persistentRevision, removedRevision }) => {
    const vault = createTestStore({ databaseName: "test-persistent" });
    const state = await vault.readState();
    const removed = createTestStore({ databaseName: "test-migration" });
    const tombstone = await removed.migrate({ localKey: "offline-legacy-value" });
    await Promise.all([vault.close(), removed.close()]);
    return {
      fullRestartKeepsKeyAndRevision: state.apiKey === "offline-test-value-one" && state.revision === persistentRevision,
      fullRestartKeepsRemoval: tombstone.apiKey === null && tombstone.revision === removedRevision,
    };
  }, { persistentRevision: first.persistentRevision, removedRevision: first.removedRevision });
  check(restart);
  console.log(`Credential store checks passed (Chrome ${version}): real AES-GCM and IndexedDB, full restart, legacy priority, removal, stale revisions, corruption and failed transactions. Fake data only.`);
} finally {
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
