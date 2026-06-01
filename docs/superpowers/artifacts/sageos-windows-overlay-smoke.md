# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: Liquid Linear visual evidence slice after 2082a95859

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
- [ ] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [ ] `Ctrl+Alt+Space` closes the overlay.
- [x] `pnpm --dir apps/windows-overlay smoke:electron` verifies the packaged Electron overlay against a mock gateway.
- [x] `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto|primary|<display id>` routes the overlay to the active, primary, or configured monitor.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [x] HUD expands to full overlay.
- [x] `Ctrl+K` focuses the Universal Launcher when the full overlay is active.
- [x] `Escape` dismisses the overlay through the preload IPC close bridge.
- [x] `SAGEOS_OVERLAY_VOICE_ENABLED=1` plus `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk` exposes the Voice entry point.
- [x] The Voice entry point is omitted when voice config is missing, disabled, or invalid.
- [x] Liquid Linear material tokens cover ambient, command, focus, and summit glass elevations.
- [x] Automated smoke captures the overlay over bright, text-heavy, and IDE-like visual backdrops.
- [x] Edge Rail collapse keeps health, approval, and incident indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [x] Pause, resume, approve, deny, queue, cancel, run next, safe repair, and emergency stop controls call the expected `sageos.*` RPC methods.
- [x] No renderer page errors appear during the smoke flow.

## Evidence

- Full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Bright backdrop full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-full-bright.png`
- Left edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-left.png`
- Text-heavy backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-text-heavy.png`
- HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud.png`
- IDE-like backdrop HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud-ide.png`
- Notes: Automated overlay package test, typecheck, build, `pnpm tsgo`, `pnpm lint`, and
  `git diff --check` passed on 2026-06-01 during the visual/layout pass. The visual contract
  now enforces the Liquid Linear command glass token layer, focus states, reduced-motion handling,
  edge anchoring classes, state classes, text overflow guards, and full-overlay pinned widget flow.
  The `smoke:electron` package script
  launches the packaged Electron overlay against a mock gateway, verifies that
  `SAGEOS_OVERLAY_COLLAPSED_EDGE=left`,
  `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto`, and
  `SAGEOS_OVERLAY_PINNED_WIDGETS=memoryQueue,systemHealth,nightShift` reach the shell/renderer,
  enables `SAGEOS_OVERLAY_VOICE_ENABLED=1` with `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk`,
  verifies the Voice button focuses the Universal Launcher,
  captures full Command Deck over a bright synthetic desktop, captures Edge Rail and pinned widgets
  over a text-heavy synthetic app, captures HUD over an IDE-like dark surface,
  renders without pinned-widget overlap in the full Command Deck, exposes the preload IPC bridge
  as `window.sageOsOverlay`, collapses to the left Edge Rail, launches HUD-first mode, expands HUD
  to the full overlay, and records expected RPC calls for pause, resume, emergency stop, approve,
  deny, run next, safe memory replay repair, queue, cancel, and launcher send. Unit coverage now
  verifies the registered global hotkey callback opens and closes the overlay, startup fails if
  Electron reports hotkey registration failure, and active-monitor selection honors `primary` plus
  configured display IDs. The smoke now presses `Ctrl+K`, verifies launcher focus, presses
  `Escape`, and waits for the Electron BrowserWindow to hide through the close bridge. The smoke
  emitted Electron's development CSP warning only; no renderer page errors were observed. Physical
  hotkey open/close and real pass-through usability over an underlying app still need
  physical/manual verification.
