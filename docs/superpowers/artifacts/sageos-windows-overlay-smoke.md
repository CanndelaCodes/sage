# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-01
Operator: Codex
Build: 50b7537bb3

## Preconditions

- [ ] Windows desktop session is active.
- [ ] Sage gateway is running locally.
- [x] `pnpm install` has completed.

## Checks

- [x] `pnpm --dir apps/windows-overlay typecheck` passes.
- [x] `pnpm --dir apps/windows-overlay test` passes.
- [x] `pnpm --dir apps/windows-overlay build` passes.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -Hotkey "Ctrl+Alt+Space" -OpenMode full -GatewayUrl "ws://127.0.0.1:18789"` starts the overlay.
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
- Notes: Automated root overlay config/state tests plus overlay package typecheck, test, and build passed on 2026-06-01. `pnpm tsgo` and `pnpm build` passed; root build emitted existing plugin timing warnings only. Launch script started Electron overlay processes on 2026-06-01 and they were stopped after verification. Connected gateway smoke was blocked because `sage gateway run --bind loopback --port 18789 --force` exited with missing `gateway.mode=local`; retrying with `--allow-unconfigured` produced the same config error. Hotkey open/close, HUD mode, and connected renderer control smoke still need a configured local gateway session.
