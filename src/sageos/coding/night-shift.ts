import { appendFile } from "node:fs/promises";
import type {
  SageOsCodingReport,
  SageOsCodingReportOutcome,
  SageOsCodingTestResult,
  SageOsConfig,
  SageOsRun,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "../types.js";
import { appendSageOsEvent, createSageOsEventLog } from "../event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsCodingReport,
  upsertSageOsRun,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "../state-store.js";
import { collectSageOsStatus } from "../status.js";
import {
  assertRelativeRepoPath,
  captureSageOsRepoDiff,
  execFileCommandRunner,
  isAllowedRepo,
  parseCommandLine,
  readSageOsRepoState,
  type SageOsCommandRunner,
} from "./repo-state.js";

export type SageOsNightShiftAppend = {
  relativePath: string;
  text: string;
};

export type SageOsNightShiftResult = {
  outcome: SageOsCodingReportOutcome;
  task: SageOsTaskSpec;
  run: SageOsRun;
  report: SageOsCodingReport;
  status: SageOsStatusSnapshot;
};

export async function runSageOsNightShiftTask(params: {
  taskId: string;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  cfg?: SageOsConfig;
  append?: SageOsNightShiftAppend;
  testCommand?: string;
  requestedBy?: string;
  runner?: SageOsCommandRunner;
  now?: () => Date;
}): Promise<SageOsNightShiftResult> {
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const task = state.tasks.find((entry) => entry.id === params.taskId);
  if (!task) {
    throw new Error(`SageOS task not found: ${params.taskId}`);
  }
  if (task.state !== "queued") {
    throw new Error(`SageOS coding task is not queued: ${params.taskId}`);
  }
  if (params.cfg?.coding?.enabled !== true) {
    throw new Error("SageOS coding is disabled.");
  }
  const repoPath = resolveTaskRepo(task);
  if (!repoPath || !isAllowedRepo(repoPath, params.cfg.coding.allowedRepos ?? [])) {
    throw new Error(`SageOS coding task repo is not allowed: ${repoPath || "missing"}`);
  }

  const runner = params.runner ?? execFileCommandRunner;
  const startedAt = (params.now?.() ?? new Date()).toISOString();
  const requestedBy = params.requestedBy?.trim() || "sageos.night_shift";
  const attempt =
    state.runs
      .filter((run) => run.taskId === task.id)
      .reduce((max, run) => Math.max(max, run.attempt), 0) + 1;
  const run = createCodingRun(task, attempt, startedAt);
  const runningTask: SageOsTaskSpec = { ...task, state: "running", updatedAt: startedAt };
  await upsertSageOsTask(store, runningTask);
  await upsertSageOsRun(store, run);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "coding_task_started",
    actor: requestedBy,
    summary: `Started SageOS coding task ${task.id} in ${repoPath}`,
    taskId: task.id,
    runId: run.id,
    traceId: run.traceId,
  });

  const preState = await readSageOsRepoState({ repoPath, runner });
  const blockers: string[] = [];
  const requireCleanGit = params.cfg.coding.requireCleanGit !== false;
  if (requireCleanGit && preState.dirty) {
    blockers.push(
      `Repo is dirty and requireCleanGit is enabled: ${preState.changedFiles.join(", ")}`,
    );
  }

  let tests: SageOsCodingTestResult[] = [];
  if (blockers.length === 0) {
    if (params.append) {
      const target = assertRelativeRepoPath(repoPath, params.append.relativePath);
      await appendFile(target, params.append.text, "utf8");
    }
    if (params.testCommand?.trim()) {
      tests = [await runTestCommand(repoPath, params.testCommand, runner)];
      const failedTests = tests.filter((test) => test.exitCode !== 0);
      if (failedTests.length > 0) {
        blockers.push(
          `Test command failed (${failedTests[0]?.exitCode ?? 1}): ${failedTests[0]?.command}`,
        );
      }
    }
  }

  const postState = await readSageOsRepoState({ repoPath, runner });
  const diff = await captureSageOsRepoDiff({
    repoPath,
    changedFiles: postState.changedFiles,
    runner,
  });
  const finishedAt = (params.now?.() ?? new Date()).toISOString();
  const outcome: SageOsCodingReportOutcome =
    blockers.length === 0 ? "succeeded" : preState.dirty && requireCleanGit ? "blocked" : "failed";
  const report: SageOsCodingReport = {
    id: `coding_report_${safeId(task.id)}_${attempt}`,
    taskId: task.id,
    runId: run.id,
    repoPath,
    objective: task.objective,
    outcome,
    startedAt,
    finishedAt,
    preState,
    postState,
    diff,
    tests,
    blockers,
    verificationRefs: tests.map((test) => `test:${test.command}`),
    rollback: "Review git diff and revert changed files if needed.",
    createdAt: startedAt,
    updatedAt: finishedAt,
  };
  await upsertSageOsCodingReport(store, report);

  const completionSummary = blockers[0] ?? `${diff.changedFiles.length} file(s) changed`;
  const finalTask: SageOsTaskSpec = {
    ...runningTask,
    state: outcome === "succeeded" ? "completed" : outcome === "blocked" ? "blocked" : "failed",
    updatedAt: finishedAt,
  };
  const finalRun: SageOsRun = {
    ...run,
    state: outcome === "succeeded" ? "succeeded" : "failed",
    finishedAt,
    error: blockers.length > 0 ? blockers.join("; ") : undefined,
    logs: [
      ...(run.logs ?? []),
      `${outcome === "succeeded" ? "Completed" : outcome === "blocked" ? "Blocked" : "Failed"} SageOS coding task ${task.id}: ${completionSummary}`,
    ],
    artifacts: [report.id],
    verificationResult: {
      outcome: outcome === "succeeded" ? "passed" : "failed",
      summary: formatCodingVerificationSummary(tests, completionSummary),
      refs: report.verificationRefs,
    },
  };
  await upsertSageOsTask(store, finalTask);
  await upsertSageOsRun(store, finalRun);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type:
      outcome === "succeeded"
        ? "coding_task_completed"
        : outcome === "blocked"
          ? "coding_task_blocked"
          : "coding_task_failed",
    actor: requestedBy,
    summary: `SageOS coding task ${task.id} ${outcome}: ${completionSummary}`,
    taskId: task.id,
    runId: run.id,
    traceId: run.traceId,
  });
  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(store, status);
  return { outcome, task: finalTask, run: finalRun, report, status };
}

