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
      "window.sageOsOverlay?.setInteractivePointer",
      "sageos-overlay:interactive-pointer",
      "SAGEOS_OVERLAY_COLLAPSED_EDGE",
      "SAGEOS_OVERLAY_ACTIVE_MONITOR",
      "SAGEOS_OVERLAY_PINNED_WIDGETS",
      "SAGEOS_OVERLAY_VOICE_ENABLED",
      "SAGEOS_OVERLAY_VOICE_MODE",
      "setVisualBackdrop(page, \"bright\")",
      "setVisualBackdrop(page, \"text-heavy\")",
      "setVisualBackdrop(page, \"ide\")",
      "overlay-smoke-full-bright.png",
      "overlay-smoke-edge-text-heavy.png",
      "overlay-smoke-hud-ide.png",
      ".overlay-shell--hud .compact-hud",
      ".edge-rail--left",
      "sageos.control",
      "sageos.approvals.resolve",
      "sageos.tasks.queue",
      "sageos.tasks.cancel",
      "sageos.tasks.runNext",
      "sageos.memory.replay",
      "chat.send",
      'name: "Run", exact: true',
      'waitForRecordedMethod("sageos.tasks.queue")',
      'filter({ hasText: "Memory replay" })',
      'name: "Deny"',
      'name: "Run next"',
      'name: "Replay memory queue"',
      'waitForRecordedMethod("sageos.memory.replay")',
      'waitForRecordedMethod("sageos.tasks.runNext")',
      'page.keyboard.press("Control+K")',
      'name: "Start voice command"',
      'page.keyboard.press("Escape")',
      'waitForOverlayWindowHidden(app)',
    ]) {
      expect(script).toContain(expected);
    }
  });

  it("wires mouse-first tray commands in the main process", () => {
    const main = readFileSync(new URL("../src/main/main.ts", import.meta.url), "utf8");

    for (const expected of [
      "adapter.setTrayActions",
      "open: () => controller.expand()",
      "showHud: () => controller.showHud()",
      "collapse: () => controller.collapse()",
      "hide: () => controller.close()",
      "quit: () => app.quit()",
    ]) {
      expect(main).toContain(expected);
    }
  });
});
