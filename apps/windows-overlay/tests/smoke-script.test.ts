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
      "createPassThroughProbe",
      "sendNativeMouseClick",
      "waitForPassThroughProbeClick",
      "SageOS pass-through probe",
      "passThroughProbeClicks",
      "buildSha",
      "readBuildSha",
      "git",
      "rev-parse",
      "smokeDefaultHotkeyToggle",
      "sendNativeHotkey",
      "waitForGlobalShortcut",
      "defaultHotkeyToggles",
      "Ctrl+Alt+Space",
      "SAGEOS_OVERLAY_COLLAPSED_EDGE",
      "SAGEOS_OVERLAY_ACTIVE_MONITOR",
      "SAGEOS_OVERLAY_PINNED_WIDGETS",
      "SAGEOS_OVERLAY_VOICE_ENABLED",
      "SAGEOS_OVERLAY_VOICE_MODE",
      "setVisualBackdrop(page, \"bright\")",
      "setVisualBackdrop(page, \"text-heavy\")",
      "setVisualBackdrop(page, \"browser\")",
      "setVisualBackdrop(page, \"ide\")",
      "assertKeyboardFocusOrder(page)",
      "readFocusedControlName",
      "overlay-smoke-full-bright.png",
      "overlay-smoke-edge-text-heavy.png",
      "overlay-smoke-edge-browser.png",
      "overlay-smoke-edge-ide.png",
      "overlay-smoke-hud-ide.png",
      "worker_task_1_1",
      "currentToolCall",
      "budgetUsed",
      "timeline",
      "node test.js",
      ".overlay-shell--hud .compact-hud",
      ".edge-rail--left",
      "sageos.control",
      "sageos.approvals.resolve",
      "sageos.tasks.create",
      "sageos.tasks.queue",
      "sageos.tasks.cancel",
      "sageos.tasks.runNext",
      "sageos.memory.replay",
      "chat.send",
      "submitLauncherCommand(page",
      'name: "Run", exact: true',
      'document.querySelector(\'input[aria-label="SageOS command"]\')?.value === ""',
      "Assign Memory Steward to replay capture queue",
      'waitForRecordedMethod("sageos.tasks.queue")',
      'filter({ hasText: "Memory replay" })',
      'name: "Stop", exact: true',
      'name: "Deny"',
      'name: "Run next"',
      'name: "Replay memory queue"',
      'waitForRecordedMethod("sageos.control", 4)',
      'waitForRecordedMethod("sageos.memory.replay")',
      'waitForRecordedMethod("sageos.tasks.runNext")',
      'page.keyboard.press("Control+K")',
      "assertVoiceEntry(page)",
      "isVoiceInputAvailable(page)",
      'page.keyboard.press("Escape")',
      'waitForOverlayWindowHidden(app)',
    ]) {
      expect(script).toContain(expected);
    }
  });

  it("launch script exposes badge visibility environment controls", () => {
    const script = readFileSync(
      new URL("../../../scripts/sageos-windows-overlay.ps1", import.meta.url),
      "utf8",
    );

    for (const expected of [
      "[bool]$ShowApprovalBadge = $true",
      "[bool]$ShowIncidentBadge = $true",
      "$env:SAGEOS_OVERLAY_SHOW_APPROVAL_BADGE",
      "$env:SAGEOS_OVERLAY_SHOW_INCIDENT_BADGE",
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
