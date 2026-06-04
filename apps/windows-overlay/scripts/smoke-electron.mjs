import { _electron as electron } from "playwright-core";
import { WebSocketServer } from "ws";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const overlayDir = path.resolve(import.meta.dirname, "..");
const screenshotDir = path.join(overlayDir, "dist");
const require = createRequire(import.meta.url);
const electronPath = require(path.join(overlayDir, "node_modules/electron"));
const execFileAsync = promisify(execFile);
const now = "2026-06-01T19:30:00.000Z";

await fs.mkdir(screenshotDir, { recursive: true });

const recordedMethods = [];
const rendererErrors = [];
const gateway = await startMockGateway(recordedMethods);

try {
  const buildSha = await readBuildSha();
  const hotkeySmoke = await smokeDefaultHotkeyToggle(gateway.url, rendererErrors);
  const fullSmoke = await smokeFullOverlay(gateway.url, rendererErrors);
  await smokeHudOverlay(gateway.url, rendererErrors);
  assertRecordedMethods(recordedMethods, [
    "connect",
    "sageos.status",
    "sageos.control",
    "sageos.approvals.resolve",
    "sageos.tasks.create",
    "sageos.tasks.queue",
    "sageos.tasks.cancel",
    "sageos.tasks.runNext",
    "sageos.memory.replay",
    "chat.send",
  ]);
  assertNoRendererErrors(rendererErrors);

  console.log(
    JSON.stringify(
      {
        ok: true,
        buildSha,
        defaultHotkeyToggles: hotkeySmoke.defaultHotkeyToggles,
        passThroughProbeClicks: fullSmoke.passThroughProbeClicks,
        rendererErrors: rendererErrors.length,
        methods: recordedMethods.map((entry) => entry.method),
        screenshots: {
          full: path.join(screenshotDir, "overlay-smoke-styled.png"),
          workspaceRun: path.join(screenshotDir, "overlay-smoke-workspace-run.png"),
          fullBright: path.join(screenshotDir, "overlay-smoke-full-bright.png"),
          fullReducedMotion: path.join(screenshotDir, "overlay-smoke-full-reduced-motion.png"),
          edgeLeft: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
          edgeDark: path.join(screenshotDir, "overlay-smoke-edge-dark.png"),
          edgeTextHeavy: path.join(screenshotDir, "overlay-smoke-edge-text-heavy.png"),
          edgeBrowser: path.join(screenshotDir, "overlay-smoke-edge-browser.png"),
          edgeIde: path.join(screenshotDir, "overlay-smoke-edge-ide.png"),
          hud: path.join(screenshotDir, "overlay-smoke-hud.png"),
          hudIde: path.join(screenshotDir, "overlay-smoke-hud-ide.png"),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await gateway.close();
}

async function smokeFullOverlay(gatewayUrl, rendererErrors) {
  const app = await launchOverlay({
    SAGEOS_OVERLAY_GATEWAY_URL: gatewayUrl,
    SAGEOS_OVERLAY_HOTKEY: "Ctrl+Alt+Shift+F12",
    SAGEOS_OVERLAY_OPEN_MODE: "full",
    SAGEOS_OVERLAY_OPEN_ON_LAUNCH: "1",
    SAGEOS_OVERLAY_COLLAPSED_EDGE: "left",
    SAGEOS_OVERLAY_ACTIVE_MONITOR: "auto",
    SAGEOS_OVERLAY_PINNED_WIDGETS: "memoryQueue,systemHealth,nightShift",
    SAGEOS_OVERLAY_VOICE_ENABLED: "1",
    SAGEOS_OVERLAY_VOICE_MODE: "pushToTalk",
  });

  try {
    const page = await app.firstWindow({ timeout: 15_000 });
    attachRendererErrorGuards(page, rendererErrors);
    await page.waitForSelector(".overlay-shell--commandDeck .pinned-widgets", {
      timeout: 15_000,
    });
    await page.waitForFunction(() => document.body.innerText.includes("Memory Queue"));
    await waitForGatewayActionsReady(page);
    await assertPreloadBridge(page);
    await assertVoiceEntry(page);
    await assertKeyboardFocusOrder(page);
    await assertQuickActionArrowNavigation(page);
    await assertCriticalTextFit(page);

    await setVisualBackdrop(page, "desktop");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-styled.png"),
      animations: "disabled",
    });
    const nightShiftRow = page.locator(".overlay-row").filter({ hasText: "Night Shift report" });
    await nightShiftRow.getByRole("button", { name: "Open run" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Artifact previews"));
    await waitForAgentWorkspaceInViewport(page, "Artifact previews");
    await assertCriticalTextFit(page);
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-workspace-run.png"),
      animations: "disabled",
    });
    await assertReducedMotion(page);
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-full-reduced-motion.png"),
      animations: "disabled",
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setVisualBackdrop(page, "bright");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-full-bright.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Pause" }).click();
    await waitForRecordedMethod("sageos.control");
    await page.getByRole("button", { name: "Resume" }).click();
    await waitForRecordedMethod("sageos.control", 2);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await waitForRecordedMethod("sageos.control", 3);
    await page.getByRole("button", { name: "Emergency stop" }).click();
    await waitForRecordedMethod("sageos.control", 4);
    await page.getByRole("button", { name: "Approve" }).click();
    await waitForRecordedMethod("sageos.approvals.resolve");
    await page.getByRole("button", { name: "Deny" }).click();
    await waitForRecordedMethod("sageos.approvals.resolve", 2);
    await page.getByRole("button", { name: "Run next" }).click();
    await waitForRecordedMethod("sageos.tasks.runNext");
    await page.getByRole("button", { name: "Replay memory queue" }).click();
    await waitForRecordedMethod("sageos.memory.replay");
    const memoryReplayRow = page.locator(".overlay-row").filter({ hasText: "Memory replay" });
    await memoryReplayRow.getByRole("button", { name: "Queue" }).click();
    await waitForRecordedMethod("sageos.tasks.queue");
    await memoryReplayRow.getByRole("button", { name: "Cancel" }).click();
    await waitForRecordedMethod("sageos.tasks.cancel");
    await submitLauncherCommand(page, "Assign Memory Steward to replay capture queue", "sageos.tasks.create");
    await submitLauncherCommand(page, "Summarize SageOS overlay smoke", "chat.send");

    await page.evaluate(() => window.sageOsOverlay?.collapse());
    await page.waitForSelector(".edge-rail--left", { timeout: 5_000 });
    await assertCriticalTextFit(page);
    const passThroughProbe = await createPassThroughProbe(app);
    await armOverlayClickProbe(page);
    const nativeClick = await sendNativeMouseClick(passThroughProbe.clickPoint);
    const passThroughProbeClicks = await waitForPassThroughProbeClick(
      app,
      passThroughProbe,
      nativeClick,
    );
    await page.evaluate(() => window.sageOsOverlay?.setInteractivePointer(true));
    await page.evaluate(() => window.sageOsOverlay?.setInteractivePointer(false));
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "dark");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-dark.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "text-heavy");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-text-heavy.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "browser");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-browser.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "ide");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-ide.png"),
      animations: "disabled",
    });

    await page.evaluate(() => window.sageOsOverlay?.expand());
    await page.waitForSelector(".overlay-shell--commandDeck", { timeout: 5_000 });
    await page.keyboard.press("Control+K");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "SageOS command",
    );
    await page.keyboard.press("Escape");
    await waitForOverlayWindowHidden(app);
    return { passThroughProbeClicks };
  } finally {
    await app.close().catch(() => {});
  }
}

