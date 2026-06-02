import { describe, expect, it, vi } from "vitest";
import {
  activateSageOsEmployee,
  approveSageOsApproval,
  pauseSageOsEmployee,
  createSageOsTask,
  emergencyStopSageOs,
  loadSageOsOverlayStatus,
  pauseSageOs,
  queueSageOsTask,
  resumeSageOs,
  resumeSageOsEmployee,
  retireSageOsEmployee,
  runSageOsIncidentRepair,
  runSageOsLauncherCommand,
  sendSageOsLauncherCommand,
  stopSageOs,
} from "../src/renderer/sageos-actions.js";

describe("SageOS overlay actions", () => {
  it("loads status through sageos.status", async () => {
    const request = vi.fn().mockResolvedValue({ status: { mode: "execute_scoped" } });
    const result = await loadSageOsOverlayStatus({ request });

    expect(request).toHaveBeenCalledWith("sageos.status", {});
    expect(result.status.mode).toBe("execute_scoped");
  });

  it("uses existing control, approval, and task RPC methods", async () => {
    const request = vi.fn().mockResolvedValue({ state: {} });
    await pauseSageOs({ request });
    await resumeSageOs({ request });
    await stopSageOs({ request });
    await emergencyStopSageOs({ request });
    await approveSageOsApproval({ request }, "approval_1");
    await queueSageOsTask({ request }, "task_1");
    await createSageOsTask({ request }, {
      title: "Review queue",
      objective: "Review failed captures.",
      ownerAgentId: "employee_memory",
    });

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "paused",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "running",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "stopped",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "stopped",
      emergency: true,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.approvals.resolve", {
      id: "approval_1",
      decision: "approved",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.queue", {
      id: "task_1",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.create", {
      title: "Review queue",
      objective: "Review failed captures.",
      ownerAgentId: "employee_memory",
    });
  });

  it("uses employee lifecycle RPC methods", async () => {
    const request = vi.fn().mockResolvedValue({ state: {} });

    await pauseSageOsEmployee({ request }, "employee_memory");
    await resumeSageOsEmployee({ request }, "employee_memory");
    await retireSageOsEmployee({ request }, "employee_memory");

    expect(request).toHaveBeenCalledWith("sageos.agents.pause", {
      id: "employee_memory",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.agents.resume", {
      id: "employee_memory",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.agents.retire", {
      id: "employee_memory",
      reason: "windows-overlay",
    });
  });

  it("uses the employee activation RPC method", async () => {
    const request = vi.fn().mockResolvedValue({ result: { outcome: "activated" } });

    await activateSageOsEmployee({ request }, "employee_memory");

    expect(request).toHaveBeenCalledWith("sageos.agents.activate", {
      id: "employee_memory",
      reason: "windows-overlay",
    });
  });

  it("runs allowlisted incident repair actions and refreshes overlay state", async () => {
    const refreshed = { status: { incidents: [] } };
    const request = vi.fn().mockResolvedValueOnce({ result: { ok: true } }).mockResolvedValueOnce(refreshed);
    const state = {
      status: {
        incidents: [
          {
            id: "incident_memory",
            autoRepairSafe: true,
            repairAction: {
              gatewayMethod: "sageos.memory.replay",
              approvalRequired: false,
            },
          },
        ],
      },
    };

    const result = await runSageOsIncidentRepair({ request }, state as never, "incident_memory");

    expect(request).toHaveBeenNthCalledWith(1, "sageos.memory.replay", {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(result).toBe(refreshed);
  });

  it("runs notification incident preview repairs and refreshes overlay state", async () => {
    const refreshed = { status: { incidents: [] } };
    const request = vi
      .fn()
      .mockResolvedValueOnce({ notification: { title: "SageOS: Daily digest" } })
      .mockResolvedValueOnce(refreshed);
    const state = {
      status: {
        incidents: [
          {
            id: "incident_notification_failed",
            autoRepairSafe: true,
            repairAction: {
              gatewayMethod: "sageos.notifications.digest",
              approvalRequired: false,
            },
          },
        ],
      },
    };

    const result = await runSageOsIncidentRepair(
      { request },
      state as never,
      "incident_notification_failed",
    );

    expect(request).toHaveBeenNthCalledWith(1, "sageos.notifications.digest", {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(result).toBe(refreshed);
  });

  it("runs worker incident inspection repairs and refreshes overlay state", async () => {
    const refreshed = { status: { incidents: [] } };
    const request = vi.fn().mockResolvedValueOnce({ runs: [] }).mockResolvedValueOnce(refreshed);
    const state = {
      status: {
        incidents: [
          {
            id: "incident_worker_failed",
            autoRepairSafe: true,
            repairAction: {
              gatewayMethod: "sageos.runs.list",
              approvalRequired: false,
            },
          },
        ],
      },
    };

    const result = await runSageOsIncidentRepair(
      { request },
      state as never,
      "incident_worker_failed",
    );

    expect(request).toHaveBeenNthCalledWith(1, "sageos.runs.list", {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(result).toBe(refreshed);
  });

  it("rejects incident repair methods that are not safe for the overlay", async () => {
    const request = vi.fn();
    const state = {
      status: {
        incidents: [
          {
            id: "incident_shell",
            autoRepairSafe: true,
            repairAction: {
              gatewayMethod: "sageos.shell.exec",
              approvalRequired: false,
            },
          },
        ],
      },
    };

    await expect(runSageOsIncidentRepair({ request }, state as never, "incident_shell")).rejects.toThrow(
      "not allowlisted",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("sends launcher commands through chat.send on the main session", async () => {
    const request = vi.fn().mockResolvedValue({ runId: "run_1", status: "started" });

    const result = await runSageOsLauncherCommand({ request }, "  summarize my active work  ", {
      idempotencyKey: "overlay-run-1",
    });

    expect(request).toHaveBeenCalledWith("chat.send", {
      sessionKey: "main",
      message: "summarize my active work",
      deliver: false,
      idempotencyKey: "overlay-run-1",
    });
    expect(result).toEqual({ runId: "run_1", status: "started" });
  });

  it("routes employee creation launcher commands through SageOS agent creation", async () => {
    const refreshed = { status: { employees: { total: 1 } } };
    const request = vi.fn().mockResolvedValueOnce({ employee: { id: "employee_security_sentinel" } }).mockResolvedValueOnce(refreshed);

    const result = await runSageOsLauncherCommand(
      { request },
      "Create a Security Sentinel that watches Defender and reports daily",
    );

    expect(request).toHaveBeenNthCalledWith(1, "sageos.agents.create", {
      description: "Create a Security Sentinel that watches Defender and reports daily",
    });
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(result).toBe(refreshed);
  });

  it("routes task assignment launcher commands through SageOS task creation", async () => {
    const refreshed = { status: { tasks: { total: 1 } } };
    const request = vi.fn().mockResolvedValueOnce({ result: { outcome: "created" } }).mockResolvedValueOnce(refreshed);

    const result = await runSageOsLauncherCommand(
      { request },
      "Assign Memory Steward to replay capture queue",
    );

    expect(request).toHaveBeenNthCalledWith(1, "sageos.tasks.create", {
      title: "Replay Capture Queue",
      objective: "replay capture queue",
      ownerAgentId: "employee_memory_steward",
    });
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(result).toBe(refreshed);
  });

  it("still exposes the raw chat launcher command helper", async () => {
    const request = vi.fn().mockResolvedValue({ runId: "run_1", status: "started" });

    await sendSageOsLauncherCommand({ request }, "check SageOS health", {
      idempotencyKey: "overlay-run-2",
    });

    expect(request).toHaveBeenCalledWith("chat.send", {
      sessionKey: "main",
      message: "check SageOS health",
      deliver: false,
      idempotencyKey: "overlay-run-2",
    });
  });
});
