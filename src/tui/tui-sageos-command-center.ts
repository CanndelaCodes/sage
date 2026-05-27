import type { SageOsPersistedState } from "../sageos/state-store.js";
import type {
  SageOsApproval,
  SageOsIncident,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "../sageos/types.js";

export function formatSageOsCommandCenterForTui(state: SageOsPersistedState): string[] {
  const status = state.status;
  const lines = [
    "SageOS Command Center",
    `Overview: ${status.supervisor.state}${
      status.supervisor.paused ? " (paused)" : ""
    }, mode ${status.mode}, ${status.employees.total} employee(s), ${status.approvals.pending} pending approval(s)`,
    `Tasks: ${status.tasks.active} active, ${status.tasks.queued} queued, ${status.tasks.blocked} blocked, ${status.tasks.total} total`,
    renderMemoryLine(status),
    `Learning: ${status.learning.status}, activity queue ${status.learning.activityQueue.pending} pending / ${status.learning.activityQueue.failed} failed`,
    `Observations: ${status.observations.recent} recent, ${status.observations.redacted} redacted, ${status.observations.failed} failed, ${status.observations.total} total`,
    `Workflows: ${status.workflows.active} active, ${status.workflows.queued} candidate, ${status.workflows.blocked} blocked, ${status.workflows.total} total`,
    `Skills: ${status.skills.active} active, ${status.skills.queued} draft, ${status.skills.blocked} blocked, ${status.skills.total} total`,
    `Apps: ${status.apps.active} active, ${status.apps.queued} draft, ${status.apps.blocked} blocked, ${status.apps.total} total`,
    `Coding: ${status.coding.enabled ? "enabled" : "disabled"}, ${status.coding.allowedRepos.length} repo(s), ${status.coding.reports.total} report(s), restrictions ${listOrNone(status.coding.restrictions)}`,
    `Notifications: Telegram ${
      status.notifications.telegram.enabled ? "enabled" : "disabled"
    }, urgent pending ${status.notifications.urgentPending}`,
    `Policy: ${status.policy.mode}, approvals ${listOrNone(status.policy.approvalsRequired)}`,
    renderAuditLine(status),
    `Incidents: ${status.incidents.length}`,
  ];

  const topTask = state.tasks.find((task) =>
    ["running", "verifying", "planning", "queued", "blocked", "waiting_for_policy"].includes(
      task.state,
    ),
  );
  if (topTask) {
    lines.push(`Top task: ${topTask.id} | ${topTask.state} | ${topTask.title}`);
  }
  const topIncident = status.incidents[0];
  if (topIncident) {
    lines.push(
      `Top incident: ${topIncident.id} | ${topIncident.category} | ${
        topIncident.repairAction?.label ?? topIncident.title
      }`,
    );
  }
  return lines;
}

export function formatSageOsTasksForTui(state: SageOsPersistedState): string[] {
  if (state.tasks.length === 0) {
    return ["SageOS tasks: none"];
  }
  return ["SageOS tasks", ...state.tasks.map(formatTaskLine)];
}

export function formatSageOsTaskDetailForTui(state: SageOsPersistedState, id: string): string[] {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) {
    return [`SageOS task not found: ${id}`];
  }
  return [
    `SageOS task ${task.id}`,
    `Title: ${task.title}`,
    `State: ${task.state}`,
    `Objective: ${task.objective}`,
    `Requested by: ${task.requestedBy}`,
    `Autonomy: ${task.autonomyTier}`,
    `Rollback: ${task.rollback ?? "not recorded"}`,
  ];
}

export function formatSageOsIncidentsForTui(state: SageOsPersistedState): string[] {
  if (state.status.incidents.length === 0) {
    return ["SageOS incidents: none"];
  }
  const lines = ["SageOS incidents"];
  for (const incident of state.status.incidents) {
    lines.push(formatIncidentLine(incident));
    if (incident.repairAction) {
      const action = incident.repairAction.gatewayMethod ?? incident.repairAction.command;
      lines.push(`  Repair: ${incident.repairAction.label}${action ? ` via ${action}` : ""}`);
    }
  }
  return lines;
}

export function formatSageOsApprovalsForTui(state: SageOsPersistedState): string[] {
  const pending = state.approvals.filter((approval) => approval.state === "pending");
  if (pending.length === 0) {
    return ["SageOS approvals: none pending"];
  }
  return ["SageOS approvals", ...pending.map(formatApprovalLine)];
}

function renderMemoryLine(status: SageOsStatusSnapshot): string {
  const parts = [
    `Memory: ${status.memory.status}`,
    `backend ${status.memory.backend}`,
    `capture queue ${status.memory.captureQueue.pending} pending / ${status.memory.captureQueue.failed} failed`,
  ];
  if (status.memory.doctor) {
    parts.push(
      `doctor ${status.memory.doctor.ok ? "ok" : "fail"}`,
      `wiki exports ${status.memory.doctor.exportedFiles.length}`,
    );
  }
  return parts.join(", ");
}

function renderAuditLine(status: SageOsStatusSnapshot): string {
  return status.audit.eventLogPath
    ? `Audit: ${status.audit.recentEvents} recent event(s), ${status.audit.eventLogPath}`
    : `Audit: ${status.audit.recentEvents} recent event(s)`;
}

function formatTaskLine(task: SageOsTaskSpec): string {
  return `- ${task.id} | ${task.state} | ${task.title}`;
}

function formatIncidentLine(incident: SageOsIncident): string {
  return `- ${incident.id} | ${incident.severity} | ${incident.title}`;
}

function formatApprovalLine(approval: SageOsApproval): string {
  return `- ${approval.id} | ${approval.riskClass} | ${approval.title}`;
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
