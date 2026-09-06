import { isValidRequestId, normalizeApiKey } from "./shared.js";

const DATABASE_NAME = "ai-translator-credentials";
const STORE_NAME = "credentials";
const RECORD_ID = "primary";
const VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function storageFailure() {
  return new Error("Encrypted key storage could not be read or saved.");
}

// Only the background worker should use this store. Nonextractable keys do not
// protect against someone who can read the browser profile or run extension code.
export function createCredentialStore({
  indexedDB = globalThis.indexedDB,
  crypto = globalThis.crypto,
  databaseName = DATABASE_NAME,
} = {}) {
  let databasePromise = null;

  async function openDatabase() {
    if (!databasePromise) {
      const pending = new Promise((resolve, reject) => {
        let finished = false;
        const fail = () => {
          finished = true;
          reject(storageFailure());
        };
        const request = indexedDB.open(databaseName, VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        };
        request.onerror = fail;
        request.onblocked = fail;
        request.onsuccess = () => {
          const database = request.result;
          if (finished) {
            database.close();
            return;
          }
          finished = true;
          database.onversionchange = () => {
            database.close();
            if (databasePromise === pending) databasePromise = null;
          };
          database.onclose = () => {
            if (databasePromise === pending) databasePromise = null;
          };
          resolve(database);
        };
      });
      databasePromise = pending;
      pending.catch(() => {
        if (databasePromise === pending) databasePromise = null;
      });
    }
    return databasePromise;
  }

  async function transact(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      // A single record keeps its key, IV, ciphertext and revision atomic.
      const transaction = database.transaction(STORE_NAME, mode,
        mode === "readwrite" ? { durability: "strict" } : undefined);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(storageFailure());
    });
  }

  function additionalData(revision) {
    return encoder.encode(`AI Translator credential:${VERSION}:${revision}`);
  }

  async function decodeRecord(record) {
    if (record === undefined) return { apiKey: null, revision: null };
    if (!record || record.version !== VERSION || !isValidRequestId(record.revision)) throw storageFailure();
    if (record.deleted === true) {
      if (Object.keys(record).some((name) => !["version", "revision", "deleted"].includes(name))) throw storageFailure();
      return { apiKey: null, revision: record.revision };
    }
    if (Object.hasOwn(record, "deleted") || !record.key || record.key.type !== "secret"
        || record.key.extractable !== false || record.key.algorithm?.name !== "AES-GCM"
        || record.key.algorithm?.length !== 256 || !Array.isArray(record.key.usages)
        || record.key.usages.length !== 2 || !record.key.usages.includes("encrypt")
        || !record.key.usages.includes("decrypt") || !(record.iv instanceof Uint8Array)
        || record.iv.byteLength !== 12 || !(record.ciphertext instanceof ArrayBuffer)
        || record.ciphertext.byteLength < 24 || record.ciphertext.byteLength > 1040) throw storageFailure();
    const bytes = await crypto.subtle.decrypt({
      name: "AES-GCM", iv: record.iv, additionalData: additionalData(record.revision), tagLength: 128,
    }, record.key, record.ciphertext);
    const plainText = decoder.decode(bytes);
    const apiKey = normalizeApiKey(plainText);
    if (!apiKey || apiKey !== plainText) throw storageFailure();
    return { apiKey, revision: record.revision };
  }

  async function readState() {
    try {
      return await decodeRecord(await transact("readonly", (store) => store.get(RECORD_ID)));
    } catch {
      throw storageFailure();
    }
  }

  async function commit(record, expectedKey) {
    await transact("readwrite", (store) => store.put(record, RECORD_ID));
    const state = await readState();
    if (state.revision !== record.revision || state.apiKey !== expectedKey) throw storageFailure();
    return state;
  }

  async function write(value) {
    try {
      const apiKey = normalizeApiKey(value);
      if (!apiKey) throw storageFailure();
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const revision = crypto.randomUUID();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({
        name: "AES-GCM", iv, additionalData: additionalData(revision), tagLength: 128,
      }, key, encoder.encode(apiKey));
      return await commit({ version: VERSION, revision, key, iv, ciphertext }, apiKey);
    } catch {
      throw storageFailure();
    }
  }

  async function remove() {
    try {
      return await commit({ version: VERSION, revision: crypto.randomUUID(), deleted: true }, null);
    } catch {
      throw storageFailure();
    }
  }

  async function migrate({ localKey, syncKey } = {}) {
    const state = await readState();
    // Existing ciphertext or a removal tombstone wins over leftover legacy keys.
    // The caller deletes legacy values only after this verified state is returned.
    if (state.revision !== null) return state;
    const apiKey = normalizeApiKey(localKey) || normalizeApiKey(syncKey);
    return apiKey ? write(apiKey) : state;
  }

  async function close() {
    const pending = databasePromise;
    databasePromise = null;
    if (pending) (await pending).close();
  }

  // Credential mutations must be serialized by the background worker. Revisions
  // let it reject writes from stale Settings pages, including remove/re-add cycles.
  return Object.freeze({ readState, write, remove, migrate, close });
}
