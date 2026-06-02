import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import type {
  SageOsConfig,
  SageOsApproval,
  SageOsCodingReport,
  SageOsIncident,
  SageOsObservation,
  SageOsRun,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { appendSageOsEvent, createSageOsEventLog, resolveSageOsStateDir } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  writeSageOsState,
  type SageOsPersistedState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsNotificationKind =
  | "digest"
  | "task"
  | "startup"
  | "shutdown"
  | "approval"
  | "incident"
  | "completion";

export type SageOsNotificationMessage = {
  kind: SageOsNotificationKind;
  title: string;
  text: string;
  target?: string;
  redactedObservationCount: number;
};

export type SageOsTelegramSender = typeof sendMessageTelegram;

export type SageOsTelegramDigestResult =
  | {
      outcome: "sent";
      target: string;
      notification: SageOsNotificationMessage;
      messageId?: string;
      chatId?: string;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "skipped";
      reason: "telegram_disabled" | "missing_target" | "quiet_hours";
      notification?: SageOsNotificationMessage;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "failed";
      target: string;
      notification: SageOsNotificationMessage;
      error: string;
      status: SageOsStatusSnapshot;
    };

export type SageOsTelegramTaskResult =
  | {
      outcome: "sent";
      target: string;
      notification: SageOsNotificationMessage;
      messageId?: string;
      chatId?: string;
    }
  | {
      outcome: "batched";
      target: string;
      notification: SageOsNotificationMessage;
      count: number;
    }
  | {
      outcome: "skipped";
      reason: "telegram_disabled" | "missing_target";
      notification?: SageOsNotificationMessage;
    }
  | {
      outcome: "failed";
      target: string;
      notification: SageOsNotificationMessage;
      error: string;
    };

export type SageOsTelegramStatusNotificationResult =
  | {
      outcome: "sent";
      target: string;
      notification: SageOsNotificationMessage;
      messageId?: string;
      chatId?: string;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "batched";
      target: string;
      notification: SageOsNotificationMessage;
      count: number;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "skipped";
      reason: "telegram_disabled" | "missing_target";
      notification?: SageOsNotificationMessage;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "failed";
      target: string;
      notification: SageOsNotificationMessage;
      error: string;
      status: SageOsStatusSnapshot;
    };

export type SageOsNotificationBatchEntry = SageOsNotificationMessage & {
  id: string;
  status: "pending";
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  runId?: string;
  reportId?: string;
};

export type SageOsNotificationBatchSummary = {
  path: string;
  counts: { total: number; pending: number };
  entries: SageOsNotificationBatchEntry[];
};

export type SageOsTelegramBatchFlushResult =
  | {
      outcome: "sent";
      target: string;
      count: number;
      notification: SageOsNotificationMessage;
      messageId?: string;
      chatId?: string;
    }
  | {
      outcome: "skipped";
      reason: "empty" | "telegram_disabled" | "missing_target";
      count: number;
      notification?: SageOsNotificationMessage;
    }
  | {
      outcome: "failed";
      target: string;
      count: number;
      notification: SageOsNotificationMessage;
      error: string;
    };

type NotificationBatchFile = {
  version: 1;
  entries: SageOsNotificationBatchEntry[];
};

const batchLocks = new Map<string, Promise<unknown>>();

export function buildSageOsDigestNotification(params: {
  state: SageOsPersistedState;
  status: SageOsStatusSnapshot;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const target = params.target ?? telegramTarget(params.cfg);
  const observations = digestObservations(params.state.observations, params.cfg);
  const warningIncidents = params.status.incidents.filter(
    (incident) => incident.severity === "warning",
  ).length;
  const criticalIncidents = params.status.incidents.filter(
    (incident) => incident.severity === "critical" || incident.severity === "error",
  ).length;
  const lines = [
    "SageOS: Daily digest",
    `Mode: ${params.status.mode}`,
    `Supervisor: ${params.status.supervisor.state}`,
    `Tasks: ${params.status.tasks.active} active, ${params.status.tasks.queued} queued, ${params.status.tasks.blocked} blocked`,
    `Runs: ${params.status.runs.active} active, ${params.status.runs.failed} failed`,
    `Approvals: ${params.status.approvals.pending} pending`,
    `Memory: ${params.status.memory.status}, queue ${params.status.memory.captureQueue.pending} pending / ${params.status.memory.captureQueue.failed} failed`,
    `Learning: ${params.status.learning.status}, queue ${params.status.learning.activityQueue.pending} pending / ${params.status.learning.activityQueue.failed} failed`,
    `Incidents: ${warningIncidents} warning${warningIncidents === 1 ? "" : "s"}${
      criticalIncidents ? `, ${criticalIncidents} urgent` : ""
    }`,
    ...observations.visible.map((observation) => `Observation: ${observation.title}`),
  ];
  if (observations.redacted > 0) {
    lines.push(`Private observations redacted: ${observations.redacted}`);
  }
  lines.push(nextAction(params.status), "Actions: Open Command Center | Pause SageOS");
  return {
    kind: "digest",
    title: "SageOS: Daily digest",
    text: lines.join("\n"),
    target,
    redactedObservationCount: observations.redacted,
  };
}

export async function sendSageOsTelegramDigestOnce(params: {
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  sender?: SageOsTelegramSender;
  now?: () => Date;
}): Promise<SageOsTelegramDigestResult> {
  const cfg = params.cfg;
  const target = params.target ?? telegramTarget(cfg);
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg });
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  const state = await readSageOsState(store);
  const eventLog = createSageOsEventLog({ stateDir: params.stateDir });

  if (!cfg?.notifications?.telegram?.enabled) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: "Skipped SageOS Telegram digest because Telegram notifications are disabled.",
    });
    return { outcome: "skipped", reason: "telegram_disabled", status };
  }
  if (!target) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: "Skipped SageOS Telegram digest because no target is configured.",
    });
    return { outcome: "skipped", reason: "missing_target", status };
  }
  const quietHours = telegramQuietHours(cfg);
  if (quietHours && isInsideQuietHours(params.now?.() ?? new Date(), quietHours)) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: `Skipped SageOS Telegram digest because quiet hours are active (${formatQuietHours(
        quietHours,
      )}).`,
    });
    return { outcome: "skipped", reason: "quiet_hours", status };
  }

  const notification = buildSageOsDigestNotification({ state, status, cfg, target });
  const sender = params.sender ?? sendMessageTelegram;
  try {
    const result = await sender(target, notification.text, {
      plainText: notification.text,
    });
    await appendSageOsEvent(eventLog, {
      type: "notification_sent",
      actor: "sageos.notification_manager",
      summary: `Sent SageOS Telegram digest to ${target}.`,
    });
    return {
      outcome: "sent",
      target,
      notification,
      messageId: result.messageId,
      chatId: result.chatId,
      status,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await appendSageOsEvent(eventLog, {
      type: "notification_failed",
      actor: "sageos.notification_manager",
      summary: `Failed to send SageOS Telegram digest to ${target}: ${error}`,
    });
    return { outcome: "failed", target, notification, error, status };
  }
}

