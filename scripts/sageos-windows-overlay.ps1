param(
  [string]$Hotkey = "Ctrl+Alt+Space",
  [ValidateSet("full", "hud")]
  [string]$OpenMode = "full",
  [bool]$HudExpandsToFull = $true,
  [switch]$PassThroughDefault,
  [ValidateSet("left", "right", "top", "bottom")]
  [string]$CollapsedEdge = "right",
  [string]$ActiveMonitor = "",
  [string[]]$PinnedWidgets = @("activeOperations", "approvals", "incidents"),
  [bool]$ShowApprovalBadge = $true,
  [bool]$ShowIncidentBadge = $true,
  [switch]$VoiceEnabled,
  [ValidateSet("pushToTalk")]
  [string]$VoiceMode = "pushToTalk",
  [string]$GatewayUrl = "ws://127.0.0.1:18789",
  [string]$Token = "",
  [string]$Password = "",
  [switch]$OpenOnLaunch
)

$ErrorActionPreference = "Stop"
$env:SAGEOS_OVERLAY_HOTKEY = $Hotkey
$env:SAGEOS_OVERLAY_OPEN_MODE = $OpenMode
$env:SAGEOS_OVERLAY_HUD_EXPANDS_TO_FULL = if ($HudExpandsToFull) { "1" } else { "0" }
$env:SAGEOS_OVERLAY_PASS_THROUGH_DEFAULT = if ($PassThroughDefault) { "1" } else { "0" }
$env:SAGEOS_OVERLAY_COLLAPSED_EDGE = $CollapsedEdge
if ($ActiveMonitor) {
  $env:SAGEOS_OVERLAY_ACTIVE_MONITOR = $ActiveMonitor
} else {
  Remove-Item Env:SAGEOS_OVERLAY_ACTIVE_MONITOR -ErrorAction SilentlyContinue
}
$env:SAGEOS_OVERLAY_PINNED_WIDGETS = ($PinnedWidgets -join ",")
$env:SAGEOS_OVERLAY_SHOW_APPROVAL_BADGE = if ($ShowApprovalBadge) { "1" } else { "0" }
$env:SAGEOS_OVERLAY_SHOW_INCIDENT_BADGE = if ($ShowIncidentBadge) { "1" } else { "0" }
if ($VoiceEnabled) {
  $env:SAGEOS_OVERLAY_VOICE_ENABLED = "1"
  $env:SAGEOS_OVERLAY_VOICE_MODE = $VoiceMode
} else {
  $env:SAGEOS_OVERLAY_VOICE_ENABLED = "0"
  Remove-Item Env:SAGEOS_OVERLAY_VOICE_MODE -ErrorAction SilentlyContinue
}
$env:SAGEOS_OVERLAY_GATEWAY_URL = $GatewayUrl
if ($Token) {
  $env:SAGEOS_OVERLAY_TOKEN = $Token
}
if ($Password) {
  $env:SAGEOS_OVERLAY_PASSWORD = $Password
}
if ($OpenOnLaunch) {
  $env:SAGEOS_OVERLAY_OPEN_ON_LAUNCH = "1"
} else {
  $env:SAGEOS_OVERLAY_OPEN_ON_LAUNCH = "0"
}
pnpm --dir apps/windows-overlay dev