async function smokeHudOverlay(gatewayUrl, rendererErrors) {
  const app = await launchOverlay({
    SAGEOS_OVERLAY_GATEWAY_URL: gatewayUrl,
    SAGEOS_OVERLAY_HOTKEY: "Ctrl+Alt+Shift+F11",
    SAGEOS_OVERLAY_OPEN_MODE: "hud",
    SAGEOS_OVERLAY_OPEN_ON_LAUNCH: "1",
    SAGEOS_OVERLAY_COLLAPSED_EDGE: "right",
    SAGEOS_OVERLAY_ACTIVE_MONITOR: "auto",
    SAGEOS_OVERLAY_PINNED_WIDGETS: "activeOperations,approvals,incidents",
  });

  try {
    const page = await app.firstWindow({ timeout: 15_000 });
    attachRendererErrorGuards(page, rendererErrors);
    await page.waitForSelector(".overlay-shell--hud .compact-hud", { timeout: 15_000 });
    await assertPreloadBridge(page);
    await assertCriticalTextFit(page);
    await setVisualBackdrop(page, "desktop");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-hud.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "ide");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-hud-ide.png"),
      animations: "disabled",
    });

    await page.evaluate(() => window.sageOsOverlay?.expand());
    await page.waitForSelector(".overlay-shell--commandDeck", { timeout: 5_000 });
  } finally {
    await app.close().catch(() => {});
  }
}

async function smokeDefaultHotkeyToggle(gatewayUrl, rendererErrors) {
  const hotkey = "Ctrl+Alt+Space";
  const app = await launchOverlay({
    SAGEOS_OVERLAY_GATEWAY_URL: gatewayUrl,
    SAGEOS_OVERLAY_HOTKEY: hotkey,
    SAGEOS_OVERLAY_OPEN_MODE: "full",
    SAGEOS_OVERLAY_OPEN_ON_LAUNCH: "0",
    SAGEOS_OVERLAY_COLLAPSED_EDGE: "right",
    SAGEOS_OVERLAY_ACTIVE_MONITOR: "auto",
    SAGEOS_OVERLAY_PINNED_WIDGETS: "activeOperations,approvals,incidents",
  });

  try {
    await waitForGlobalShortcut(app, hotkey);
    await sendNativeHotkey(hotkey);
    const page = await app.firstWindow({ timeout: 15_000 });
    attachRendererErrorGuards(page, rendererErrors);
    await page.waitForSelector(".overlay-shell--commandDeck", { timeout: 15_000 });
    await waitForOverlayWindowVisible(app, page);

    await sendNativeHotkey(hotkey);
    await waitForOverlayWindowHidden(app);
    return { defaultHotkeyToggles: 2 };
  } finally {
    await app.close().catch(() => {});
  }
}

