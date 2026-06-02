import { describe, expect, it, vi } from "vitest";
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import { createSageOsStatusSnapshot, type SageOsIncident } from "../../../../src/sageos/types.js";
import { runSageOsIncidentRepair, setSageOsControl, type SageOsUiState } from "./sageos.ts";

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

  it("runs allowlisted incident repair actions and refreshes state", async () => {
    const incident: SageOsIncident = {
      id: "incident_memory",
      severity: "warning",
      category: "memory",
      title: "Memory queue backlog",
      summary: "One memory replay item is waiting.",
      firstSeenAt: "2026-05-27T22:30:00.000Z",
      lastSeenAt: "2026-05-27T22:30:00.000Z",
      autoRepairSafe: true,
      repairAction: {
        id: "repair_memory_replay",
        label: "Replay memory queue",
        gatewayMethod: "sageos.memory.replay",
        risk: "low",
        approvalRequired: false,
      },
    };
    const initialState = makeState("running", [incident]);
    const refreshedState = makeState("running", []);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ result: { outcome: "ok" } })
      .mockResolvedValueOnce(refreshedState);
    const requestUpdate = vi.fn();
    const state: SageOsUiState = {
      client: { request } as unknown as GatewayBrowserClient,
      connected: true,
      sageOsLoading: false,
      sageOsBusy: null,
      sageOsError: null,
      sageOsState: initialState,
      requestUpdate,
    };

    await runSageOsIncidentRepair(state, "incident_memory");

    expect(request).toHaveBeenNthCalledWith(1, "sageos.memory.replay", {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(state.sageOsState).toBe(refreshedState);
    expect(state.sageOsBusy).toBeNull();
    expect(state.sageOsError).toBeNull();
    expect(requestUpdate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["incident_notification_failed", "sageos.notifications.digest"],
    ["incident_worker_failed", "sageos.runs.list"],
    ["incident_budget_exhausted", "sageos.tasks.list"],
    ["incident_security_finding", "sageos.observations.list"],
  ])("runs generated %s repair through %s", async (incidentId, gatewayMethod) => {
    const incident: SageOsIncident = {
      id: incidentId,
      severity: "warning",
      category: "generated",
      title: "Generated incident",
      summary: "Generated incident needs review.",
      firstSeenAt: "2026-06-02T10:00:00.000Z",
      lastSeenAt: "2026-06-02T10:00:00.000Z",
      autoRepairSafe: true,
      repairAction: {
        id: `repair_${incidentId}`,
        label: "Inspect incident",
        gatewayMethod,
        risk: "low",
        approvalRequired: false,
      },
    };
    const refreshedState = makeState("running", []);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ result: "ok" })
      .mockResolvedValueOnce(refreshedState);
    const state: SageOsUiState = {
      client: { request } as unknown as GatewayBrowserClient,
      connected: true,
      sageOsLoading: false,
      sageOsBusy: null,
      sageOsError: null,
      sageOsState: makeState("running", [incident]),
    };

    await runSageOsIncidentRepair(state, incidentId);

    expect(request).toHaveBeenNthCalledWith(1, gatewayMethod, {});
    expect(request).toHaveBeenNthCalledWith(2, "sageos.status", {});
    expect(state.sageOsState).toBe(refreshedState);
    expect(state.sageOsError).toBeNull();
  });
});

function makeState(
  supervisorState: "paused" | "running" | "stopped",
  incidents: SageOsIncident[] = [],
): SageOsPersistedState {
  const now = new Date().toISOString();
  return {
    version: 1,
    status: createSageOsStatusSnapshot({
      supervisor: {
        enabled: true,
        paused: supervisorState === "paused",
        state: supervisorState,
      },
      incidents,
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
