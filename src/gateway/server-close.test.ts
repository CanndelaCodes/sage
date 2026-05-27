import { describe, expect, it, vi } from "vitest";
import { createGatewayCloseHandler } from "./server-close.js";

const { mockStopGmailWatcher } = vi.hoisted(() => ({
  mockStopGmailWatcher: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../hooks/gmail-watcher.js", () => ({
  stopGmailWatcher: mockStopGmailWatcher,
}));

vi.mock("../channels/plugins/index.js", () => ({
  listChannelPlugins: () => [],
}));

function interval() {
  const timer = setInterval(() => {}, 60_000);
  timer.unref?.();
  return timer;
}

function createCloseHandler(
  overrides: Partial<Parameters<typeof createGatewayCloseHandler>[0]> = {},
) {
  const httpServer = {
    close: vi.fn((cb: (err?: Error) => void) => cb()),
    closeIdleConnections: vi.fn(),
  };
  const wss = {
    close: vi.fn((cb: () => void) => cb()),
  };
  const params = {
    bonjourStop: null,
    tailscaleCleanup: null,
    canvasHost: null,
    canvasHostServer: null,
    stopChannel: vi.fn().mockResolvedValue(undefined),
    pluginServices: null,
    cron: { stop: vi.fn() },
    heartbeatRunner: { stop: vi.fn() },
    nodePresenceTimers: new Map(),
    broadcast: vi.fn(),
    tickInterval: interval(),
    healthInterval: interval(),
    dedupeCleanup: interval(),
    agentUnsub: null,
    heartbeatUnsub: null,
    chatRunState: { clear: vi.fn() },
    clients: new Set(),
    configReloader: { stop: vi.fn().mockResolvedValue(undefined) },
    browserControl: null,
    wss,
    httpServer,
    ...overrides,
  } as Parameters<typeof createGatewayCloseHandler>[0];
  return { close: createGatewayCloseHandler(params), params, httpServer, wss };
}

describe("createGatewayCloseHandler", () => {
  it("stops the SageOS supervisor during gateway shutdown", async () => {
    const sageOsSupervisor = { stop: vi.fn().mockResolvedValue(undefined) };
    const { close } = createCloseHandler({ sageOsSupervisor });

    await close({ reason: "test shutdown" });

    expect(sageOsSupervisor.stop).toHaveBeenCalledWith("test shutdown");
  });
});
