import type { SageOsApproval, SageOsApprovalRiskClass, SageOsTaskSpec } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsTask,
  type SageOsStateStore,
} from "./state-store.js";

export type SageOsApprovalDecision = "approved" | "denied";

export type ResolveSageOsApprovalResult =
  | {
      outcome: "resolved";
      approval: SageOsApproval;
      task?: SageOsTaskSpec;
    }
  | {
      outcome: "not_found";
      id: string;
    }
  | {
      outcome: "not_pending";
      approval: SageOsApproval;
    };

export function createSageOsTaskApproval(
  task: SageOsTaskSpec,
  riskClass: SageOsApprovalRiskClass,
  opts: { requestedBy: string; now: string; reason?: string },
): SageOsApproval {
  return {
    id: `approval_task_${safeId(task.id)}`,
    state: "pending",
    riskClass,
    title: `Approve SageOS task: ${task.title}`,
    proposedAction: `Queue SageOS task ${task.id}: ${task.objective}`,
    evidence: [task.id],
    preview: opts.reason ?? task.objective,
    rollbackPlan: "Cancel the task before it runs.",
    scope: "task",
    taskId: task.id,
    requestedBy: opts.requestedBy,
    requestedAt: opts.now,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

export async function resolveSageOsApproval(params: {
  id: string;
  decision: SageOsApprovalDecision;
  actor: string;
  reason?: string;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now?: () => Date;
}): Promise<ResolveSageOsApprovalResult> {
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(stateStore);
  const approval = state.approvals.find((entry) => entry.id === params.id);
  if (!approval) {
    return { outcome: "not_found", id: params.id };
  }
  if (approval.state !== "pending") {
    return { outcome: "not_pending", approval };
  }

  const now = (params.now?.() ?? new Date()).toISOString();
  const nextApproval: SageOsApproval = {
    ...approval,
    state: params.decision,
    resolvedAt: now,
    resolvedBy: params.actor,
    resolutionReason: params.reason?.trim() || "manual",
    updatedAt: now,
  };
  await upsertSageOsApproval(stateStore, nextApproval);

  const task = resolveLinkedTask({
    tasks: state.tasks,
    approval: nextApproval,
    decision: params.decision,
    now,
  });
  if (task) {
    await upsertSageOsTask(stateStore, task);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: task.state === "queued" ? "task_queued" : "task_blocked",
      actor: params.actor,
      summary: `${task.state === "queued" ? "Queued" : "Blocked"} SageOS task ${task.id} after approval ${nextApproval.id} was ${params.decision}.`,
      taskId: task.id,
      sensitivity: "normal",
    });
  }

  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "approval_resolved",
    actor: params.actor,
    summary: `Resolved SageOS approval ${params.id} as ${params.decision}: ${nextApproval.resolutionReason}`,
    taskId: nextApproval.taskId,
    runId: nextApproval.runId,
  });

  return { outcome: "resolved", approval: nextApproval, ...(task ? { task } : {}) };
}

function safeId(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return safe || "task";
}

function resolveLinkedTask(params: {
  tasks: SageOsTaskSpec[];
  approval: SageOsApproval;
  decision: SageOsApprovalDecision;
  now: string;
}): SageOsTaskSpec | undefined {
  if (!params.approval.taskId) {
    return undefined;
  }
  const task = params.tasks.find((entry) => entry.id === params.approval.taskId);
  if (!task || task.state !== "waiting_for_policy") {
    return undefined;
  }
  return {
    ...task,
    state: params.decision === "approved" ? "queued" : "blocked",
    updatedAt: params.now,
  };
}
