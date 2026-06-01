import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createSageOsStateStore, readSageOsState, upsertSageOsTask } from "./state-store.js";
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
          verificationResult: { outcome: "passed" },
        },
      ],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_run_started");
    expect(log).toContain("task_completed");
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
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0]).toMatchObject({
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      task: { id: "task_notify", state: "completed" },
      run: { id: "run_task_notify_1", state: "succeeded" },
    });
  });
});
