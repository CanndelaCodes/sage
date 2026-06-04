---
summary: "Windows WSL2 support plus SageOS overlay status"
read_when:
  - Installing Sage on Windows
  - Looking for Windows companion app status
title: "Windows WSL2"
---

# Windows WSL2

Sage on Windows is recommended **via WSL2** (Ubuntu recommended). The
CLI + Gateway run inside Linux, which keeps the runtime consistent and makes
tooling far more compatible (Node/Bun/pnpm, Linux binaries, skills). Native
Windows might be trickier. WSL2 gives you the full Linux experience — one command
to install: `wsl --install`.

The SageOS Windows overlay is available from this repo as an MVP desktop shell
for the active Windows session. It connects to the Gateway and opens or closes
with a configurable Windows hotkey. This overlay is separate from the broader
planned Windows node companion app.

## Install (WSL2)

- [Getting Started](/start/getting-started) (use inside WSL)
- [Install & updates](/install/updating)
- Official WSL2 guide (Microsoft): https://learn.microsoft.com/windows/wsl/install

## Gateway

- [Gateway runbook](/gateway)
- [Configuration](/gateway/configuration)

## Gateway service install (CLI)

Inside WSL2:

```
sage onboard --install-daemon
```

Or:

```
sage gateway install
```

Or:

```
sage configure
```

Select **Gateway service** when prompted.

Repair/migrate:

```
sage doctor
```

## Advanced: expose WSL services over LAN (portproxy)

WSL has its own virtual network. If another machine needs to reach a service
running **inside WSL** (SSH, a local TTS server, or the Gateway), you must
forward a Windows port to the current WSL IP. The WSL IP changes after restarts,
so you may need to refresh the forwarding rule.

Example (PowerShell **as Administrator**):

```powershell
$Distro = "Ubuntu-24.04"
$ListenPort = 2222
$TargetPort = 22

$WslIp = (wsl -d $Distro -- hostname -I).Trim().Split(" ")[0]
if (-not $WslIp) { throw "WSL IP not found." }

netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$ListenPort `
  connectaddress=$WslIp connectport=$TargetPort
```

Allow the port through Windows Firewall (one-time):

```powershell
New-NetFirewallRule -DisplayName "WSL SSH $ListenPort" -Direction Inbound `
  -Protocol TCP -LocalPort $ListenPort -Action Allow
```

Refresh the portproxy after WSL restarts:

```powershell
netsh interface portproxy delete v4tov4 listenport=$ListenPort listenaddress=0.0.0.0 | Out-Null
netsh interface portproxy add v4tov4 listenport=$ListenPort listenaddress=0.0.0.0 `
  connectaddress=$WslIp connectport=$TargetPort | Out-Null
```

Notes:

- SSH from another machine targets the **Windows host IP** (example: `ssh user@windows-host -p 2222`).
- Remote nodes must point at a **reachable** Gateway URL (not `127.0.0.1`); use
  `sage status --all` to confirm.
- Use `listenaddress=0.0.0.0` for LAN access; `127.0.0.1` keeps it local only.
- If you want this automatic, register a Scheduled Task to run the refresh
  step at login.

## Step-by-step WSL2 install

### 1) Install WSL2 + Ubuntu

Open PowerShell (Admin):

```powershell
wsl --install
# Or pick a distro explicitly:
wsl --list --online
wsl --install -d Ubuntu-24.04
```

Reboot if Windows asks.

### 2) Enable systemd (required for gateway install)

In your WSL terminal:

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then from PowerShell:

```powershell
wsl --shutdown
```

Re-open Ubuntu, then verify:

```bash
systemctl --user status
```

### 3) Install Sage (inside WSL)

Follow the Linux Getting Started flow inside WSL:

```bash
git clone https://github.com/sage/sage.git
cd sage
pnpm install
pnpm ui:build # auto-installs UI deps on first run
pnpm build
sage onboard
```

Full guide: [Getting Started](/start/getting-started)

## SageOS Windows overlay

The SageOS overlay is the Windows desktop surface for SageOS MVP work. Use it
when you want a local overlay that can sit above the active desktop, start in
full or HUD mode, collapse to an Edge Rail, and keep pinned widgets visible.

From the repo root in PowerShell:

```powershell
pnpm install
pnpm --dir apps/windows-overlay build
powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 `
  -GatewayUrl "ws://127.0.0.1:18789" `
  -Hotkey "Ctrl+Alt+Space" `
  -OpenMode full `
  -OpenOnLaunch
```

Use a Gateway URL that the Windows session can reach. The default
`ws://127.0.0.1:18789` works when the Gateway is reachable from Windows on
localhost.

Useful overlay checks:

```powershell
pnpm --dir apps/windows-overlay test
pnpm --dir apps/windows-overlay typecheck
pnpm --dir apps/windows-overlay build
pnpm --dir apps/windows-overlay review:visual:all
```

`review:visual:all` runs the packaged Electron smoke flow, builds the local
visual review contact sheet, and verifies that sheet in Chrome or Edge.

Install, inspect, or remove the current-user startup shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay-startup.ps1 -Action install
powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay-startup.ps1 -Action status
powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay-startup.ps1 -Action uninstall
```

## Windows node companion

A general native Windows node companion app is still planned. For now, run the
Gateway in WSL2 and use the SageOS Windows overlay when you need the local
desktop overlay experience.
