import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("overlay visual contract", () => {
  it("defines a SageOS Vitreous Liquor material token layer", () => {
    const requiredTokens = [
      "--sageos-bg-overlay",
      "--sageos-bg-overlay-strong",
      "--sageos-surface-ambient",
      "--sageos-surface-default",
      "--sageos-surface-featured",
      "--sageos-glass-blur-sm",
      "--sageos-glass-blur-md",
      "--sageos-border-subtle",
      "--sageos-border-strong",
      "--sageos-rim-highlight",
      "--sageos-shadow-ambient",
      "--sageos-shadow-elevated",
      "--sageos-accent-primary",
      "--sageos-accent-success",
      "--sageos-accent-warning",
      "--sageos-accent-danger",
      "--sageos-motion-fast",
      "--sageos-motion-normal",
      "--sageos-motion-smooth",
    ];

    for (const token of requiredTokens) {
      expect(styles).toContain(token);
    }
  });

  it("has explicit classes for polished surface and control states", () => {
    const requiredSelectors = [
      ".overlay-shell",
      ".overlay-toolbar",
      ".overlay-content",
      ".overlay-card",
      ".overlay-panel",
      ".universal-launcher",
      ".agent-workspace",
      ".compact-hud",
      ".hud-badge",
      ".edge-rail",
      ".pinned-widgets",
      ".pinned-widget",
      ".overlay-callout--loading",
      ".overlay-callout--error",
      ".overlay-callout--empty",
      ".overlay-row--success",
      ".overlay-row--warning",
      ".overlay-row--critical",
      ".overlay-button--danger",
      ".overlay-button--primary",
    ];

    for (const selector of requiredSelectors) {
      expect(styles).toContain(selector);
    }
  });

  it("guards keyboard focus, reduced motion, and text overflow", () => {
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");

    for (const selector of [
      ".overlay-card__title",
      ".overlay-card__detail",
      ".overlay-row__title",
      ".overlay-row__detail",
      ".overview-row__detail",
      ".pinned-widget__detail",
      ".hud-badge",
    ]) {
      const selectorStart = styles.indexOf(selector);
      expect(selectorStart).toBeGreaterThanOrEqual(0);
      const blockEnd = styles.indexOf("}", selectorStart);
      const block = styles.slice(selectorStart, blockEnd);
      expect(block).toContain("overflow:");
      expect(block).toContain("text-overflow:");
    }
  });
});
