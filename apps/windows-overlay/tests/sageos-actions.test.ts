import { describe, expect, it, vi } from "vitest";
import {
  approveSageOsApproval,
  loadSageOsOverlayStatus,
  pauseSageOs,
  queueSageOsTask,
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
});
