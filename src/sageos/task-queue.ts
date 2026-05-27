import type {
  SageOsApproval,
  SageOsApprovalRiskClass,
  SageOsPolicyScope,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsTaskQueueResult = {
  outcome: "queued" | "approval_required";
  task: SageOsTaskSpec;
  approval?: SageOsApproval;
  status: SageOsStatusSnapshot;
};

export async function queueSageOsTask(params: {
  taskId: string;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  requestedBy?: string;
  reason?: string;
  now?: () => Date;
}): Promise<SageOsTaskQueueResult> {
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const task = state.tasks.find((entry) => entry.id === params.taskId);
  if (!task) {
    throw new Error(`SageOS task not found: ${params.taskId}`);
  }
  if (task.state !== "proposed" && task.state !== "blocked") {
    throw new Error(`SageOS task is not queueable: ${params.taskId}`);
  }

  const now = (params.now?.() ?? new Date()).toISOString();
  const requestedBy = params.requestedBy?.trim() || "sageos.task_queue";
  const riskClass = requiredApprovalRisk(task.policyScopes);
  const nextTask: SageOsTaskSpec = {
    ...task,
    state: riskClass ? "waiting_for_policy" : "queued",
    updatedAt: now,
  };
  await upsertSageOsTask(store, nextTask);

  let approval: SageOsApproval | undefined;
  if (riskClass) {
    approval = approvalForTask(nextTask, riskClass, { requestedBy, now });
    await upsertSageOsApproval(store, approval);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "approval_requested",
      actor: requestedBy,
      summary: `Requested approval ${approval.id} before queueing SageOS task ${task.id}: ${
        params.reason ?? "policy required"
      }`,
      taskId: task.id,
    });
  } else {
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "task_queued",
      actor: requestedBy,
      summary: `Queued SageOS task ${task.id}: ${params.reason ?? "policy allowed"}`,
      taskId: task.id,
    });
  }

  const status = await collectSageOsStatus({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  return { outcome: riskClass ? "approval_required" : "queued", task: nextTask, approval, status };
}

function approvalForTask(
  task: SageOsTaskSpec,
  riskClass: SageOsApprovalRiskClass,
  opts: { requestedBy: string; now: string },
): SageOsApproval {
  return {
    id: `approval_task_${safeId(task.id)}`,
    state: "pending",
    riskClass,
    title: `Approve SageOS task: ${task.title}`,
    proposedAction: `Queue SageOS task ${task.id}: ${task.objective}`,
    evidence: [task.id],
    preview: task.objective,
    rollbackPlan: "Cancel the task before it runs.",
    scope: "task",
    taskId: task.id,
    requestedBy: opts.requestedBy,
    requestedAt: opts.now,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

function requiredApprovalRisk(scopes: SageOsPolicyScope[]): SageOsApprovalRiskClass | undefined {
  for (const scope of scopes) {
    if (scope.risk === "high" || scope.risk === "critical") {
      return riskClassForScope(scope);
    }
    if (scope.risk === "medium" && ["channel", "network", "system"].includes(scope.kind)) {
      return riskClassForScope(scope);
    }
  }
  return undefined;
}

function riskClassForScope(scope: SageOsPolicyScope): SageOsApprovalRiskClass {
  if (scope.kind === "channel" || scope.kind === "network") {
    return "external_write";
  }
  if (scope.kind === "system") {
    return "windows_setting";
  }
  if (scope.kind === "memory") {
    return "private_data_export";
  }
  if (scope.kind === "file" || scope.kind === "repo") {
    return "destructive";
  }
  return "policy_change";
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
