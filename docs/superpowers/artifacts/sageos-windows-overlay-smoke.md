# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: a98348ab11

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
- [ ] Edge Rail collapse keeps health, approval, incident, and active-operation indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [ ] Pause, resume, approve, deny, queue, cancel, and emergency stop controls call the expected `sageos.*` RPC methods.
- [ ] No renderer console errors appear during the smoke flow.

## Evidence

- Screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Notes: Automated overlay package typecheck, test, and build passed on 2026-06-01. `pnpm tsgo` passed after adding the native `sage-windows-overlay` gateway client id. `pnpm sage gateway --allow-unconfigured --port 18789 --bind loopback --token overlay-smoke-token` started a local gateway; it rebuilt stale root output and emitted existing plugin timing warnings only. Launching the overlay with `-Token "overlay-smoke-token" -OpenOnLaunch` rendered the full overlay on the virtual desktop screenshot with status `Connected`. The earlier connected-smoke blockers were resolved by bundling renderer Lit dependencies for Electron `file://` loading and by identifying the overlay as a native Windows overlay client instead of the web Control UI. A follow-up styled smoke verified the packaged stylesheet applies inside Electron by rendering the Lit app into light DOM. Gateway output had no rejection or renderer-origin errors after the final restart. Hotkey open/close, HUD mode, edge rail, pass-through widgets, and manual button-click RPC smoke still need physical/manual verification.
