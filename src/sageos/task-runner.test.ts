import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSageOsStateStore, readSageOsState, upsertSageOsTask } from "./state-store.js";
import { runNextSageOsTaskOnce } from "./task-runner.js";

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
      runs: [{ id: "run_task_build_1", state: "succeeded" }],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_run_started");
    expect(log).toContain("task_completed");
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
});
