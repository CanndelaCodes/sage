#!/usr/bin/env node
import { execSync } from "node:child_process";
/**
 * Cross-platform A2UI bundler.
 * Replaces bundle-a2ui.sh for native Windows support.
 *
 * 1. Checks if A2UI source directories exist (exits cleanly if missing, e.g. Docker builds).
 * 2. Computes a content hash of all input files.
 * 3. Skips bundling if the hash matches the previous build.
 * 4. Runs tsc + rolldown to produce the bundle.
 * 5. Stores the new hash for incremental builds.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");

const HASH_FILE = path.join(ROOT_DIR, "src", "canvas-host", "a2ui", ".bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor", "a2ui", "renderers", "lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps", "shared", "SageKit", "Tools", "CanvasA2UI");

async function dirExists(dirPath) {
  try {
    const st = await fs.stat(dirPath);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function walk(entryPath) {
  const files = [];
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      files.push(...(await walk(path.join(entryPath, entry))));
    }
  } else {
    files.push(entryPath);
  }
  return files;
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

async function computeHash(inputPaths) {
  const allFiles = [];
  for (const inputPath of inputPaths) {
    allFiles.push(...(await walk(inputPath)));
  }
  allFiles.sort((a, b) => normalize(a).localeCompare(normalize(b)));

  const hash = createHash("sha256");
  for (const filePath of allFiles) {
    const rel = normalize(path.relative(ROOT_DIR, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function main() {
  // Docker builds exclude vendor/apps via .dockerignore.
  // In that environment we must keep the prebuilt bundle.
  if (!(await dirExists(A2UI_RENDERER_DIR)) || !(await dirExists(A2UI_APP_DIR))) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    process.exit(0);
  }

  const inputPaths = [
    path.join(ROOT_DIR, "package.json"),
    path.join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  const currentHash = await computeHash(inputPaths);

  if ((await fileExists(HASH_FILE)) && (await fileExists(OUTPUT_FILE))) {
    const previousHash = (await fs.readFile(HASH_FILE, "utf8")).trim();
    if (previousHash === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      process.exit(0);
    }
  }

  const tsconfigPath = path.join(A2UI_RENDERER_DIR, "tsconfig.json");
  const rolldownConfig = path.join(A2UI_APP_DIR, "rolldown.config.mjs");

  console.log("Building A2UI bundle...");
  execSync(`pnpm -s exec tsc -p "${tsconfigPath}"`, { cwd: ROOT_DIR, stdio: "inherit" });
  execSync(`rolldown -c "${rolldownConfig}"`, { cwd: ROOT_DIR, stdio: "inherit" });

  await fs.writeFile(HASH_FILE, currentHash, "utf8");
  console.log("A2UI bundle complete.");
}

main().catch((err) => {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
  console.error(err.message || err);
  process.exit(1);
});
