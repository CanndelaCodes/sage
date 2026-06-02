import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSageOsStateStore, readSageOsState, upsertSageOsTask } from "./state-store.js";
import { queueSageOsTask } from "./task-queue.js";

describe("SageOS task queue policy", () => {
  it("queues low-risk proposed tasks with audit evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-queue-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T17:30:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_low",
      title: "Review observed work",
      objective: "Review a local app-focus observation.",
      state: "proposed",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "suggest",
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await queueSageOsTask({
      taskId: "task_low",
      stateDir: root,
      requestedBy: "sageos.test",
      reason: "operator accepted suggestion",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:queue" } } },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "queued",
      task: { id: "task_low", state: "queued", updatedAt: now },
    });
    expect(result.approval).toBeUndefined();
    expect(result.status.tasks).toMatchObject({ total: 1, queued: 1, blocked: 0 });
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:queue",
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_low", state: "queued" }],
      approvals: [],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("task_queued");
    expect(log).toContain("task_low");
  });

  it("moves high-risk proposed tasks to waiting_for_policy with approval evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-policy-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T17:35:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_external",
      title: "Send Telegram digest",
      objective: "Send a redacted digest to Telegram.",
      state: "proposed",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "channel", allow: ["telegram"], risk: "high" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await queueSageOsTask({
      taskId: "task_external",
      stateDir: root,
      requestedBy: "sageos.test",
      reason: "operator accepted suggestion",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "approval_required",
      task: { id: "task_external", state: "waiting_for_policy", updatedAt: now },
      approval: {
        id: "approval_task_task_external",
        state: "pending",
        riskClass: "external_write",
        taskId: "task_external",
        requestedBy: "sageos.test",
      },
    });
    expect(result.status).toMatchObject({
      tasks: { total: 1, queued: 0, blocked: 1 },
      approvals: { pending: 1 },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_external", state: "waiting_for_policy" }],
      approvals: [{ id: "approval_task_task_external", state: "pending" }],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("approval_requested");
    expect(log).toContain("approval_task_task_external");
  });

  it("requires approval for low-risk private data exports when policy config requires it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-private-export-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T17:40:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_memory_export",
      title: "Export wiki review bundle",
      objective: "Export private Sage Memory review context.",
      state: "proposed",
      requestedBy: "sageos.memory_steward",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "memory", allow: ["sage_memory_export"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await queueSageOsTask({
      taskId: "task_memory_export",
      stateDir: root,
      requestedBy: "sageos.test",
      reason: "operator requested export",
      cfg: { policy: { requireApprovalForPrivateDataExport: true } },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "approval_required",
      task: { id: "task_memory_export", state: "waiting_for_policy", updatedAt: now },
      approval: {
        id: "approval_task_task_memory_export",
        state: "pending",
        riskClass: "private_data_export",
        taskId: "task_memory_export",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_memory_export", state: "waiting_for_policy" }],
      approvals: [{ id: "approval_task_task_memory_export", state: "pending" }],
    });
  });
});
