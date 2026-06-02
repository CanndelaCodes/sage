# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-02
Operator: Codex
Build: Windows overlay MVP shell verification after voice availability update

## Preconditions

- [x] Windows desktop session is active.
- [x] Sage gateway is running locally.
- [x] `pnpm install` has completed.

## Checks

- [x] `pnpm --dir apps/windows-overlay typecheck` passes.
- [x] `pnpm --dir apps/windows-overlay test` passes.
- [x] `pnpm --dir apps/windows-overlay build` passes.
- [x] Full-mode launch script starts the overlay:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 `
    -Hotkey "Ctrl+Alt+Space" -OpenMode full `
    -GatewayUrl "ws://127.0.0.1:18789" -Token "overlay-smoke-token" -OpenOnLaunch
  ```
- [x] `-OpenOnLaunch` opens the full-screen translucent overlay without requiring a synthetic hotkey.
- [x] The window controller fails startup explicitly if Electron cannot register the configured hotkey.
- [x] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [x] `Ctrl+Alt+Space` closes the overlay.
- [x] `pnpm --dir apps/windows-overlay smoke:electron` verifies the packaged Electron overlay against a mock gateway.
- [x] `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto|primary|<display id>` routes the overlay to the active, primary, or configured monitor.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [x] HUD expands to full overlay.
- [x] Tray menu exposes Open SageOS, Show HUD, Collapse to Edge Rail, Hide Overlay, and Quit SageOS Overlay mouse-first controls.
- [x] `Ctrl+K` focuses the Universal Launcher when the full overlay is active.
- [x] `Escape` dismisses the overlay through the preload IPC close bridge.
- [x] `SAGEOS_OVERLAY_VOICE_ENABLED=1` plus `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk` exposes the Voice entry point.
- [x] Voice entry is enabled only when browser speech recognition exists; otherwise it is disabled with an unavailable-runtime reason.
- [x] The Voice entry point is omitted when voice config is missing, disabled, or invalid.
- [x] Liquid Linear material tokens cover ambient, command, focus, and summit glass elevations.
- [x] Liquid Linear command glass tokens cover refraction, specular highlights, platinum tint, command/focus/control shadows, runway highlights, and spring motion.
- [x] Command Deck opens on active run telemetry when a live run exists, including worker session, current tool, budget used, verification, timeline, logs, and artifacts.
- [x] Automated smoke captures the overlay over bright, text-heavy, and IDE-like visual backdrops.
- [x] Edge Rail collapse keeps health, approval, and incident indicators visible.
- [x] Pass-through surfaces can temporarily restore overlay pointer capture over active controls.
- [x] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [x] Pause, resume, stop, approve, deny, queue, cancel, run next, safe repair, and emergency stop controls call the expected `sageos.*` RPC methods.
- [x] No renderer page errors appear during the smoke flow.

## Evidence

- Full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Bright backdrop full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-full-bright.png`
- Left edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-left.png`
- Text-heavy backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-text-heavy.png`
- HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud.png`
- IDE-like backdrop HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud-ide.png`
- Current verification update: `pnpm --dir apps/windows-overlay smoke:electron` passed on
  2026-06-02 after the voice availability update. The packaged overlay reported `ok: true`,
  `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, no renderer page errors,
  four `sageos.control` calls for pause, resume, stop, and emergency stop, verified the
  availability-aware Voice entry state, and refreshed the full, bright, edge-left, text-heavy edge,
  HUD, and IDE HUD screenshots above.
- Notes: Automated overlay package test, focused config/state tests, overlay typecheck, overlay build,
  root `pnpm tsgo`, root `pnpm build`, exact `pnpm oxfmt --check` plan targets, and
  `git diff --check` passed on 2026-06-01 during the final overlay MVP verification pass.
  The visual contract
  now enforces the Liquid Linear command glass token layer, refraction/specular surface overlays,
  forced-colors fallback, focus states, reduced-motion handling,
  edge anchoring classes, state classes, text overflow guards, and full-overlay pinned widget flow.
  The `smoke:electron` package script
  launches the packaged Electron overlay against a mock gateway, verifies that
  `SAGEOS_OVERLAY_COLLAPSED_EDGE=left`,
  `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto`, and
  `SAGEOS_OVERLAY_PINNED_WIDGETS=memoryQueue,systemHealth,nightShift` reach the shell/renderer,
  launches a default-hotkey overlay instance with `Ctrl+Alt+Space`, waits for Electron
  `globalShortcut` registration, sends native Windows keyboard input, and reports
  `defaultHotkeyToggles: 2` after the overlay opens and closes,
  enables `SAGEOS_OVERLAY_VOICE_ENABLED=1` with `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk`,
  verifies the Voice control is enabled only when browser speech recognition exists and is otherwise
  disabled with an unavailable-runtime reason,
  captures full Command Deck over a bright synthetic desktop, captures Edge Rail and pinned widgets
  over a text-heavy synthetic app, captures HUD over an IDE-like dark surface,
  seeds the mock gateway with an active run that includes `workerSessionId`, `currentToolCall`,
  `budgetUsed`, `timeline`, logs, artifacts, and verification metadata,
  waits for launcher submissions to enable before clicking and for the launcher field to clear
  before sending the next command,
  verifies the `sageos-overlay:interactive-pointer` preload bridge and exercises temporary pointer
  capture while Edge Rail is active,
  creates a native Electron underlay probe and sends a Windows user32 mouse click through the
  pass-through Edge Rail surface; `smoke:electron` reports `passThroughProbeClicks` after the
  underlay receives the click,
  verifies the tray menu exposes mouse-first open, HUD, collapse, hide, and quit controls wired to
  the overlay controller,
  renders without pinned-widget overlap in the full Command Deck, exposes the preload IPC bridge
  as `window.sageOsOverlay`, collapses to the left Edge Rail, launches HUD-first mode, expands HUD
  to the full overlay, and records expected RPC calls for pause, resume, stop, emergency stop, approve,
  deny, run next, safe memory replay repair, queue, cancel, and launcher send. Unit coverage now
  verifies the registered global hotkey callback opens and closes the overlay, startup fails if
  Electron reports hotkey registration failure, and active-monitor selection honors `primary` plus
  configured display IDs. The smoke now presses `Ctrl+K`, verifies launcher focus, presses
  `Escape`, and waits for the Electron BrowserWindow to hide through the close bridge. The smoke
  emitted Electron's development CSP warning only; no renderer page errors were observed.
