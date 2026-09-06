import { readFile } from "node:fs/promises";

let loadId = 0;

// Use the real background source and policies. Only browser credential storage
// is replaced; its real crypto and IndexedDB behavior has a separate browser test.
export async function loadBackground(createCredentialStore) {
  const url = new URL("../../background.js", import.meta.url);
  const source = (await readFile(url, "utf8"))
    .replace('import { createCredentialStore } from "./credential-store.js";',
      'const createCredentialStore = globalThis.__testCredentialStoreFactory;')
    .replace(/from "(\.\/[^\"]+)"/g, (_match, relative) => `from ${JSON.stringify(new URL(relative, url).href)}`);
  const previous = globalThis.__testCredentialStoreFactory;
  globalThis.__testCredentialStoreFactory = createCredentialStore;
  try {
    await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#background-test-${++loadId}`);
  } finally {
    if (previous === undefined) delete globalThis.__testCredentialStoreFactory;
    else globalThis.__testCredentialStoreFactory = previous;
  }
}
