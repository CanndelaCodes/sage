import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { appendSageOsEvent, createSageOsEventLog, readSageOsEvents } from "./event-log.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsAgent,
  upsertSageOsCodingReport,
  upsertSageOsObservation,
  upsertSageOsRun,
  upsertSageOsTask,
  writeSageOsControl,
  writeSageOsState,
} from "./state-store.js";
import { createSageOsSupervisor, runSageOsSupervisorWorkLoopOnce } from "./supervisor.js";
import { createSageOsStatusSnapshot } from "./types.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForSupervisorState = async (
  supervisor: ReturnType<typeof createSageOsSupervisor>,
  state: ReturnType<typeof createSageOsSupervisor>["getStatus"] extends () => infer Status
    ? Status extends { state: infer State }
      ? State
      : never
    : never,
) => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (supervisor.getStatus().state === state) {
      return;
    }
    await wait(5);
  }
  expect(supervisor.getStatus().state).toBe(state);
};

describe("SageOS supervisor skeleton", () => {
  it("starts, pauses, resumes, stops, and records lifecycle events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-"));
    const supervisor = createSageOsSupervisor({ stateDir: root, intervalMs: 5 });

    await supervisor.start();
    expect(supervisor.getStatus().state).toBe("running");

    await supervisor.pause("test");
    expect(supervisor.getStatus().paused).toBe(true);

    await supervisor.resume("test");
    expect(supervisor.getStatus().paused).toBe(false);

    await supervisor.stop("test");
    expect(supervisor.getStatus().state).toBe("stopped");

    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("supervisor_started");
    expect(log).toContain("supervisor_paused");
    expect(log).toContain("supervisor_resumed");
    expect(log).toContain("supervisor_stopped");
  });

  it("does not start autonomous work when persisted emergency-stop control exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-start-control-"));
    const controlStore = createSageOsControlStore({ stateDir: root });
    await writeSageOsControl(controlStore, { state: "stopped", emergency: true });

    const supervisor = createSageOsSupervisor({ stateDir: root, intervalMs: 5 });
    await supervisor.start();

    expect(supervisor.getStatus()).toMatchObject({
      enabled: false,
      paused: true,
      state: "stopped",
    });
  });

  it("honors persisted CLI control state while running", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-control-"));
    const controlStore = createSageOsControlStore({ stateDir: root });
    const supervisor = createSageOsSupervisor({ stateDir: root, intervalMs: 5 });

    await supervisor.start();
    await writeSageOsControl(controlStore, { state: "paused" });
    await waitForSupervisorState(supervisor, "paused");

    await writeSageOsControl(controlStore, { state: "running" });
    await waitForSupervisorState(supervisor, "running");

    await writeSageOsControl(controlStore, { state: "stopped" });
    await waitForSupervisorState(supervisor, "stopped");
  });

  it("runs configured background work on running ticks and persists the resulting status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-work-loop-"));
    const status = createSageOsStatusSnapshot({
      tasks: { total: 1, active: 0, queued: 0, blocked: 0 },
      memory: {
        status: "ok",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 2, pending: 0, failed: 0 },
      },
    });
    const runWorkLoopOnce = vi.fn().mockResolvedValue({ status });
    const supervisor = createSageOsSupervisor({
      stateDir: root,
      intervalMs: 5,
      runWorkLoopOnce,
    });

    await supervisor.start();
    const deadline = Date.now() + 500;
    while (Date.now() < deadline && runWorkLoopOnce.mock.calls.length === 0) {
      await wait(5);
    }
    await supervisor.stop("test");

    expect(runWorkLoopOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        stateDir: root,
        requestedBy: "sageos.supervisor",
      }),
    );
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({
      status: {
        supervisor: { state: "stopped" },
        tasks: { total: 1 },
        memory: { captureQueue: { total: 2 } },
      },
    });
  });

  it("persists degraded supervisor state when background work fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-work-loop-error-"));
    const runWorkLoopOnce = vi.fn().mockRejectedValue(new Error("observer failed"));
    const supervisor = createSageOsSupervisor({
      stateDir: root,
      intervalMs: 5,
      runWorkLoopOnce,
    });

    await supervisor.start();
    const deadline = Date.now() + 500;
    while (Date.now() < deadline && supervisor.getStatus().state !== "degraded") {
      await wait(5);
    }
    expect(runWorkLoopOnce).toHaveBeenCalled();
    try {
      const store = createSageOsStateStore({ stateDir: root });
      let persisted = await readSageOsState(store);
      while (Date.now() < deadline && persisted.status.supervisor.state !== "degraded") {
        await wait(5);
        persisted = await readSageOsState(store);
      }
      expect(persisted).toMatchObject({
        status: {
          supervisor: {
            state: "degraded",
            lastError: "Error: observer failed",
          },
        },
      });
    } finally {
      await supervisor.stop("test");
    }
  });

  it("routes enabled observation, memory replay, and queued task work through one supervisor work loop", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-work-routes-"));
    const now = new Date("2026-06-01T15:00:00.000Z");
    const status = createSageOsStatusSnapshot({
      generatedAt: now.toISOString(),
      tasks: { total: 1, active: 0, queued: 0, blocked: 0 },
    });
    const observeAppFocusOnce = vi
      .fn()
      .mockResolvedValue({ status: "skipped", reason: "empty-result" });
    const observeSystemStatusOnce = vi.fn().mockResolvedValue({ status: "recorded" });
    const runMemoryStewardOnce = vi.fn().mockResolvedValue({ status });
    const runNextTaskOnce = vi.fn().mockResolvedValue({ outcome: "idle", status });
    const flushDueNotificationBatchOnce = vi
      .fn()
      .mockResolvedValue({ outcome: "skipped", reason: "not_due", count: 1 });
    const collectStatus = vi.fn().mockResolvedValue(status);

    const result = await runSageOsSupervisorWorkLoopOnce({
      cfg: {
        sageos: {
          sources: { appFocus: true, system: true },
          memory: { replayQueues: true },
          notifications: {
            telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
          },
        },
      },
      stateDir: root,
      agentId: "main",
      requestedBy: "sageos.test",
      deps: {
        observeAppFocusOnce,
        observeSystemStatusOnce,
        runMemoryStewardOnce,
        runNextTaskOnce,
        flushDueNotificationBatchOnce,
        collectStatus,
      },
    });

    expect(result.status).toBe(status);
    expect(observeAppFocusOnce).toHaveBeenCalledWith({
      cfg: {
        sources: { appFocus: true, system: true },
        memory: { replayQueues: true },
        notifications: {
          telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
        },
      },
      stateDir: root,
      agentId: "main",
    });
    expect(observeSystemStatusOnce).toHaveBeenCalledWith({
      cfg: {
        sources: { appFocus: true, system: true },
        memory: { replayQueues: true },
        notifications: {
          telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
        },
      },
      stateDir: root,
    });
    expect(runMemoryStewardOnce).toHaveBeenCalledWith({
      cfg: {
        sageos: {
          sources: { appFocus: true, system: true },
          memory: { replayQueues: true },
          notifications: {
            telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
          },
        },
      },
      agentId: "main",
      stateDir: root,
    });
    expect(runNextTaskOnce).toHaveBeenCalledWith({
      stateDir: root,
      requestedBy: "sageos.test",
      notify: true,
      cfg: {
        sources: { appFocus: true, system: true },
        memory: { replayQueues: true },
        notifications: {
          telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
        },
      },
    });
    expect(flushDueNotificationBatchOnce).toHaveBeenCalledWith({
      stateDir: root,
      cfg: {
        sources: { appFocus: true, system: true },
        memory: { replayQueues: true },
        notifications: {
          telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
        },
      },
    });
    expect(result.notificationBatch).toMatchObject({
      outcome: "skipped",
      reason: "not_due",
      count: 1,
    });
    expect(collectStatus).toHaveBeenCalledWith({
      stateDir: root,
      agentId: "main",
      cfg: {
        sources: { appFocus: true, system: true },
        memory: { replayQueues: true },
        notifications: {
          telegram: { enabled: true, target: "telegram:123", batchWindowMinutes: 15 },
        },
      },
    });
  });

  it("runs queued task work up to the configured per-loop concurrency limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-task-limit-"));
    const status = createSageOsStatusSnapshot();
    const runNextTaskOnce = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "completed",
        task: { id: "task_a" },
        run: { id: "run_task_a_1" },
        status,
      })
      .mockResolvedValueOnce({
        outcome: "completed",
        task: { id: "task_b" },
        run: { id: "run_task_b_1" },
        status,
      })
      .mockResolvedValueOnce({ outcome: "idle", status });
    const collectStatus = vi.fn().mockResolvedValue(status);

    const result = await runSageOsSupervisorWorkLoopOnce({
      cfg: { sageos: { supervisor: { maxConcurrentTasks: 2 } } },
      stateDir: root,
      requestedBy: "sageos.test",
      deps: { runNextTaskOnce, collectStatus },
    });

    expect(runNextTaskOnce).toHaveBeenCalledTimes(2);
    expect(result.tasks.map((entry) => entry.outcome)).toEqual(["completed", "completed"]);
    expect(result.task).toMatchObject({ outcome: "completed", task: { id: "task_a" } });
  });

  it("checks scheduled Telegram digests during supervisor work loops", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-supervisor-digest-schedule-"));
    const status = createSageOsStatusSnapshot();
    const runNextTaskOnce = vi.fn().mockResolvedValue({ outcome: "idle", status });
    const sendDueTelegramDigestOnce = vi
      .fn()
      .mockResolvedValue({ outcome: "skipped", reason: "not_due" });
    const collectStatus = vi.fn().mockResolvedValue(status);

    const result = await runSageOsSupervisorWorkLoopOnce({
      cfg: {
        sageos: {
          notifications: {
            telegram: { enabled: true, target: "telegram:123", digestSchedule: "* * * * *" },
          },
        },
      },
      stateDir: root,
      requestedBy: "sageos.test",
      deps: { runNextTaskOnce, sendDueTelegramDigestOnce, collectStatus },
    });

    expect(sendDueTelegramDigestOnce).toHaveBeenCalledWith({
      stateDir: root,
      cfg: {
        notifications: {
          telegram: { enabled: true, target: "telegram:123", digestSchedule: "* * * * *" },
        },
      },
    });
    expect(result.digest).toMatchObject({ outcome: "skipped", reason: "not_due" });
  });

  it("preserves task and run resources across concurrent status writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-state-concurrent-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-18T00:00:00.000Z";

    await Promise.all([
      upsertSageOsTask(store, {
        id: "task_concurrent_a",
        title: "Concurrent task A",
        objective: "Survive status persistence",
        state: "queued",
        requestedBy: "jason",
        autonomyTier: "observe",
        policyScopes: [{ kind: "system", allow: ["status"], risk: "low" }],
        createdAt: now,
        updatedAt: now,
      }),
      upsertSageOsTask(store, {
        id: "task_concurrent_b",
        title: "Concurrent task B",
        objective: "Survive concurrent task upsert",
        state: "queued",
        requestedBy: "jason",
        autonomyTier: "observe",
        policyScopes: [{ kind: "system", allow: ["status"], risk: "low" }],
        createdAt: now,
        updatedAt: now,
      }),
      upsertSageOsRun(store, {
        id: "run_concurrent_a",
        taskId: "task_concurrent_a",
        attempt: 1,
        state: "queued",
        traceId: "trc_concurrent_a",
      }),
      upsertSageOsRun(store, {
        id: "run_concurrent_b",
        taskId: "task_concurrent_b",
        attempt: 1,
        state: "queued",
        traceId: "trc_concurrent_b",
      }),
      writeSageOsState(
        store,
        createSageOsStatusSnapshot({
          supervisor: { enabled: true, paused: false, state: "running" },
        }),
      ),
    ]);

    const state = await readSageOsState(store);
    expect(state.status.supervisor.state).toBe("running");
    expect(state.tasks.map((task) => task.id).toSorted()).toEqual([
      "task_concurrent_a",
      "task_concurrent_b",
    ]);
    expect(state.runs.map((run) => run.id).toSorted()).toEqual([
      "run_concurrent_a",
      "run_concurrent_b",
    ]);
  });
});