export function resolveSageOsNotificationBatchPath(params: { stateDir?: string } = {}): string {
  return path.join(resolveSageOsStateDir(params.stateDir), "notification-batch.json");
}

export async function listSageOsNotificationBatch(
  params: {
    stateDir?: string;
    queuePath?: string;
  } = {},
): Promise<SageOsNotificationBatchSummary> {
  const queuePath = params.queuePath ?? resolveSageOsNotificationBatchPath(params);
  const store = await loadNotificationBatch(queuePath);
  const entries = store.entries.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    path: queuePath,
    counts: { total: entries.length, pending: entries.length },
    entries,
  };
}

export async function flushSageOsTelegramNotificationBatchOnce(
  params: {
    stateDir?: string;
    queuePath?: string;
    cfg?: SageOsConfig;
    target?: string;
    sender?: SageOsTelegramSender;
  } = {},
): Promise<SageOsTelegramBatchFlushResult> {
  const queuePath = params.queuePath ?? resolveSageOsNotificationBatchPath(params);
  const eventLog = createSageOsEventLog({ stateDir: params.stateDir });
  const summary = await listSageOsNotificationBatch({ queuePath });
  if (summary.entries.length === 0) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: "Skipped SageOS Telegram notification batch because the batch queue is empty.",
    });
    return { outcome: "skipped", reason: "empty", count: 0 };
  }
  if (!params.cfg?.notifications?.telegram?.enabled) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary:
        "Skipped SageOS Telegram notification batch because Telegram notifications are disabled.",
    });
    return { outcome: "skipped", reason: "telegram_disabled", count: summary.entries.length };
  }
  const target = params.target ?? summary.entries[0]?.target ?? telegramTarget(params.cfg);
  if (!target) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: "Skipped SageOS Telegram notification batch because no target is configured.",
    });
    return { outcome: "skipped", reason: "missing_target", count: summary.entries.length };
  }

  const notification = buildSageOsBatchedNotification(summary.entries, target);
  const sender = params.sender ?? sendMessageTelegram;
  try {
    const result = await sender(target, notification.text, { plainText: notification.text });
    await clearNotificationBatch(queuePath, new Set(summary.entries.map((entry) => entry.id)));
    await appendSageOsEvent(eventLog, {
      type: "notification_sent",
      actor: "sageos.notification_manager",
      summary: `Sent SageOS Telegram notification batch with ${summary.entries.length} updates to ${target}.`,
    });
    return {
      outcome: "sent",
      target,
      count: summary.entries.length,
      notification,
      messageId: result.messageId,
      chatId: result.chatId,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await appendSageOsEvent(eventLog, {
      type: "notification_failed",
      actor: "sageos.notification_manager",
      summary: `Failed to send SageOS Telegram notification batch to ${target}: ${error}`,
    });
    return { outcome: "failed", target, count: summary.entries.length, notification, error };
  }
}

