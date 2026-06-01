import type {
  SageOsApproval,
  SageOsAgentSpec,
  SageOsAppCandidate,
  SageOsCodingReport,
  SageOsCollaborationEvent,
  SageOsIncident,
  SageOsObservation,
  SageOsRun,
  SageOsSkillRecord,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
  SageOsWorkflow,
} from "../../../../src/sageos/types.js";
import type { OverlayGatewayClient } from "./gateway-client.js";

export type SageOsOverlayStatusState = {
  status: SageOsStatusSnapshot;
  agents?: SageOsAgentSpec[];
  tasks?: SageOsTaskSpec[];
  runs?: SageOsRun[];
  approvals?: SageOsApproval[];
  codingReports?: SageOsCodingReport[];
  workflows?: SageOsWorkflow[];
  skills?: SageOsSkillRecord[];
  apps?: SageOsAppCandidate[];
  observations?: SageOsObservation[];
  collaborations?: SageOsCollaborationEvent[];
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

export function createSageOsTask(
  client: OverlayGatewayClient,
  task: { title: string; objective: string; ownerAgentId?: string; autonomyTier?: string },
) {
  return client.request("sageos.tasks.create", {
    title: task.title,
    objective: task.objective,
    ...(task.ownerAgentId ? { ownerAgentId: task.ownerAgentId } : {}),
    ...(task.autonomyTier ? { autonomyTier: task.autonomyTier } : {}),
  });
}

export function runNextSageOsTask(client: OverlayGatewayClient) {
  return client.request("sageos.tasks.runNext", {});
}

export function cancelSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.cancel", { id, reason: "windows-overlay" });
}

export function activateSageOsEmployee(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.agents.activate", { id, reason: "windows-overlay" });
}

export function pauseSageOsEmployee(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.agents.pause", { id, reason: "windows-overlay" });
}

export function resumeSageOsEmployee(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.agents.resume", { id, reason: "windows-overlay" });
}

export function retireSageOsEmployee(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.agents.retire", { id, reason: "windows-overlay" });
}

export async function runSageOsLauncherCommand(
  client: OverlayGatewayClient,
  message: string,
  opts: { idempotencyKey?: string; sessionKey?: string } = {},
) {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("SageOS launcher command is required");
  }

  const employeeDescription = parseEmployeeDraftLauncherCommand(trimmed);
  if (employeeDescription) {
    await client.request("sageos.agents.create", { description: employeeDescription });
    return loadSageOsOverlayStatus(client);
  }

  const task = parseTaskCreationLauncherCommand(trimmed);
  if (task) {
    await createSageOsTask(client, task);
    return loadSageOsOverlayStatus(client);
  }

  return sendSageOsLauncherCommand(client, trimmed, opts);
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

function parseEmployeeDraftLauncherCommand(message: string): string | null {
  const normalized = message.toLowerCase();
  if (!/^(create|draft|add)\s+/.test(normalized)) {
    return null;
  }

  const employeeHints = [
    "employee",
    "agent",
    "security sentinel",
    "pc steward",
    "windows admin",
    "system doctor",
    "memory steward",
    "workflow engineer",
    "coding worker",
    "reviewer",
  ];
  return employeeHints.some((hint) => normalized.includes(hint)) ? message : null;
}

function parseTaskCreationLauncherCommand(
  message: string,
): { title: string; objective: string; ownerAgentId?: string } | null {
  const assignTaskMatch = message.match(
    /^(?:assign)\s+(?:a\s+)?task\s+to\s+(.+?)\s+to\s+(.+)$/i,
  );
  if (assignTaskMatch) {
    return taskIntent(assignTaskMatch[2], assignTaskMatch[1]);
  }

  const assignEmployeeMatch = message.match(/^(?:assign|ask)\s+(.+?)\s+to\s+(.+)$/i);
  if (assignEmployeeMatch) {
    return taskIntent(assignEmployeeMatch[2], assignEmployeeMatch[1]);
  }

  const createTaskForMatch = message.match(
    /^(?:create|draft|add)\s+(?:a\s+)?task\s+for\s+(.+?)\s+to\s+(.+)$/i,
  );
  if (createTaskForMatch) {
    return taskIntent(createTaskForMatch[2], createTaskForMatch[1]);
  }

  const createTaskMatch = message.match(
    /^(?:create|draft|add)\s+(?:a\s+)?task(?:\s+to|\s*:)?\s+(.+)$/i,
  );
  return createTaskMatch ? taskIntent(createTaskMatch[1]) : null;
}

function taskIntent(objectiveValue: string | undefined, ownerValue?: string) {
  const objective = objectiveValue?.trim();
  if (!objective) {
    return null;
  }
  const ownerAgentId = ownerValue ? employeeIdFromLauncherOwner(ownerValue) : undefined;
  return {
    title: titleFromObjective(objective),
    objective,
    ...(ownerAgentId ? { ownerAgentId } : {}),
  };
}

function employeeIdFromLauncherOwner(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+(?:employee|agent)$/i, "");
  return cleaned.startsWith("employee_") ? cleaned : `employee_${slugify(cleaned)}`;
}

function titleFromObjective(objective: string): string {
  return objective
    .replace(/[.!?]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "employee";
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
