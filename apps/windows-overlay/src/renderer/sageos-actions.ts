import type {
  SageOsApproval,
  SageOsCodingReport,
  SageOsIncident,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "../../../../src/sageos/types.js";
import type { OverlayGatewayClient } from "./gateway-client.js";

export type SageOsOverlayStatusState = {
  status: SageOsStatusSnapshot;
  tasks?: SageOsTaskSpec[];
  approvals?: SageOsApproval[];
  codingReports?: SageOsCodingReport[];
} & Record<string, unknown>;

const safeIncidentRepairMethods = new Set([
  "sageos.memory.replay",
  "sageos.memory.doctor",
  "sageos.approvals.list",
  "sageos.observations.list",
]);

export function loadSageOsOverlayStatus(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.status", {});
}

export function pauseSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "paused",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function resumeSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "running",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function emergencyStopSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "stopped",
    emergency: true,
    reason: "windows-overlay",
  });
}

export function approveSageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "approved",
    reason: "windows-overlay",
  });
}

export function denySageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "denied",
    reason: "windows-overlay",
  });
}

export function queueSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.queue", { id, reason: "windows-overlay" });
}

export function runNextSageOsTask(client: OverlayGatewayClient) {
  return client.request("sageos.tasks.runNext", {});
}

export function cancelSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.cancel", { id, reason: "windows-overlay" });
}

export function sendSageOsLauncherCommand(
  client: OverlayGatewayClient,
  message: string,
  opts: { idempotencyKey?: string; sessionKey?: string } = {},
) {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("SageOS launcher command is required");
  }
  return client.request("chat.send", {
    sessionKey: opts.sessionKey ?? "main",
    message: trimmed,
    deliver: false,
    idempotencyKey: opts.idempotencyKey ?? createLauncherCommandId(),
  });
}

export function canRunSageOsIncidentRepair(
  incident: Pick<SageOsIncident, "autoRepairSafe" | "repairAction">,
) {
  const gatewayMethod = incident.repairAction?.gatewayMethod?.trim();
  return (
    incident.autoRepairSafe &&
    !incident.repairAction?.approvalRequired &&
    Boolean(gatewayMethod && safeIncidentRepairMethods.has(gatewayMethod))
  );
}

export async function runSageOsIncidentRepair(
  client: OverlayGatewayClient,
  state: SageOsOverlayStatusState,
  incidentId: string,
) {
  const incident = state.status.incidents.find((entry) => entry.id === incidentId);
  if (!incident) {
    throw new Error(`SageOS incident not found: ${incidentId}`);
  }

  const gatewayMethod = incident.repairAction?.gatewayMethod?.trim();
  if (!incident.autoRepairSafe || incident.repairAction?.approvalRequired || !gatewayMethod) {
    throw new Error(`SageOS incident repair requires review: ${incidentId}`);
  }
  if (!safeIncidentRepairMethods.has(gatewayMethod)) {
    throw new Error(`SageOS repair method is not allowlisted: ${gatewayMethod}`);
  }

  await client.request(gatewayMethod, {});
  return loadSageOsOverlayStatus(client);
}

function createLauncherCommandId() {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return `windows-overlay-${cryptoApi?.randomUUID?.() ?? Date.now().toString(36)}`;
}
