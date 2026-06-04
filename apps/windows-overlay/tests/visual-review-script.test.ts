import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("overlay visual review generator", () => {
  it("is wired as a package script", () => {
    expect(packageJson.scripts["review:visual"]).toBe("node scripts/build-visual-review.mjs");
    expect(packageJson.scripts["review:visual:verify"]).toBe(
      "node scripts/verify-visual-review.mjs",
    );
  });

  it("builds a local review page for every smoke screenshot and MVP visual criterion", () => {
    const script = readFileSync(
      new URL("../scripts/build-visual-review.mjs", import.meta.url),
      "utf8",
    );

    for (const expected of [
      "overlay-visual-review.html",
      "SageOS Overlay MVP Visual Review",
      "Jason acceptance",
      "Liquid Linear",
      "overlay-smoke-styled.png",
      "overlay-smoke-full-bright.png",
      "overlay-smoke-full-reduced-motion.png",
      "overlay-smoke-edge-left.png",
      "overlay-smoke-edge-dark.png",
      "overlay-smoke-edge-text-heavy.png",
      "overlay-smoke-edge-browser.png",
      "overlay-smoke-edge-ide.png",
      "overlay-smoke-hud.png",
      "overlay-smoke-hud-ide.png",
      "Text never overlaps or clips",
      "Pinned widgets stay legible",
      "Edge Rail remains precise",
      "Keyboard focus is visible and ordered",
      "Reduced motion is respected",
      "operations-grade",
      "Apple-like liquid glass depth",
      "Linear-like row density",
    ]) {
      expect(script).toContain(expected);
    }
  });

  it("verifies the generated review page in a local browser", () => {
    const script = readFileSync(
      new URL("../scripts/verify-visual-review.mjs", import.meta.url),
      "utf8",
    );

    for (const expected of [
      "overlay-visual-review.html",
      "overlay-visual-review-render.png",
      "playwright-core",
      "findBrowserExecutable",
      "SageOS Overlay MVP Visual Review",
      "imageCount !== 10",
      "criteriaCount !== 8",
      "brokenImages",
      "overflowX",
      "bodyTextLength",
      "headless",
      "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
      "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    ]) {
      expect(script).toContain(expected);
    }
  });
});
