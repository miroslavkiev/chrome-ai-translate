import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

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
assert.deepEqual(names, [
  "background.js",
  "content.js",
  "icon.png",
  "manifest.json",
  "popup.html",
  "popup.js",
  "settings.html",
  "settings.js",
]);

for (const name of names) {
  const [archived, built] = await Promise.all([
    zip.file(name).async("nodebuffer"),
    readFile(path.join(dist, name)),
  ]);
  assert(archived.equals(built), `${name} does not match the current dist file`);
}

await Promise.all([
  assertFresh("background.js", ["background.js", "request-policy.js", "shared.js", ...buildInputs]),
  assertFresh("content.js", ["content.js", "trigger.js", "shared.js", ...buildInputs]),
  assertFresh("popup.js", ["popup.js", "shared.js", ...buildInputs]),
  assertFresh("settings.js", ["settings.js", "shared.js", ...buildInputs]),
  assertFresh("manifest.json", ["manifest.json", ...buildInputs]),
  assertFresh("popup.html", ["popup.html", ...buildInputs]),
  assertFresh("settings.html", ["settings.html", ...buildInputs]),
  assertFresh("icon.png", ["icon.png", ...buildInputs]),
  assertFresh(archiveName, ["scripts/package.mjs", "package.json", "package-lock.json"]),
]);

const expected = (await readFile(path.join(dist, `${archiveName}.sha256`), "utf8")).split(/\s+/)[0];
const actual = createHash("sha256").update(bytes).digest("hex");
assert.equal(actual, expected, "archive checksum does not match");
console.log(`Verified ${archiveName}: ${names.join(", ")}`);
