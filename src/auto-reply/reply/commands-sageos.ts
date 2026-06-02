import type {
  CommandHandler,
  CommandHandlerResult,
  HandleCommandsParams,
} from "./commands-types.js";
import { logVerbose } from "../../globals.js";
import { resolveSageOsApproval } from "../../sageos/approvals.js";
import { appendSageOsEvent, createSageOsEventLog } from "../../sageos/event-log.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  writeSageOsControl,
  writeSageOsState,
} from "../../sageos/state-store.js";
import { renderSageOsStatus } from "../../sageos/status-renderer.js";
import { collectSageOsStatus } from "../../sageos/status.js";
import {
  createSageOsStatusSnapshot,
  type SageOsRun,
  type SageOsStatusSnapshot,
  type SageOsSupervisorStatus,
  type SageOsTaskSpec,
} from "../../sageos/types.js";

type SageOsCommandAction =
  | "status"
  | "pause"
  | "resume"
  | "stop"
  | "emergency-stop"
  | "tasks"
  | "task"
  | "approve"
  | "deny";

type SageOsControlState = "paused" | "running" | "stopped";

const CONTROL_ACTIONS = new Set<SageOsCommandAction>(["pause", "resume", "stop", "emergency-stop"]);

function parseSageOsCommand(commandBody: string): {
  action: SageOsCommandAction;
  target: string;
} | null {
  const match = commandBody.match(/^\/sageos(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return null;
  }
  const raw = match[1]?.trim() ?? "";
  if (!raw) {
    return { action: "status", target: "" };
  }
  const [actionToken = "", ...rest] = raw.split(/\s+/);
  const action = actionToken.toLowerCase() as SageOsCommandAction;
  if (
    ![
      "status",
      "pause",
      "resume",
      "stop",
      "emergency-stop",
      "tasks",
      "task",
      "approve",
      "deny",
    ].includes(action)
  ) {
    return { action: "status", target: raw };
  }
  return { action, target: rest.join(" ").trim() };
}

function usageReply(): CommandHandlerResult {
  return {
    shouldContinue: false,
    reply: {
      text:
        "SageOS controls:\n" +
        "- /sageos status\n" +
        "- /sageos pause [reason]\n" +
        "- /sageos resume [reason]\n" +
        "- /sageos stop [reason]\n" +
        "- /sageos emergency-stop [reason]\n" +
        "- /sageos tasks\n" +
        "- /sageos task <id>\n" +
        "- /sageos approve <approval-id> [reason]\n" +
        "- /sageos deny <approval-id> [reason]",
    },
  };
}

function supervisorStatusForControl(
  current: SageOsSupervisorStatus,
  state: SageOsControlState,
  opts: { emergency?: boolean } = {},
): SageOsSupervisorStatus {
  const now = new Date();
  const isStopped = state === "stopped";
  return {
    ...current,
    enabled: opts.emergency ? false : !isStopped,
    paused: state === "paused" || Boolean(opts.emergency),
    state,
    lastTickAt: state === "running" ? now.toISOString() : current.lastTickAt,
    nextTickAt: state === "running" ? new Date(now.getTime() + 30_000).toISOString() : undefined,
    stoppedAt: isStopped ? now.toISOString() : undefined,
  };
}

async function applySageOsControl(params: {
  state: SageOsControlState;
  reason: string;
  emergency?: boolean;
}): Promise<SageOsStatusSnapshot> {
  const stateStore = createSageOsStateStore();
  const controlStore = createSageOsControlStore();
  const eventLog = createSageOsEventLog();
  const current = await readSageOsState(stateStore);
  const status = createSageOsStatusSnapshot({
    ...current.status,
    supervisor: supervisorStatusForControl(current.status.supervisor, params.state, {
      emergency: params.emergency,
    }),
    audit: { ...current.status.audit, eventLogPath: eventLog.path },
  });
  const eventType = params.emergency
    ? "emergency_stop"
    : params.state === "running"
      ? "supervisor_resumed"
      : params.state === "paused"
        ? "supervisor_paused"
        : "supervisor_stopped";
  await writeSageOsState(stateStore, status);
  await writeSageOsControl(controlStore, {
    state: params.state,
    reason: params.reason,
    emergency: params.emergency,
  });
  await appendSageOsEvent(eventLog, {
    type: eventType,
    actor: "sageos.command",
    summary: `SageOS ${params.emergency ? "emergency stop" : params.state}: ${params.reason}`,
  });
  const refreshed = await collectSageOsStatus();
  await writeSageOsState(stateStore, refreshed);
  return refreshed;
}

function formatControlReply(action: SageOsCommandAction, status: SageOsStatusSnapshot): string {
  const state = status.supervisor.state;
  const suffix = `Supervisor: ${state}${status.supervisor.paused ? " (paused)" : ""}`;
  if (action === "pause") {
    return `SageOS paused\n${suffix}`;
  }
  if (action === "resume") {
    return `SageOS resumed\n${suffix}`;
  }
  if (action === "emergency-stop") {
    return `SageOS emergency stop engaged\n${suffix}`;
  }
  return `SageOS stopped\n${suffix}`;
}

function summarizePolicyScopes(task: SageOsTaskSpec): string {
  if (task.policyScopes.length === 0) {
    return "none";
  }
  return task.policyScopes
    .map((scope) => {
      const risk = scope.risk ? `/${scope.risk}` : "";
      const allow = scope.allow?.length ? ` ${scope.allow.join(", ")}` : "";
      return `${scope.kind}${risk}${allow}`;
    })
    .join("; ");
}

function sortByUpdatedAtDesc<T extends { updatedAt?: string; createdAt?: string }>(
  items: T[],
): T[] {
  return items.toSorted((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
    const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function formatTaskLine(task: SageOsTaskSpec): string {
  return `- ${task.id}: ${task.title} [${task.state}]`;
}

function formatTasks(tasks: SageOsTaskSpec[]): string {
  if (tasks.length === 0) {
    return "SageOS tasks: none";
  }
  const lines = sortByUpdatedAtDesc(tasks).slice(0, 10).map(formatTaskLine);
  return ["SageOS tasks", ...lines].join("\n");
}

function sortRuns(runs: SageOsRun[]): SageOsRun[] {
  return runs.toSorted((a, b) => b.attempt - a.attempt);
}

function formatTaskDetail(task: SageOsTaskSpec, runs: SageOsRun[]): string {
  const lines = [
    `SageOS task ${task.id}`,
    `Title: ${task.title}`,
    `State: ${task.state}`,
    `Objective: ${task.objective}`,
    `Requested by: ${task.requestedBy}`,
    `Autonomy: ${task.autonomyTier}`,
    `Policy: ${summarizePolicyScopes(task)}`,
  ];
  const taskRuns = sortRuns(runs.filter((run) => run.taskId === task.id)).slice(0, 5);
  if (taskRuns.length > 0) {
    lines.push("Runs:");
    for (const run of taskRuns) {
      lines.push(`- ${run.id}: ${run.state} attempt ${run.attempt}`);
    }
  }
  return lines.join("\n");
}

function parseApprovalTarget(target: string): { id: string; reason?: string } | undefined {
  const [id = "", ...reasonParts] = target.trim().split(/\s+/);
  const trimmedId = id.trim();
  if (!trimmedId) {
    return undefined;
  }
  const reason = reasonParts.join(" ").trim();
  return { id: trimmedId, ...(reason ? { reason } : {}) };
}

export const handleSageOsCommand: CommandHandler = async (
  params: HandleCommandsParams,
  allowTextCommands: boolean,
) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsed = parseSageOsCommand(params.command.commandBodyNormalized);
  if (!parsed) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /sageos from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  if (parsed.action === "status") {
    if (parsed.target) {
      return usageReply();
    }
    const status = await collectSageOsStatus();
    return { shouldContinue: false, reply: { text: renderSageOsStatus(status) } };
  }

  if (CONTROL_ACTIONS.has(parsed.action)) {
    const state =
      parsed.action === "resume" ? "running" : parsed.action === "pause" ? "paused" : "stopped";
    const reason = parsed.target || params.command.surface || "command";
    const status = await applySageOsControl({
      state,
      reason,
      emergency: parsed.action === "emergency-stop",
    });
    return {
      shouldContinue: false,
      reply: { text: formatControlReply(parsed.action, status) },
    };
  }

  if (parsed.action === "approve" || parsed.action === "deny") {
    const approvalTarget = parseApprovalTarget(parsed.target);
    if (!approvalTarget) {
      return usageReply();
    }
    const result = await resolveSageOsApproval({
      id: approvalTarget.id,
      decision: parsed.action === "approve" ? "approved" : "denied",
      actor: "sageos.command",
      reason: approvalTarget.reason || params.command.surface || "command",
    });
    if (result.outcome === "not_found") {
      return {
        shouldContinue: false,
        reply: { text: `SageOS approval not found: ${result.id}` },
      };
    }
    if (result.outcome === "not_pending") {
      return {
        shouldContinue: false,
        reply: {
          text: `SageOS approval not pending: ${result.approval.id} (${result.approval.state})`,
        },
      };
    }
    const lines = [
      `SageOS approval ${result.approval.state}`,
      `Approval: ${result.approval.id}`,
      `Risk: ${result.approval.riskClass}`,
      `Reason: ${result.approval.resolutionReason ?? "manual"}`,
    ];
    if (result.task) {
      lines.push(`Task: ${result.task.id} ${result.task.state}`);
    }
    return { shouldContinue: false, reply: { text: lines.join("\n") } };
  }

  const store = createSageOsStateStore();
  const state = await readSageOsState(store);
  if (parsed.action === "tasks") {
    if (parsed.target) {
      return usageReply();
    }
    return { shouldContinue: false, reply: { text: formatTasks(state.tasks) } };
  }

  if (!parsed.target) {
    return usageReply();
  }
  const task = state.tasks.find((candidate) => candidate.id === parsed.target);
  if (!task) {
    return {
      shouldContinue: false,
      reply: { text: `SageOS task not found: ${parsed.target}` },
    };
  }
  return {
    shouldContinue: false,
    reply: { text: formatTaskDetail(task, state.runs) },
  };
};