export function buildSageOsTaskNotification(params: {
  task: SageOsTaskSpec;
  run: SageOsRun;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const completed = params.run.state === "succeeded";
  const target = params.target ?? telegramTarget(params.cfg);
  const lines = [
    completed ? "SageOS: Task completed" : "SageOS: Task failed",
    `Task: ${params.task.id} - ${params.task.title}`,
    `Run: ${params.run.id} (${params.run.state})`,
    `Result: ${completed ? "completed" : "failed"}`,
    `Risk: ${riskSummary(params.task)}`,
    `Next: ${completed ? "review result or continue follow-up" : "inspect failure and retry if safe"}`,
    "Actions: Open Command Center | Pause SageOS",
  ];
  if (params.run.error) {
    lines.splice(4, 0, `Error: ${params.run.error}`);
  }
  return {
    kind: "task",
    title: completed ? "SageOS: Task completed" : "SageOS: Task failed",
    text: lines.join("\n"),
    target,
    redactedObservationCount: 0,
  };
}

export function buildSageOsLifecycleNotification(params: {
  kind: "startup" | "shutdown";
  status: SageOsStatusSnapshot;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const target = params.target ?? telegramTarget(params.cfg);
  const title = params.kind === "startup" ? "SageOS: Startup" : "SageOS: Shutdown";
  const lines = [
    title,
    `Mode: ${params.status.mode}`,
    `Supervisor: ${params.status.supervisor.state}`,
    `Tasks: ${params.status.tasks.active} active, ${params.status.tasks.queued} queued, ${params.status.tasks.blocked} blocked`,
    `Incidents: ${params.status.incidents.length}`,
    nextAction(params.status),
    params.kind === "startup"
      ? "Actions: Open Command Center | Pause SageOS"
      : "Actions: Open Command Center | Resume SageOS",
  ];
  return {
    kind: params.kind,
    title,
    text: lines.join("\n"),
    target,
    redactedObservationCount: 0,
  };
}

export function buildSageOsApprovalNotification(params: {
  approval: SageOsApproval;
  status: SageOsStatusSnapshot;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const target = params.target ?? telegramTarget(params.cfg);
  const lines = [
    "SageOS: Approval required",
    `Approval: ${params.approval.id} - ${params.approval.title}`,
    `Risk: ${params.approval.riskClass}`,
    `Scope: ${params.approval.scope}`,
    `Requested by: ${params.approval.requestedBy}`,
    `Action: ${params.approval.proposedAction}`,
  ];
  if (params.approval.taskId) {
    lines.push(`Task: ${params.approval.taskId}`);
  }
  if (params.approval.preview) {
    lines.push(`Preview: ${params.approval.preview}`);
  }
  if (params.approval.rollbackPlan) {
    lines.push(`Rollback: ${params.approval.rollbackPlan}`);
  }
  if (params.approval.expiresAt) {
    lines.push(`Expires: ${params.approval.expiresAt}`);
  }
  lines.push(
    nextAction(params.status),
    `Actions: /sageos approve ${params.approval.id} | /sageos deny ${params.approval.id} | Open Command Center`,
  );
  return {
    kind: "approval",
    title: "SageOS: Approval required",
    text: lines.join("\n"),
    target,
    redactedObservationCount: 0,
  };
}

export function buildSageOsIncidentNotification(params: {
  incident: SageOsIncident;
  status: SageOsStatusSnapshot;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const target = params.target ?? telegramTarget(params.cfg);
  const repair = params.incident.repairAction;
  const lines = [
    "SageOS: Incident",
    `Severity: ${params.incident.severity}`,
    `Category: ${params.incident.category}`,
    `Title: ${params.incident.title}`,
    `Summary: ${params.incident.summary}`,
    repair ? `Repair: ${repair.label}` : "Repair: manual review required",
  ];
  if (repair?.command) {
    lines.push(`Command: ${repair.command}`);
  }
  if (repair?.gatewayMethod) {
    lines.push(`Gateway: ${repair.gatewayMethod}`);
  }
  lines.push(nextAction(params.status), "Actions: Open Command Center | Pause SageOS");
  return {
    kind: "incident",
    title: "SageOS: Incident",
    text: lines.join("\n"),
    target,
    redactedObservationCount: 0,
  };
}

export function buildSageOsCompletionNotification(params: {
  report: SageOsCodingReport;
  status: SageOsStatusSnapshot;
  cfg?: SageOsConfig;
  target?: string;
}): SageOsNotificationMessage {
  const target = params.target ?? telegramTarget(params.cfg);
  const passed = params.report.tests.filter((test) => test.exitCode === 0).length;
  const failed = params.report.tests.length - passed;
  const changed = params.report.diff.changedFiles.length;
  const title =
    params.report.outcome === "succeeded"
      ? "SageOS: Night Shift completed"
      : params.report.outcome === "blocked"
        ? "SageOS: Night Shift blocked"
        : "SageOS: Night Shift failed";
  const lines = [
    title,
    `Result: ${params.report.outcome}`,
    `Task: ${params.report.taskId}`,
    `Run: ${params.report.runId}`,
    `Repo: ${params.report.repoPath}`,
    `Diff: ${changed} file${changed === 1 ? "" : "s"} changed`,
    `Tests: ${passed} passed / ${failed} failed`,
    `Report: ${params.report.id}`,
  ];
  if (params.report.blockers.length > 0) {
    lines.push(`Blockers: ${params.report.blockers.length}`);
  }
  lines.push(nextAction(params.status), "Actions: Open Command Center | Pause SageOS");
  return {
    kind: "completion",
    title,
    text: lines.join("\n"),
    target,
    redactedObservationCount: 0,
  };
}

export async function sendSageOsTaskNotificationOnce(params: {
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  task: SageOsTaskSpec;
  run: SageOsRun;
  sender?: SageOsTelegramSender;
  now?: () => Date;
}): Promise<SageOsTelegramTaskResult> {
  const cfg = params.cfg;
  const target = params.target ?? telegramTarget(cfg);
  const eventLog = createSageOsEventLog({ stateDir: params.stateDir });
  if (!cfg?.notifications?.telegram?.enabled) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: `Skipped SageOS task notification for ${params.task.id} because Telegram notifications are disabled.`,
      taskId: params.task.id,
      runId: params.run.id,
    });
    return { outcome: "skipped", reason: "telegram_disabled" };
  }
  if (!target) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: `Skipped SageOS task notification for ${params.task.id} because no target is configured.`,
      taskId: params.task.id,
      runId: params.run.id,
    });
    return { outcome: "skipped", reason: "missing_target" };
  }

  const notification = buildSageOsTaskNotification({
    task: params.task,
    run: params.run,
    cfg,
    target,
  });
  if (shouldBatchTaskNotification(cfg, params.run)) {
    const entry = await enqueueNotificationBatch({
      stateDir: params.stateDir,
      notification,
      taskId: params.task.id,
      runId: params.run.id,
      now: params.now,
    });
    await appendSageOsEvent(eventLog, {
      type: "notification_batched",
      actor: "sageos.notification_manager",
      summary: `Batched SageOS task notification for ${params.task.id}.`,
      taskId: params.task.id,
      runId: params.run.id,
    });
    return { outcome: "batched", target, notification, count: entry.count };
  }
  const sender = params.sender ?? sendMessageTelegram;
  try {
    const result = await sender(target, notification.text, { plainText: notification.text });
    await appendSageOsEvent(eventLog, {
      type: "notification_sent",
      actor: "sageos.notification_manager",
      summary: `Sent SageOS task notification for ${params.task.id} to ${target}.`,
      taskId: params.task.id,
      runId: params.run.id,
    });
    return {
      outcome: "sent",
      target,
      notification,
      messageId: result.messageId,
      chatId: result.chatId,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await appendSageOsEvent(eventLog, {
      type: "notification_failed",
      actor: "sageos.notification_manager",
      summary: `Failed to send SageOS task notification for ${params.task.id} to ${target}: ${error}`,
      taskId: params.task.id,
      runId: params.run.id,
    });
    return { outcome: "failed", target, notification, error };
  }
}

