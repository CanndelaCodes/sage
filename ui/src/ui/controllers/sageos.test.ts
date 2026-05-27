import { describe, expect, it, vi } from "vitest";
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import { createSageOsStatusSnapshot } from "../../../../src/sageos/types.js";
import { setSageOsControl, type SageOsUiState } from "./sageos.ts";

describe("SageOS controller", () => {
  it("applies direct sageos.control state responses and requests a repaint", async () => {
    const nextState = makeState("paused");
    const request = vi.fn(async () => nextState);
    const requestUpdate = vi.fn();
    const state: SageOsUiState = {
      client: { request } as unknown as GatewayBrowserClient,
      connected: true,
      sageOsLoading: false,
      sageOsBusy: null,
      sageOsError: null,
      sageOsState: null,
      requestUpdate,
    };

    await setSageOsControl(state, "paused");

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "paused",
      emergency: false,
      reason: "control-ui",
    });
    expect(state.sageOsState).toBe(nextState);
    expect(state.sageOsBusy).toBeNull();
    expect(state.sageOsError).toBeNull();
    expect(requestUpdate).toHaveBeenCalledTimes(2);
  });
});

function makeState(supervisorState: "paused" | "running" | "stopped"): SageOsPersistedState {
  const now = new Date().toISOString();
  return {
    version: 1,
    status: createSageOsStatusSnapshot({
      supervisor: {
        enabled: true,
        paused: supervisorState === "paused",
        state: supervisorState,
      },
    }),
    agents: [],
    tasks: [],
    runs: [],
    workflows: [],
    skills: [],
    apps: [],
    collaborations: [],
    codingReports: [],
    approvals: [],
    observations: [],
    updatedAt: now,
  };
}
