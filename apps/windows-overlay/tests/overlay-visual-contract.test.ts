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
      "--sageos-surface-summit",
      "--sageos-glass-blur-sm",
      "--sageos-glass-blur-md",
      "--sageos-glass-opacity-floor",
      "--sageos-glass-saturation",
      "--sageos-glass-refraction",
      "--sageos-glass-specular",
      "--sageos-glass-platinum",
      "--sageos-liquid-ambient",
      "--sageos-liquid-command",
      "--sageos-liquid-focus",
      "--sageos-liquid-summit",
      "--sageos-border-subtle",
      "--sageos-border-strong",
      "--sageos-rim-highlight",
      "--sageos-shadow-ambient",
      "--sageos-shadow-command",
      "--sageos-shadow-focus",
      "--sageos-shadow-control",
      "--sageos-shadow-elevated",
      "--sageos-shadow-summit",
      "--sageos-highlight-runway",
      "--sageos-accent-primary",
      "--sageos-accent-success",
      "--sageos-accent-warning",
      "--sageos-accent-danger",
      "--sageos-motion-fast",
      "--sageos-motion-normal",
      "--sageos-motion-snappy",
      "--sageos-motion-responsive",
      "--sageos-motion-smooth",
      "--sageos-motion-spring-snappy",
      "--sageos-motion-spring-responsive",
      "--sageos-motion-spring-smooth",
    ];

    for (const token of requiredTokens) {
      expect(styles).toContain(token);
    }
  });

  it("has explicit classes for polished surface and control states", () => {
    const requiredSelectors = [
      ".overlay-shell",
      ".overlay-shell::before",
      ".overlay-toolbar",
      ".overlay-content",
      ".overlay-card",
      ".overlay-card::after",
      ".overlay-panel",
      ".overlay-panel::after",
      ".universal-launcher",
      ".agent-workspace",
      ".agent-workspace::after",
      ".compact-hud",
      ".hud-badge",
      ".edge-rail",
      ".edge-rail--left",
      ".edge-rail--right",
      ".edge-rail--top",
      ".edge-rail--bottom",
      ".pinned-widgets",
      ".pinned-widgets--left",
      ".pinned-widgets--right",
      ".pinned-widgets--top",
      ".pinned-widgets--bottom",
      ".overlay-shell--commandDeck .pinned-widgets",
      ".pinned-widget",
      ".pinned-widget::after",
      ".overlay-callout--loading",
      ".overlay-callout--error",
      ".overlay-callout--empty",
      ".overlay-callout--success",
      ".overlay-callout--warning",
      ".overlay-callout--critical",
      ".overlay-callout--degraded",
      ".overlay-row--success",
      ".overlay-row--warning",
      ".overlay-row--critical",
      ".overlay-row--disabled",
      ".overlay-panel--focus",
      ".overlay-panel--summit",
      ".pinned-widget--ambient",
      ".overlay-button--danger",
      ".overlay-button--primary",
      ".overlay-button--pending",
      ".overlay-button--success",
      ".overlay-button--error",
      ".overlay-button::after",
    ];

    for (const selector of requiredSelectors) {
      expect(styles).toContain(selector);
    }
  });

  it("guards keyboard focus, reduced motion, and text overflow", () => {
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (forced-colors: active)");

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