async function launchOverlay(env) {
  return electron.launch({
    executablePath: electronPath,
    args: [overlayDir],
    cwd: overlayDir,
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function readBuildSha() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: repoRoot,
      windowsHide: true,
    });
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function createPassThroughProbe(app) {
  const html = `<!doctype html>
    <html>
      <head>
        <title>SageOS pass-through probe</title>
        <style>
          html,
          body {
            width: 100%;
            height: 100%;
            margin: 0;
            background: #f8fafc;
            color: #0f172a;
            font: 13px/1.45 "Segoe UI", sans-serif;
          }

          body {
            display: grid;
            place-items: center;
          }

          #target {
            width: 220px;
            height: 96px;
            border: 1px solid #0284c7;
            border-radius: 8px;
            background: #e0f2fe;
          }
        </style>
      </head>
      <body data-clicks="0">
        <button id="target" type="button">Underlay clicks: <span id="count">0</span></button>
        <script>
          document.addEventListener("click", () => {
            const next = Number(document.body.dataset.clicks || "0") + 1;
            document.body.dataset.clicks = String(next);
            document.getElementById("count").textContent = String(next);
          });
        </script>
      </body>
    </html>`;
  const probe = await app.evaluate(
    async ({ BrowserWindow, screen }, probeHtml) => {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const width = 360;
      const height = 180;
      const x = display.bounds.x + display.bounds.width - width - 96;
      const y = display.bounds.y + display.bounds.height - height - 96;
      const window = new BrowserWindow({
        x,
        y,
        width,
        height,
        frame: false,
        show: false,
        skipTaskbar: true,
        alwaysOnTop: false,
        resizable: false,
        backgroundColor: "#f8fafc",
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(probeHtml)}`);
      window.showInactive();
      return {
        id: window.id,
        nativeHandle: window.getNativeWindowHandle().toString("hex"),
        clickPoint: {
          x: x + Math.floor(width / 2),
          y: y + Math.floor(height / 2),
        },
      };
    },
    html,
  );
  return { ...probe, page: await waitForPageTitle(app, "SageOS pass-through probe") };
}

async function waitForPageTitle(app, title, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const page of app.windows()) {
      if ((await page.title()) === title) {
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for Electron window title: ${title}`);
}

async function sendNativeMouseClick({ x, y }) {
  if (process.platform !== "win32") {
    throw new Error("SageOS pass-through smoke requires native Windows mouse input");
  }
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SageOsMouseInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
$target = New-Object SageOsMouseInput+POINT
$target.X = ${Math.round(x)}
$target.Y = ${Math.round(y)}

function Read-SageOsWindowAtPoint([SageOsMouseInput+POINT]$Point) {
  $handle = [SageOsMouseInput]::WindowFromPoint($Point)
  $title = New-Object System.Text.StringBuilder 512
  $className = New-Object System.Text.StringBuilder 512
  [SageOsMouseInput]::GetWindowText($handle, $title, $title.Capacity) | Out-Null
  [SageOsMouseInput]::GetClassName($handle, $className, $className.Capacity) | Out-Null
  return @{
    hwnd = ("0x{0:X}" -f $handle.ToInt64())
    title = $title.ToString()
    className = $className.ToString()
  }
}

$beforeTarget = Read-SageOsWindowAtPoint $target
[SageOsMouseInput]::SetCursorPos($target.X, $target.Y) | Out-Null
Start-Sleep -Milliseconds 60
$cursor = New-Object SageOsMouseInput+POINT
[SageOsMouseInput]::GetCursorPos([ref]$cursor) | Out-Null
$beforeClick = Read-SageOsWindowAtPoint $target
[SageOsMouseInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[SageOsMouseInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
$afterClick = Read-SageOsWindowAtPoint $target
@{
  target = @{ x = $target.X; y = $target.Y }
  cursor = @{ x = $cursor.X; y = $cursor.Y }
  beforeMove = $beforeTarget
  beforeClick = $beforeClick
  afterClick = $afterClick
} | ConvertTo-Json -Depth 4 -Compress
`;
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true },
  );
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}");
}

async function sendNativeHotkey(accelerator) {
  if (process.platform !== "win32") {
    throw new Error("SageOS hotkey smoke requires native Windows keyboard input");
  }
  const keyCodes = accelerator.split("+").map((key) => virtualKeyCode(key.trim()));
  const keyDown = keyCodes
    .map((keyCode) => `[SageOsKeyboardInput]::keybd_event(${keyCode}, 0, 0, [UIntPtr]::Zero)`)
    .join("\n");
  const keyUp = keyCodes
    .toReversed()
    .map((keyCode) => `[SageOsKeyboardInput]::keybd_event(${keyCode}, 0, 0x0002, [UIntPtr]::Zero)`)
    .join("\n");
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class SageOsKeyboardInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
${keyDown}
Start-Sleep -Milliseconds 80
${keyUp}
`;
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true },
  );
}

function virtualKeyCode(key) {
  const normalized = key.toLowerCase();
  const keyCodes = {
    alt: 0x12,
    control: 0x11,
    ctrl: 0x11,
    shift: 0x10,
    space: 0x20,
    f11: 0x7a,
    f12: 0x7b,
  };
  const keyCode = keyCodes[normalized];
  if (!keyCode) {
    throw new Error(`Unsupported native hotkey key: ${key}`);
  }
  return keyCode;
}

async function waitForPassThroughProbeClick(app, probe, nativeClick, timeoutMs = 5_000) {
  try {
    await probe.page.waitForFunction(
      () => Number(document.body.dataset.clicks || "0") > 0,
      undefined,
      { timeout: timeoutMs },
    );
  } catch (error) {
    const diagnostics = await readPassThroughProbeDiagnostics(app, probe, nativeClick);
    throw new Error(
      [
        `Timed out waiting for pass-through probe click after ${timeoutMs}ms.`,
        JSON.stringify(diagnostics, null, 2),
      ].join("\n"),
      { cause: error },
    );
  }
  return probe.page.evaluate(() => Number(document.body.dataset.clicks || "0"));
}

async function armOverlayClickProbe(page) {
  await page.evaluate(() => {
    window.__sageOsSmokeOverlayClicks = 0;
    window.__sageOsSmokeOverlayClickTargets = [];
    document.addEventListener(
      "click",
      (event) => {
        window.__sageOsSmokeOverlayClicks += 1;
        const target = event.target;
        window.__sageOsSmokeOverlayClickTargets.push(
          target instanceof HTMLElement
            ? target.getAttribute("aria-label") || target.textContent?.trim() || target.tagName
            : "non-element click target",
        );
      },
      { capture: true },
    );
  });
}

async function readPassThroughProbeDiagnostics(app, probe, nativeClick) {
  const probePage = await probe.page
    .evaluate(() => ({
      clicks: Number(document.body.dataset.clicks || "0"),
      title: document.title,
      targetText: document.getElementById("target")?.textContent?.trim() ?? null,
    }))
    .catch((error) => ({ error: String(error) }));
  const targetBox = await probe.page.locator("#target").boundingBox().catch((error) => ({
    error: String(error),
  }));
  const electron = await app.evaluate(({ BrowserWindow, screen }, probeId) => {
    const probeWindow = BrowserWindow.fromId(probeId);
    const windows = BrowserWindow.getAllWindows().map((candidate) => ({
      id: candidate.id,
      title: candidate.getTitle(),
      bounds: candidate.getBounds(),
      visible: candidate.isVisible(),
      focused: candidate.isFocused(),
      alwaysOnTop: candidate.isAlwaysOnTop(),
      focusable: candidate.isFocusable(),
      nativeHandle: candidate.getNativeWindowHandle().toString("hex"),
    }));
    return {
      cursor: screen.getCursorScreenPoint(),
      displays: screen.getAllDisplays().map((display) => ({
        id: display.id,
        scaleFactor: display.scaleFactor,
        bounds: display.bounds,
        workArea: display.workArea,
      })),
      probeBounds: probeWindow?.getBounds() ?? null,
      probeVisible: probeWindow?.isVisible() ?? null,
      windows,
    };
  }, probe.id);
  const overlayWindow = electron.windows.find((candidate) => candidate.id !== probe.id);
  const overlayPage = await app
    .windows()
    .find((candidate) => candidate !== probe.page)
    ?.evaluate(
      ({ point, bounds }) => {
        const clientX = point.x - (bounds?.x ?? 0);
        const clientY = point.y - (bounds?.y ?? 0);
        const element = document.elementFromPoint(clientX, clientY);
        return {
          clicks: window.__sageOsSmokeOverlayClicks ?? 0,
          clickTargets: window.__sageOsSmokeOverlayClickTargets ?? [],
          clientPoint: { x: clientX, y: clientY },
          elementAtClick:
            element instanceof HTMLElement
              ? {
                  tagName: element.tagName,
                  className: element.className,
                  ariaLabel: element.getAttribute("aria-label"),
                  text: element.textContent?.trim().slice(0, 120) ?? "",
                }
              : null,
          surface: document.querySelector("sageos-overlay-app")?.dataset.surface ?? null,
        };
      },
      { point: probe.clickPoint, bounds: overlayWindow?.bounds ?? null },
    )
    .catch((error) => ({ error: String(error) }));
  return {
    clickPoint: probe.clickPoint,
    probeNativeHandle: probe.nativeHandle,
    nativeClick,
    probePage,
    overlayPage,
    targetBox,
    electron,
  };
}

async function waitForGlobalShortcut(app, accelerator, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const registered = await app.evaluate(
      ({ globalShortcut }, hotkey) => globalShortcut.isRegistered(hotkey),
      accelerator,
    );
    if (registered) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for global shortcut registration: ${accelerator}`);
}

async function waitForOverlayWindowVisible(app, page, timeoutMs = 5_000) {
  const browserWindow = await app.browserWindow(page);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const visible = await browserWindow.evaluate((window) => window.isVisible());
    if (visible) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for overlay BrowserWindow to become visible");
}

async function assertPreloadBridge(page) {
  const api = await page.evaluate(() => ({
    collapse: typeof window.sageOsOverlay?.collapse,
    expand: typeof window.sageOsOverlay?.expand,
    close: typeof window.sageOsOverlay?.close,
    interactivePointer: typeof window.sageOsOverlay?.setInteractivePointer,
  }));
  assertEqual(api.collapse, "function", "window.sageOsOverlay?.collapse is exposed");
  assertEqual(api.expand, "function", "window.sageOsOverlay?.expand is exposed");
  assertEqual(api.close, "function", "window.sageOsOverlay?.close is exposed");
  assertEqual(
    api.interactivePointer,
    "function",
    "sageos-overlay:interactive-pointer bridge is exposed",
  );
}

function attachRendererErrorGuards(page, rendererErrors) {
  page.on("pageerror", (error) => {
    rendererErrors.push(`pageerror: ${error.stack || error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      rendererErrors.push(`console error: ${message.text()}`);
    }
  });
}

function assertNoRendererErrors(rendererErrors) {
  if (rendererErrors.length > 0) {
    throw new Error(`Renderer errors during overlay smoke:\n${rendererErrors.join("\n")}`);
  }
}

async function assertVoiceEntry(page) {
  const voiceButton = page.getByRole("button", { name: "Start voice command" });
  await voiceButton.waitFor({ state: "attached", timeout: 5_000 });
  const available = await isVoiceInputAvailable(page);
  const disabled = await voiceButton.isDisabled();
  if (available) {
    assertEqual(disabled, false, "Voice input is enabled when browser speech recognition exists");
    return;
  }

  assertEqual(disabled, true, "Voice input is disabled when browser speech recognition is missing");
  assertEqual(
    await voiceButton.getAttribute("title"),
    "Voice input is not available in this Electron runtime.",
    "Voice input explains unavailable runtime support",
  );
}

async function waitForGatewayActionsReady(page) {
  await page.waitForFunction(
    () => {
      const buttonByLabel = (label) =>
        Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent?.trim() === label,
        );
      return ["Pause", "Resume", "Stop", "Emergency stop", "Run next"].every((label) => {
        const button = buttonByLabel(label);
        return button instanceof HTMLButtonElement && !button.disabled;
      });
    },
    undefined,
    { timeout: 5_000 },
  );
}

