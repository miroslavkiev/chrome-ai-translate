import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LOCALES } from "./locales.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseCatalog(source, label) {
  const catalog = JSON.parse(source);
  const objects = [];
  for (const token of source.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/g)) {
    if (token[0] === "{") objects.push(new Set());
    else if (token[0] === "[") objects.push(null);
    else if (token[0] === "}" || token[0] === "]") objects.pop();
    else if (/^\s*:/.test(source.slice(token.index + token[0].length))) {
      const key = JSON.parse(token[0]);
      const keys = objects.at(-1);
      assert(keys && !keys.has(key), `${label}: duplicate JSON key ${key}`);
      keys.add(key);
    }
  }
  return catalog;
}

function richTags(message, label) {
  const stack = [];
  const seen = new Set();
  for (const token of message.matchAll(/<\/?\d[^>]*>/g)) {
    const match = /^<(\/?)([1-9]\d*)>$/.exec(token[0]);
    assert(match, `${label}: malformed numbered tag ${token[0]}`);
    const [, closing, id] = match;
    if (closing) assert.equal(stack.pop(), id, `${label}: unbalanced numbered tag ${id}`);
    else {
      assert(!seen.has(id), `${label}: repeated numbered tag ${id}`);
      seen.add(id);
      stack.push(id);
    }
  }
  assert.equal(stack.length, 0, `${label}: unclosed numbered tag`);
  return [...seen].sort();
}

function placeholders(entry, label) {
  const definitions = Object.entries(entry.placeholders ?? {}).map(([key, value]) => {
    assert.match(key, /^[a-z0-9_]+$/i, `${label}: invalid placeholder name`);
    assert(value && typeof value.content === "string", `${label}: placeholder ${key} needs content`);
    return [key.toLowerCase(), value.content];
  }).sort(([a], [b]) => a.localeCompare(b));
  assert.equal(new Set(definitions.map(([key]) => key)).size, definitions.length, `${label}: duplicate placeholder names`);
  const references = [...entry.message.replaceAll("$$", "").matchAll(/\$(?:[1-9]\d*|[a-z_][a-z0-9_]*\$)/gi)]
    .map(([value]) => value.toLowerCase()).sort();
  for (const reference of references.filter((value) => value.endsWith("$"))) {
    assert(definitions.some(([key]) => key === reference.slice(1, -1)), `${label}: undefined placeholder ${reference}`);
  }
  return { definitions, references };
}

export function validateCatalogs(catalogs) {
  assert.deepEqual(Object.keys(catalogs).sort(), [...SUPPORTED_LOCALES].sort(), "Locale catalogs must match the supported Chrome locales");
  const english = catalogs.en;
  assert(english && typeof english === "object" && !Array.isArray(english), "English catalog must be an object");
  const keys = Object.keys(english).sort();
  assert(keys.includes("extName") && keys.includes("extDescription"), "Manifest messages are required");
  const signatures = {};
  for (const locale of ["en", ...SUPPORTED_LOCALES.filter((value) => value !== "en")]) {
    const catalog = catalogs[locale];
    assert(catalog && typeof catalog === "object" && !Array.isArray(catalog), `${locale}: catalog must be an object`);
    assert.equal(catalog.ui_locale?.message, locale.replaceAll("_", "-"), `${locale}: UI language metadata must match its catalog`);
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale}: missing or extra message IDs`);
    for (const key of keys) {
      const label = `${locale}/${key}`;
      assert.match(key, /^[a-z0-9_]+$/i, `${label}: invalid message ID`);
      const entry = catalog[key];
      assert(entry && typeof entry.message === "string" && entry.message.trim(), `${label}: message must not be empty`);
      const signature = { tags: richTags(entry.message, label), ...placeholders(entry, label) };
      if (locale === "en") signatures[key] = signature;
      else assert.deepEqual(signature, signatures[key], `${label}: placeholder or numbered tag mismatch`);
    }
    assert(catalog.extName.message.length <= 75, `${locale}: extension name exceeds 75 characters`);
    assert(catalog.extDescription.message.length <= 132, `${locale}: extension description exceeds 132 characters`);
    if (!/^en(?:_|$)/.test(locale)) {
      assert(keys.some((key) => key !== "ui_locale" && catalog[key].message !== english[key].message), `${locale}: catalog is only an English copy`);
    }
  }
  return { localeCount: SUPPORTED_LOCALES.length, messageCount: keys.length };
}

export async function readCatalogs(directory = root) {
  const localesDirectory = path.join(directory, "_locales");
  const locales = await readdir(localesDirectory, { withFileTypes: true });
  assert(locales.every((entry) => entry.isDirectory()), "_locales may only contain locale directories");
  assert.deepEqual(locales.map(({ name }) => name).sort(), [...SUPPORTED_LOCALES].sort(), "Unexpected locale directory");
  const catalogs = {};
  for (const locale of SUPPORTED_LOCALES) {
    const files = await readdir(path.join(localesDirectory, locale), { withFileTypes: true });
    assert(files.length === 1 && files[0].name === "messages.json" && files[0].isFile(), `${locale}: only messages.json is allowed`);
    const label = `_locales/${locale}/messages.json`;
    catalogs[locale] = parseCatalog(await readFile(path.join(directory, label), "utf8"), label);
  }
  return catalogs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { localeCount, messageCount } = validateCatalogs(await readCatalogs());
  console.log(`Checked ${localeCount} complete locale catalogs with ${messageCount} messages each.`);
}
