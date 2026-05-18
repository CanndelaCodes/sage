import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAgent,
  upsertSageOsRun,
  upsertSageOsTask,
  writeSageOsControl,
  writeSageOsState,
} from "./state-store.js";
import { createSageOsSupervisor } from "./supervisor.js";
import { createSageOsStatusSnapshot } from "./types.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    await wait(20);
    expect(supervisor.getStatus().state).toBe("paused");

    await writeSageOsControl(controlStore, { state: "running" });
    await wait(20);
    expect(supervisor.getStatus().state).toBe("running");

    await writeSageOsControl(controlStore, { state: "stopped" });
    await wait(20);
    expect(supervisor.getStatus().state).toBe("stopped");
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
});