async function waitForAgentWorkspaceInViewport(page, expectedText) {
  try {
    await page.waitForFunction(
      (text) => {
        const workspace = document.querySelector(".agent-workspace");
        if (!(workspace instanceof HTMLElement) || !workspace.textContent?.includes(text)) {
          return false;
        }
        const workspaceRect = workspace.getBoundingClientRect();
        const previewFact = Array.from(workspace.querySelectorAll(".agent-workspace__fact")).find(
          (fact) => fact.textContent?.includes(text),
        );
        const previewRect =
          previewFact instanceof HTMLElement ? previewFact.getBoundingClientRect() : null;
        return (
          workspaceRect.top >= 0 &&
          workspaceRect.top < window.innerHeight * 0.45 &&
          workspaceRect.height > 160 &&
          Boolean(previewRect) &&
          previewRect.top >= 0 &&
          previewRect.bottom <= window.innerHeight &&
          previewRect.height > 24
        );
      },
      expectedText,
      { timeout: 5_000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate((text) => {
      const workspace = document.querySelector(".agent-workspace");
      const content = document.querySelector(".overlay-content");
      const workspaceRect =
        workspace instanceof HTMLElement ? workspace.getBoundingClientRect() : null;
      const contentRect = content instanceof HTMLElement ? content.getBoundingClientRect() : null;
      return {
        expectedText: text,
        hasWorkspace: workspace instanceof HTMLElement,
        workspaceIncludesText: workspace?.textContent?.includes(text) ?? false,
        factRects:
          workspace instanceof HTMLElement
            ? Array.from(workspace.querySelectorAll(".agent-workspace__fact")).map((fact) => {
                const rect = fact.getBoundingClientRect();
                return {
                  text: fact.textContent?.replace(/\s+/g, " ").trim().slice(0, 90) ?? "",
                  top: rect.top,
                  bottom: rect.bottom,
                  height: rect.height,
                };
              })
            : [],
        workspaceRect: workspaceRect
          ? {
              top: workspaceRect.top,
              bottom: workspaceRect.bottom,
              height: workspaceRect.height,
            }
          : null,
        contentRect: contentRect
          ? {
              top: contentRect.top,
              bottom: contentRect.bottom,
              height: contentRect.height,
            }
          : null,
        contentScroll:
          content instanceof HTMLElement
            ? {
                scrollTop: content.scrollTop,
                scrollHeight: content.scrollHeight,
                clientHeight: content.clientHeight,
              }
            : null,
        viewportHeight: window.innerHeight,
      };
    }, expectedText);
    throw new Error(
      [
        `Timed out waiting for Agent Workspace to scroll into view with text: ${expectedText}`,
        JSON.stringify(diagnostics, null, 2),
      ].join("\n"),
      { cause: error },
    );
  }
}

async function assertKeyboardFocusOrder(page) {
  const expectedOrder = ["Pause", "Resume", "Stop", "Emergency stop", "Full", "Rail", "Close", "SageOS command"];
  await page.evaluate(() => {
    const host = document.querySelector("sageos-overlay-app");
    const active = host?.shadowRoot?.activeElement ?? document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });

  for (const expectedName of expectedOrder) {
    await page.keyboard.press("Tab");
    const focusedName = await readFocusedControlName(page);
    assertEqual(focusedName, expectedName, `Keyboard focus order should visit ${expectedName}`);
  }
}

async function assertQuickActionArrowNavigation(page) {
  await page.getByLabel("SageOS command").focus();
  await page.keyboard.press("ArrowDown");
  assertEqual(
    await readFocusedControlName(page),
    "New employee",
    "ArrowDown should move focus from launcher input to the first quick action",
  );
  await page.keyboard.press("ArrowRight");
  assertEqual(
    await readFocusedControlName(page),
    "New task",
    "ArrowRight should move launcher quick-action focus forward",
  );
  await page.keyboard.press("End");
  assertEqual(
    await readFocusedControlName(page),
    "Repair",
    "End should move launcher quick-action focus to the final action",
  );
  await page.keyboard.press("ArrowLeft");
  assertEqual(
    await readFocusedControlName(page),
    "App/widget",
    "ArrowLeft should move launcher quick-action focus backward",
  );
  await page.keyboard.press("Home");
  assertEqual(
    await readFocusedControlName(page),
    "New employee",
    "Home should move launcher quick-action focus to the first action",
  );
}

async function assertCriticalTextFit(page) {
  const failures = await page.evaluate(() => {
    const controlSelectors = [
      ".overlay-toolbar button",
      ".universal-launcher input",
      ".universal-launcher > button",
      ".universal-launcher__quick-actions button",
      ".compact-hud button",
      ".hud-badge",
      ".edge-rail button",
    ];
    const groupSelectors = [
      ".overlay-toolbar",
      ".universal-launcher",
      ".universal-launcher__quick-actions",
      ".compact-hud__badges",
      ".edge-rail",
    ];

    const issues = [];
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) =>
      element.getAttribute("aria-label") ||
      element.getAttribute("placeholder") ||
      element.textContent?.replace(/\s+/g, " ").trim() ||
      element.tagName.toLowerCase();

    for (const element of document.querySelectorAll(controlSelectors.join(","))) {
      if (!(element instanceof HTMLElement) || !isVisible(element)) {
        continue;
      }
      const label = labelFor(element);
      const rect = element.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) {
        issues.push(`${label} has a sub-20px hit target (${Math.round(rect.width)}x${Math.round(rect.height)})`);
      }
      if (element.scrollWidth - element.clientWidth > 2) {
        issues.push(`${label} clips horizontally (${element.scrollWidth} > ${element.clientWidth})`);
      }
      if (element.scrollHeight - element.clientHeight > 2) {
        issues.push(`${label} clips vertically (${element.scrollHeight} > ${element.clientHeight})`);
      }
    }

    for (const groupSelector of groupSelectors) {
      const group = document.querySelector(groupSelector);
      if (!(group instanceof HTMLElement) || !isVisible(group)) {
        continue;
      }
      const controls = Array.from(group.querySelectorAll("button, input, .hud-badge")).filter(
        (element) => element instanceof HTMLElement && isVisible(element),
      );
      for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
        const left = controls[leftIndex];
        const leftRect = left.getBoundingClientRect();
        for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
          const right = controls[rightIndex];
          const rightRect = right.getBoundingClientRect();
          const overlapX = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
          const overlapY = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
          if (overlapX > 1 && overlapY > 1) {
            issues.push(`${labelFor(left)} overlaps ${labelFor(right)} in ${groupSelector}`);
          }
        }
      }
    }

    return issues;
  });

  if (failures.length > 0) {
    throw new Error(`Critical overlay text/control fit failed:\n${failures.join("\n")}`);
  }
}

