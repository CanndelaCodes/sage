import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LearningEvent } from "./types.js";
import { normalizeLearningEvent } from "./events.js";

const execFileAsync = promisify(execFile);

export type ActiveAppFocusResult =
  | {
      supported: false;
      reason: "unsupported-platform" | "empty-result" | "invalid-result";
      error?: string;
    }
  | { supported: true; event: LearningEvent };

type Deps = {
  platform?: NodeJS.Platform;
  now?: () => Date;
  execPowerShell?: () => Promise<string>;
};

export async function readActiveAppFocus(deps: Deps = {}): Promise<ActiveAppFocusResult> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") {
    return { supported: false, reason: "unsupported-platform" };
  }
  let raw: string;
  try {
    raw = await (deps.execPowerShell ?? readWindowsForegroundApp)();
  } catch (err) {
    return {
      supported: false,
      reason: "invalid-result",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!raw.trim()) {
    return { supported: false, reason: "empty-result" };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const processName = readString(parsed.processName);
    const windowTitle = readString(parsed.windowTitle);
    const pid = typeof parsed.pid === "number" && Number.isFinite(parsed.pid) ? parsed.pid : null;
    if (!processName && !windowTitle) {
      return { supported: false, reason: "invalid-result" };
    }
    return {
      supported: true,
      event: normalizeLearningEvent(
        {
          source: "app_focus",
          actor: "local-user",
          title: [processName, windowTitle].filter(Boolean).join(": "),
          text: `Active app focus: ${[processName, windowTitle].filter(Boolean).join(" - ")}`,
          payload: {
            ...(processName ? { processName } : {}),
            ...(pid !== null ? { pid } : {}),
            ...(windowTitle ? { windowTitle } : {}),
          },
        },
        { now: deps.now },
      ),
    };
  } catch (err) {
    return {
      supported: false,
      reason: "invalid-result",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function readWindowsForegroundApp(): Promise<string> {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$handle = [Win32Focus]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 2048
[void][Win32Focus]::GetWindowText($handle, $builder, $builder.Capacity)
$pidValue = 0
[void][Win32Focus]::GetWindowThreadProcessId($handle, [ref]$pidValue)
$proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
[pscustomobject]@{
  processName = if ($proc) { $proc.ProcessName } else { $null }
  pid = [int]$pidValue
  windowTitle = $builder.ToString()
} | ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
  return stdout;
}

function readString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
