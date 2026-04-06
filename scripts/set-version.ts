#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];

if (!version) {
  console.error("Usage: tsx scripts/set-version.ts <version>");
  console.error("Example: tsx scripts/set-version.ts 1.2.3");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version "${version}" — expected format: MAJOR.MINOR.PATCH`);
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function updateJson(relPath: string, updater: (obj: Record<string, unknown>) => void) {
  const abs = resolve(root, relPath);
  const obj = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
  updater(obj);
  writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  updated ${relPath}`);
}

function updateToml(relPath: string) {
  const abs = resolve(root, relPath);
  const content = readFileSync(abs, "utf8");
  const updated = content.replace(/^version = ".*?"/m, `version = "${version}"`);
  if (updated === content) {
    console.warn(`  warning: no version line found in ${relPath}`);
    return;
  }
  writeFileSync(abs, updated);
  console.log(`  updated ${relPath}`);
}

console.log(`Setting version to ${version}:`);
updateJson("package.json", (o) => { o.version = version; });
updateJson("src-tauri/tauri.conf.json", (o) => { o.version = version; });
updateToml("src-tauri/Cargo.toml");