async function assertReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures = await page.evaluate(() => {
    const issues = [];
    const parseCssDurationMs = (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 0;
      }
      if (trimmed.endsWith("ms")) {
        return Number.parseFloat(trimmed) || 0;
      }
      if (trimmed.endsWith("s")) {
        return (Number.parseFloat(trimmed) || 0) * 1000;
      }
      return Number.parseFloat(trimmed) || 0;
    };
    const visibleElements = Array.from(
      document.querySelectorAll(
        ".overlay-shell, .overlay-toolbar button, .universal-launcher button, .universal-launcher input, .pinned-widget, .compact-hud, .edge-rail",
      ),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });

    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      issues.push("prefers-reduced-motion media query did not match reduce");
    }

    for (const element of visibleElements) {
      const style = getComputedStyle(element);
      const durations = [
        ...style.transitionDuration.split(","),
        ...style.animationDuration.split(","),
      ].map(parseCssDurationMs);
      const longestDuration = Math.max(0, ...durations);
      if (longestDuration > 1) {
        const label =
          element.getAttribute("aria-label") ||
          element.textContent?.replace(/\s+/g, " ").trim() ||
          element.tagName.toLowerCase();
        issues.push(`${label} keeps ${longestDuration}ms motion under reduced motion`);
      }
    }

    return issues;
  });

  if (failures.length > 0) {
    throw new Error(`Reduced-motion overlay smoke failed:\n${failures.join("\n")}`);
  }
}

