import type {
  SageOsConfig,
  SageOsRun,
  SageOsRunVerificationResult,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { runSageOsNightShiftTask } from "./coding/night-shift.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import { sendSageOsTaskNotificationOnce } from "./notifications.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsRun,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsTaskExecutorResult = {
  summary?: string;
  logs?: string[];
  artifacts?: string[];
  verificationResult?: SageOsRunVerificationResult;
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
      run: SageOsRun;
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
    now?: () => Date;
  } = {},
): Promise<SageOsTaskRunnerResult> {
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const task = state.tasks.find((entry) => entry.state === "queued");
  if (!task) {
    const status = await collectSageOsStatus({ stateDir: params.stateDir });
    await writeSageOsState(store, status);
    return { outcome: "idle", status };
  }

  const now = (params.now?.() ?? new Date()).toISOString();
  const requestedBy = params.requestedBy?.trim() || "sageos.task_runner";
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
      const failedRun = failRun(createTaskRun(task, attempt, now), task, now, error);
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
    const completedTask: SageOsTaskSpec = {
      ...runningTask,
      state: "completed",
      updatedAt: finishedAt,
    };
    const completedRun = completeRun(run, runningTask, finishedAt, execution);
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
    const status = await collectSageOsStatus({ stateDir: params.stateDir });
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
    const status = await collectSageOsStatus({ stateDir: params.stateDir });
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

function completeRun(
  run: SageOsRun,
  task: SageOsTaskSpec,
  finishedAt: string,
  execution: SageOsTaskExecutorResult | void,
): SageOsRun {
  const summary = execution?.summary?.trim() || "dry run completed";
  return {
    ...run,
    state: "succeeded",
    finishedAt,
    logs: [
      ...(run.logs ?? []),
      ...(execution?.logs ?? []),
      `Completed SageOS task ${task.id}: ${summary}`,
    ],
    artifacts: uniqueStrings(execution?.artifacts ?? task.evidenceRefs ?? []),
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
): SageOsRun {
  return {
    ...run,
    state: "failed",
    finishedAt,
    error,
    logs: [...(run.logs ?? []), `Failed SageOS task ${task.id}: ${error}`],
    artifacts: run.artifacts ?? [],
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

async function dryRunExecutor(ctx: { task: SageOsTaskSpec }): Promise<{ summary: string }> {
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
