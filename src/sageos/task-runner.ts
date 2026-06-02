import type {
  SageOsApproval,
  SageOsConfig,
  SageOsRun,
  SageOsRunBudgetUsage,
  SageOsRunTimelineEvent,
  SageOsRunVerificationResult,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { createSageOsTaskApproval } from "./approvals.js";
import { describeSageOsBudgetViolations } from "./budget.js";
import { runSageOsNightShiftTask } from "./coding/night-shift.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  sendSageOsCompletionNotificationOnce,
  sendSageOsTaskNotificationOnce,
} from "./notifications.js";
import { evaluateSageOsAutonomyTier } from "./policy.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsRun,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { applySageOsTaskExecutionContract } from "./task-contract.js";

export type SageOsTaskExecutorResult = {
  summary?: string;
  logs?: string[];
  artifacts?: string[];
  verificationResult?: SageOsRunVerificationResult;
  budgetUsed?: SageOsRunBudgetUsage;
  timeline?: SageOsRunTimelineEvent[];
  toolCalls?: number;
  costUsd?: number;
};

export type SageOsTaskExecutor = (ctx: {
  task: SageOsTaskSpec;
  run: SageOsRun;
  stateDir?: string;
}) => Promise<SageOsTaskExecutorResult | void>;

export type SageOsTaskRunnerResult =
  | {
      outcome: "idle";
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "completed" | "failed" | "blocked";
      task: SageOsTaskSpec;
      run?: SageOsRun;
      approval?: SageOsApproval;
      status: SageOsStatusSnapshot;
    };

