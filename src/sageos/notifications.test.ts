import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSageOsEventLog } from "./event-log.js";
import {
  buildSageOsDigestNotification,
  buildSageOsTaskNotification,
  sendSageOsTaskNotificationOnce,
  sendSageOsTelegramDigestOnce,
} from "./notifications.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsObservation,
  upsertSageOsTask,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { createSageOsStatusSnapshot } from "./types.js";

describe("SageOS notifications", () => {
  it("builds a Telegram digest that redacts private and secret observation content by default", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-notification-digest-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T19:00:00.000Z";

    await writeSageOsState(
      store,
      createSageOsStatusSnapshot({
        supervisor: { enabled: true, paused: false, state: "running" },
        incidents: [
          {
            id: "incident_memory",
            severity: "warning",
            category: "memory",
            title: "Memory queue failed",
            summary: "Replay needed.",
            firstSeenAt: now,
            lastSeenAt: now,
            autoRepairSafe: true,
          },
        ],
      }),
    );
    await upsertSageOsTask(store, {
      id: "task_digest",
      title: "Send digest",
      objective: "Send a redacted Telegram digest.",
      state: "queued",
      requestedBy: "sageos.test",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "channel", allow: ["telegram"], risk: "high" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_waiting",
      title: "Review external write",
      objective: "Wait for external-write approval.",
      state: "waiting_for_policy",
      requestedBy: "sageos.test",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "channel", allow: ["telegram"], risk: "high" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_digest",
      state: "pending",
      riskClass: "external_write",
      title: "Send Telegram digest",
      proposedAction: "Send a redacted digest.",
      evidence: ["task_digest"],
      scope: "task",
      taskId: "task_digest",
      requestedBy: "sageos.test",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_public",
      source: "system",
      state: "captured",
      title: "System health sampled",
      text: "System health is okay.",
      sensitivity: "normal",
      observedAt: now,
      payload: {},
      provenance: { adapter: "test" },
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_private",
      source: "app_focus",
      state: "captured",
      title: "Payroll roadmap",
      text: "Private payroll planning details should not leave local state.",
      sensitivity: "private",
      observedAt: now,
      payload: {},
      provenance: { adapter: "test" },
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_secret",
      source: "browser",
      state: "captured",
      title: "Secret token page",
      text: "SECRET_TOKEN=do-not-send",
      sensitivity: "secret",
      observedAt: now,
      payload: {},
      provenance: { adapter: "test" },
      createdAt: now,
      updatedAt: now,
    });

    const status = await collectSageOsStatus({ stateDir: root });
    const state = await readSageOsState(store);
    const notification = buildSageOsDigestNotification({
      state,
      status,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    expect(notification).toMatchObject({
      kind: "digest",
      title: "SageOS: Daily digest",
      target: "telegram:123",
    });
    expect(notification.text).toContain("Tasks: 0 active, 1 queued, 1 blocked");
    expect(notification.text).toContain("Approvals: 1 pending");
    expect(notification.text).toContain("Incidents: 1 warning");
    expect(notification.text).toContain("Observation: System health sampled");
    expect(notification.text).toContain("Private observations redacted: 2");
    expect(notification.text).toContain("Actions: Open Command Center | Pause SageOS");
    expect(notification.text).not.toContain("Payroll roadmap");
    expect(notification.text).not.toContain("payroll planning");
    expect(notification.text).not.toContain("SECRET_TOKEN");
  });

  it("sends configured Telegram digests with audit evidence and skips disabled Telegram", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-notification-send-"));
    const store = createSageOsStateStore({ stateDir: root });
    await writeSageOsState(
      store,
      createSageOsStatusSnapshot({
        supervisor: { enabled: true, paused: false, state: "running" },
      }),
    );
    const sender = vi.fn(async () => ({ messageId: "42", chatId: "123" }));

    const sent = await sendSageOsTelegramDigestOnce({
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      sender,
    });

    expect(sent).toMatchObject({ outcome: "sent", target: "telegram:123" });
    expect(sender).toHaveBeenCalledWith(
      "telegram:123",
      expect.stringContaining("SageOS: Daily digest"),
      expect.objectContaining({ plainText: expect.stringContaining("SageOS: Daily digest") }),
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      status: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    const logPath = createSageOsEventLog({ stateDir: root }).path;
    await expect(readFile(logPath, "utf8")).resolves.toContain("notification_sent");

    sender.mockClear();
    const skipped = await sendSageOsTelegramDigestOnce({
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: false, target: "telegram:123" } } },
      sender,
    });

    expect(skipped).toMatchObject({ outcome: "skipped", reason: "telegram_disabled" });
    expect(sender).not.toHaveBeenCalled();
    await expect(readFile(logPath, "utf8")).resolves.toContain("notification_skipped");
  });

  it("builds and sends task result notifications with audit evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-task-notification-"));
    const task = {
      id: "task_build",
      title: "Build status widget",
      objective: "Build a local Command Center widget.",
      state: "completed" as const,
      requestedBy: "sageos.task_runner",
      autonomyTier: "execute_scoped" as const,
      policyScopes: [{ kind: "repo" as const, allow: ["C:/repo"], risk: "medium" as const }],
      createdAt: "2026-05-27T21:10:00.000Z",
      updatedAt: "2026-05-27T21:12:00.000Z",
    };
    const run = {
      id: "run_task_build_1",
      taskId: task.id,
      attempt: 1,
      state: "succeeded" as const,
      traceId: "trace_task_build",
      startedAt: "2026-05-27T21:11:00.000Z",
      finishedAt: "2026-05-27T21:12:00.000Z",
    };

    const notification = buildSageOsTaskNotification({
      task,
      run,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    expect(notification).toMatchObject({
      kind: "task",
      title: "SageOS: Task completed",
      target: "telegram:123",
    });
    expect(notification.text).toContain("Task: task_build - Build status widget");
    expect(notification.text).toContain("Run: run_task_build_1 (succeeded)");
    expect(notification.text).toContain("Risk: repo:medium");
    expect(notification.text).toContain("Actions: Open Command Center | Pause SageOS");

    const sender = vi.fn(async () => ({ messageId: "99", chatId: "123" }));
    const sent = await sendSageOsTaskNotificationOnce({
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      task,
      run,
      sender,
    });

    expect(sent).toMatchObject({ outcome: "sent", target: "telegram:123" });
    expect(sender).toHaveBeenCalledWith(
      "telegram:123",
      expect.stringContaining("SageOS: Task completed"),
      expect.objectContaining({ plainText: expect.stringContaining("Run: run_task_build_1") }),
    );
    const logPath = createSageOsEventLog({ stateDir: root }).path;
    await expect(readFile(logPath, "utf8")).resolves.toContain("notification_sent");

    sender.mockClear();
    const skipped = await sendSageOsTaskNotificationOnce({
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: false, target: "telegram:123" } } },
      task,
      run,
      sender,
    });

    expect(skipped).toMatchObject({ outcome: "skipped", reason: "telegram_disabled" });
    expect(sender).not.toHaveBeenCalled();
  });
});
