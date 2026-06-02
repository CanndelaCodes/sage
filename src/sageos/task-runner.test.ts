import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsTask,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { runNextSageOsTaskOnce } from "./task-runner.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function createFixtureRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFile(path.join(repo, "README.md"), "# Fixture\n", "utf8");
  await writeFile(
    path.join(repo, "test.js"),
    [
      "const { readFileSync } = require('node:fs');",
      "const text = readFileSync('README.md', 'utf8');",
      "if (!text.includes('night shift')) {",
      "  console.error('marker missing');",
      "  process.exit(1);",
      "}",
      "console.log('ok');",
      "",
    ].join("\n"),
    "utf8",
  );
  await git(repo, ["init"]);
  await git(repo, ["add", "README.md", "test.js"]);
  await git(repo, [
    "-c",
    "user.email=sageos@example.test",
    "-c",
    "user.name=SageOS Test",
    "commit",
    "-m",
    "init",
  ]);
  return repo;
}

describe("SageOS task runner", () => {
  it("runs the next queued task with the dry-run executor", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T18:00:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_build",
      title: "Build next slice",
      objective: "Run a deterministic dry-run worker.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: ["C:\\Users\\jason\\Desktop\\sage"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "completed",
      task: { id: "task_build", state: "completed", updatedAt: now },
      run: {
        id: "run_task_build_1",
        taskId: "task_build",
        attempt: 1,
        state: "succeeded",
        traceId: "trace_run_task_build_1",
        workerSessionId: "worker_task_build_1",
        logs: [
          "Started SageOS task task_build run run_task_build_1",
          "Completed SageOS task task_build: dry-run executor accepted task_build",
        ],
        artifacts: [],
        verificationResult: {
          outcome: "passed",
          summary: "dry-run executor accepted task_build",
          refs: [],
        },
        budgetUsed: { elapsedMinutes: 0, toolCalls: 1 },
        timeline: [
          {
            at: now,
            label: "Started SageOS task task_build",
            state: "running",
            ref: "run_task_build_1",
          },
          {
            at: now,
            label: "Completed SageOS task task_build",
            state: "succeeded",
            ref: "run_task_build_1",
          },
        ],
        startedAt: now,
        finishedAt: now,
      },
    });
    expect(result.status).toMatchObject({
      tasks: { total: 1, active: 0, queued: 0, blocked: 0 },
      runs: { total: 1, active: 0, failed: 0 },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_build", state: "completed" }],
      runs: [
        {
          id: "run_task_build_1",
          state: "succeeded",
          workerSessionId: "worker_task_build_1",
          budgetUsed: { elapsedMinutes: 0, toolCalls: 1 },
          timeline: [
            { label: "Started SageOS task task_build" },
            { label: "Completed SageOS task task_build" },
          ],
          verificationResult: { outcome: "passed" },
        },
      ],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_run_started");
    expect(log).toContain("task_completed");
  });

  it("blocks queued tasks above the current autonomy tier before executor runs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-tier-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-02T06:10:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_execute_scoped",
      title: "Run scoped execution",
      objective: "Do not run when SageOS is configured for prepare-only autonomy.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    let executorCalls = 0;

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      cfg: { mode: "prepare" },
      executor: async () => {
        executorCalls += 1;
        return { summary: "should not run" };
      },
      now: () => new Date(now),
    });

    expect(executorCalls).toBe(0);
    expect(result).toMatchObject({
      outcome: "blocked",
      task: { id: "task_execute_scoped", state: "waiting_for_policy", updatedAt: now },
      approval: {
        id: "approval_task_task_execute_scoped",
        state: "pending",
        riskClass: "policy_change",
        taskId: "task_execute_scoped",
      },
      status: {
        tasks: { total: 1, queued: 0, blocked: 1 },
        approvals: { pending: 1 },
      },
    });
    expect(result.status.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "incident_policy_blocked",
          repairAction: expect.objectContaining({ gatewayMethod: "sageos.approvals.list" }),
        }),
      ]),
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_execute_scoped", state: "waiting_for_policy" }],
      approvals: [{ id: "approval_task_task_execute_scoped", state: "pending" }],
      runs: [],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("approval_requested");
    expect(log).toContain("requires execute_scoped autonomy while current policy allows prepare");
  });

  it("runs queued tasks with an approved autonomy-tier approval", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-tier-approved-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-02T06:15:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_execute_approved",
      title: "Run approved scoped execution",
      objective: "Run after the operator approved this autonomy escalation.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_task_task_execute_approved",
      state: "approved",
      riskClass: "policy_change",
      title: "Approve SageOS task: Run approved scoped execution",
      proposedAction: "Queue SageOS task task_execute_approved",
      evidence: ["task_execute_approved"],
      scope: "task",
      taskId: "task_execute_approved",
      requestedBy: "sageos.test",
      requestedAt: now,
      resolvedBy: "operator",
      resolvedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    let executorCalls = 0;

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      cfg: { mode: "prepare" },
      executor: async () => {
        executorCalls += 1;
        return { summary: "approved execution ran" };
      },
      now: () => new Date(now),
    });

    expect(executorCalls).toBe(1);
    expect(result).toMatchObject({
      outcome: "completed",
      task: { id: "task_execute_approved", state: "completed" },
      run: {
        id: "run_task_execute_approved_1",
        state: "succeeded",
        verificationResult: { outcome: "passed", summary: "approved execution ran" },
      },
    });
  });

  it("dispatches queued coding execution plans through the Night Shift runner", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-coding-"));
    const repo = await createFixtureRepo("sageos-task-runner-coding-repo-");
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-01T18:00:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_coding_plan",
      title: "Run scoped coding plan",
      objective: "Append a fixture marker and run the fixture test.",
      state: "queued",
      requestedBy: "sageos.overlay",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: [repo], risk: "low" }],
      execution: {
        kind: "coding",
        append: { relativePath: "README.md", text: "\nnight shift\n" },
        testCommand: "node test.js",
      },
      createdAt: now,
      updatedAt: now,
    });

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.supervisor",
      cfg: { coding: { enabled: true, allowedRepos: [repo], requireCleanGit: true } },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "completed",
      task: { id: "task_coding_plan", state: "completed" },
      run: { id: "run_task_coding_plan_1", state: "succeeded" },
    });
    expect(result.run).toMatchObject({
      workerSessionId: "worker_task_coding_plan_1",
      logs: [
        "Started SageOS coding task task_coding_plan run run_task_coding_plan_1",
        "Completed SageOS coding task task_coding_plan: 1 file(s) changed",
      ],
      artifacts: ["coding_report_task_coding_plan_1"],
      verificationResult: {
        outcome: "passed",
        summary: "node test.js: passed",
        refs: ["test:node test.js"],
      },
      budgetUsed: { elapsedMinutes: 0, toolCalls: 2 },
      timeline: [
        { label: "Started SageOS coding task task_coding_plan", state: "running" },
        { label: "Completed SageOS coding task task_coding_plan", state: "succeeded" },
      ],
    });
    await expect(readFile(path.join(repo, "README.md"), "utf8")).resolves.toContain("night shift");
    await expect(readSageOsState(store)).resolves.toMatchObject({
      codingReports: [
        {
          id: "coding_report_task_coding_plan_1",
          taskId: "task_coding_plan",
          outcome: "succeeded",
          tests: [{ command: "node test.js", exitCode: 0 }],
        },
      ],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("coding_task_completed");
  });

  it("sends Night Shift completion notifications for notified coding execution plans", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-coding-notify-"));
    const repo = await createFixtureRepo("sageos-task-runner-coding-notify-repo-");
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-01T18:02:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_coding_notify",
      title: "Run notified coding plan",
      objective: "Append a fixture marker, run the fixture test, and notify the completion report.",
      state: "queued",
      requestedBy: "sageos.overlay",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: [repo], risk: "low" }],
      execution: {
        kind: "coding",
        append: { relativePath: "README.md", text: "\nnight shift\n" },
        testCommand: "node test.js",
      },
      createdAt: now,
      updatedAt: now,
    });
    const cfg = {
      coding: { enabled: true, allowedRepos: [repo], requireCleanGit: true },
      notifications: { telegram: { enabled: true, target: "telegram:123" } },
    };
    const taskNotificationCalls: unknown[] = [];
    const completionNotificationCalls: unknown[] = [];

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.supervisor",
      notify: true,
      cfg,
      sendTaskNotificationOnce: async (params: unknown) => {
        taskNotificationCalls.push(params);
        return { outcome: "sent", target: "telegram:123" };
      },
      sendCompletionNotificationOnce: async (params: unknown) => {
        completionNotificationCalls.push(params);
        return { outcome: "sent", target: "telegram:123" };
      },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "completed",
      task: { id: "task_coding_notify", state: "completed" },
      run: { id: "run_task_coding_notify_1", state: "succeeded" },
    });
    expect(taskNotificationCalls).toHaveLength(1);
    expect(completionNotificationCalls).toHaveLength(1);
    expect(completionNotificationCalls[0]).toMatchObject({
      stateDir: root,
      cfg,
      reportId: "coding_report_task_coding_notify_1",
    });
  });

  it("records coding dispatch preflight failures as failed task runs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-coding-disabled-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-01T18:05:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_coding_disabled",
      title: "Run disabled coding plan",
      objective: "Do not leave a coding plan queued forever when coding is disabled.",
      state: "queued",
      requestedBy: "sageos.overlay",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: ["C:\\repo"], risk: "low" }],
      execution: {
        kind: "coding",
        testCommand: "node test.js",
      },
      createdAt: now,
      updatedAt: now,
    });

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.supervisor",
      cfg: { coding: { enabled: false, allowedRepos: ["C:\\repo"] } },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      task: { id: "task_coding_disabled", state: "failed" },
      run: {
        id: "run_task_coding_disabled_1",
        state: "failed",
        error: "SageOS coding is disabled.",
        workerSessionId: "worker_task_coding_disabled_1",
        logs: [
          "Started SageOS task task_coding_disabled run run_task_coding_disabled_1",
          "Failed SageOS task task_coding_disabled: SageOS coding is disabled.",
        ],
        artifacts: [],
        verificationResult: {
          outcome: "failed",
          summary: "SageOS coding is disabled.",
          refs: [],
        },
        budgetUsed: { elapsedMinutes: 0, toolCalls: 0 },
        timeline: [
          {
            at: now,
            label: "Started SageOS task task_coding_disabled",
            state: "running",
            ref: "run_task_coding_disabled_1",
          },
          {
            at: now,
            label: "Failed SageOS task task_coding_disabled",
            state: "failed",
            ref: "run_task_coding_disabled_1",
          },
        ],
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_coding_disabled", state: "failed" }],
      runs: [{ id: "run_task_coding_disabled_1", state: "failed" }],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_failed");
    expect(log).toContain("SageOS coding is disabled.");
  });

  it("records failed executor runs without losing run history", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-fail-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T18:05:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_fail",
      title: "Fail next slice",
      objective: "Exercise failed run accounting.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      executor: async () => {
        throw new Error("executor failed");
      },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      task: { id: "task_fail", state: "failed", updatedAt: now },
      run: {
        id: "run_task_fail_1",
        taskId: "task_fail",
        attempt: 1,
        state: "failed",
        error: "executor failed",
        workerSessionId: "worker_task_fail_1",
        logs: [
          "Started SageOS task task_fail run run_task_fail_1",
          "Failed SageOS task task_fail: executor failed",
        ],
        artifacts: [],
        verificationResult: {
          outcome: "failed",
          summary: "executor failed",
          refs: [],
        },
        budgetUsed: { elapsedMinutes: 0, toolCalls: 1 },
        timeline: [
          {
            at: now,
            label: "Started SageOS task task_fail",
            state: "running",
            ref: "run_task_fail_1",
          },
          {
            at: now,
            label: "Failed SageOS task task_fail",
            state: "failed",
            ref: "run_task_fail_1",
          },
        ],
      },
    });
    expect(result.status.runs).toMatchObject({ total: 1, active: 0, failed: 1 });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_fail", state: "failed" }],
      runs: [{ id: "run_task_fail_1", state: "failed", error: "executor failed" }],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_failed");
    expect(log).toContain("executor failed");
  });

  it("fails over-budget executor runs and surfaces a budget incident", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-budget-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-06-02T05:20:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_budget",
      title: "Respect task budget",
      objective: "Do not mark work successful after exceeding delegated budget.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      budget: { maxToolCalls: 1, maxMinutes: 10, maxCostUsd: 0.05 },
      createdAt: now,
      updatedAt: now,
    });

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      executor: async () => ({
        summary: "executor used too much budget",
        budgetUsed: { elapsedMinutes: 2, toolCalls: 3, costUsd: 0.08 },
      }),
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      task: { id: "task_budget", state: "failed" },
      run: {
        id: "run_task_budget_1",
        state: "failed",
        error: "Task budget exceeded: tool calls 3/1, cost USD 0.08/0.05",
        budgetUsed: { elapsedMinutes: 2, toolCalls: 3, costUsd: 0.08 },
        verificationResult: {
          outcome: "failed",
          summary: "Task budget exceeded: tool calls 3/1, cost USD 0.08/0.05",
        },
      },
    });
    expect(result.status.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "incident_budget_exhausted",
          category: "budget",
          repairAction: expect.objectContaining({
            command: "sage os tasks --json",
            gatewayMethod: "sageos.tasks.list",
          }),
        }),
      ]),
    );

    const refreshed = await collectSageOsStatus({ stateDir: root });
    expect(
      refreshed.incidents.filter((incident) => incident.id === "incident_budget_exhausted"),
    ).toHaveLength(1);
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_budget_exhausted");
  });

  it("optionally sends a task notification after a completed run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-runner-notify-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T21:20:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_notify",
      title: "Notify completion",
      objective: "Exercise task notification integration.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    const notificationCalls: unknown[] = [];

    const result = await runNextSageOsTaskOnce({
      stateDir: root,
      requestedBy: "sageos.test",
      notify: true,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      sendTaskNotificationOnce: async (params: unknown) => {
        notificationCalls.push(params);
        return { outcome: "sent", target: "telegram:123" };
      },
      now: () => new Date(now),
    });

    expect(result.outcome).toBe("completed");
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:123",
    });
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0]).toMatchObject({
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      task: { id: "task_notify", state: "completed" },
      run: { id: "run_task_notify_1", state: "succeeded" },
    });
  });
});
