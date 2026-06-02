import type {
  SageOsApproval,
  SageOsConfig,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { createSageOsTaskApproval } from "./approvals.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import { requiredSageOsApprovalRisk } from "./policy.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { applySageOsTaskExecutionContract } from "./task-contract.js";

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
  cfg?: SageOsConfig;
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
  const riskClass = requiredSageOsApprovalRisk(task.policyScopes, params.cfg);
  const nextTask = applySageOsTaskExecutionContract({
    ...task,
    state: riskClass ? "waiting_for_policy" : "queued",
    updatedAt: now,
  });
  await upsertSageOsTask(store, nextTask);

  let approval: SageOsApproval | undefined;
  if (riskClass) {
    approval = createSageOsTaskApproval(nextTask, riskClass, { requestedBy, now });
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

  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(store, status);
  return { outcome: riskClass ? "approval_required" : "queued", task: nextTask, approval, status };
}
