import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ignored = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".yml"]);
const prohibitedDashes = [String.fromCodePoint(0x2014), String.fromCodePoint(0x2013)];

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(file));
    else if (textExtensions.has(path.extname(entry.name))) files.push(file);
  }
  return files;
}

const files = await collect(root);
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (prohibitedDashes.some((dash) => source.includes(dash))) {
    throw new Error(`${path.relative(root, file)} contains a prohibited dash character`);
  }
  if ([".js", ".mjs"].includes(path.extname(file))) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  if (path.extname(file) === ".json") JSON.parse(source);
}

console.log(`Checked ${files.length} source files.`);
