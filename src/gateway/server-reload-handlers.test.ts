import { describe, expect, it, vi } from "vitest";
import { createGatewayReloadHandlers } from "./server-reload-handlers.js";
import { startGatewaySageOsSupervisor } from "./server-sageos.js";

vi.mock("./server-sageos.js", () => ({
  startGatewaySageOsSupervisor: vi.fn(),
}));

function createPlan() {
  return {
    changedPaths: ["sageos.mode"],
    restartGateway: false,
    restartReasons: [],
    hotReasons: ["sageos.mode"],
    reloadHooks: false,
    restartGmailWatcher: false,
    restartBrowserControl: false,
    restartCron: false,
    restartHeartbeat: false,
    restartSageOsSupervisor: true,
    restartChannels: new Set(),
    noopPaths: [],
  };
}

describe("createGatewayReloadHandlers", () => {
  it("stops the current SageOS supervisor and starts a new one on hot reload", async () => {
    const currentSupervisor = { stop: vi.fn().mockResolvedValue(undefined) };
    const nextSupervisor = { stop: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(startGatewaySageOsSupervisor).mockResolvedValue(nextSupervisor as never);
    let state = {
      hooksConfig: {},
      heartbeatRunner: { updateConfig: vi.fn(), stop: vi.fn() },
      cronState: { cron: { stop: vi.fn() }, storePath: "cron.json", cronEnabled: true },
      browserControl: null,
      sageOsSupervisor: currentSupervisor,
    };
    const nextConfig = { sageos: { mode: "observe" } };
    const handlers = createGatewayReloadHandlers({
      deps: {} as never,
      broadcast: vi.fn(),
      getState: () => state as never,
      setState: (nextState) => {
        state = nextState as never;
      },
      startChannel: vi.fn(),
      stopChannel: vi.fn(),
      logHooks: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      logBrowser: { error: vi.fn() },
      logChannels: { info: vi.fn(), error: vi.fn() },
      logCron: { error: vi.fn() },
      logReload: { info: vi.fn(), warn: vi.fn() },
      logSageOs: { info: vi.fn(), error: vi.fn() },
    });

    await handlers.applyHotReload(createPlan(), nextConfig as never);

    expect(currentSupervisor.stop).toHaveBeenCalledWith("config reload");
    expect(startGatewaySageOsSupervisor).toHaveBeenCalledWith({
      cfg: nextConfig,
      log: {
        info: expect.any(Function),
        error: expect.any(Function),
      },
    });
    expect(state.sageOsSupervisor).toBe(nextSupervisor);
  });
});
