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
const gateway = await startMockGateway(recordedMethods);

try {
  const hotkeySmoke = await smokeDefaultHotkeyToggle(gateway.url);
  const fullSmoke = await smokeFullOverlay(gateway.url);
  await smokeHudOverlay(gateway.url);
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        defaultHotkeyToggles: hotkeySmoke.defaultHotkeyToggles,
        passThroughProbeClicks: fullSmoke.passThroughProbeClicks,
        methods: recordedMethods.map((entry) => entry.method),
        screenshots: {
          full: path.join(screenshotDir, "overlay-smoke-styled.png"),
          fullBright: path.join(screenshotDir, "overlay-smoke-full-bright.png"),
          edgeLeft: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
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

async function smokeFullOverlay(gatewayUrl) {
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
    await page.waitForSelector(".overlay-shell--commandDeck .pinned-widgets", {
      timeout: 15_000,
    });
    await page.waitForFunction(() => document.body.innerText.includes("Memory Queue"));
    await assertPreloadBridge(page);
    await assertVoiceEntry(page);

    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-styled.png"),
      animations: "disabled",
    });
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
    const passThroughProbe = await createPassThroughProbe(app);
    await sendNativeMouseClick(passThroughProbe.clickPoint);
    const passThroughProbeClicks = await waitForPassThroughProbeClick(passThroughProbe);
    await page.evaluate(() => window.sageOsOverlay?.setInteractivePointer(true));
    await page.evaluate(() => window.sageOsOverlay?.setInteractivePointer(false));
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
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

async function smokeHudOverlay(gatewayUrl) {
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
    await page.waitForSelector(".overlay-shell--hud .compact-hud", { timeout: 15_000 });
    await assertPreloadBridge(page);
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

async function smokeDefaultHotkeyToggle(gatewayUrl) {
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

public static class SageOsMouseInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[SageOsMouseInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 60
[SageOsMouseInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[SageOsMouseInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`;
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true },
  );
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

async function waitForPassThroughProbeClick(probe, timeoutMs = 5_000) {
  await probe.page.waitForFunction(
    () => Number(document.body.dataset.clicks || "0") > 0,
    undefined,
    { timeout: timeoutMs },
  );
  return probe.page.evaluate(() => Number(document.body.dataset.clicks || "0"));
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
    backdrop.textContent = "";
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

      .overlay-smoke-visual-backdrop--bright {
        background:
          linear-gradient(90deg, rgba(15, 23, 42, 0.08) 1px, transparent 1px) 0 0 / 32px 32px,
          linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);
      }

      .overlay-smoke-visual-backdrop--text-heavy {
        background: #f8fafc;
        color: rgba(15, 23, 42, 0.72);
        padding: 18px;
      }

      .overlay-smoke-visual-backdrop--ide {
        background:
          linear-gradient(90deg, #111827 0 68px, #0f172a 68px 100%),
          linear-gradient(180deg, #111827 0%, #020617 100%);
      }

      .overlay-smoke-visual-backdrop--ide::before {
        position: absolute;
        inset: 22px 22px 22px 92px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background:
          repeating-linear-gradient(
            180deg,
            rgba(56, 189, 248, 0.14) 0 1px,
            transparent 1px 24px
          ),
          linear-gradient(90deg, rgba(34, 197, 94, 0.12), transparent 42%),
          #020617;
        content: "";
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
    codingReports: [],
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
