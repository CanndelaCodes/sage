# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: overlay automated smoke slice after 89d6a180c9

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
- [ ] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [ ] `Ctrl+Alt+Space` closes the overlay.
- [x] `pnpm --dir apps/windows-overlay smoke:electron` verifies the packaged Electron overlay against a mock gateway.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [x] HUD expands to full overlay.
- [x] Edge Rail collapse keeps health, approval, and incident indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [x] Pause, resume, approve, deny, queue, cancel, and emergency stop controls call the expected `sageos.*` RPC methods.
- [x] No renderer page errors appear during the smoke flow.

## Evidence

- Full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Left edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-left.png`
- HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud.png`
- Notes: Automated overlay package test, typecheck, build, `pnpm tsgo`, `pnpm lint`, and
  `git diff --check` passed on 2026-06-01 during the visual/layout pass. The visual contract
  now enforces the Vitreous Liquor token layer, focus states, reduced-motion handling, edge
  anchoring classes, and full-overlay pinned widget flow. `pnpm --dir apps/windows-overlay
smoke:electron` launches the packaged Electron overlay against a mock gateway, verifies that
  `SAGEOS_OVERLAY_COLLAPSED_EDGE=left` and
  `SAGEOS_OVERLAY_PINNED_WIDGETS=memoryQueue,systemHealth,nightShift` reach the renderer, renders
  without pinned-widget overlap in the full Command Deck, exposes the preload IPC bridge as
  `window.sageOsOverlay`, collapses to the left Edge Rail, launches HUD-first mode, expands HUD to
  the full overlay, and records expected RPC calls for pause, resume, emergency stop, approve,
  queue, cancel, and launcher send. The smoke emitted Electron's development CSP warning only; no
  renderer page errors were observed. Physical hotkey open/close and real pass-through usability
  over an underlying app still need physical/manual verification.
