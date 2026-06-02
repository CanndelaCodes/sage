import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSageOsStateStore, readSageOsState, upsertSageOsAgent } from "./state-store.js";
import { createSageOsTask } from "./task-creation.js";

describe("SageOS task creation", () => {
  const previousStateDir = process.env.SAGE_STATE_DIR;

  beforeEach(async () => {
    process.env.SAGE_STATE_DIR = await mkdtemp(path.join(tmpdir(), "sageos-task-create-"));
  });

  afterEach(() => {
    if (previousStateDir) {
      process.env.SAGE_STATE_DIR = previousStateDir;
    } else {
      delete process.env.SAGE_STATE_DIR;
    }
  });

  it("creates proposed tasks with owner assignment and durable audit evidence", async () => {
    const stateDir = process.env.SAGE_STATE_DIR!;
    const store = createSageOsStateStore();
    await upsertSageOsAgent(store, {
      id: "employee_memory_steward",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep memory queues healthy.",
      status: "active",
      autonomyTier: "execute_scoped",
      responsibilities: ["Replay failed memory captures."],
      allowedScopes: [{ kind: "memory", allow: ["capture_queue"], risk: "low" }],
      deniedScopes: [],
      createdAt: "2026-06-01T14:00:00.000Z",
      updatedAt: "2026-06-01T14:00:00.000Z",
    });

    const result = await createSageOsTask({
      title: "Review memory queue",
      objective: "Replay failed memory captures and summarize blockers.",
      ownerAgentId: "employee_memory_steward",
      requestedBy: "sageos.test",
      stateStore: store,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:create" } } },
      now: () => new Date("2026-06-01T14:05:00.000Z"),
    });

    expect(result).toMatchObject({
      outcome: "created",
      task: {
        id: "task_review_memory_queue",
        title: "Review memory queue",
        objective: "Replay failed memory captures and summarize blockers.",
        state: "proposed",
        ownerAgentId: "employee_memory_steward",
        requestedBy: "sageos.test",
        autonomyTier: "suggest",
        evidenceRefs: ["task_review_memory_queue"],
        toolProfile: "sageos.default",
        budget: { maxMinutes: 30, maxToolCalls: 50 },
        expectedOutput: "Summary of task outcome, evidence, blockers, and next steps.",
        verificationPlan: ["Confirm the task outcome with available local evidence."],
        rollback: "Cancel before execution or review generated artifacts before applying changes.",
        notificationPolicy: {
          channels: ["overlay"],
          notifyOn: ["completed", "failed", "blocked"],
        },
        sensitivity: "normal",
        riskClass: "low",
        policyScopes: [{ kind: "memory", allow: ["sage_memory"], risk: "low" }],
      },
      status: { tasks: { total: 1, queued: 1 } },
    });
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:create",
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: "task_review_memory_queue" })],
    });
    const rawEvents = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    expect(rawEvents).toContain("task_created");
    expect(rawEvents).toContain("employee_memory_steward");
  });

  it("avoids overwriting existing tasks when title slugs collide", async () => {
    const store = createSageOsStateStore();
    const first = await createSageOsTask({
      title: "Send digest",
      objective: "Send a digest to Telegram.",
      stateStore: store,
      now: () => new Date("2026-06-01T14:10:00.000Z"),
    });
    const second = await createSageOsTask({
      title: "Send digest",
      objective: "Send the next digest to Telegram.",
      stateStore: store,
      now: () => new Date("2026-06-01T14:11:00.000Z"),
    });

    expect(first).toMatchObject({
      task: {
        id: "task_send_digest",
        riskClass: "high",
        policyScopes: [{ kind: "channel", allow: ["external_message"], risk: "high" }],
      },
    });
    expect(second).toMatchObject({ task: { id: "task_send_digest_2" } });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [
        expect.objectContaining({ id: "task_send_digest" }),
        expect.objectContaining({ id: "task_send_digest_2" }),
      ],
    });
  });

  it("rejects assignments to missing or unavailable employees", async () => {
    const store = createSageOsStateStore();

    await expect(
      createSageOsTask({
        title: "Review stale queue",
        objective: "Review stale queue.",
        ownerAgentId: "employee_missing",
        stateStore: store,
      }),
    ).resolves.toEqual({
      outcome: "invalid_owner",
      ownerAgentId: "employee_missing",
      reason: "not_found",
    });

    await upsertSageOsAgent(store, {
      id: "employee_retired",
      name: "Retired Employee",
      role: "archive",
      mission: "No active work.",
      status: "retired",
      autonomyTier: "suggest",
      responsibilities: [],
      allowedScopes: [],
      deniedScopes: [],
      createdAt: "2026-06-01T14:15:00.000Z",
      updatedAt: "2026-06-01T14:15:00.000Z",
    });

    await expect(
      createSageOsTask({
        title: "Review archived work",
        objective: "Review archived work.",
        ownerAgentId: "employee_retired",
        stateStore: store,
      }),
    ).resolves.toEqual({
      outcome: "invalid_owner",
      ownerAgentId: "employee_retired",
      reason: "unavailable",
    });
  });
});
