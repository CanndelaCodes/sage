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
const reportFile = path.join(distDir, "overlay-visual-review-report.json");

const browserExecutable = await findBrowserExecutable();
await fs.access(reviewFile);

const browser = await chromium.launch({
  executablePath: browserExecutable,
  headless: true,
  args: ["--allow-file-access-from-files"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(reviewFile).href, { waitUntil: "load" });
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
  );

  const result = await page.evaluate(() => {
    const imageMetrics = Array.from(document.images).map(sampleImageContent);
    return {
      title: document.title,
      bodyTextLength: document.body.innerText.length,
      imageCount: document.images.length,
      brokenImages: Array.from(document.images).filter(
        (img) => img.naturalWidth === 0 || img.naturalHeight === 0,
      ).length,
      imageMetrics,
      imageContentFailures: imageMetrics
        .map((metric) => ({ ...metric, failureReason: imageContentFailureReason(metric) }))
        .filter((metric) => metric.failureReason),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      criteriaCount: document.querySelectorAll(".criteria li").length,
      figureCount: document.querySelectorAll("figure").length,
      rubricRowCount: document.querySelectorAll(".rubric-row").length,
      decisionControlCount: document.querySelectorAll(".decision-control").length,
      decisionSummaryCount: document.querySelectorAll(".decision-summary .decision-card").length,
    };

    function sampleImageContent(img) {
      const width = Math.max(1, Math.min(64, img.naturalWidth));
      const height = Math.max(1, Math.min(64, img.naturalHeight));
      const src = img.getAttribute("src") ?? "";
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          return { src, width, height, error: "canvas context unavailable" };
        }
        context.drawImage(img, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const colors = new Set();
        let opaquePixels = 0;
        let minLuminance = 255;
        let maxLuminance = 0;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index] ?? 0;
          const green = data[index + 1] ?? 0;
          const blue = data[index + 2] ?? 0;
          const alpha = data[index + 3] ?? 0;
          if (alpha > 10) {
            opaquePixels += 1;
          }
          colors.add(`${red >> 4},${green >> 4},${blue >> 4},${alpha >> 4}`);
          const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          minLuminance = Math.min(minLuminance, luminance);
          maxLuminance = Math.max(maxLuminance, luminance);
        }
        const pixelCount = width * height;
        return {
          src,
          width,
          height,
          uniqueColorCount: colors.size,
          luminanceRange: Math.round((maxLuminance - minLuminance) * 100) / 100,
          opaquePixelRatio: Math.round((opaquePixels / pixelCount) * 1000) / 1000,
        };
      } catch (error) {
        return { src, width, height, error: String(error) };
      }
    }

    function imageContentFailureReason(metric) {
      if (metric.error) {
        return metric.error;
      }
      if (metric.opaquePixelRatio < 0.01) {
        return `too transparent: ${metric.opaquePixelRatio}`;
      }
      if (metric.uniqueColorCount < 8) {
        return `too few sampled colors: ${metric.uniqueColorCount}`;
      }
      if (metric.luminanceRange < 18) {
        return `too little luminance range: ${metric.luminanceRange}`;
      }
      return "";
    }
  });

  if (result.title !== "SageOS Overlay MVP Visual Review") {
    throw new Error(`Unexpected visual review title: ${result.title}`);
  }
  if (result.imageCount !== 11 || result.figureCount !== 11) {
    throw new Error(
      `Expected 11 smoke screenshots, saw ${result.imageCount} images and ${result.figureCount} figures.`,
    );
  }
  if (result.criteriaCount !== 8) {
    throw new Error(`Expected 8 visual acceptance criteria, saw ${result.criteriaCount}.`);
  }
  if (result.rubricRowCount !== 8) {
    throw new Error(`Expected 8 acceptance rubric rows, saw ${result.rubricRowCount}.`);
  }
  if (result.decisionControlCount !== 24) {
    throw new Error(
      `Expected 24 acceptance decision controls, saw ${result.decisionControlCount}.`,
    );
  }
  if (result.decisionSummaryCount !== 3) {
    throw new Error(`Expected 3 release decision cards, saw ${result.decisionSummaryCount}.`);
  }
  if (result.brokenImages > 0) {
    throw new Error(`Visual review has ${result.brokenImages} broken image(s).`);
  }
  if (result.imageContentFailures.length > 0) {
    throw new Error(
      [
        "Visual review has blank or flat smoke screenshot(s).",
        JSON.stringify(result.imageContentFailures, null, 2),
      ].join("\n"),
    );
  }
  if (result.overflowX > 1) {
    throw new Error(`Visual review has horizontal overflow: ${result.overflowX}px.`);
  }
  if (result.bodyTextLength < 500) {
    throw new Error(`Visual review body appears blank: ${result.bodyTextLength} characters.`);
  }

  await page.screenshot({ path: renderFile, fullPage: true, animations: "disabled" });
  const report = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    browserExecutable,
    reviewFile,
    renderFile,
    reportFile,
    humanAcceptance: "required",
    ...result,
  };
  await fs.writeFile(`${reportFile}.tmp`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.rename(`${reportFile}.tmp`, reportFile);

  console.log(
    JSON.stringify(
      report,
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
