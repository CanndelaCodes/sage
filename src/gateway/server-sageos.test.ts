import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSageOsStateStore, readSageOsState } from "../sageos/state-store.js";
import { createSageOsSupervisor } from "../sageos/supervisor.js";
import { startGatewaySageOsSupervisor } from "./server-sageos.js";

function createSupervisorMock() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    emergencyStop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn(),
    getSnapshot: vi.fn(),
  };
}

function createLogMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("startGatewaySageOsSupervisor", () => {
  it("starts the SageOS supervisor by default with gateway config", async () => {
    const supervisor = createSupervisorMock();
    const createSupervisor = vi.fn(() => supervisor);
    const log = createLogMock();

    const result = await startGatewaySageOsSupervisor({
      cfg: { sageos: { mode: "execute_scoped", supervisor: { intervalSeconds: 2 } } },
      createSupervisor,
      log,
    });

    expect(result).toBe(supervisor);
    expect(createSupervisor).toHaveBeenCalledWith({
      config: { sageos: { mode: "execute_scoped", supervisor: { intervalSeconds: 2 } } },
      mode: "execute_scoped",
      intervalMs: 2000,
    });
    expect(supervisor.start).toHaveBeenCalledOnce();
  });

  it("does not start when SageOS is explicitly disabled", async () => {
    const supervisor = createSupervisorMock();
    const createSupervisor = vi.fn(() => supervisor);
    const log = createLogMock();

    const result = await startGatewaySageOsSupervisor({
      cfg: { sageos: { enabled: false } },
      createSupervisor,
      log,
    });

    expect(result).toBeNull();
    expect(createSupervisor).not.toHaveBeenCalled();
    expect(supervisor.start).not.toHaveBeenCalled();
  });

  it("does not start when SageOS mode is off", async () => {
    const supervisor = createSupervisorMock();
    const createSupervisor = vi.fn(() => supervisor);
    const log = createLogMock();

    const result = await startGatewaySageOsSupervisor({
      cfg: { sageos: { mode: "off" } },
      createSupervisor,
      log,
    });

    expect(result).toBeNull();
    expect(createSupervisor).not.toHaveBeenCalled();
    expect(supervisor.start).not.toHaveBeenCalled();
  });

  it("logs and returns null when supervisor startup fails", async () => {
    const supervisor = {
      ...createSupervisorMock(),
      start: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const createSupervisor = vi.fn(() => supervisor);
    const log = createLogMock();

    const result = await startGatewaySageOsSupervisor({
      cfg: { sageos: { enabled: true } },
      createSupervisor,
      log,
    });

    expect(result).toBeNull();
    expect(log.error).toHaveBeenCalledWith("SageOS supervisor failed to start: Error: boom");
  });

  it("starts a real supervisor that persists state and audit events", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "sageos-gateway-supervisor-"));
    const log = createLogMock();

    const supervisor = await startGatewaySageOsSupervisor({
      cfg: { sageos: { mode: "execute_scoped", supervisor: { intervalSeconds: 1 } } },
      createSupervisor: (options) =>
        createSageOsSupervisor({ ...options, stateDir, intervalMs: 5 }),
      log,
    });

    expect(supervisor).toBeTruthy();
    const store = createSageOsStateStore({ stateDir });
    const started = await readSageOsState(store);
    expect(started.status.supervisor).toMatchObject({
      enabled: true,
      paused: false,
      state: "running",
    });

    await supervisor!.stop("test shutdown");

    const stopped = await readSageOsState(store);
    expect(stopped.status.supervisor).toMatchObject({
      enabled: false,
      paused: false,
      state: "stopped",
    });
    const events = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("supervisor_started");
    expect(events).toContain("supervisor_stopped");
  });
});
