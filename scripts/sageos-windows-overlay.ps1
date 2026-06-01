param(
  [string]$Hotkey = "Ctrl+Alt+Space",
  [ValidateSet("full", "hud")]
  [string]$OpenMode = "full"
)

$ErrorActionPreference = "Stop"
$env:SAGEOS_OVERLAY_HOTKEY = $Hotkey
$env:SAGEOS_OVERLAY_OPEN_MODE = $OpenMode
pnpm --dir apps/windows-overlay dev
