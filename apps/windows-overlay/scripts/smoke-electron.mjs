import { _electron as electron } from "playwright-core";
import { WebSocketServer } from "ws";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const overlayDir = path.resolve(import.meta.dirname, "..");
const screenshotDir = path.join(overlayDir, "dist");
const require = createRequire(import.meta.url);
const electronPath = require(path.join(overlayDir, "node_modules/electron"));
const now = "2026-06-01T19:30:00.000Z";

await fs.mkdir(screenshotDir, { recursive: true });

const recordedMethods = [];
const gateway = await startMockGateway(recordedMethods);

try {
  await smokeFullOverlay(gateway.url);
  await smokeHudOverlay(gateway.url);
  assertRecordedMethods(recordedMethods, [
    "connect",
    "sageos.status",
    "sageos.control",
    "sageos.approvals.resolve",
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
        methods: recordedMethods.map((entry) => entry.method),
        screenshots: {
          full: path.join(screenshotDir, "overlay-smoke-styled.png"),
          fullBright: path.join(screenshotDir, "overlay-smoke-full-bright.png"),
          edgeLeft: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
          edgeTextHeavy: path.join(screenshotDir, "overlay-smoke-edge-text-heavy.png"),
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
    await page.getByRole("button", { name: "Start voice command" }).click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "SageOS command",
    );

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
    await page.getByRole("button", { name: "Emergency stop" }).click();
    await waitForRecordedMethod("sageos.control", 3);
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
    await page.getByLabel("SageOS command").fill("Summarize SageOS overlay smoke");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await waitForRecordedMethod("chat.send");

    await page.evaluate(() => window.sageOsOverlay?.collapse());
    await page.waitForSelector(".edge-rail--left", { timeout: 5_000 });
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-left.png"),
      animations: "disabled",
    });
    await setVisualBackdrop(page, "text-heavy");
    await page.screenshot({
      path: path.join(screenshotDir, "overlay-smoke-edge-text-heavy.png"),
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

async function assertPreloadBridge(page) {
  const api = await page.evaluate(() => ({
    collapse: typeof window.sageOsOverlay?.collapse,
    expand: typeof window.sageOsOverlay?.expand,
    close: typeof window.sageOsOverlay?.close,
  }));
  assertEqual(api.collapse, "function", "window.sageOsOverlay?.collapse is exposed");
  assertEqual(api.expand, "function", "window.sageOsOverlay?.expand is exposed");
  assertEqual(api.close, "function", "window.sageOsOverlay?.close is exposed");
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
    backdrop.textContent =
      backdropKind === "text-heavy"
        ? Array.from({ length: 80 }, (_, index) => `Log ${index + 1}: Gateway event / task queue / memory status`).join(
            "\n",
          )
        : "";
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
    runs: [],
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
