import type {
  SageOsConfig,
  SageOsObservation,
  SageOsRun,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  writeSageOsState,
  type SageOsPersistedState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsNotificationKind = "digest" | "task";

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

export type SageOsTelegramTaskResult =
  | {
      outcome: "sent";
      target: string;
      notification: SageOsNotificationMessage;
      messageId?: string;
      chatId?: string;
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

export async function sendSageOsTaskNotificationOnce(params: {
  stateDir?: string;
  cfg?: SageOsConfig;
  target?: string;
  task: SageOsTaskSpec;
  run: SageOsRun;
  sender?: SageOsTelegramSender;
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

function telegramTarget(cfg: SageOsConfig | undefined): string | undefined {
  const target = cfg?.notifications?.telegram?.target?.trim();
  return target || undefined;
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