export async function sendSageOsLifecycleNotificationOnce(params: {
  kind: "startup" | "shutdown";
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  sender?: SageOsTelegramSender;
}): Promise<SageOsTelegramStatusNotificationResult> {
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(createSageOsStateStore({ stateDir: params.stateDir }), status);
  const notification = buildSageOsLifecycleNotification({
    kind: params.kind,
    status,
    cfg: params.cfg,
    target: params.target,
  });
  return sendStatusNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    notification,
    status,
    sender: params.sender,
    auditLabel: `SageOS ${params.kind}`,
  });
}

export async function sendSageOsIncidentNotificationOnce(params: {
  incidentId: string;
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  sender?: SageOsTelegramSender;
}): Promise<SageOsTelegramStatusNotificationResult> {
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(createSageOsStateStore({ stateDir: params.stateDir }), status);
  const incident = status.incidents.find((entry) => entry.id === params.incidentId);
  if (!incident) {
    throw new Error(`SageOS incident not found: ${params.incidentId}`);
  }
  const notification = buildSageOsIncidentNotification({
    incident,
    status,
    cfg: params.cfg,
    target: params.target,
  });
  return sendStatusNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    notification,
    status,
    sender: params.sender,
    auditLabel: `SageOS incident ${incident.id}`,
  });
}

