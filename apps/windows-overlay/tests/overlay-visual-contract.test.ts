import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

describe("overlay visual contract", () => {
  it("defines a SageOS Liquid Linear material token layer", () => {
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
      "--sageos-liquid-hud",
      "--sageos-liquid-rail",
      "--sageos-liquid-summit",
      "--sageos-border-subtle",
      "--sageos-border-strong",
      "--sageos-rim-highlight",
      "--sageos-shadow-ambient",
      "--sageos-shadow-command",
      "--sageos-shadow-focus",
      "--sageos-shadow-control",
      "--sageos-shadow-hud",
      "--sageos-shadow-rail",
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
      "--sageos-radius-shell",
    ];

    for (const token of requiredTokens) {
      expect(styles).toContain(token);
    }
  });

  it("applies Liquid Linear material tokens to HUD, rail, and pinned ambient glass", () => {
    const materialContracts = [
      [".compact-hud", ["var(--sageos-liquid-hud)", "var(--sageos-shadow-hud)", "var(--sageos-radius-shell)"]],
      [".edge-rail", ["var(--sageos-liquid-rail)", "var(--sageos-shadow-rail)"]],
      [".pinned-widget--ambient", ["var(--sageos-liquid-ambient)", "var(--sageos-shadow-ambient)"]],
    ] as const;

    for (const [selector, expectedSnippets] of materialContracts) {
      const selectorStart = styles.indexOf(selector);
      expect(selectorStart).toBeGreaterThanOrEqual(0);
      const blockEnd = styles.indexOf("}", selectorStart);
      const block = styles.slice(selectorStart, blockEnd);

      for (const snippet of expectedSnippets) {
        expect(block).toContain(snippet);
      }
    }
  });

  it("keeps HUD and rail content above specular material layers", () => {
    for (const selector of [".compact-hud__main", ".compact-hud__badges", ".edge-rail button"]) {
      const selectorStart = styles.indexOf(selector);
      expect(selectorStart).toBeGreaterThanOrEqual(0);
      const blockEnd = styles.indexOf("}", selectorStart);
      const block = styles.slice(selectorStart, blockEnd);
      expect(block).toContain("position: relative");
      expect(block).toContain("z-index: 1");
    }
  });

  it("keeps normal text tokens at practical AA contrast over glass opacity floors", () => {
    const textTokens = ["--sageos-text-primary", "--sageos-text-secondary", "--sageos-text-muted"] as const;
    const surfaceTokens = [
      "--sageos-liquid-ambient",
      "--sageos-liquid-command",
      "--sageos-liquid-focus",
      "--sageos-liquid-summit",
    ] as const;
    const backdrops = [
      ["dark", [0, 0, 0]],
      ["bright", [248, 250, 252]],
      ["browser", [238, 242, 247]],
      ["ide", [2, 6, 23]],
    ] as const;

    for (const textToken of textTokens) {
      const textColor = parseCssColor(readCssToken(textToken));

      for (const surfaceToken of surfaceTokens) {
        const surfaceColor = parseCssColor(readCssToken(surfaceToken));

        for (const [backdropName, backdropColor] of backdrops) {
          const effectiveSurface = blendRgba(surfaceColor, backdropColor);
          const contrast = contrastRatio(textColor, effectiveSurface);

          expect(
            contrast,
            `${textToken} over ${surfaceToken} on ${backdropName} backdrop should keep normal text readable`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
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

function readCssToken(token: string): string {
  const match = styles.match(new RegExp(`${token}:\\s*([^;]+);`));
  expect(match, `Expected ${token} to be defined`).not.toBeNull();
  return match![1].trim();
}

function parseCssColor(value: string): readonly [number, number, number, number] {
  const hexMatch = value.match(/^#(?<hex>[0-9a-fA-F]{6})$/);
  if (hexMatch?.groups) {
    const hex = hexMatch.groups.hex;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
  }

  const rgbaMatch = value.match(/^rgba\(\s*(?<r>\d+),\s*(?<g>\d+),\s*(?<b>\d+),\s*(?<a>0|1|0?\.\d+)\s*\)$/);
  if (rgbaMatch?.groups) {
    return [
      Number(rgbaMatch.groups.r),
      Number(rgbaMatch.groups.g),
      Number(rgbaMatch.groups.b),
      Number(rgbaMatch.groups.a),
    ];
  }

  throw new Error(`Unsupported CSS color value: ${value}`);
}

function blendRgba(
  foreground: readonly [number, number, number, number],
  background: readonly [number, number, number],
): readonly [number, number, number, number] {
  const [r, g, b, alpha] = foreground;
  return [
    r * alpha + background[0] * (1 - alpha),
    g * alpha + background[1] * (1 - alpha),
    b * alpha + background[2] * (1 - alpha),
    1,
  ];
}

function contrastRatio(
  foreground: readonly [number, number, number, number],
  background: readonly [number, number, number, number],
): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: readonly [number, number, number, number]): number {
  const [r, g, b] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