export async function runNextSageOsTaskOnce(
  params: {
    stateDir?: string;
    stateStore?: SageOsStateStore;
    requestedBy?: string;
    executor?: SageOsTaskExecutor;
    notify?: boolean;
    cfg?: SageOsConfig;
    sendTaskNotificationOnce?: typeof sendSageOsTaskNotificationOnce;
    sendCompletionNotificationOnce?: typeof sendSageOsCompletionNotificationOnce;
    now?: () => Date;
  } = {},
): Promise<SageOsTaskRunnerResult> {
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const queuedTask = state.tasks.find((entry) => entry.state === "queued");
  if (!queuedTask) {
    const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
    await writeSageOsState(store, status);
    return { outcome: "idle", status };
  }

  const now = (params.now?.() ?? new Date()).toISOString();
  const requestedBy = params.requestedBy?.trim() || "sageos.task_runner";
  const task = applySageOsTaskExecutionContract(queuedTask);
  await upsertSageOsTask(store, task);
  const autonomyDecision = evaluateSageOsAutonomyTier(task.autonomyTier, params.cfg);
  if (!autonomyDecision.allowed && !hasApprovedAutonomyApproval(task, state.approvals)) {
    const blockedTask: SageOsTaskSpec = {
      ...task,
      state: "waiting_for_policy",
      updatedAt: now,
    };
    const approval = createSageOsTaskApproval(blockedTask, autonomyDecision.riskClass, {
      requestedBy,
      now,
      reason: autonomyDecision.reason,
    });
    await upsertSageOsTask(store, blockedTask);
    await upsertSageOsApproval(store, approval);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "approval_requested",
      actor: requestedBy,
      summary: `Requested approval ${approval.id} before running SageOS task ${task.id}: ${autonomyDecision.reason}`,
      taskId: task.id,
    });
    const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
    await writeSageOsState(store, status);
    return { outcome: "blocked", task: blockedTask, approval, status };
  }
  const attempt =
    state.runs
      .filter((run) => run.taskId === task.id)
      .reduce((max, run) => Math.max(max, run.attempt), 0) + 1;
  if (!params.executor && task.execution?.kind === "coding") {
    try {
      const result = await runSageOsNightShiftTask({
        taskId: task.id,
        stateDir: params.stateDir,
        stateStore: store,
        cfg: params.cfg,
        append: task.execution.append,
        testCommand: task.execution.testCommand,
        requestedBy,
        now: params.now,
      });
      await maybeSendTaskNotification(params, result.task, result.run);
      await maybeSendCompletionNotification(params, result.report.id);
      return {
        outcome:
          result.outcome === "succeeded"
            ? "completed"
            : result.outcome === "blocked"
              ? "blocked"
              : "failed",
        task: result.task,
        run: result.run,
        status: result.status,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failedTask: SageOsTaskSpec = { ...task, state: "failed", updatedAt: now };
      const failedRun = failRun(createTaskRun(task, attempt, now), task, now, error, {
        toolCalls: 0,
      });
      await upsertSageOsTask(store, failedTask);
      await upsertSageOsRun(store, failedRun);
      await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
        type: "task_failed",
        actor: requestedBy,
        summary: `Failed SageOS task ${task.id}: ${error}`,
        taskId: task.id,
        runId: failedRun.id,
        traceId: failedRun.traceId,
      });
      await maybeSendTaskNotification(params, failedTask, failedRun);
      const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
      await writeSageOsState(store, status);
      return { outcome: "failed", task: failedTask, run: failedRun, status };
    }
  }

  const run = createTaskRun(task, attempt, now);
  const runningTask: SageOsTaskSpec = { ...task, state: "running", updatedAt: now };
  await upsertSageOsTask(store, runningTask);
  await upsertSageOsRun(store, run);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "task_run_started",
    actor: requestedBy,
    summary: `Started SageOS task ${task.id} run ${run.id}`,
    taskId: task.id,
    runId: run.id,
    traceId: run.traceId,
  });

  try {
    const execution = await (params.executor ?? dryRunExecutor)({
      task: runningTask,
      run,
      stateDir: params.stateDir,
    });
    const finishedAt = (params.now?.() ?? new Date()).toISOString();
    const budgetUsed = executorBudgetUsage(run, finishedAt, execution);
    const budgetViolations = describeSageOsBudgetViolations(runningTask.budget, budgetUsed);
    if (budgetViolations.length > 0) {
      const error = `Task budget exceeded: ${budgetViolations.join(", ")}`;
      const failedTask: SageOsTaskSpec = { ...runningTask, state: "failed", updatedAt: finishedAt };
      const failedRun = failRun(
        run,
        runningTask,
        finishedAt,
        error,
        budgetUsed,
        budgetViolations.some((violation) => violation.startsWith("elapsed minutes"))
          ? "timed_out"
          : "failed",
      );
      await upsertSageOsTask(store, failedTask);
      await upsertSageOsRun(store, failedRun);
      await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
        type: "task_budget_exhausted",
        actor: requestedBy,
        summary: `SageOS task ${task.id} exceeded budget: ${budgetViolations.join(", ")}`,
        taskId: task.id,
        runId: run.id,
        traceId: run.traceId,
      });
      await maybeSendTaskNotification(params, failedTask, failedRun);
      const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
      await writeSageOsState(store, status);
      return { outcome: "failed", task: failedTask, run: failedRun, status };
    }
    const completedTask: SageOsTaskSpec = {
      ...runningTask,
      state: "completed",
      updatedAt: finishedAt,
    };
    const completedRun = completeRun(run, runningTask, finishedAt, execution, budgetUsed);
    await upsertSageOsTask(store, completedTask);
    await upsertSageOsRun(store, completedRun);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "task_completed",
      actor: requestedBy,
      summary: `Completed SageOS task ${task.id}: ${execution?.summary ?? "dry run completed"}`,
      taskId: task.id,
      runId: run.id,
      traceId: run.traceId,
    });
    await maybeSendTaskNotification(params, completedTask, completedRun);
    const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
    await writeSageOsState(store, status);
    return { outcome: "completed", task: completedTask, run: completedRun, status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const finishedAt = (params.now?.() ?? new Date()).toISOString();
    const failedTask: SageOsTaskSpec = { ...runningTask, state: "failed", updatedAt: finishedAt };
    const failedRun = failRun(run, runningTask, finishedAt, error);
    await upsertSageOsTask(store, failedTask);
    await upsertSageOsRun(store, failedRun);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "task_failed",
      actor: requestedBy,
      summary: `Failed SageOS task ${task.id}: ${error}`,
      taskId: task.id,
      runId: run.id,
      traceId: run.traceId,
    });
    await maybeSendTaskNotification(params, failedTask, failedRun);
    const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
    await writeSageOsState(store, status);
    return { outcome: "failed", task: failedTask, run: failedRun, status };
  }
}

function createTaskRun(task: SageOsTaskSpec, attempt: number, startedAt: string): SageOsRun {
  const slug = safeId(task.id);
  const id = `run_${slug}_${attempt}`;
  return {
    id,
    taskId: task.id,
    attempt,
    state: "running",
    traceId: `trace_run_${slug}_${attempt}`,
    workerSessionId: `worker_${slug}_${attempt}`,
    currentToolCall: "dry-run executor",
    budgetUsed: { elapsedMinutes: 0, toolCalls: 0 },
    timeline: [
      {
        at: startedAt,
        label: `Started SageOS task ${task.id}`,
        state: "running",
        ref: id,
      },
    ],
    logs: [`Started SageOS task ${task.id} run ${id}`],
    artifacts: [],
    verificationResult: {
      outcome: "skipped",
      summary: "Verification has not run yet.",
      refs: [],
    },
    startedAt,
  };
}

function hasApprovedAutonomyApproval(task: SageOsTaskSpec, approvals: SageOsApproval[]): boolean {
  return approvals.some(
    (approval) =>
      approval.taskId === task.id &&
      approval.state === "approved" &&
      approval.riskClass === "policy_change",
  );
}