describe("SageOS state store", () => {
  it("persists queryable agent, task, and run resources without losing status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-state-store-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-18T00:00:00.000Z";

    await upsertSageOsAgent(store, {
      id: "agent_researcher",
      name: "Researcher",
      role: "research",
      mission: "Collect and synthesize inputs",
      status: "active",
      autonomyTier: "suggest",
      responsibilities: ["research"],
      allowedScopes: [],
      deniedScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_1",
      title: "Check system",
      objective: "Validate local system posture",
      state: "queued",
      requestedBy: "jason",
      autonomyTier: "observe",
      policyScopes: [{ kind: "system", allow: ["status"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsRun(store, {
      id: "run_1",
      taskId: "task_1",
      attempt: 1,
      state: "queued",
      traceId: "trc_1",
    });

    const state = await readSageOsState(store);
    expect(state.status.supervisor.state).toBe("stopped");
    expect(state.tasks).toHaveLength(1);
    expect(state.runs).toEqual([expect.objectContaining({ taskId: "task_1" })]);
  });

  it("persists durable coding reports without losing other resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-coding-report-store-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T23:30:00.000Z";

    await upsertSageOsTask(store, {
      id: "task_fix",
      title: "Fix failing test",
      objective: "Fix a failing test in an allowed repo.",
      state: "completed",
      requestedBy: "jason",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: ["C:\\repo"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsCodingReport(store, {
      id: "coding_report_task_fix_1",
      taskId: "task_fix",
      runId: "run_task_fix_1",
      repoPath: "C:\\repo",
      objective: "Fix a failing test in an allowed repo.",
      outcome: "succeeded",
      startedAt: now,
      finishedAt: now,
      preState: { branch: "main", dirty: false, changedFiles: [] },
      postState: { branch: "main", dirty: true, changedFiles: ["README.md"] },
      diff: {
        stat: "README.md | 1 +",
        preview: "+night shift",
        changedFiles: ["README.md"],
      },
      tests: [
        {
          command: "node test.js",
          exitCode: 0,
          stdoutPreview: "ok",
          stderrPreview: "",
        },
      ],
      blockers: [],
      verificationRefs: ["test:node test.js"],
      rollback: "Review git diff and revert changed files if needed.",
      createdAt: now,
      updatedAt: now,
    });

    const state = await readSageOsState(store);
    expect(state.tasks).toEqual([expect.objectContaining({ id: "task_fix" })]);
    expect(state.codingReports).toEqual([
      expect.objectContaining({
        id: "coding_report_task_fix_1",
        taskId: "task_fix",
        outcome: "succeeded",
        diff: expect.objectContaining({ changedFiles: ["README.md"] }),
      }),
    ]);
  });

  it("persists durable approval resources without losing other resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-approval-store-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T14:00:00.000Z";

    await upsertSageOsTask(store, {
      id: "task_external",
      title: "Send update",
      objective: "Send a status update externally.",
      state: "waiting_for_policy",
      requestedBy: "jason",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "channel", allow: ["telegram"], risk: "high" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_external",
      state: "pending",
      riskClass: "external_write",
      title: "Send Telegram update",
      proposedAction: "Send a redacted task completion summary to Telegram.",
      evidence: ["task_external", "artifact_summary"],
      preview: "Task complete. No private details included.",
      rollbackPlan: "Delete the Telegram message if it is incorrect.",
      scope: "task",
      taskId: "task_external",
      requestedBy: "coding_worker",
      requestedAt: now,
      expiresAt: "2026-05-28T14:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    });

    const state = await readSageOsState(store);
    expect(state.tasks).toEqual([expect.objectContaining({ id: "task_external" })]);
    expect(state.approvals).toEqual([
      expect.objectContaining({
        id: "approval_external",
        state: "pending",
        riskClass: "external_write",
        scope: "task",
        rollbackPlan: "Delete the Telegram message if it is incorrect.",
      }),
    ]);
  });

  it("persists durable observation resources without losing other resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-observation-store-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T16:00:00.000Z";

    await upsertSageOsTask(store, {
      id: "task_observe",
      title: "Observe work context",
      objective: "Record approved local app focus metadata.",
      state: "running",
      requestedBy: "jason",
      autonomyTier: "observe",
      policyScopes: [{ kind: "system", allow: ["app_focus"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_observe",
      state: "approved",
      riskClass: "windows_setting",
      title: "Enable app focus source",
      proposedAction: "Allow app focus metadata observation.",
      evidence: ["source_policy"],
      scope: "domain",
      domain: "sageos.sources.appFocus",
      requestedBy: "operator",
      requestedAt: now,
      resolvedAt: now,
      resolvedBy: "jason",
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_app_focus",
      source: "app_focus",
      state: "captured",
      title: "Code: SageOS",
      text: "Active app focus: Code - SageOS",
      sensitivity: "private",
      observedAt: now,
      payload: { processName: "Code", windowTitle: "SageOS" },
      provenance: { adapter: "app_focus" },
      createdAt: now,
      updatedAt: now,
    });

    const state = await readSageOsState(store);
    expect(state.tasks).toEqual([expect.objectContaining({ id: "task_observe" })]);
    expect(state.approvals).toEqual([expect.objectContaining({ id: "approval_observe" })]);
    expect(state.observations).toEqual([
      expect.objectContaining({
        id: "obs_app_focus",
        source: "app_focus",
        state: "captured",
        payload: { processName: "Code", windowTitle: "SageOS" },
      }),
    ]);
  });
});

describe("SageOS event log", () => {
  it("appends JSONL events with ids, timestamps, and trace ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-event-log-"));
    const log = createSageOsEventLog({ stateDir: root });

    const event = await appendSageOsEvent(log, {
      type: "task_queued",
      actor: "test",
      summary: "queued a test task",
      sensitivity: "normal",
    });

    expect(event.id).toMatch(/^evt_/);
    expect(event.traceId).toMatch(/^trc_/);
    expect(event.ts).toBeTruthy();

    const raw = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(JSON.parse(raw.trim())).toMatchObject({
      id: event.id,
      type: "task_queued",
      actor: "test",
    });
  });

  it("reads back newest audit events with an optional limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-event-log-read-"));
    const log = createSageOsEventLog({ stateDir: root });

    await appendSageOsEvent(log, {
      type: "first_event",
      actor: "test",
      summary: "first",
    });
    const second = await appendSageOsEvent(log, {
      type: "second_event",
      actor: "test",
      summary: "second",
    });

    await expect(readSageOsEvents(log, { limit: 1 })).resolves.toEqual([
      expect.objectContaining({ id: second.id, type: "second_event" }),
    ]);
  });
});