export async function sendSageOsApprovalNotificationOnce(params: {
  approvalId: string;
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  sender?: SageOsTelegramSender;
}): Promise<SageOsTelegramStatusNotificationResult> {
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  const state = await readSageOsState(store);
  const approval = state.approvals.find((entry) => entry.id === params.approvalId);
  if (!approval) {
    throw new Error(`SageOS approval not found: ${params.approvalId}`);
  }
  const notification = buildSageOsApprovalNotification({
    approval,
    status,
    cfg: params.cfg,
    target: params.target,
  });
  return sendStatusNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    notification,
    status,
    sender: params.sender,
    auditLabel: `SageOS approval ${approval.id}`,
  });
}

export async function sendSageOsCompletionNotificationOnce(params: {
  reportId: string;
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  sender?: SageOsTelegramSender;
}): Promise<SageOsTelegramStatusNotificationResult> {
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  const state = await readSageOsState(store);
  const report = state.codingReports.find((entry) => entry.id === params.reportId);
  if (!report) {
    throw new Error(`SageOS coding report not found: ${params.reportId}`);
  }
  const notification = buildSageOsCompletionNotification({
    report,
    status,
    cfg: params.cfg,
    target: params.target,
  });
  if (
    shouldBatchCompletionNotification(params.cfg, report) &&
    params.cfg?.notifications?.telegram?.enabled &&
    notification.target
  ) {
    const entry = await enqueueNotificationBatch({
      stateDir: params.stateDir,
      notification,
      reportId: report.id,
    });
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "notification_batched",
      actor: "sageos.notification_manager",
      summary: `Batched SageOS completion notification for ${report.id}.`,
      taskId: report.taskId,
      runId: report.runId,
    });
    return {
      outcome: "batched",
      target: notification.target,
      notification,
      count: entry.count,
      status,
    };
  }
  return sendStatusNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    notification,
    status,
    sender: params.sender,
    auditLabel: `SageOS completion ${report.id}`,
  });
}

