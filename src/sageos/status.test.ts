import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enqueueLearningEvents, replayLearningEventQueue } from "../learning/activity-queue.js";
import { normalizeLearningEvent } from "../learning/events.js";
import {
  enqueueSageMemoryCaptureFailure,
  replaySageMemoryCaptureQueue,
} from "../memory/sage-memory-capture-queue.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsAgent,
  upsertSageOsAppCandidate,
  upsertSageOsCodingReport,
  upsertSageOsObservation,
  upsertSageOsRun,
  upsertSageOsSkill,
  upsertSageOsTask,
  upsertSageOsWorkflow,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { createSageOsStatusSnapshot } from "./types.js";

describe("SageOS status collector", () => {
  it("collects command-center status from durable resources and local queues", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sageos-status-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T12:00:00.000Z";

    await writeSageOsState(
      store,
      createSageOsStatusSnapshot({
        supervisor: { enabled: true, paused: false, state: "running" },
      }),
    );
    await upsertSageOsAgent(store, {
      id: "agent_memory",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep Sage Memory capture healthy.",
      status: "active",
      autonomyTier: "execute_scoped",
      responsibilities: ["memory"],
      allowedScopes: [{ kind: "memory", allow: ["capture"], risk: "low" }],
      deniedScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    for (const [id, state] of [
      ["task_queued", "queued"],
      ["task_running", "running"],
      ["task_blocked", "blocked"],
    ] as const) {
      await upsertSageOsTask(store, {
        id,
        title: id,
        objective: `Exercise ${state} task accounting.`,
        state,
        requestedBy: "test",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        createdAt: now,
        updatedAt: now,
      });
    }
    await upsertSageOsRun(store, {
      id: "run_active",
      taskId: "task_running",
      attempt: 1,
      state: "running",
      traceId: "trace_active",
      startedAt: now,
    });
    await upsertSageOsWorkflow(store, {
      id: "workflow_focus_code",
      name: "Review repeated Code focus",
      state: "candidate",
      observedPattern: "app_focus:code",
      sourceObservationIds: ["obs_recent", "obs_redacted"],
      trigger: "Repeated Code focus observations",
      inputs: ["window title"],
      outputs: ["workflow candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      implementationRefs: [],
      evalRefs: [],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsSkill(store, {
      id: "skill_focus_code",
      name: "Skill: Review repeated Code focus",
      state: "draft",
      workflowId: "workflow_focus_code",
      provenance: ["workflow_focus_code", "obs_recent", "obs_redacted"],
      triggerConditions: ["Repeated Code focus observations"],
      tests: ["obs_recent", "obs_redacted"],
      allowedScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      rollbackRef: "workflow_focus_code@candidate",
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsAppCandidate(store, {
      id: "app_widget_code_focus",
      name: "Code Focus Widget",
      state: "draft",
      targetSurface: "widget",
      purpose: "Summarize repeated Code focus observations.",
      sourceObservationIds: ["obs_recent", "obs_redacted"],
      provenance: ["workflow_focus_code", "obs_recent", "obs_redacted"],
      sensitivity: "private",
      inputs: ["window title"],
      outputs: ["local widget draft"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      previewCommand: "sage os apps preview app_widget_code_focus",
      artifactRefs: [],
      rollbackRef: "delete apps.json entry app_widget_code_focus",
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsCodingReport(store, {
      id: "coding_report_task_running_1",
      taskId: "task_running",
      runId: "run_active",
      repoPath: "C:\\repo",
      objective: "Run targeted tests.",
      outcome: "succeeded",
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
    });
    await upsertSageOsApproval(store, {
      id: "approval_external",
      state: "pending",
      riskClass: "external_write",
      title: "Send external update",
      proposedAction: "Send a redacted task completion message.",
      evidence: ["task_running"],
      preview: "Task completed.",
      rollbackPlan: "Delete the message if incorrect.",
      scope: "task",
      taskId: "task_running",
      requestedBy: "coding_worker",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_old",
      state: "approved",
      riskClass: "policy_change",
      title: "Change policy",
      proposedAction: "Update autonomy policy.",
      evidence: ["policy_diff"],
      scope: "domain",
      domain: "sageos.policy",
      requestedBy: "operator",
      requestedAt: now,
      resolvedAt: now,
      resolvedBy: "jason",
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_recent",
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
    await upsertSageOsObservation(store, {
      id: "obs_redacted",
      source: "app_focus",
      state: "redacted",
      title: "App focus redacted",
      text: "Active app focus redacted by SageOS privacy policy.",
      sensitivity: "private",
      observedAt: now,
      payload: { redacted: true, reason: "deny_app" },
      provenance: { adapter: "app_focus" },
      reason: "deny_app",
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_failed",
      source: "system",
      state: "failed",
      title: "System source failed",
      text: "System observation failed.",
      sensitivity: "normal",
      observedAt: "2026-05-25T13:00:00.000Z",
      payload: { error: "probe failed" },
      provenance: { adapter: "system" },
      reason: "probe_failed",
      createdAt: "2026-05-25T13:00:00.000Z",
      updatedAt: "2026-05-25T13:00:00.000Z",
    });

    const log = createSageOsEventLog({ stateDir: root });
    await appendSageOsEvent(log, {
      type: "task_queued",
      actor: "test",
      summary: "Queued test task.",
    });

    const memoryQueuePath = path.join(root, "agents", "main", "sage-memory", "capture-queue.json");
    const sessionFile = path.join(root, "session.jsonl");
    await fs.writeFile(sessionFile, "{}\n", "utf8");
    await enqueueSageMemoryCaptureFailure({
      queuePath: memoryQueuePath,
      agentId: "main",
      sessionFile,
      captureMethod: "sage-memory-heartbeat",
      error: "remote offline",
      now: () => new Date(now),
    });
    await replaySageMemoryCaptureQueue({
      queuePath: memoryQueuePath,
      agentId: "main",
      cfg: { memory: { backend: "sage-memory" } } as never,
      managerFactory: () => ({
        ingestLlmSession: async () => {
          throw new Error("still offline");
        },
      }),
      now: () => new Date("2026-05-27T12:01:00.000Z"),
    });

    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");
    const learningEvent = normalizeLearningEvent(
      {
        source: "tool_usage",
        actor: "agent:main",
        title: "Recovered workflow",
        text: "A useful workflow should be retained.",
      },
      {
        now: () => new Date(now),
        idFactory: () => "learning-event-1",
      },
    );
    await enqueueLearningEvents({ queuePath: learningQueuePath, events: [learningEvent] });
    await replayLearningEventQueue({
      queuePath: learningQueuePath,
      ingest: async () => {
        throw new Error("memory unavailable");
      },
      now: () => new Date("2026-05-27T12:02:00.000Z"),
    });

    const snapshot = await collectSageOsStatus({
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: memoryQueuePath,
      learningActivityQueuePath: learningQueuePath,
    });
    const persisted = await readSageOsState(store);

    expect(snapshot.employees).toMatchObject({ total: 1, active: 1 });
    expect(snapshot.tasks).toMatchObject({ total: 3, active: 1, queued: 1, blocked: 1 });
    expect(snapshot.runs).toMatchObject({ total: 1, active: 1, failed: 0 });
    expect(snapshot.workflows).toMatchObject({ total: 1, active: 0, queued: 1, blocked: 0 });
    expect(snapshot.skills).toMatchObject({ total: 1, active: 0, queued: 1, blocked: 0 });
    expect(snapshot.apps).toMatchObject({ total: 1, active: 0, queued: 1, blocked: 0 });
    expect(snapshot.coding).toMatchObject({
      reports: { total: 1, active: 1, blocked: 0 },
      lastReportId: "coding_report_task_running_1",
    });
    expect(persisted.skills).toMatchObject([
      {
        id: "skill_focus_code",
        workflowId: "workflow_focus_code",
      },
    ]);
    expect(persisted.apps).toMatchObject([
      {
        id: "app_widget_code_focus",
        sourceObservationIds: ["obs_recent", "obs_redacted"],
      },
    ]);
    expect(persisted.codingReports).toMatchObject([
      {
        id: "coding_report_task_running_1",
        outcome: "succeeded",
      },
    ]);
    expect(snapshot.approvals.pending).toBe(1);
    expect(snapshot.observations).toMatchObject({
      total: 3,
      recent: 2,
      redacted: 1,
      failed: 1,
    });
    expect(snapshot.memory.captureQueue.failed).toBe(1);
    expect(snapshot.learning.activityQueue.failed).toBe(1);
    expect(snapshot.audit).toMatchObject({ recentEvents: 1, eventLogPath: log.path });
    expect(snapshot.incidents.map((incident) => incident.category)).toEqual(
      expect.arrayContaining(["memory", "learning", "policy"]),
    );
    expect(snapshot.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "incident_memory_queue_failed",
          repairAction: expect.objectContaining({
            command: "sage os memory replay --json",
            gatewayMethod: "sageos.memory.replay",
          }),
        }),
        expect.objectContaining({
          id: "incident_policy_blocked",
          repairAction: expect.objectContaining({
            command: "sage os approvals --json",
            gatewayMethod: "sageos.approvals.list",
          }),
        }),
      ]),
    );
  });

  it("preserves memory doctor export proof and raises failed doctor incidents", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sageos-status-memory-doctor-"));
    const store = createSageOsStateStore({ stateDir: root });
    const memoryQueuePath = path.join(root, "agents", "main", "sage-memory", "capture-queue.json");
    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");

    await writeSageOsState(
      store,
      createSageOsStatusSnapshot({
        memory: {
          status: "ok",
          backend: "sage-memory",
          canonical: "sage-memory",
          captureQueue: { total: 0, pending: 0, failed: 0 },
          doctor: {
            ok: false,
            checkedAt: "2026-05-27T17:30:00.000Z",
            checks: 8,
            warnings: 1,
            failures: 1,
            exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
            diagnosticNamespace: "sage.sessions.diagnostics",
            sessionNodePath: "sage-memory/node_doctor",
          },
        },
      }),
    );

    const snapshot = await collectSageOsStatus({
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: memoryQueuePath,
      learningActivityQueuePath: learningQueuePath,
    });

    expect(snapshot.memory.status).toBe("degraded");
    expect(snapshot.memory.doctor).toMatchObject({
      ok: false,
      checkedAt: "2026-05-27T17:30:00.000Z",
      failures: 1,
      warnings: 1,
      exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
      diagnosticNamespace: "sage.sessions.diagnostics",
    });
    expect(snapshot.incidents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "incident_memory_doctor_failed",
          category: "memory",
          repairAction: expect.objectContaining({
            command: "sage os memory doctor --json",
            gatewayMethod: "sageos.memory.doctor",
          }),
        }),
      ]),
    );
  });
});
