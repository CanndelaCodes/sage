import { describe, expect, it, vi } from "vitest";
import { SageOsOverlayController } from "../src/renderer/overlay-controller.js";

function stateFixture(mode = "execute_scoped") {
  return {
    status: {
      mode,
      supervisor: { state: "running", enabled: true, paused: false },
      approvals: { pending: 0 },
      tasks: { total: 0, active: 0, queued: 0, blocked: 0 },
      incidents: [],
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

  it("resolves approvals and task actions through existing RPC methods", async () => {
    const request = vi.fn().mockResolvedValue(stateFixture("execute_scoped"));
    const controller = new SageOsOverlayController({ request });

    await controller.approveApproval("approval_1");
    await controller.denyApproval("approval_2");
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
});