async function sendStatusNotification(params: {
  stateDir?: string;
  cfg?: SageOsConfig;
  notification: SageOsNotificationMessage;
  status: SageOsStatusSnapshot;
  sender?: SageOsTelegramSender;
  auditLabel: string;
}): Promise<SageOsTelegramStatusNotificationResult> {
  const eventLog = createSageOsEventLog({ stateDir: params.stateDir });
  if (!params.cfg?.notifications?.telegram?.enabled) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: `Skipped ${params.auditLabel} notification because Telegram notifications are disabled.`,
    });
    return { outcome: "skipped", reason: "telegram_disabled", status: params.status };
  }
  if (!params.notification.target) {
    await appendSageOsEvent(eventLog, {
      type: "notification_skipped",
      actor: "sageos.notification_manager",
      summary: `Skipped ${params.auditLabel} notification because no target is configured.`,
    });
    return {
      outcome: "skipped",
      reason: "missing_target",
      notification: params.notification,
      status: params.status,
    };
  }

  const sender = params.sender ?? sendMessageTelegram;
  try {
    const result = await sender(params.notification.target, params.notification.text, {
      plainText: params.notification.text,
    });
    await appendSageOsEvent(eventLog, {
      type: "notification_sent",
      actor: "sageos.notification_manager",
      summary: `Sent ${params.auditLabel} notification to ${params.notification.target}.`,
    });
    return {
      outcome: "sent",
      target: params.notification.target,
      notification: params.notification,
      messageId: result.messageId,
      chatId: result.chatId,
      status: params.status,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await appendSageOsEvent(eventLog, {
      type: "notification_failed",
      actor: "sageos.notification_manager",
      summary: `Failed to send ${params.auditLabel} notification to ${params.notification.target}: ${error}`,
    });
    return {
      outcome: "failed",
      target: params.notification.target,
      notification: params.notification,
      error,
      status: params.status,
    };
  }
}

function buildSageOsBatchedNotification(
  entries: SageOsNotificationBatchEntry[],
  target: string,
): SageOsNotificationMessage {
  const lines = [
    "SageOS: Batched updates",
    `Updates: ${entries.length}`,
    ...entries.flatMap((entry, index) => [
      "",
      `${index + 1}. ${entry.title}`,
      ...entry.text
        .split(/\r?\n/)
        .slice(1, 5)
        .map((line) => `   ${line}`),
    ]),
    "",
    "Actions: Open Command Center | Pause SageOS",
  ];
  return {
    kind: "digest",
    title: "SageOS: Batched updates",
    text: lines.join("\n"),
    target,
    redactedObservationCount: entries.reduce(
      (total, entry) => total + entry.redactedObservationCount,
      0,
    ),
  };
}

async function enqueueNotificationBatch(params: {
  stateDir?: string;
  queuePath?: string;
  notification: SageOsNotificationMessage;
  taskId?: string;
  runId?: string;
  reportId?: string;
  now?: () => Date;
}): Promise<{ entry: SageOsNotificationBatchEntry; count: number }> {
  const queuePath = params.queuePath ?? resolveSageOsNotificationBatchPath(params);
  const now = (params.now?.() ?? new Date()).toISOString();
  let entry: SageOsNotificationBatchEntry | undefined;
  let count = 0;
  await updateNotificationBatch(queuePath, (store) => {
    entry = {
      ...params.notification,
      id: `notification_batch_${randomUUID()}`,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      taskId: params.taskId,
      runId: params.runId,
      reportId: params.reportId,
    };
    store.entries.push(entry);
    count = store.entries.length;
  });
  if (!entry) {
    throw new Error("failed to enqueue SageOS notification batch entry");
  }
  return { entry, count };
}

async function clearNotificationBatch(queuePath: string, ids: Set<string>): Promise<void> {
  await updateNotificationBatch(queuePath, (store) => {
    store.entries = store.entries.filter((entry) => !ids.has(entry.id));
  });
}

async function updateNotificationBatch<T>(
  queuePath: string,
  update: (store: NotificationBatchFile) => T | Promise<T>,
): Promise<T> {
  return await withNotificationBatchLock(queuePath, async () => {
    const store = await loadNotificationBatch(queuePath);
    const result = await update(store);
    await saveNotificationBatch(queuePath, store);
    return result;
  });
}

