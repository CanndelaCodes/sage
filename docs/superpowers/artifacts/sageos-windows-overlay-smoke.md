# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: overlay visual/layout smoke slice after 77516eacbb

## Preconditions

- [x] Windows desktop session is active.
- [x] Sage gateway is running locally.
- [x] `pnpm install` has completed.

## Checks

- [x] `pnpm --dir apps/windows-overlay typecheck` passes.
- [x] `pnpm --dir apps/windows-overlay test` passes.
- [x] `pnpm --dir apps/windows-overlay build` passes.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -Hotkey "Ctrl+Alt+Space" -OpenMode full -GatewayUrl "ws://127.0.0.1:18789" -Token "overlay-smoke-token" -OpenOnLaunch` starts the overlay.
- [x] `-OpenOnLaunch` opens the full-screen translucent overlay without requiring a synthetic hotkey.
- [ ] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [ ] `Ctrl+Alt+Space` closes the overlay.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [ ] HUD expands to full overlay.
- [x] Edge Rail collapse keeps health, approval, and incident indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [ ] Pause, resume, approve, deny, queue, cancel, and emergency stop controls call the expected `sageos.*` RPC methods.
- [x] No renderer page errors appear during the smoke flow.

## Evidence

- Full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Left edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-left.png`
- Notes: Automated overlay package test, typecheck, build, `pnpm tsgo`, `pnpm lint`, and `git diff --check` passed on 2026-06-01 during the visual/layout pass. The visual contract now enforces the Vitreous Liquor token layer, focus states, reduced-motion handling, edge anchoring classes, and full-overlay pinned widget flow. An Electron smoke with a mock gateway verified that `SAGEOS_OVERLAY_COLLAPSED_EDGE=left` and `SAGEOS_OVERLAY_PINNED_WIDGETS=memoryQueue,systemHealth,nightShift` reach the renderer, render without pinned-widget overlap in the full Command Deck, expose the preload IPC bridge as `window.sageOsOverlay`, and collapse to the left Edge Rail. The smoke emitted Electron's development CSP warning only; no renderer page errors were observed. Physical hotkey open/close, HUD-first mode, pass-through usability, and manual button-click RPC smoke still need physical/manual verification.
