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
});
