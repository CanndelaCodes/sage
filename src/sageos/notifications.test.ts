import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSageOsEventLog } from "./event-log.js";
import {
  buildSageOsDigestNotification,
  buildSageOsCompletionNotification,
  buildSageOsIncidentNotification,
  buildSageOsLifecycleNotification,
  buildSageOsTaskNotification,
  sendSageOsCompletionNotificationOnce,
  sendSageOsIncidentNotificationOnce,
  sendSageOsLifecycleNotificationOnce,
  sendSageOsTaskNotificationOnce,
  sendSageOsTelegramDigestOnce,
} from "./notifications.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsCodingReport,
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
    expect(notification.text).toContain("Incidents: 2 warnings");
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

  it("builds and sends startup lifecycle notifications with audit evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-lifecycle-notification-"));
    const status = createSageOsStatusSnapshot({
      supervisor: { enabled: true, paused: false, state: "running" },
      tasks: { total: 2, active: 1, queued: 1, blocked: 0 },
      incidents: [],
    });
    await writeSageOsState(createSageOsStateStore({ stateDir: root }), status);

    const notification = buildSageOsLifecycleNotification({
      kind: "startup",
      status,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    expect(notification).toMatchObject({
      kind: "startup",
      title: "SageOS: Startup",
      target: "telegram:123",
    });
    expect(notification.text).toContain("Supervisor: running");
    expect(notification.text).toContain("Tasks: 1 active, 1 queued, 0 blocked");
    expect(notification.text).toContain("Actions: Open Command Center | Pause SageOS");

    const sender = vi.fn(async () => ({ messageId: "11", chatId: "123" }));
    const sent = await sendSageOsLifecycleNotificationOnce({
      kind: "startup",
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      sender,
    });

    expect(sent).toMatchObject({ outcome: "sent", target: "telegram:123" });
    expect(sender).toHaveBeenCalledWith(
      "telegram:123",
      expect.stringContaining("SageOS: Startup"),
      expect.objectContaining({ plainText: expect.stringContaining("Supervisor: running") }),
    );
    await expect(
      readFile(createSageOsEventLog({ stateDir: root }).path, "utf8"),
    ).resolves.toContain("notification_sent");
  });

  it("builds and sends urgent incident notifications with repair actions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-incident-notification-"));
    const now = "2026-05-27T23:59:00.000Z";
    const status = createSageOsStatusSnapshot({
      incidents: [
        {
          id: "incident_memory_queue_failed",
          severity: "warning",
          category: "memory",
          title: "Sage Memory capture queue has failed entries",
          summary: "1 Sage Memory capture entry is failed and needs replay or repair.",
          firstSeenAt: now,
          lastSeenAt: now,
          autoRepairSafe: true,
          repairAction: {
            id: "repair_memory_queue_replay",
            label: "Replay memory queues",
            command: "sage os memory replay --json",
            gatewayMethod: "sageos.memory.replay",
            risk: "low",
            approvalRequired: false,
          },
        },
      ],
    });
    await writeSageOsState(createSageOsStateStore({ stateDir: root }), status);

    const incident = status.incidents[0];
    if (!incident) {
      throw new Error("incident fixture missing");
    }
    const notification = buildSageOsIncidentNotification({
      incident,
      status,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    expect(notification).toMatchObject({
      kind: "incident",
      title: "SageOS: Incident",
      target: "telegram:123",
    });
    expect(notification.text).toContain("Severity: warning");
    expect(notification.text).toContain("Sage Memory capture queue has failed entries");
    expect(notification.text).toContain("Repair: Replay memory queues");
    expect(notification.text).toContain("Command: sage os memory replay --json");

    const sender = vi.fn(async () => ({ messageId: "12", chatId: "123" }));
    const sent = await sendSageOsIncidentNotificationOnce({
      incidentId: "incident_memory_queue_failed",
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      sender,
    });

    expect(sent).toMatchObject({
      outcome: "sent",
      target: "telegram:123",
      notification: { kind: "incident" },
    });
    expect(sender).toHaveBeenCalledWith(
      "telegram:123",
      expect.stringContaining("SageOS: Incident"),
      expect.objectContaining({ plainText: expect.stringContaining("Replay memory queues") }),
    );
  });

  it("builds and sends Night Shift completion notifications from coding reports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-completion-notification-"));
    const now = "2026-05-28T00:05:00.000Z";
    const report = {
      id: "coding_report_task_fix_1",
      taskId: "task_fix",
      runId: "run_task_fix_1",
      repoPath: "C:\\repo",
      objective: "Fix the fixture test.",
      outcome: "succeeded" as const,
      startedAt: now,
      finishedAt: now,
      preState: { branch: "main", dirty: false, changedFiles: [] },
      postState: { branch: "main", dirty: true, changedFiles: ["README.md"] },
      diff: { stat: "README.md | 1 +", preview: "+done", changedFiles: ["README.md"] },
      tests: [{ command: "node test.js", exitCode: 0, stdoutPreview: "ok", stderrPreview: "" }],
      blockers: [],
      verificationRefs: ["test:node test.js"],
      rollback: "Review git diff and revert changed files if needed.",
      createdAt: now,
      updatedAt: now,
    };
    await writeSageOsState(
      createSageOsStateStore({ stateDir: root }),
      createSageOsStatusSnapshot(),
    );
    await upsertSageOsCodingReport(createSageOsStateStore({ stateDir: root }), report);
    const status = await collectSageOsStatus({ stateDir: root });

    const notification = buildSageOsCompletionNotification({
      report,
      status,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });

    expect(notification).toMatchObject({
      kind: "completion",
      title: "SageOS: Night Shift completed",
      target: "telegram:123",
    });
    expect(notification.text).toContain("Result: succeeded");
    expect(notification.text).toContain("Diff: 1 file changed");
    expect(notification.text).toContain("Tests: 1 passed / 0 failed");
    expect(notification.text).toContain("Report: coding_report_task_fix_1");
    expect(notification.text).not.toContain("+done");

    const sender = vi.fn(async () => ({ messageId: "13", chatId: "123" }));
    const sent = await sendSageOsCompletionNotificationOnce({
      reportId: "coding_report_task_fix_1",
      stateDir: root,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      sender,
    });

    expect(sent).toMatchObject({
      outcome: "sent",
      target: "telegram:123",
      notification: { kind: "completion" },
    });
    expect(sender).toHaveBeenCalledWith(
      "telegram:123",
      expect.stringContaining("SageOS: Night Shift completed"),
      expect.objectContaining({ plainText: expect.stringContaining("Tests: 1 passed / 0 failed") }),
    );
  });
});
