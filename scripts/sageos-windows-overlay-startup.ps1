param(
  [ValidateSet("install", "uninstall", "status")]
  [string]$Action = "status",
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

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "SageOS Windows Overlay.lnk"
$repoRoot = Split-Path -Parent $PSScriptRoot
$launchScriptRelative = "scripts\\sageos-windows-overlay.ps1"
$launchScript = Join-Path $repoRoot "scripts\sageos-windows-overlay.ps1"
$powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

function ConvertTo-ShortcutArgument {
  param([string]$Value)

  return '"' + ($Value -replace '"', '\"') + '"'
}

function ConvertTo-ShortcutSwitch {
  param(
    [string]$Name,
    [bool]$Enabled
  )

  if (-not $Enabled) {
    return @()
  }

  return @($Name)
}

function Get-ShortcutArguments {
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle Hidden",
    "-File",
    (ConvertTo-ShortcutArgument $launchScript),
    "-Hotkey",
    (ConvertTo-ShortcutArgument $Hotkey),
    "-OpenMode",
    (ConvertTo-ShortcutArgument $OpenMode),
    "-HudExpandsToFull",
    (ConvertTo-ShortcutArgument ([string]$HudExpandsToFull)),
    "-CollapsedEdge",
    (ConvertTo-ShortcutArgument $CollapsedEdge),
    "-ShowApprovalBadge",
    (ConvertTo-ShortcutArgument ([string]$ShowApprovalBadge)),
    "-ShowIncidentBadge",
    (ConvertTo-ShortcutArgument ([string]$ShowIncidentBadge)),
    "-GatewayUrl",
    (ConvertTo-ShortcutArgument $GatewayUrl)
  )

  if ($ActiveMonitor) {
    $arguments += @("-ActiveMonitor", (ConvertTo-ShortcutArgument $ActiveMonitor))
  }

  foreach ($widget in $PinnedWidgets) {
    $arguments += @("-PinnedWidgets", (ConvertTo-ShortcutArgument $widget))
  }

  $arguments += ConvertTo-ShortcutSwitch "-PassThroughDefault" ([bool]$PassThroughDefault)
  $arguments += ConvertTo-ShortcutSwitch "-VoiceEnabled" ([bool]$VoiceEnabled)

  if ($VoiceEnabled) {
    $arguments += @("-VoiceMode", (ConvertTo-ShortcutArgument $VoiceMode))
  }

  if ($Token) {
    $arguments += @("-Token", (ConvertTo-ShortcutArgument $Token))
  }

  if ($Password) {
    $arguments += @("-Password", (ConvertTo-ShortcutArgument $Password))
  }

  $arguments += ConvertTo-ShortcutSwitch "-OpenOnLaunch" ([bool]$OpenOnLaunch)

  return $arguments -join " "
}

function Get-ShortcutStatus {
  $installed = Test-Path -LiteralPath $shortcutPath
  $status = [ordered]@{
    installed = $installed
    shortcutPath = $shortcutPath
    targetPath = $null
    arguments = $null
    workingDirectory = $null
    launchScript = $launchScript
  }

  if ($installed) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $status.targetPath = $shortcut.TargetPath
    $status.arguments = $shortcut.Arguments
    $status.workingDirectory = $shortcut.WorkingDirectory
  }

  return $status
}

if ($Action -eq "install") {
  if (-not (Test-Path -LiteralPath $launchScript)) {
    throw "SageOS Windows overlay launch script not found: $launchScript"
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powershellPath
  $shortcut.Arguments = Get-ShortcutArguments
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Launch SageOS Windows Overlay for the active user session"
  $shortcut.IconLocation = $powershellPath
  $shortcut.Save()
}
elseif ($Action -eq "uninstall") {
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
}

Get-ShortcutStatus | ConvertTo-Json -Depth 4
