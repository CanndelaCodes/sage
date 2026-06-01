import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("Electron overlay smoke script", () => {
  it("is wired as a repeatable package script", () => {
    expect(packageJson.scripts["smoke:electron"]).toBe("node scripts/smoke-electron.mjs");
  });

  it("covers bridge, layout, HUD, edge rail, and RPC controls", () => {
    const script = readFileSync(new URL("../scripts/smoke-electron.mjs", import.meta.url), "utf8");

    for (const expected of [
      "window.sageOsOverlay?.collapse",
      "window.sageOsOverlay?.expand",
      "SAGEOS_OVERLAY_COLLAPSED_EDGE",
      "SAGEOS_OVERLAY_ACTIVE_MONITOR",
      "SAGEOS_OVERLAY_PINNED_WIDGETS",
      ".overlay-shell--hud .compact-hud",
      ".edge-rail--left",
      "sageos.control",
      "sageos.approvals.resolve",
      "sageos.tasks.queue",
      "sageos.tasks.cancel",
      "chat.send",
      'name: "Run", exact: true',
      'waitForRecordedMethod("sageos.tasks.queue")',
      'filter({ hasText: "Memory replay" })',
      'page.keyboard.press("Control+K")',
      'page.keyboard.press("Escape")',
      'waitForOverlayWindowHidden(app)',
    ]) {
      expect(script).toContain(expected);
    }
  });
});
