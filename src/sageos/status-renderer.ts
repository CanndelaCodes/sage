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
    `Apps: ${snapshot.apps.active} active, ${snapshot.apps.queued} draft, ${snapshot.apps.blocked} blocked, ${snapshot.apps.total} total`,
    renderCollaborationLine(snapshot),
    `Approvals: ${snapshot.approvals.pending} pending`,
    `Observations: ${snapshot.observations.recent} recent, ${snapshot.observations.redacted} redacted, ${snapshot.observations.failed} failed, ${snapshot.observations.total} total`,
    renderMemoryLine(snapshot),
    `Learning: ${snapshot.learning.status}, activity queue ${snapshot.learning.activityQueue.pending} pending / ${snapshot.learning.activityQueue.failed} failed`,
    `Policy: ${snapshot.policy.mode}, approvals ${listOrNone(snapshot.policy.approvalsRequired)}`,
    `Sources: ${snapshot.sources.enabled.length} enabled, ${snapshot.sources.disabled.length} disabled, ${snapshot.sources.failing.length} failing`,
    renderNotificationLine(snapshot),
    `Coding: ${
      snapshot.coding.enabled ? "enabled" : "disabled"
    }, ${snapshot.coding.allowedRepos.length} repos, ${snapshot.coding.reports.total} reports, restrictions ${listOrNone(
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

function renderCollaborationLine(snapshot: SageOsStatusSnapshot): string {
  const collaboration = snapshot.collaboration;
  return [
    `Collaboration: ${collaboration.open} open`,
    countLabel(collaboration.handoffs, "handoff"),
    countLabel(collaboration.reviewRequests, "review"),
    countLabel(collaboration.incidentEscalations, "incident escalation"),
    countLabel(collaboration.sharedArtifacts, "shared artifact"),
    `${collaboration.total} total`,
  ].join(", ");
}

function renderNotificationLine(snapshot: SageOsStatusSnapshot): string {
  const recent = snapshot.notifications.recent ?? { sent: 0, failed: 0, skipped: 0 };
  const parts = [
    `Notifications: Telegram ${snapshot.notifications.telegram.enabled ? "enabled" : "disabled"}`,
    `urgent pending ${snapshot.notifications.urgentPending}`,
  ];
  if (snapshot.notifications.telegram.digestSchedule) {
    parts.push(`digest ${snapshot.notifications.telegram.digestSchedule}`);
  }
  if (snapshot.notifications.digest?.nextDueAt) {
    parts.push(`next ${snapshot.notifications.digest.nextDueAt}`);
  }
  if (snapshot.notifications.digest?.lastScheduledFor) {
    parts.push(`last digest ${snapshot.notifications.digest.lastScheduledFor}`);
  }
  if (snapshot.notifications.digest?.error) {
    parts.push(`digest error ${snapshot.notifications.digest.error}`);
  }
  if (snapshot.notifications.telegram.batchWindowMinutes) {
    parts.push(`batch ${snapshot.notifications.telegram.batchWindowMinutes}m`);
  }
  if (snapshot.notifications.batch) {
    parts.push(
      `queued ${snapshot.notifications.batch.pending}/${snapshot.notifications.batch.total}`,
    );
    if (snapshot.notifications.batch.dueAt) {
      parts.push(`due ${snapshot.notifications.batch.dueAt}`);
    }
  }
  const quietHours = snapshot.notifications.telegram.quietHours;
  if (quietHours) {
    parts.push(
      `quiet ${quietHours.start}-${quietHours.end}${quietHours.timezone ? ` ${quietHours.timezone}` : ""}`,
    );
  }
  if (snapshot.notifications.telegram.urgentOnlyDuringFocus) {
    parts.push("focus urgent-only");
  }
  parts.push(`recent ${recent.sent} sent / ${recent.failed} failed / ${recent.skipped} skipped`);
  if (recent.lastOutcome) {
    parts.push(`last ${recent.lastOutcome}`);
  }
  return parts.join(", ");
}

function renderMemoryLine(snapshot: SageOsStatusSnapshot): string {
  const parts = [
    `Memory: ${snapshot.memory.status}`,
    `backend ${snapshot.memory.backend}`,
    `capture queue ${snapshot.memory.captureQueue.pending} pending / ${snapshot.memory.captureQueue.failed} failed`,
  ];
  if (snapshot.memory.doctor) {
    parts.push(
      `doctor ${snapshot.memory.doctor.ok ? "ok" : "fail"}`,
      `wiki exports ${snapshot.memory.doctor.exportedFiles.length}`,
    );
  }
  return parts.join(", ");
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
