import { describe, expect, it, vi } from "vitest";
import {
  approveSageOsApproval,
  loadSageOsOverlayStatus,
  pauseSageOs,
  queueSageOsTask,
  runSageOsIncidentRepair,
  runSageOsLauncherCommand,
  sendSageOsLauncherCommand,
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
    await approveSageOsApproval({ request }, "approval_1");
    await queueSageOsTask({ request }, "task_1");

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "paused",
      emergency: false,
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
