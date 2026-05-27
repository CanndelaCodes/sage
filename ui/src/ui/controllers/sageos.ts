import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import type { GatewayBrowserClient } from "../gateway.ts";

export type SageOsControlAction = "paused" | "running" | "stopped" | "emergency_stop";
export type SageOsApprovalDecision = "approved" | "denied";

const safeIncidentRepairMethods = new Set([
  "sageos.memory.replay",
  "sageos.memory.doctor",
  "sageos.approvals.list",
  "sageos.observations.list",
]);

export type SageOsUiState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sageOsLoading: boolean;
  sageOsBusy: string | null;
  sageOsError: string | null;
  sageOsState: SageOsPersistedState | null;
  requestUpdate?: () => void;
};

export async function loadSageOs(state: SageOsUiState) {
  if (!state.client || !state.connected || state.sageOsLoading) {
    return;
  }
  state.sageOsLoading = true;
  state.sageOsError = null;
  requestSageOsUpdate(state);
  try {
    state.sageOsState = await state.client.request<SageOsPersistedState>("sageos.status", {});
  } catch (err) {
    state.sageOsError = String(err);
  } finally {
    state.sageOsLoading = false;
    requestSageOsUpdate(state);
  }
}

export async function setSageOsControl(state: SageOsUiState, action: SageOsControlAction) {
  const emergency = action === "emergency_stop";
  await runSageOsMutation(state, `control:${action}`, async () => {
    state.sageOsState = await requireClient(state).request<SageOsPersistedState>("sageos.control", {
      state: emergency ? "stopped" : action,
      emergency,
      reason: "control-ui",
    });
  });
}

export async function resolveSageOsApproval(
  state: SageOsUiState,
  id: string,
  decision: SageOsApprovalDecision,
) {
  await runSageOsMutation(state, `approval:${id}:${decision}`, async () => {
    const payload = await requireClient(state).request<{ state: SageOsPersistedState }>(
      "sageos.approvals.resolve",
      {
        id,
        decision,
        reason: "control-ui",
      },
    );
    state.sageOsState = payload.state;
  });
}

export async function queueSageOsTask(state: SageOsUiState, id: string) {
  await runSageOsMutation(state, `queue:${id}`, async () => {
    const payload = await requireClient(state).request<{ state: SageOsPersistedState }>(
      "sageos.tasks.queue",
      {
        id,
        reason: "control-ui",
      },
    );
    state.sageOsState = payload.state;
  });
}

export async function runNextSageOsTask(state: SageOsUiState) {
  await runSageOsMutation(state, "run-next", async () => {
    const payload = await requireClient(state).request<{ state: SageOsPersistedState }>(
      "sageos.tasks.runNext",
      {},
    );
    state.sageOsState = payload.state;
  });
}

export async function cancelSageOsTask(state: SageOsUiState, id: string) {
  await runSageOsMutation(state, `cancel:${id}`, async () => {
    const payload = await requireClient(state).request<{ state: SageOsPersistedState }>(
      "sageos.tasks.cancel",
      {
        id,
        reason: "control-ui",
      },
    );
    state.sageOsState = payload.state;
  });
}

export async function runSageOsIncidentRepair(state: SageOsUiState, incidentId: string) {
  await runSageOsMutation(state, `repair:${incidentId}`, async () => {
    const incident = state.sageOsState?.status.incidents.find((entry) => entry.id === incidentId);
    if (!incident) {
      throw new Error(`SageOS incident not found: ${incidentId}`);
    }
    const repair = incident.repairAction;
    const gatewayMethod = repair?.gatewayMethod?.trim();
    if (!incident.autoRepairSafe || repair?.approvalRequired || !gatewayMethod) {
      throw new Error(`SageOS incident repair requires review: ${incidentId}`);
    }
    if (!safeIncidentRepairMethods.has(gatewayMethod)) {
      throw new Error(`SageOS repair method is not allowlisted: ${gatewayMethod}`);
    }
    await requireClient(state).request(gatewayMethod, {});
    state.sageOsState = await requireClient(state).request<SageOsPersistedState>(
      "sageos.status",
      {},
    );
  });
}

async function runSageOsMutation(state: SageOsUiState, busyKey: string, run: () => Promise<void>) {
  if (!state.client || !state.connected || state.sageOsBusy) {
    return;
  }
  state.sageOsBusy = busyKey;
  state.sageOsError = null;
  requestSageOsUpdate(state);
  try {
    await run();
  } catch (err) {
    state.sageOsError = String(err);
  } finally {
    state.sageOsBusy = null;
    requestSageOsUpdate(state);
  }
}

function requireClient(state: SageOsUiState): GatewayBrowserClient {
  if (!state.client || !state.connected) {
    throw new Error("gateway not connected");
  }
  return state.client;
}

function requestSageOsUpdate(state: SageOsUiState) {
  state.requestUpdate?.();
}
