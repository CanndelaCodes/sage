import { chromium } from "playwright-core";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const overlayDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(overlayDir, "dist");
const reviewFile = path.join(distDir, "overlay-visual-review.html");
const renderFile = path.join(distDir, "overlay-visual-review-render.png");

const browserExecutable = await findBrowserExecutable();
await fs.access(reviewFile);

const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(reviewFile).href, { waitUntil: "load" });
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
  );

  const result = await page.evaluate(() => ({
    title: document.title,
    bodyTextLength: document.body.innerText.length,
    imageCount: document.images.length,
    brokenImages: Array.from(document.images).filter(
      (img) => img.naturalWidth === 0 || img.naturalHeight === 0,
    ).length,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    criteriaCount: document.querySelectorAll(".criteria li").length,
    figureCount: document.querySelectorAll("figure").length,
  }));

  if (result.title !== "SageOS Overlay MVP Visual Review") {
    throw new Error(`Unexpected visual review title: ${result.title}`);
  }
  if (result.imageCount !== 10 || result.figureCount !== 10) {
    throw new Error(
      `Expected 10 smoke screenshots, saw ${result.imageCount} images and ${result.figureCount} figures.`,
    );
  }
  if (result.criteriaCount !== 8) {
    throw new Error(`Expected 8 visual acceptance criteria, saw ${result.criteriaCount}.`);
  }
  if (result.brokenImages > 0) {
    throw new Error(`Visual review has ${result.brokenImages} broken image(s).`);
  }
  if (result.overflowX > 1) {
    throw new Error(`Visual review has horizontal overflow: ${result.overflowX}px.`);
  }
  if (result.bodyTextLength < 500) {
    throw new Error(`Visual review body appears blank: ${result.bodyTextLength} characters.`);
  }

  await page.screenshot({ path: renderFile, fullPage: true, animations: "disabled" });
  console.log(
    JSON.stringify(
      {
        ok: true,
        browserExecutable,
        reviewFile,
        renderFile,
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.SAGEOS_VISUAL_REVIEW_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "msedge",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep) || candidate.includes("\\")) {
        await fs.access(candidate);
        return candidate;
      }
      const resolved = await resolveBrowserCommand(candidate);
      if (resolved) {
        return resolved;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    [
      "SageOS Overlay MVP Visual Review verification requires Chrome, Edge, or Chromium.",
      "Set SAGEOS_VISUAL_REVIEW_BROWSER to a browser executable path, then rerun `review:visual:verify`.",
    ].join("\n"),
  );
}

async function resolveBrowserCommand(command) {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], { windowsHide: true });
    return stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}
