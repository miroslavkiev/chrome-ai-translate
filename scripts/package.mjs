import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const archiveName = "chrome-ai-translate.zip";
const checksumName = `${archiveName}.sha256`;
const excluded = new Set([archiveName, checksumName]);
const fixedDate = new Date("1980-01-01T00:00:00.000Z");

const names = (await readdir(dist)).filter((name) => !excluded.has(name)).sort();
if (!names.includes("manifest.json")) throw new Error("dist/manifest.json is missing");

const zip = new JSZip();
for (const name of names) {
  zip.file(name, await readFile(path.join(dist, name)), {
    date: fixedDate,
    unixPermissions: 0o644,
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
console.log(`Created ${archiveName} with ${names.length} root files.`);