function createCodingRun(task: SageOsTaskSpec, attempt: number, startedAt: string): SageOsRun {
  const slug = safeId(task.id);
  const id = `run_${slug}_${attempt}`;
  return {
    id,
    taskId: task.id,
    attempt,
    state: "running",
    traceId: `trace_coding_${slug}_${attempt}`,
    workerSessionId: `worker_${slug}_${attempt}`,
    logs: [`Started SageOS coding task ${task.id} run ${id}`],
    artifacts: [],
    verificationResult: {
      outcome: "skipped",
      summary: "Verification has not run yet.",
      refs: [],
    },
    startedAt,
  };
}

function formatCodingVerificationSummary(
  tests: SageOsCodingTestResult[],
  fallback: string,
): string {
  if (tests.length === 0) {
    return fallback;
  }
  return tests
    .map((test) => `${test.command}: ${test.exitCode === 0 ? "passed" : "failed"}`)
    .join(", ");
}

async function runTestCommand(
  repoPath: string,
  commandLine: string,
  runner: SageOsCommandRunner,
): Promise<SageOsCodingTestResult> {
  const parsed = parseCommandLine(commandLine);
  const result = await runner(parsed.command, parsed.args, { cwd: repoPath });
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdoutPreview: previewText(result.stdout),
    stderrPreview: previewText(result.stderr),
  };
}

function resolveTaskRepo(task: SageOsTaskSpec): string | undefined {
  for (const scope of task.policyScopes) {
    if (scope.kind !== "repo") {
      continue;
    }
    const repo = scope.allow?.find((item) => item.trim());
    if (repo) {
      return repo;
    }
  }
  return undefined;
}

function previewText(value: string, max = 4_000): string {
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
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
