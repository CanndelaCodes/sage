import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const startupScriptPath = join(repoRoot, "scripts", "sageos-windows-overlay-startup.ps1");

describe("Windows overlay startup installer", () => {
  it("is exposed through repeatable package scripts", () => {
    expect(packageJson.scripts["startup:install"]).toBe(
      "powershell -ExecutionPolicy Bypass -File ../../scripts/sageos-windows-overlay-startup.ps1 -Action install",
    );
    expect(packageJson.scripts["startup:status"]).toBe(
      "powershell -ExecutionPolicy Bypass -File ../../scripts/sageos-windows-overlay-startup.ps1 -Action status",
    );
    expect(packageJson.scripts["startup:uninstall"]).toBe(
      "powershell -ExecutionPolicy Bypass -File ../../scripts/sageos-windows-overlay-startup.ps1 -Action uninstall",
    );
  });

  it("installs a Windows Startup-folder shortcut for the active user session", () => {
    expect(existsSync(startupScriptPath)).toBe(true);
    const script = readFileSync(startupScriptPath, "utf8");

    for (const expected of [
      '[Environment]::GetFolderPath("Startup")',
      "SageOS Windows Overlay.lnk",
      "WScript.Shell",
      "CreateShortcut",
      "powershell.exe",
      "-WindowStyle Hidden",
      "scripts\\sageos-windows-overlay.ps1",
      "-ShowApprovalBadge",
      "-ShowIncidentBadge",
      "$shortcut.TargetPath",
      "$shortcut.Arguments",
      "$shortcut.WorkingDirectory",
      "$shortcut.Save()",
    ]) {
      expect(script).toContain(expected);
    }
  });

  it("supports status and uninstall without requiring administrator scope", () => {
    const script = readFileSync(startupScriptPath, "utf8");

    expect(script).toContain('[ValidateSet("install", "uninstall", "status")]');
    expect(script).toContain("Remove-Item -LiteralPath $shortcutPath");
    expect(script).toContain("ConvertTo-Json");
    expect(script).not.toContain("schtasks");
    expect(script).not.toContain("Start-Process");
  });
});