function completeRun(
  run: SageOsRun,
  task: SageOsTaskSpec,
  finishedAt: string,
  execution: SageOsTaskExecutorResult | void,
  budgetUsed = executorBudgetUsage(run, finishedAt, execution),
): SageOsRun {
  const summary = execution?.summary?.trim() || "dry run completed";
  return {
    ...run,
    state: "succeeded",
    finishedAt,
    currentToolCall: undefined,
    logs: [
      ...(run.logs ?? []),
      ...(execution?.logs ?? []),
      `Completed SageOS task ${task.id}: ${summary}`,
    ],
    artifacts: uniqueStrings(execution?.artifacts ?? task.evidenceRefs ?? []),
    budgetUsed,
    timeline: [
      ...(run.timeline ?? []),
      ...(execution?.timeline ?? []),
      {
        at: finishedAt,
        label: `Completed SageOS task ${task.id}`,
        state: "succeeded",
        ref: run.id,
      },
    ],
    verificationResult:
      execution?.verificationResult ??
      ({
        outcome: "passed",
        summary,
        refs: uniqueStrings(task.verificationPlan ?? []),
      } satisfies SageOsRunVerificationResult),
  };
}

function failRun(
  run: SageOsRun,
  task: SageOsTaskSpec,
  finishedAt: string,
  error: string,
  usage: SageOsRunBudgetUsage = { toolCalls: 1 },
  state: SageOsRun["state"] = "failed",
): SageOsRun {
  return {
    ...run,
    state,
    finishedAt,
    error,
    currentToolCall: undefined,
    logs: [...(run.logs ?? []), `Failed SageOS task ${task.id}: ${error}`],
    artifacts: run.artifacts ?? [],
    budgetUsed: runBudgetUsage(run, finishedAt, usage),
    timeline: [
      ...(run.timeline ?? []),
      {
        at: finishedAt,
        label: `Failed SageOS task ${task.id}`,
        state: "failed",
        ref: run.id,
      },
    ],
    verificationResult: {
      outcome: "failed",
      summary: error,
      refs: [],
    },
  };
}

async function maybeSendTaskNotification(
  params: {
    stateDir?: string;
    notify?: boolean;
    cfg?: SageOsConfig;
    sendTaskNotificationOnce?: typeof sendSageOsTaskNotificationOnce;
  },
  task: SageOsTaskSpec,
  run: SageOsRun,
): Promise<void> {
  if (!params.notify) {
    return;
  }
  const sendTaskNotification = params.sendTaskNotificationOnce ?? sendSageOsTaskNotificationOnce;
  await sendTaskNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    task,
    run,
  });
}

async function maybeSendCompletionNotification(
  params: {
    stateDir?: string;
    notify?: boolean;
    cfg?: SageOsConfig;
    sendCompletionNotificationOnce?: typeof sendSageOsCompletionNotificationOnce;
  },
  reportId: string,
): Promise<void> {
  if (!params.notify) {
    return;
  }
  const sendCompletionNotification =
    params.sendCompletionNotificationOnce ?? sendSageOsCompletionNotificationOnce;
  await sendCompletionNotification({
    stateDir: params.stateDir,
    cfg: params.cfg,
    reportId,
  });
}

async function dryRunExecutor(ctx: { task: SageOsTaskSpec }): Promise<SageOsTaskExecutorResult> {
  return { summary: `dry-run executor accepted ${ctx.task.id}` };
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function executorBudgetUsage(
  run: SageOsRun,
  finishedAt: string,
  execution: SageOsTaskExecutorResult | void,
): SageOsRunBudgetUsage {
  const usage: SageOsRunBudgetUsage = {};
  const elapsedMinutes = execution?.budgetUsed?.elapsedMinutes;
  if (elapsedMinutes !== undefined) {
    usage.elapsedMinutes = elapsedMinutes;
  }
  usage.toolCalls = execution?.budgetUsed?.toolCalls ?? execution?.toolCalls ?? 1;
  const costUsd = execution?.budgetUsed?.costUsd ?? execution?.costUsd;
  if (costUsd !== undefined) {
    usage.costUsd = costUsd;
  }
  return runBudgetUsage(run, finishedAt, usage);
}

function runBudgetUsage(
  run: SageOsRun,
  finishedAt: string,
  usage: SageOsRunBudgetUsage = {},
): SageOsRunBudgetUsage {
  return {
    elapsedMinutes: usage.elapsedMinutes ?? elapsedMinutes(run.startedAt, finishedAt),
    toolCalls: usage.toolCalls ?? run.budgetUsed?.toolCalls ?? 0,
    ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
  };
}

function elapsedMinutes(startedAt: string | undefined, finishedAt: string): number {
  const started = Date.parse(startedAt ?? finishedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    return 0;
  }
  return Math.max(0, Math.ceil((finished - started) / 60_000));
}
