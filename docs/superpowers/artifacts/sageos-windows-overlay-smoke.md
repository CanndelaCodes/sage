# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: 0a9866dd10

## Preconditions

- [ ] Windows desktop session is active.
- [ ] Sage gateway is running locally.
- [x] `pnpm install` has completed.

## Checks

- [x] `pnpm --dir apps/windows-overlay typecheck` passes.
- [x] `pnpm --dir apps/windows-overlay test` passes.
- [x] `pnpm --dir apps/windows-overlay build` passes.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -Hotkey "Ctrl+Alt+Space" -OpenMode full` starts the overlay.
- [ ] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [ ] `Ctrl+Alt+Space` closes the overlay.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [ ] HUD expands to full overlay.
- [ ] Edge Rail collapse keeps health, approval, incident, and active-operation indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [ ] Pause, resume, approve, deny, queue, cancel, and emergency stop controls call the expected `sageos.*` RPC methods.
- [ ] No renderer console errors appear during the smoke flow.

## Evidence

- Screenshot path:
- Notes: Automated root overlay config/state tests plus overlay package typecheck, test, and build passed on 2026-06-01. Manual desktop overlay launch and hotkey checks still need to be run in an active Windows desktop session with the Sage gateway running. The current build emits a non-fatal tsdown warning about Electron dependency bundling.
