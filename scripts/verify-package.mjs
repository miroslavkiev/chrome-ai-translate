import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import JSZip from "jszip";
import { PACKAGE_FILES } from "./package-files.mjs";
import { SUPPORTED_LOCALES } from "./locales.mjs";
import { parseCatalog, readCatalogs, validateCatalogs } from "./check-locales.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const archiveName = "chrome-ai-translate.zip";
const bytes = await readFile(path.join(dist, archiveName));
const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
const buildInputs = ["webpack.config.js", "package.json", "package-lock.json"];

async function assertFresh(output, inputs) {
  const [outputStat, ...inputStats] = await Promise.all([
    stat(path.join(dist, output)),
    ...inputs.map((name) => stat(path.join(root, name))),
  ]);
  const newestInput = Math.max(...inputStats.map(({ mtimeMs }) => mtimeMs));
  assert(outputStat.mtimeMs + 1 >= newestInput, `${output} is older than its source`);
}

assert(names.includes("manifest.json"), "manifest.json must be at the archive root");
assert(!names.some((name) => name.startsWith("dist/")), "archive entries must not use a dist prefix");
assert.deepEqual(names, PACKAGE_FILES, "Archive contains missing or unexpected files");

const sourceCatalogs = await readCatalogs(root);
const { localeCount, messageCount } = validateCatalogs(sourceCatalogs);
const packagedCatalogs = {};
for (const locale of SUPPORTED_LOCALES) {
  const name = `_locales/${locale}/messages.json`;
  packagedCatalogs[locale] = parseCatalog(await zip.file(name).async("string"), name);
  assert.equal(await zip.file(name).async("string"), await readFile(path.join(root, name), "utf8"), `${name} differs from the source catalog`);
}
validateCatalogs(packagedCatalogs);

const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
const sourceManifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(manifest.version, packageJson.version, "manifest and package versions must match");
assert.equal(sourceManifest.version, packageJson.version, "source and package versions must match");
assert.equal(manifest.default_locale, "en");
assert.equal(manifest.name, "__MSG_extName__");
assert.equal(manifest.description, "__MSG_extDescription__");
assert.equal(sourceManifest.default_locale, manifest.default_locale);
assert.equal(sourceManifest.name, manifest.name);
assert.equal(sourceManifest.description, manifest.description);
assert.equal(sourceManifest.background.service_worker, "dist/background.js");
assert.equal(manifest.background.service_worker, "background.js");
new Script(await zip.file("background.js").async("string"), { filename: "background.js" });
assert.deepEqual(manifest.host_permissions, ["https://generativelanguage.googleapis.com/*"], "Background network access must stay limited to Gemini");
assert.deepEqual(sourceManifest.host_permissions, manifest.host_permissions);
assert.equal(manifest.homepage_url, "https://github.com/miroslavkiev/chrome-ai-translate");

// Keep both extension-list and toolbar icons present at their declared pixel sizes.
assert.deepEqual(Object.keys(manifest.icons), ["16", "32", "48", "128"]);
assert.deepEqual(manifest.action.default_icon, manifest.icons);
assert.deepEqual(sourceManifest.icons, manifest.icons);
assert.deepEqual(sourceManifest.action.default_icon, manifest.icons);
for (const [size, file] of Object.entries(manifest.icons)) {
  assert(names.includes(file), `Packaged icon ${file} is missing`);
  const png = await zip.file(file).async("nodebuffer");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${file} must be a PNG`);
  assert.equal(png.readUInt32BE(16), Number(size), `${file} width must match the manifest`);
  assert.equal(png.readUInt32BE(20), Number(size), `${file} height must match the manifest`);
}

// Chrome content scripts must parse as classic scripts in either install folder.
for (const file of manifest.content_scripts.flatMap((script) => script.js)) {
  assert(names.includes(file), `Packaged content script ${file} is missing`);
  new Script(await zip.file(file).async("string"), { filename: file });
}
for (const file of sourceManifest.content_scripts.flatMap((script) => script.js)) {
  new Script(await readFile(path.join(root, file), "utf8"), { filename: file });
}

for (const name of names) {
  const [archived, built] = await Promise.all([
    zip.file(name).async("nodebuffer"),
    readFile(path.join(dist, name)),
  ]);
  assert(archived.equals(built), `${name} does not match the current dist file`);
}

await Promise.all([
  assertFresh("background.js", ["background.js", "credential-store.js", "request-policy.js", "shared.js", "i18n.js", "_locales/en/messages.json", ...buildInputs]),
  assertFresh("content.js", ["content.js", "trigger.js", "shared.js", "i18n.js", "_locales/en/messages.json", ...buildInputs]),
  assertFresh("popup.js", ["popup.js", "shared.js", "i18n.js", "_locales/en/messages.json", ...buildInputs]),
  assertFresh("settings.js", ["settings.js", "shared.js", "i18n.js", "_locales/en/messages.json", ...buildInputs]),
  assertFresh("guide.js", ["guide.js", "i18n.js", "_locales/en/messages.json", ...buildInputs]),
  assertFresh("manifest.json", ["manifest.json", ...buildInputs]),
  assertFresh("popup.html", ["popup.html", ...buildInputs]),
  assertFresh("settings.html", ["settings.html", ...buildInputs]),
  ...Object.values(manifest.icons).map((name) => assertFresh(name, [name, ...buildInputs])),
  ...["ui.css", "guide.css", "help.html", "about.html", "setup-key.png", "setup-language.png", "INSTALL.md", "PRIVACY.md", "LICENSE"].map((name) => assertFresh(name, [name, ...buildInputs])),
  ...SUPPORTED_LOCALES.map((locale) => assertFresh(`_locales/${locale}/messages.json`, [`_locales/${locale}/messages.json`, ...buildInputs])),
  assertFresh(archiveName, ["scripts/package.mjs", "scripts/package-files.mjs", "scripts/locales.mjs", "package.json", "package-lock.json"]),
]);

const expected = (await readFile(path.join(dist, `${archiveName}.sha256`), "utf8")).split(/\s+/)[0];
const actual = createHash("sha256").update(bytes).digest("hex");
assert.equal(actual, expected, "archive checksum does not match");
console.log(`Verified ${archiveName}: ${names.length} files, ${localeCount} locales, ${messageCount} messages per locale.`);
