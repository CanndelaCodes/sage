import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("Electron overlay smoke script", () => {
  it("is wired as a repeatable package script", () => {
    expect(packageJson.scripts["smoke:electron"]).toBe("node scripts/smoke-electron.mjs");
    expect(packageJson.scripts.start).toBe("electron .");
  });

  it("covers bridge, layout, HUD, edge rail, and RPC controls", () => {
    const script = readFileSync(new URL("../scripts/smoke-electron.mjs", import.meta.url), "utf8");
    const overlayApp = readFileSync(new URL("../src/renderer/overlay-app.ts", import.meta.url), "utf8");

    for (const expected of [
      "window.sageOsOverlay?.collapse",
      "window.sageOsOverlay?.expand",
      "window.sageOsOverlay?.setInteractivePointer",
      "sageos-overlay:interactive-pointer",
      "createPassThroughProbe",
      "forceOverlayPassThrough",
      "assertShellOverlayWindow(app)",
      "setFocusable(false)",
      "sendNativeMouseClick",
      "nativeClickPoint",
      "getDisplayMatching",
      "displayBounds",
      "sameRect",
      "waitForPassThroughProbeClick",
      "readPassThroughProbeDiagnostics",
      "Timed out waiting for pass-through probe click",
      "getCursorScreenPoint",
      "getAllDisplays",
      "SageOS pass-through probe",
      "passThroughProbeClicks",
      "rendererErrors",
      "attachRendererErrorGuards",
      "assertNoRendererErrors",
      "pageerror",
      'message.type() === "error"',
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
      "setVisualBackdrop(page, \"desktop\")",
      "setVisualBackdrop(page, \"bright\")",
      "setVisualBackdrop(page, \"dark\")",
      "setVisualBackdrop(page, \"text-heavy\")",
      "setVisualBackdrop(page, \"browser\")",
      "setVisualBackdrop(page, \"ide\")",
      "overlay-smoke-visual-backdrop--desktop",
      "overlay-smoke-ide",
      "assertKeyboardFocusOrder(page)",
      "waitForGatewayActionsReady(page)",
      "assertQuickActionArrowNavigation(page)",
      "readFocusedControlName",
      'page.keyboard.press("ArrowDown")',
      'page.keyboard.press("ArrowRight")',
      'page.keyboard.press("End")',
      "overlay-smoke-full-bright.png",
      "overlay-smoke-workspace-run.png",
      "overlay-smoke-edge-dark.png",
      "overlay-smoke-edge-text-heavy.png",
      "overlay-smoke-edge-browser.png",
      "overlay-smoke-edge-ide.png",
      "overlay-smoke-hud-ide.png",
      "worker_task_1_1",
      "Open run",
      "Artifact previews",
      "waitForAgentWorkspaceInViewport(page",
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
      "chat.history",
      "sessions.list",
      "createSmokeChatHistory",
      "createSmokeChatSessions",
      "Recent overlay planning note",
      "Keep the Windows overlay as the primary SageOS UI.",
      "SageOS MVP planning",
      "Recent sessions",
      "Resume Sage AI session telegram",
      "Gateway history loaded for resumed Hermes parity smoke.",
      "submitLauncherCommand(page",
      "assertSageAiChatPanelLayout(page)",
      "assertSageAiChatSessionResume(page)",
      "Sage AI Chat stream",
      ".sage-ai-chat__facts",
      ".sage-ai-chat__sessions",
      ".sage-ai-chat__session",
      ".sage-ai-chat__transcript",
      ".sage-ai-chat__composer",
      ".sage-ai-chat__controls button",
      "Send Sage AI chat message",
      "Stop Sage AI chat",
      "Refresh Sage AI sessions",
      "bleeds outside panel vertically",
      "Sage AI chat panel overlaps the Command Deck",
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
      "assertCriticalTextFit(page)",
      "assertReducedMotion(page)",
      'reducedMotion: "reduce"',
      'matchMedia("(prefers-reduced-motion: reduce)")',
      "scrollWidth",
      "overlay-smoke-full-reduced-motion.png",
      'page.keyboard.press("Escape")',
      'waitForOverlayWindowHidden(app)',
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).not.toContain("repeating-linear-gradient");
    expect(script).not.toContain("32px 32px");
    expect(overlayApp).toContain("controller.loadChatHistory");
  });

  it("launch script exposes badge visibility environment controls", () => {
    const script = readFileSync(
      new URL("../../../scripts/sageos-windows-overlay.ps1", import.meta.url),
      "utf8",
    );

    for (const expected of [
      '[ValidateSet("auto", "always", "never")]',
      '[string]$Build = "auto"',
      "function Test-OverlayBuildAssets",
      "function Invoke-OverlayBuild",
      'if ($Build -eq "always" -or ($Build -eq "auto" -and -not (Test-OverlayBuildAssets)))',
      "pnpm --dir apps/windows-overlay start",
      "[bool]$ShowApprovalBadge = $true",
      "[bool]$ShowIncidentBadge = $true",
      "$env:SAGEOS_OVERLAY_SHOW_APPROVAL_BADGE",
      "$env:SAGEOS_OVERLAY_SHOW_INCIDENT_BADGE",
      "Remove-Item Env:SAGEOS_OVERLAY_TOKEN",
      "Remove-Item Env:SAGEOS_OVERLAY_PASSWORD",
    ]) {
      expect(script).toContain(expected);
    }

    expect(script).not.toContain("pnpm --dir apps/windows-overlay dev");
  });

  it("startup shortcut preserves the selected production build mode", () => {
    const script = readFileSync(
      new URL("../../../scripts/sageos-windows-overlay-startup.ps1", import.meta.url),
      "utf8",
    );

    for (const expected of [
      '[ValidateSet("auto", "always", "never")]',
      '[string]$Build = "auto"',
      '"-Build"',
      "(ConvertTo-ShortcutArgument $Build)",
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
