import type { SageOsStatusSnapshot } from "./types.js";

export function renderSageOsStatus(snapshot: SageOsStatusSnapshot): string {
  const lines = [
    "SageOS Command Center",
    `Mode: ${snapshot.mode}`,
    `Supervisor: ${snapshot.supervisor.state}${snapshot.supervisor.paused ? " (paused)" : ""}`,
    `Employees: ${snapshot.employees.active}/${snapshot.employees.total} active, ${snapshot.employees.queued} draft, ${snapshot.employees.blocked} blocked`,
    `Tasks: ${snapshot.tasks.active} active, ${snapshot.tasks.queued} queued, ${snapshot.tasks.blocked} blocked, ${snapshot.tasks.total} total`,
    `Runs: ${snapshot.runs.active} active, ${snapshot.runs.queued} queued, ${snapshot.runs.failed} failed, ${snapshot.runs.total} total`,
    `Workflows: ${snapshot.workflows.active} active, ${snapshot.workflows.queued} candidate, ${snapshot.workflows.blocked} blocked, ${snapshot.workflows.total} total`,
    `Skills: ${snapshot.skills.active} active, ${snapshot.skills.queued} draft, ${snapshot.skills.blocked} blocked, ${snapshot.skills.total} total`,
    `Approvals: ${snapshot.approvals.pending} pending`,
    `Observations: ${snapshot.observations.recent} recent, ${snapshot.observations.redacted} redacted, ${snapshot.observations.failed} failed, ${snapshot.observations.total} total`,
    `Memory: ${snapshot.memory.status}, backend ${snapshot.memory.backend}, capture queue ${snapshot.memory.captureQueue.pending} pending / ${snapshot.memory.captureQueue.failed} failed`,
    `Learning: ${snapshot.learning.status}, activity queue ${snapshot.learning.activityQueue.pending} pending / ${snapshot.learning.activityQueue.failed} failed`,
    `Policy: ${snapshot.policy.mode}, approvals ${listOrNone(snapshot.policy.approvalsRequired)}`,
    `Sources: ${snapshot.sources.enabled.length} enabled, ${snapshot.sources.disabled.length} disabled, ${snapshot.sources.failing.length} failing`,
    `Notifications: Telegram ${
      snapshot.notifications.telegram.enabled ? "enabled" : "disabled"
    }, urgent pending ${snapshot.notifications.urgentPending}`,
    `Coding: ${
      snapshot.coding.enabled ? "enabled" : "disabled"
    }, ${snapshot.coding.allowedRepos.length} repos, restrictions ${listOrNone(
      snapshot.coding.restrictions,
    )}`,
    `Incidents: ${snapshot.incidents.length}`,
  ];
  if (snapshot.audit.eventLogPath) {
    lines.push(
      `Audit: ${snapshot.audit.recentEvents} recent events, ${snapshot.audit.eventLogPath}`,
    );
  } else {
    lines.push(`Audit: ${snapshot.audit.recentEvents} recent events`);
  }
  return lines.join("\n");
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
