import { describe, expect, it, vi } from "vitest";
import { SageOsOverlayController } from "../src/renderer/overlay-controller.js";

function stateFixture(mode = "execute_scoped", incidents: unknown[] = []) {
  return {
    status: {
      mode,
      supervisor: { state: "running", enabled: true, paused: false },
      approvals: { pending: 0 },
      tasks: { total: 0, active: 0, queued: 0, blocked: 0 },
      incidents,
    },
  };
}

describe("SageOsOverlayController", () => {
  it("loads SageOS status from the gateway", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture());
    const onChange = vi.fn();
    const controller = new SageOsOverlayController({ request }, onChange);

    await controller.loadStatus();

    expect(request).toHaveBeenCalledWith("sageos.status", {});
    expect(controller.state.sageOsState?.status.mode).toBe("execute_scoped");
    expect(controller.state.loading).toBe(false);
    expect(controller.state.connected).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("updates from live SageOS gateway events", () => {
    const request = vi.fn();
    const controller = new SageOsOverlayController({ request });

    controller.handleGatewayEvent({
      type: "event",
      event: "sageos",
      payload: stateFixture("observe"),
    });

    expect(controller.state.sageOsState?.status.mode).toBe("observe");
    expect(controller.state.connected).toBe(true);
  });

  it("pauses SageOS through the existing control RPC", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture("execute_scoped"));
    const controller = new SageOsOverlayController({ request });

    await controller.pause();

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "paused",
      emergency: false,
      reason: "windows-overlay",
    });
  });

  it("marks gateway mutations as loading while they are in flight", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    const request = <T = unknown>(_method: string, _params: Record<string, unknown>) =>
      new Promise<T>((resolve) => {
        resolveRequest = resolve as (value: unknown) => void;
      });
    const controller = new SageOsOverlayController({ request });

    const pending = controller.pause();

    expect(controller.state.loading).toBe(true);
    expect(controller.state.error).toBeNull();

    resolveRequest(stateFixture("execute_scoped"));
    await pending;

    expect(controller.state.loading).toBe(false);
    expect(controller.state.sageOsState?.status.mode).toBe("execute_scoped");
  });

  it("stops SageOS without the emergency flag through the existing control RPC", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture("execute_scoped"));
    const controller = new SageOsOverlayController({ request });

    await controller.stopSageOs();

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "stopped",
      emergency: false,
      reason: "windows-overlay",
    });
  });

  it("resolves approvals and task actions through existing RPC methods", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture("execute_scoped"));
    const controller = new SageOsOverlayController({ request });

    await controller.approveApproval("approval_1");
    await controller.denyApproval("approval_2");
    await controller.createTask({
      title: "Review queue",
      objective: "Review failed captures.",
      ownerAgentId: "employee_memory",
    });
    await controller.queueTask("task_1");
    await controller.cancelTask("task_2");
    await controller.runNextTask();

    expect(request).toHaveBeenCalledWith("sageos.approvals.resolve", {
      id: "approval_1",
      decision: "approved",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.approvals.resolve", {
      id: "approval_2",
      decision: "denied",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.create", {
      title: "Review queue",
      objective: "Review failed captures.",
      ownerAgentId: "employee_memory",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.queue", {
      id: "task_1",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.cancel", {
      id: "task_2",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.runNext", {});
  });

  it("adopts wrapped gateway state payloads after mutations", async () => {
    const queuedState = stateFixture("observe");
    const approvedState = stateFixture("execute_scoped", [{ id: "incident_after_approval" }]);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ result: { outcome: "queued" }, state: queuedState })
      .mockResolvedValueOnce({ approval: { id: "approval_1", state: "approved" }, state: approvedState });
    const controller = new SageOsOverlayController({ request });

    await controller.queueTask("task_1");

    expect(controller.state.connected).toBe(true);
    expect(controller.state.sageOsState).toBe(queuedState);

    await controller.approveApproval("approval_1");

    expect(controller.state.sageOsState).toBe(approvedState);
  });

  it("runs employee lifecycle actions through existing RPC methods", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture("execute_scoped"));
    const controller = new SageOsOverlayController({ request });

    await controller.activateEmployee("employee_memory");
    await controller.pauseEmployee("employee_memory");
    await controller.resumeEmployee("employee_memory");
    await controller.retireEmployee("employee_memory");

    expect(request).toHaveBeenCalledWith("sageos.agents.activate", {
      id: "employee_memory",
      reason: "windows-overlay",
    });
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

  it("runs safe incident repairs through the controller and refreshes status", async () => {
    const refreshed = stateFixture("execute_scoped");
    const request = vi.fn().mockResolvedValueOnce({ result: { ok: true } }).mockResolvedValueOnce(refreshed);
    const controller = new SageOsOverlayController({ request });
    controller.state = {
      ...controller.state,
      connected: true,
      sageOsState: stateFixture("execute_scoped", [
        {
          id: "incident_memory",
          autoRepairSafe: true,
          repairAction: {
            gatewayMethod: "sageos.memory.replay",
            approvalRequired: false,
          },
        },
      ]) as never,
    };

    await controller.runIncidentRepair("incident_memory");

    expect(request).toHaveBeenNthCalledWith(1, "sageos.memory.replay", {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(controller.state.sageOsState).toBe(refreshed);
  });

  it("sends Universal Launcher commands to the main chat session", async () => {
    const request = vi.fn().mockResolvedValue({ runId: "run_1", status: "started" });
    const controller = new SageOsOverlayController({ request });

    await controller.sendLauncherCommand("  check SageOS health  ", "overlay-run-1");

    expect(request).toHaveBeenCalledWith("chat.send", {
      sessionKey: "main",
      message: "check SageOS health",
      deliver: false,
      idempotencyKey: "overlay-run-1",
    });
  });

  it("creates employees from Universal Launcher employee commands", async () => {
    const refreshed = stateFixture("execute_scoped");
    const request = vi.fn().mockResolvedValueOnce({ employee: { id: "employee_security_sentinel" } }).mockResolvedValueOnce(refreshed);
    const controller = new SageOsOverlayController({ request });

    await controller.sendLauncherCommand("Create a Security Sentinel that watches Defender");

    expect(request).toHaveBeenNthCalledWith(1, "sageos.agents.create", {
      description: "Create a Security Sentinel that watches Defender",
    });
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(controller.state.sageOsState).toBe(refreshed);
  });

  it("creates assigned tasks from Universal Launcher task commands", async () => {
    const refreshed = stateFixture("execute_scoped");
    const request = vi.fn().mockResolvedValueOnce({ result: { outcome: "created" } }).mockResolvedValueOnce(refreshed);
    const controller = new SageOsOverlayController({ request });

    await controller.sendLauncherCommand("Assign Memory Steward to replay capture queue");

    expect(request).toHaveBeenNthCalledWith(1, "sageos.tasks.create", {
      title: "Replay Capture Queue",
      objective: "replay capture queue",
      ownerAgentId: "employee_memory_steward",
    });
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(controller.state.sageOsState).toBe(refreshed);
  });
});
