param(
  [string]$Hotkey = "Ctrl+Alt+Space",
  [ValidateSet("full", "hud")]
  [string]$OpenMode = "full",
  [string]$GatewayUrl = "ws://127.0.0.1:18789",
  [string]$Token = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$env:SAGEOS_OVERLAY_HOTKEY = $Hotkey
$env:SAGEOS_OVERLAY_OPEN_MODE = $OpenMode
$env:SAGEOS_OVERLAY_GATEWAY_URL = $GatewayUrl
if ($Token) {
  $env:SAGEOS_OVERLAY_TOKEN = $Token
}
if ($Password) {
  $env:SAGEOS_OVERLAY_PASSWORD = $Password
}
pnpm --dir apps/windows-overlay dev