async function withNotificationBatchLock<T>(queuePath: string, run: () => Promise<T>): Promise<T> {
  const previous = batchLocks.get(queuePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  const keepAlive = current.then(
    () => undefined,
    () => undefined,
  );
  batchLocks.set(queuePath, keepAlive);
  try {
    return await current;
  } finally {
    if (batchLocks.get(queuePath) === keepAlive) {
      batchLocks.delete(queuePath);
    }
  }
}

async function loadNotificationBatch(queuePath: string): Promise<NotificationBatchFile> {
  try {
    const raw = await fs.readFile(queuePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NotificationBatchFile>;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isNotificationBatchEntry) : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function saveNotificationBatch(
  queuePath: string,
  store: NotificationBatchFile,
): Promise<void> {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  const body = `${JSON.stringify({ version: 1, entries: store.entries }, null, 2)}\n`;
  if (process.platform === "win32") {
    await fs.writeFile(queuePath, body, "utf-8");
    return;
  }
  const tmp = `${queuePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, body, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tmp, queuePath);
    await fs.chmod(queuePath, 0o600);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

function isNotificationBatchEntry(input: unknown): input is SageOsNotificationBatchEntry {
  const entry = input as Partial<SageOsNotificationBatchEntry>;
  return (
    !!entry &&
    typeof entry.id === "string" &&
    entry.status === "pending" &&
    typeof entry.kind === "string" &&
    typeof entry.title === "string" &&
    typeof entry.text === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string" &&
    typeof entry.redactedObservationCount === "number"
  );
}

function shouldBatchTaskNotification(cfg: SageOsConfig | undefined, run: SageOsRun): boolean {
  return telegramBatchWindowMinutes(cfg) > 0 && run.state === "succeeded";
}

function shouldBatchCompletionNotification(
  cfg: SageOsConfig | undefined,
  report: SageOsCodingReport,
): boolean {
  return telegramBatchWindowMinutes(cfg) > 0 && report.outcome === "succeeded";
}

function telegramBatchWindowMinutes(cfg: SageOsConfig | undefined): number {
  const value = cfg?.notifications?.telegram?.batchWindowMinutes;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function telegramTarget(cfg: SageOsConfig | undefined): string | undefined {
  const target = cfg?.notifications?.telegram?.target?.trim();
  return target || undefined;
}

type TelegramQuietHours = NonNullable<
  NonNullable<NonNullable<SageOsConfig["notifications"]>["telegram"]>["quietHours"]
>;

function telegramQuietHours(cfg: SageOsConfig | undefined): TelegramQuietHours | undefined {
  const quietHours = cfg?.notifications?.telegram?.quietHours;
  const start = quietHours?.start.trim();
  const end = quietHours?.end.trim();
  if (!start || !end) {
    return undefined;
  }
  const timezone = quietHours?.timezone?.trim();
  return { start, end, ...(timezone ? { timezone } : {}) };
}

function isInsideQuietHours(now: Date, quietHours: TelegramQuietHours): boolean {
  const start = timeToMinutes(quietHours.start);
  const end = timeToMinutes(quietHours.end);
  if (start === undefined || end === undefined || start === end) {
    return false;
  }
  const current = localMinutes(now, quietHours.timezone);
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

function timeToMinutes(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function localMinutes(date: Date, timezone: string | undefined): number {
  if (!timezone) {
    return date.getHours() * 60 + date.getMinutes();
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function formatQuietHours(quietHours: TelegramQuietHours): string {
  return `${quietHours.start}-${quietHours.end}${quietHours.timezone ? ` ${quietHours.timezone}` : ""}`;
}

function riskSummary(task: SageOsTaskSpec): string {
  if (task.policyScopes.length === 0) {
    return "local:low";
  }
  return task.policyScopes.map((scope) => `${scope.kind}:${scope.risk ?? "low"}`).join(", ");
}

function digestObservations(
  observations: SageOsObservation[],
  cfg: SageOsConfig | undefined,
): { visible: SageOsObservation[]; redacted: number } {
  const allowPrivate = cfg?.privacy?.telegramPrivateContent === true;
  const recent = observations
    .filter((observation) => observation.state === "captured")
    .toSorted((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const visible = recent
    .filter((observation) => {
      if (observation.sensitivity === "secret") {
        return false;
      }
      return (
        allowPrivate || observation.sensitivity === "public" || observation.sensitivity === "normal"
      );
    })
    .slice(0, 3);
  const redacted = recent.length - visible.length;
  return { visible, redacted };
}

function nextAction(status: SageOsStatusSnapshot): string {
  if (status.approvals.pending > 0) {
    return `Next: review ${status.approvals.pending} pending approval${
      status.approvals.pending === 1 ? "" : "s"
    }.`;
  }
  if (status.incidents.length > 0) {
    return `Next: inspect ${status.incidents.length} incident${
      status.incidents.length === 1 ? "" : "s"
    }.`;
  }
  if (status.tasks.queued > 0) {
    return `Next: run or review ${status.tasks.queued} queued task${
      status.tasks.queued === 1 ? "" : "s"
    }.`;
  }
  return "Next: no urgent action.";
}