async function readFocusedControlName(page) {
  return page.evaluate(() => {
    const host = document.querySelector("sageos-overlay-app");
    const active = host?.shadowRoot?.activeElement ?? document.activeElement;
    if (!active) {
      return "";
    }

    const ariaLabel = active.getAttribute("aria-label");
    if (ariaLabel) {
      return ariaLabel.trim();
    }

    return (active.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

async function isVoiceInputAvailable(page) {
  return page.evaluate(
    () => typeof window.SpeechRecognition === "function" || typeof window.webkitSpeechRecognition === "function",
  );
}

async function setVisualBackdrop(page, kind) {
  await ensureVisualBackdropStyle(page);
  await page.evaluate((backdropKind) => {
    let backdrop = document.getElementById("overlay-smoke-visual-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "overlay-smoke-visual-backdrop";
      document.body.prepend(backdrop);
    }
    backdrop.className = `overlay-smoke-visual-backdrop overlay-smoke-visual-backdrop--${backdropKind}`;
    backdrop.innerHTML = "";
    backdrop.textContent = "";
    if (backdropKind === "desktop") {
      backdrop.innerHTML = `
        <div class="overlay-smoke-desktop">
          <aside>
            <strong>Inbox</strong>
            <span>Build approvals</span>
            <span>Memory queue</span>
            <span>Night shift</span>
          </aside>
          <main>
            <header>
              <b>Sage Ops</b>
              <span>Dashboard content visible through overlay glass</span>
            </header>
            <section>
              ${Array.from(
                { length: 9 },
                (_, index) =>
                  `<article><b>Workstream ${index + 1}</b><span>Agent status, verification, and release notes</span></article>`,
              ).join("")}
            </section>
          </main>
        </div>`;
      return;
    }
    if (backdropKind === "bright") {
      backdrop.innerHTML = `
        <div class="overlay-smoke-sheet">
          <header><b>Weekly Operating Plan</b><span>Light enterprise workspace under the full overlay.</span></header>
          ${Array.from(
            { length: 14 },
            (_, index) =>
              `<p><b>${String(index + 1).padStart(2, "0")}</b><span>Approval queue, memory health, source sync, and deployment readiness.</span></p>`,
          ).join("")}
        </div>`;
      return;
    }
    if (backdropKind === "dark") {
      backdrop.innerHTML = `
        <div class="overlay-smoke-terminal">
          <header><b>Production Console</b><span>tail -f sageos-gateway.log</span></header>
          ${Array.from(
            { length: 18 },
            (_, index) =>
              `<p><b>${new Date(Date.UTC(2026, 5, 1, 19, index, 0)).toISOString()}</b><span>gateway event accepted / task run heartbeat / policy gate stable</span></p>`,
          ).join("")}
        </div>`;
      return;
    }
    if (backdropKind === "text-heavy") {
      backdrop.textContent = Array.from(
        { length: 80 },
        (_, index) => `Log ${index + 1}: Gateway event / task queue / memory status`,
      ).join("\n");
      return;
    }
    if (backdropKind === "browser") {
      backdrop.innerHTML = `
        <div class="overlay-smoke-browser">
          <div class="overlay-smoke-browser__chrome">
            <span></span><span></span><span></span>
            <strong>https://ops.example.com/sageos/review</strong>
          </div>
          <div class="overlay-smoke-browser__hero">
            <h1>Operations Review</h1>
            <p>Dense browser content behind pinned SageOS widgets.</p>
          </div>
          <div class="overlay-smoke-browser__grid">
            ${Array.from(
              { length: 12 },
              (_, index) => `<section><b>Metric ${index + 1}</b><span>Queue / approvals / source health</span></section>`,
            ).join("")}
          </div>
      </div>`;
      return;
    }
    if (backdropKind === "ide") {
      const lines = [
        "const surface = renderOverlayModel(state, { workspaceTarget });",
        "await controller.runNextTask();",
        "return artifactRefs.map((ref) => formatArtifactPreview(state, ref));",
        "expect(report.imageContentFailures).toHaveLength(0);",
        "window.sageOsOverlay?.setInteractivePointer(active);",
        "const action = getOverlayGatewayActionState(params);",
      ];
      backdrop.innerHTML = `
        <div class="overlay-smoke-ide">
          <aside>
            <b>sage</b>
            <span>apps/windows-overlay</span>
            <span>src/renderer</span>
            <span>tests</span>
            <span>docs/superpowers</span>
          </aside>
          <main>
            <header>
              <b>overlay-app.ts</b>
              <span>verified workspace run artifact previews</span>
            </header>
            <section>
              ${Array.from(
                { length: 22 },
                (_, index) =>
                  `<p><b>${String(index + 42).padStart(3, "0")}</b><span>${lines[index % lines.length]}</span></p>`,
              ).join("")}
            </section>
          </main>
        </div>`;
    }
  }, kind);
}

async function ensureVisualBackdropStyle(page) {
  if (await page.evaluate(() => Boolean(document.getElementById("overlay-smoke-visual-backdrop-style")))) {
    return;
  }

  await page.addStyleTag({
    content: `
      body {
        position: relative;
      }

      sageos-overlay-app {
        position: relative;
        z-index: 1;
      }

      .overlay-smoke-visual-backdrop {
        position: fixed;
        inset: 0;
        z-index: 0;
        overflow: hidden;
        pointer-events: none;
        white-space: pre-wrap;
        font: 13px/1.45 Consolas, "Cascadia Mono", monospace;
      }

      .overlay-smoke-visual-backdrop--desktop {
        background: linear-gradient(135deg, #edf2f7 0%, #d9e3ee 52%, #cbd6e3 100%);
      }

      .overlay-smoke-visual-backdrop--bright {
        background: linear-gradient(180deg, #f8fafc 0%, #e8eef6 100%);
      }

      .overlay-smoke-visual-backdrop--dark {
        background: linear-gradient(135deg, #05070c 0%, #111827 52%, #05070c 100%);
      }

      .overlay-smoke-visual-backdrop--text-heavy {
        background: #f8fafc;
        color: rgba(15, 23, 42, 0.72);
        padding: 18px;
      }

      .overlay-smoke-visual-backdrop--ide {
        background: linear-gradient(180deg, #111827 0%, #020617 100%);
      }

      .overlay-smoke-visual-backdrop--browser {
        background: #eef2f7;
        color: #0f172a;
        font: 14px/1.45 "Segoe UI", sans-serif;
        white-space: normal;
      }

      .overlay-smoke-browser {
        display: grid;
        gap: 22px;
        width: min(1180px, calc(100vw - 88px));
        margin: 42px auto;
      }

      .overlay-smoke-browser__chrome {
        display: grid;
        grid-template-columns: 12px 12px 12px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
        padding: 12px 16px;
      }

      .overlay-smoke-browser__chrome span {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: #cbd5e1;
      }

      .overlay-smoke-browser__chrome strong {
        overflow: hidden;
        color: rgba(15, 23, 42, 0.64);
        font-weight: 520;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .overlay-smoke-browser__hero,
      .overlay-smoke-browser__grid section {
        border: 1px solid rgba(15, 23, 42, 0.1);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.78);
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.1);
        padding: 22px;
      }

      .overlay-smoke-browser__hero h1 {
        margin: 0;
        font-size: 42px;
        letter-spacing: 0;
      }

      .overlay-smoke-browser__hero p {
        margin: 8px 0 0;
        color: rgba(15, 23, 42, 0.66);
      }

      .overlay-smoke-browser__grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }

      .overlay-smoke-browser__grid section {
        display: grid;
        gap: 8px;
        min-height: 96px;
      }

      .overlay-smoke-browser__grid b,
      .overlay-smoke-browser__grid span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .overlay-smoke-browser__grid span {
        color: rgba(15, 23, 42, 0.58);
      }

      .overlay-smoke-desktop,
      .overlay-smoke-ide {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        gap: 18px;
        width: min(1260px, calc(100vw - 80px));
        min-height: calc(100vh - 86px);
        margin: 42px auto;
      }

      .overlay-smoke-desktop aside,
      .overlay-smoke-desktop header,
      .overlay-smoke-desktop article,
      .overlay-smoke-sheet,
      .overlay-smoke-terminal,
      .overlay-smoke-ide aside,
      .overlay-smoke-ide header,
      .overlay-smoke-ide section {
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.62);
        box-shadow: 0 16px 42px rgba(15, 23, 42, 0.1);
      }

      .overlay-smoke-desktop aside,
      .overlay-smoke-ide aside {
        display: grid;
        align-content: start;
        gap: 10px;
        padding: 18px;
      }

      .overlay-smoke-desktop aside span,
      .overlay-smoke-ide aside span {
        overflow: hidden;
        color: rgba(15, 23, 42, 0.64);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .overlay-smoke-desktop main,
      .overlay-smoke-ide main {
        display: grid;
        align-content: start;
        gap: 18px;
      }

      .overlay-smoke-desktop header,
      .overlay-smoke-sheet header,
      .overlay-smoke-terminal header,
      .overlay-smoke-ide header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding: 18px 20px;
      }

      .overlay-smoke-desktop header span,
      .overlay-smoke-sheet header span,
      .overlay-smoke-terminal header span,
      .overlay-smoke-ide header span {
        overflow: hidden;
        color: rgba(15, 23, 42, 0.62);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .overlay-smoke-desktop section {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .overlay-smoke-desktop article {
        display: grid;
        gap: 8px;
        min-height: 112px;
        padding: 16px;
      }

      .overlay-smoke-desktop article span {
        color: rgba(15, 23, 42, 0.58);
      }

      .overlay-smoke-sheet {
        display: grid;
        gap: 0;
        width: min(1120px, calc(100vw - 90px));
        margin: 44px auto;
        padding: 0;
      }

      .overlay-smoke-sheet p,
      .overlay-smoke-terminal p,
      .overlay-smoke-ide p {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        gap: 16px;
        margin: 0;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
        padding: 11px 18px;
      }

      .overlay-smoke-sheet p span,
      .overlay-smoke-terminal p span,
      .overlay-smoke-ide p span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .overlay-smoke-terminal {
        width: min(1180px, calc(100vw - 92px));
        margin: 42px auto;
        border-color: rgba(148, 163, 184, 0.2);
        background: rgba(3, 7, 18, 0.78);
        box-shadow: 0 18px 52px rgba(0, 0, 0, 0.24);
      }

      .overlay-smoke-terminal header,
      .overlay-smoke-terminal p {
        border-color: rgba(148, 163, 184, 0.16);
        color: rgba(226, 232, 240, 0.82);
      }

      .overlay-smoke-terminal header span,
      .overlay-smoke-terminal p span {
        color: rgba(203, 213, 225, 0.72);
      }

      .overlay-smoke-ide aside,
      .overlay-smoke-ide header,
      .overlay-smoke-ide section {
        border-color: rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.82);
        color: rgba(248, 250, 252, 0.88);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .overlay-smoke-ide aside span,
      .overlay-smoke-ide header span,
      .overlay-smoke-ide p span {
        color: rgba(203, 213, 225, 0.7);
      }

      .overlay-smoke-ide p {
        border-color: rgba(148, 163, 184, 0.12);
      }
    `,
  });
  await page.evaluate(() => {
    const style = [...document.querySelectorAll("style")].at(-1);
    if (style) {
      style.id = "overlay-smoke-visual-backdrop-style";
    }
  });
}

async function waitForOverlayWindowHidden(app, timeoutMs = 5_000) {
  const page = app.windows()[0];
  if (!page) {
    throw new Error("Overlay smoke did not find an Electron window");
  }
  const browserWindow = await app.browserWindow(page);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const visible = await browserWindow.evaluate((window) => window.isVisible());
    if (!visible) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for overlay BrowserWindow to hide");
}

async function startMockGateway(recorded) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock gateway did not expose a TCP port");
  }

  server.on("connection", (ws) => {
    ws.on("message", (data) => {
      const frame = JSON.parse(rawMessageToString(data));
      if (frame.type !== "req") {
        return;
      }
      recorded.push({ method: frame.method, params: frame.params ?? {} });
      const payload =
        frame.method === "connect"
          ? {
              type: "hello-ok",
              protocol: 3,
              features: {
                methods: [
                  "sageos.status",
                  "sageos.control",
                  "sageos.approvals.resolve",
                  "sageos.tasks.create",
                  "sageos.tasks.queue",
                  "sageos.tasks.cancel",
                  "sageos.tasks.runNext",
                  "sageos.memory.replay",
                  "chat.send",
                ],
                events: ["sageos"],
              },
            }
          : createSmokeState();
      ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload }));
    });
  });

  return {
    url: `ws://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function rawMessageToString(data) {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function createSmokeState() {
  return {
    status: {
      generatedAt: now,
      mode: "execute_scoped",
      supervisor: { state: "running", enabled: true, paused: false, lastTickAt: now },
      employees: { total: 7, active: 3, queued: 1, blocked: 0 },
      approvals: { pending: 2 },
      tasks: { total: 5, active: 2, queued: 1, blocked: 1 },
      runs: { total: 4, active: 1, queued: 0, failed: 1 },
      workflows: { total: 5, active: 2, queued: 1, blocked: 0 },
      skills: { total: 9, active: 1, queued: 0, blocked: 0 },
      apps: { total: 2, active: 1, queued: 0, blocked: 0 },
      observations: { total: 20, recent: 4, redacted: 2, failed: 1 },
      memory: {
        status: "degraded",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 6, pending: 2, failed: 1, path: "memory.jsonl" },
      },
      learning: {
        status: "ok",
        activityQueue: { total: 5, pending: 1, failed: 0, path: "learning.jsonl" },
      },
      sources: { enabled: ["apps", "clipboard"], disabled: ["audio"], failing: ["screen"] },
      policy: {
        mode: "execute_scoped",
        defaultTier: "execute_scoped",
        approvalsRequired: ["destructive", "external_writes"],
      },
      coding: {
        enabled: true,
        allowedRepos: [repoRoot],
        restrictions: ["no destructive git"],
        reports: { total: 2, active: 0, queued: 1, blocked: 0 },
      },
      notifications: { telegram: { enabled: true, target: "Jason" }, urgentPending: 1 },
      audit: { recentEvents: 12, eventLogPath: "events.jsonl" },
      incidents: [
        {
          id: "incident_1",
          severity: "warning",
          category: "memory",
          title: "Memory queue backlog",
          summary: "Memory queue has failed captures.",
          firstSeenAt: now,
          lastSeenAt: now,
          autoRepairSafe: true,
          repairAction: {
            id: "repair_memory_replay",
            label: "Replay memory queue",
            gatewayMethod: "sageos.memory.replay",
            risk: "low",
            approvalRequired: false,
          },
        },
      ],
    },
    agents: [
      {
        id: "employee_memory",
        name: "Memory Steward",
        role: "memory",
        mission: "Keep Sage Memory capture healthy.",
        status: "active",
        autonomyTier: "execute_scoped",
        responsibilities: ["memory"],
        allowedScopes: [{ kind: "memory", allow: ["capture"], risk: "low" }],
        deniedScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    tasks: [
      {
        id: "task_1",
        title: "Night Shift report",
        objective: "Summarize coding work",
        state: "running",
        ownerAgentId: "employee_memory",
        requestedBy: "Jason",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "task_2",
        title: "Memory replay",
        objective: "Replay queued memory captures",
        state: "proposed",
        requestedBy: "Jason",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [
      {
        id: "approval_1",
        title: "Approve repair",
        proposedAction: "Run memory replay",
        state: "pending",
        riskClass: "external_write",
        evidence: ["memory queue"],
        scope: "one_time",
        requestedBy: "Jason",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [
      {
        id: "run_task_1_1",
        taskId: "task_1",
        attempt: 1,
        state: "running",
        traceId: "trace_task_1",
        workerSessionId: "worker_task_1_1",
        currentToolCall: "node test.js",
        budgetUsed: { elapsedMinutes: 12, toolCalls: 9, costUsd: 0.02 },
        timeline: [
          {
            at: now,
            label: "Started run",
            state: "running",
            ref: "run_task_1_1",
          },
          {
            at: now,
            label: "Ran tests",
            state: "running",
            ref: "test:node test.js",
          },
        ],
        logs: ["Started SageOS task task_1 run run_task_1_1"],
        artifacts: ["coding_report_task_1"],
        verificationResult: {
          outcome: "skipped",
          summary: "Verification is running.",
          refs: ["test:node test.js"],
        },
        startedAt: now,
      },
    ],
    codingReports: [
      {
        id: "coding_report_task_1",
        taskId: "task_1",
        repoPath: repoRoot,
        objective: "Summarize coding work",
        outcome: "succeeded",
        tests: [{ command: "node test.js", exitCode: 0 }],
        blockers: [],
        preState: { branch: "main", dirty: false, changedFiles: [] },
        postState: {
          branch: "codex/activity-events-ingest",
          dirty: true,
          changedFiles: ["README.md"],
        },
        diff: { changedFiles: ["README.md"] },
        verificationRefs: ["test:node test.js"],
        rollback: "Revert README.md changes.",
        startedAt: now,
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    workflows: [],
    skills: [],
    apps: [],
    observations: [],
    collaborations: [],
  };
}

function assertRecordedMethods(recorded, requiredMethods) {
  const observed = new Set(recorded.map((entry) => entry.method));
  for (const method of requiredMethods) {
    if (!observed.has(method)) {
      throw new Error(`Expected smoke gateway method was not called: ${method}`);
    }
  }
}

async function submitLauncherCommand(page, command, expectedMethod) {
  await page.getByLabel("SageOS command").fill(command);
  await page.waitForFunction(
    (expectedCommand) => {
      const input = document.querySelector('input[aria-label="SageOS command"]');
      const runButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Run",
      );
      return input?.value === expectedCommand && runButton instanceof HTMLButtonElement && !runButton.disabled;
    },
    command,
    { timeout: 5_000 },
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await waitForRecordedMethod(expectedMethod);
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="SageOS command"]')?.value === "",
    undefined,
    { timeout: 5_000 },
  );
}

async function waitForRecordedMethod(method, count = 1, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const matches = recordedMethods.filter((entry) => entry.method === method).length;
    if (matches >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for smoke gateway method: ${method}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}
