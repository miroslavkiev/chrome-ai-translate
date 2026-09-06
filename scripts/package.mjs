import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import assert from "node:assert/strict";
import { PACKAGE_FILES } from "./package-files.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const archiveName = "chrome-ai-translate.zip";
const checksumName = `${archiveName}.sha256`;
const excluded = new Set([archiveName, checksumName]);
const fixedDate = new Date("1980-01-01T00:00:00.000Z");

async function collect(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!prefix && excluded.has(entry.name)) continue;
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await collect(path.join(directory, entry.name), `${name}/`));
    else {
      assert(entry.isFile(), `Unsupported package entry: ${name}`);
      files.push(name);
    }
  }
  return files;
}

const names = (await collect(dist)).sort();
assert.deepEqual(names, PACKAGE_FILES, "Built package contains missing or unexpected files");

const zip = new JSZip();
for (const name of names) {
  zip.file(name, await readFile(path.join(dist, name)), {
    date: fixedDate,
    unixPermissions: 0o644,
    createFolders: false,
  });
}

const bytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
  platform: "UNIX",
});
const digest = createHash("sha256").update(bytes).digest("hex");

await writeFile(path.join(dist, archiveName), bytes);
await writeFile(path.join(dist, checksumName), `${digest}  ${archiveName}\n`, "utf8");
console.log(`Created ${archiveName} with ${names.length} files.`);
