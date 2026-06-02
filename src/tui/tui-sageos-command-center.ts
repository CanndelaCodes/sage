import type { SageOsPersistedState } from "../sageos/state-store.js";
import type {
  SageOsApproval,
  SageOsIncident,
  SageOsPolicyScope,
  SageOsRun,
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
    renderCollaborationLine(status),
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

export function formatSageOsEmployeesForTui(state: SageOsPersistedState): string[] {
  if (state.agents.length === 0) {
    return ["SageOS employees: none"];
  }
  return [
    "SageOS employees",
    ...state.agents.map(
      (agent) => `- ${agent.id} | ${agent.status} | ${agent.name} | ${agent.autonomyTier}`,
    ),
  ];
}

export function formatSageOsEmployeeDetailForTui(
  state: SageOsPersistedState,
  id: string,
): string[] {
  const agent = state.agents.find((entry) => entry.id === id);
  if (!agent) {
    return [`SageOS employee not found: ${id}`];
  }
  return [
    `SageOS employee ${agent.id}`,
    `Name: ${agent.name}`,
    `Role: ${agent.role}`,
    `Status: ${agent.status}`,
    `Autonomy: ${agent.autonomyTier}`,
    `Mission: ${agent.mission}`,
    `Responsibilities: ${listOrNone(agent.responsibilities)}`,
    `Tools: ${listOrNone(agent.tools ?? [])}`,
    `Memory scopes: ${listOrNone(agent.memoryScopes ?? [])}`,
    `Schedules: ${listOrNone(agent.schedules ?? [])}`,
    `Risks: ${listOrNone(agent.risks ?? [])}`,
    `Allowed scopes: ${formatScopes(agent.allowedScopes)}`,
    `Denied scopes: ${formatScopes(agent.deniedScopes)}`,
  ];
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

export function formatSageOsRunsForTui(state: SageOsPersistedState): string[] {
  if (state.runs.length === 0) {
    return ["SageOS runs: none"];
  }
  return ["SageOS runs", ...state.runs.map(formatRunLine)];
}

export function formatSageOsRunDetailForTui(state: SageOsPersistedState, id: string): string[] {
  const run = state.runs.find((entry) => entry.id === id);
  if (!run) {
    return [`SageOS run not found: ${id}`];
  }
  const lines = [
    `SageOS run ${run.id}`,
    `Task: ${run.taskId}`,
    `State: ${run.state}`,
    `Attempt: ${run.attempt}`,
    `Trace: ${run.traceId}`,
  ];
  if (run.workerSessionId) {
    lines.push(`Worker session: ${run.workerSessionId}`);
  }
  if (run.currentToolCall) {
    lines.push(`Current tool: ${run.currentToolCall}`);
  }
  if (run.budgetUsed) {
    lines.push(
      `Budget: ${run.budgetUsed.elapsedMinutes ?? 0}m, ${
        run.budgetUsed.toolCalls ?? 0
      } tool call(s), $${run.budgetUsed.costUsd ?? 0}`,
    );
  }
  if (run.timeline?.length) {
    lines.push(`Timeline: ${run.timeline.map((event) => event.label).join(" -> ")}`);
  }
  if (run.artifacts?.length) {
    lines.push(`Artifacts: ${listOrNone(run.artifacts)}`);
  }
  if (run.verificationResult) {
    lines.push(
      `Verification: ${run.verificationResult.outcome} | ${run.verificationResult.summary}`,
    );
  }
  if (run.error) {
    lines.push(`Error: ${run.error}`);
  }
  return lines;
}

export function formatSageOsObservationsForTui(state: SageOsPersistedState): string[] {
  if (state.observations.length === 0) {
    return ["SageOS observations: none"];
  }
  return [
    "SageOS observations",
    ...state.observations.map(
      (observation) =>
        `- ${observation.id} | ${observation.source} | ${observation.state} | ${observation.sensitivity} | ${observation.title}`,
    ),
  ];
}

export function formatSageOsObservationDetailForTui(
  state: SageOsPersistedState,
  id: string,
): string[] {
  const observation = state.observations.find((entry) => entry.id === id);
  if (!observation) {
    return [`SageOS observation not found: ${id}`];
  }
  const sensitive = observation.sensitivity === "private" || observation.sensitivity === "secret";
  return [
    `SageOS observation ${observation.id}`,
    `Title: ${observation.title}`,
    `Source: ${observation.source}`,
    `State: ${observation.state}`,
    `Sensitivity: ${observation.sensitivity}`,
    `Observed: ${observation.observedAt}`,
    `Text: ${sensitive ? "redacted in TUI summary" : previewText(observation.text)}`,
  ];
}

export function formatSageOsWorkflowsForTui(state: SageOsPersistedState): string[] {
  if (state.workflows.length === 0) {
    return ["SageOS workflows: none"];
  }
  return [
    "SageOS workflows",
    ...state.workflows.map(
      (workflow) =>
        `- ${workflow.id} | ${workflow.state} | ${workflow.name} | ${workflow.observedPattern}`,
    ),
  ];
}

export function formatSageOsSkillsForTui(state: SageOsPersistedState): string[] {
  if (state.skills.length === 0) {
    return ["SageOS skills: none"];
  }
  return [
    "SageOS skills",
    ...state.skills.map(
      (skill) =>
        `- ${skill.id} | ${skill.state} | ${skill.name} | workflow ${skill.workflowId ?? "none"}`,
    ),
  ];
}

export function formatSageOsAppsForTui(state: SageOsPersistedState): string[] {
  if (state.apps.length === 0) {
    return ["SageOS apps and widgets: none"];
  }
  return [
    "SageOS apps and widgets",
    ...state.apps.map(
      (app) =>
        `- ${app.id} | ${app.state} | ${app.name} | ${app.targetSurface} | ${app.sensitivity}`,
    ),
  ];
}

export function formatSageOsCodingReportsForTui(state: SageOsPersistedState): string[] {
  if (state.codingReports.length === 0) {
    return ["SageOS coding reports: none"];
  }
  return [
    "SageOS coding reports",
    ...state.codingReports.map(
      (report) =>
        `- ${report.id} | ${report.outcome} | ${report.repoPath} | task ${
          report.taskId
        } | tests ${report.tests.length} | changed ${listOrNone(report.diff.changedFiles)}`,
    ),
  ];
}

export function formatSageOsCollaborationsForTui(state: SageOsPersistedState): string[] {
  if (state.collaborations.length === 0) {
    return ["SageOS collaborations: none"];
  }
  return [
    "SageOS collaborations",
    ...state.collaborations.map(
      (event) =>
        `- ${event.id} | ${event.kind} | ${event.state} | ${event.fromAgentId} -> ${
          event.toAgentId ?? "unassigned"
        } | ${event.title}`,
    ),
  ];
}

export function formatSageOsAuditForTui(state: SageOsPersistedState): string[] {
  const lines = ["SageOS audit", `Recent events: ${state.status.audit.recentEvents}`];
  if (state.status.audit.eventLogPath) {
    lines.push(`Event log: ${state.status.audit.eventLogPath}`);
  }
  lines.push(`State updated: ${state.updatedAt}`);
  return lines;
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

function renderCollaborationLine(status: SageOsStatusSnapshot): string {
  const collaboration = status.collaboration;
  return [
    `Collaboration: ${collaboration.open} open`,
    countLabel(collaboration.handoffs, "handoff"),
    countLabel(collaboration.reviewRequests, "review request"),
    countLabel(collaboration.incidentEscalations, "incident escalation"),
    countLabel(collaboration.sharedArtifacts, "shared artifact"),
    `${collaboration.total} total`,
  ].join(", ");
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

function formatRunLine(run: SageOsRun): string {
  const parts = [`- ${run.id}`, run.state, `task ${run.taskId}`, `trace ${run.traceId}`];
  if (run.currentToolCall) {
    parts.push(`tool ${run.currentToolCall}`);
  }
  return parts.join(" | ");
}

function formatScopes(scopes: SageOsPolicyScope[]): string {
  if (scopes.length === 0) {
    return "none";
  }
  return scopes
    .map((scope) => {
      const parts: string[] = [scope.kind];
      if (scope.allow?.length) {
        parts.push(`allow ${scope.allow.join(",")}`);
      }
      if (scope.deny?.length) {
        parts.push(`deny ${scope.deny.join(",")}`);
      }
      if (scope.risk) {
        parts.push(`risk ${scope.risk}`);
      }
      return parts.join(":");
    })
    .join("; ");
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function previewText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}
