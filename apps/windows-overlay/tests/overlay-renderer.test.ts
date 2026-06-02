import { describe, expect, it, vi } from "vitest";
import {
  getOverlaySurfaceVisibility,
  getOverlayToolbarControls,
  getOverlayGatewayActionState,
  handleOverlayKeyboardShortcut,
  isOverlayInteractiveElement,
  isOverlayVoiceInputAvailable,
  getOverlayConnectionState,
  getOverlayStateCallouts,
  applyOverlayWorkspaceAvailability,
  buildEmployeeOperatorLauncherCommand,
  buildTaskOperatorLauncherCommand,
  readInitialOverlaySurface,
  readOverlayGatewaySettings,
  readOverlayInteractionSettings,
  readOverlayLayoutSettings,
  renderOverlayModel,
  SageOsOverlayApp,
} from "../src/renderer/overlay-app.js";

const state = {
  status: {
    generatedAt: "2026-06-01T13:00:00.000Z",
    mode: "execute_scoped",
    supervisor: { state: "running", enabled: true, paused: false },
    employees: { total: 7, active: 3, queued: 1, blocked: 0 },
    approvals: { pending: 2 },
    tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
    runs: { total: 4, active: 1, queued: 0, failed: 1 },
    workflows: { total: 5, active: 2, queued: 1, blocked: 0 },
    skills: { total: 9, active: 1, queued: 0, blocked: 0 },
    apps: { total: 2, active: 1, queued: 0, blocked: 0 },
    observations: { total: 20, recent: 4, redacted: 2, failed: 1 },
    memory: {
      status: "degraded",
      backend: "sage-memory",
      canonical: "sage-memory",
      captureQueue: { total: 6, pending: 2, failed: 1, path: "memory.jsonl" },
    },
    learning: {
      status: "ok",
      activityQueue: { total: 5, pending: 1, failed: 0, path: "learning.jsonl" },
    },
    sources: { enabled: ["apps", "clipboard"], disabled: ["audio"], failing: ["screen"] },
    policy: {
      mode: "execute_scoped",
      defaultTier: "execute_scoped",
      approvalsRequired: ["destructive", "external_writes"],
    },
    coding: {
      enabled: true,
      allowedRepos: ["C:/Users/jason/Desktop/sage"],
      restrictions: ["no destructive git"],
      reports: { total: 2, active: 0, queued: 1, blocked: 0 },
    },
    notifications: {
      telegram: {
        enabled: true,
        target: "Jason",
        digestSchedule: "0 8 * * *",
        batchWindowMinutes: 15,
        quietHours: { start: "22:00", end: "07:00", timezone: "UTC" },
      },
      urgentPending: 1,
      recent: {
        sent: 2,
        failed: 1,
        skipped: 1,
        lastOutcome: "skipped",
        lastSummary: "Skipped SageOS Telegram digest because quiet hours are active.",
      },
      batch: {
        path: "notification-batch.json",
        pending: 1,
        total: 1,
        firstQueuedAt: "2026-06-01T13:00:00.000Z",
        dueAt: "2026-06-01T13:15:00.000Z",
      },
      digest: {
        path: "notification-digest.json",
        schedule: "0 8 * * *",
        lastScheduledFor: "2026-06-01T12:00:00.000Z",
        nextDueAt: "2026-06-02T12:00:00.000Z",
      },
    },
    audit: { recentEvents: 12, eventLogPath: "events.jsonl" },
    incidents: [
      {
        id: "incident_1",
        severity: "warning",
        title: "Memory queue backlog",
        summary: "Memory queue has failed captures.",
        autoRepairSafe: true,
        repairAction: {
          id: "repair_memory_replay",
          label: "Replay memory queue",
          gatewayMethod: "sageos.memory.replay",
          approvalRequired: false,
        },
      },
    ],
  },
  agents: [
    {
      id: "employee_memory",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep Sage Memory capture healthy.",
      status: "active",
      autonomyTier: "execute_scoped",
      responsibilities: ["memory"],
      allowedScopes: [{ kind: "memory", allow: ["capture"], risk: "low" }],
      deniedScopes: [{ kind: "memory", deny: ["private_data_export"], risk: "critical" }],
      tools: ["sage-memory"],
      memoryScopes: ["capture_queue"],
      schedules: ["gateway tick"],
      risks: ["incorrect replay"],
    },
  ],
  tasks: [
    {
      id: "task_1",
      title: "Night Shift report",
      objective: "Summarize coding work",
      state: "running",
      ownerAgentId: "employee_memory",
      evidenceRefs: ["memory:node_1"],
      toolProfile: "sageos.coding-worker",
      budget: { maxMinutes: 45, maxToolCalls: 80 },
      expectedOutput: "Implementation report with tests.",
      verificationPlan: ["Run focused tests", "Review changed files"],
      rollback: "Revert the scoped branch.",
      notificationPolicy: {
        channels: ["overlay", "telegram"],
        notifyOn: ["completed", "failed"],
      },
      sensitivity: "normal",
      riskClass: "medium",
    },
    { id: "task_2", title: "Memory replay", objective: "Replay queued memory captures", state: "proposed" },
  ],
  runs: [
    {
      id: "run_task_1",
      taskId: "task_1",
      attempt: 1,
      state: "running",
      traceId: "trace_task_1",
      workerSessionId: "worker_task_1_1",
      currentToolCall: "node test.js",
      budgetUsed: { elapsedMinutes: 12, toolCalls: 9, costUsd: 0.02 },
      timeline: [
        {
          at: "2026-06-01T12:50:00.000Z",
          label: "Started run",
          state: "running",
          ref: "run_task_1",
        },
        {
          at: "2026-06-01T12:55:00.000Z",
          label: "Ran tests",
          state: "running",
          ref: "test:node test.js",
        },
      ],
      logs: ["Started SageOS task task_1 run run_task_1"],
      artifacts: ["coding_report_task_1"],
      verificationResult: {
        outcome: "passed",
        summary: "Tests passed",
        refs: ["test:node test.js"],
      },
      startedAt: "2026-06-01T12:50:00.000Z",
    },
  ],
  approvals: [
    {
      id: "approval_1",
      title: "Approve repair",
      proposedAction: "Run memory replay",
      state: "pending",
      riskClass: "local_reversible_write",
      evidence: ["incident_1", "memory:queue"],
      preview: "Would replay failed memory captures only.",
      rollbackPlan: "Stop replay and keep failed items queued.",
      scope: "task",
      taskId: "task_1",
      runId: "run_task_1",
      employeeId: "employee_memory",
      workflowId: "workflow_1",
      domain: "memory",
      requestedBy: "Security Sentinel",
      requestedAt: "2026-06-01T12:58:00.000Z",
      expiresAt: "2026-06-01T13:58:00.000Z",
    },
  ],
  codingReports: [
    {
      id: "coding_report_task_1",
      taskId: "task_1",
      repoPath: "C:/Users/jason/Desktop/sage",
      objective: "Summarize coding work",
      outcome: "succeeded",
      tests: [{ command: "node test.js", exitCode: 0 }],
      blockers: [],
      diff: { changedFiles: ["README.md"] },
    },
  ],
  workflows: [
    {
      id: "workflow_1",
      name: "Review repeated Code focus",
      state: "candidate",
      observedPattern: "app_focus:code",
      trigger: "Repeated Code focus observations",
      inputs: ["window title"],
      outputs: ["workflow candidate"],
      sourceObservationIds: ["obs_1"],
    },
  ],
  skills: [
    {
      id: "skill_1",
      name: "Skill: Review repeated Code focus",
      state: "draft",
      workflowId: "workflow_1",
      provenance: ["workflow_1", "obs_1"],
      tests: ["obs_1"],
      triggerConditions: ["Repeated Code focus observations"],
    },
  ],
  apps: [
    {
      id: "app_1",
      name: "Code Focus Widget",
      state: "draft",
      targetSurface: "widget",
      purpose: "Summarize repeated Code focus observations.",
      previewCommand: "sage os apps preview app_1",
      artifactRefs: ["apps/code-focus"],
    },
  ],
  observations: [
    {
      id: "obs_1",
      source: "app_focus",
      state: "captured",
      title: "Code: SageOS",
      text: "Active app focus: Code - SageOS",
      observedAt: "2026-06-01T12:55:00.000Z",
    },
  ],
  collaborations: [
    {
      id: "collab_1",
      kind: "handoff",
      fromAgentId: "employee_memory",
      toAgentId: "employee_reviewer",
      title: "Review memory queue",
      summary: "Review failed capture replay evidence.",
      artifactRefs: ["coding_report_task_1"],
      state: "open",
    },
  ],
};

describe("overlay renderer model", () => {
  it("maps SageOS state into Command Deck cards", () => {
    const model = renderOverlayModel(state as never);
    expect(model.commandDeck.cards.map((card) => card.title)).toEqual([
      "Supervisor",
      "Active Operations",
      "Approvals",
      "Incidents",
    ]);
  });

  it("maps the same state into HUD and Edge Rail badges", () => {
    const model = renderOverlayModel(state as never);
    expect(model.hud.badges).toEqual([
      { label: "Tasks", value: "1" },
      { label: "Approvals", value: "2" },
      { label: "Incidents", value: "1" },
    ]);
    expect(model.edgeRail.badges).toEqual([
      { kind: "health", count: 0, target: { kind: "system", id: "supervisor" } },
      { kind: "approval", count: 2, target: { kind: "approval", id: "approval_1" } },
      { kind: "incident", count: 1, target: { kind: "incident", id: "incident_1" } },
    ]);
  });

  it("honors badge visibility settings for HUD and Edge Rail", () => {
    const model = renderOverlayModel(state as never, {
      showApprovalBadge: false,
      showIncidentBadge: false,
    });

    expect(model.hud.badges).toEqual([{ label: "Tasks", value: "1" }]);
    expect(model.edgeRail.badges).toEqual([
      { kind: "health", count: 0, target: { kind: "system", id: "supervisor" } },
    ]);
  });

  it("maps tasks, approvals, and incidents into operational rows", () => {
    const model = renderOverlayModel(state as never);

    expect(model.workspace).toMatchObject({
      title: "run_task_1",
      eyebrow: "Run / running",
    });
    expect(model.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Worker", value: "worker_task_1_1" },
        { label: "Current tool", value: "node test.js" },
        { label: "Budget used", value: "12 min / 9 tool calls / $0.02" },
      ]),
    );
    expect(model.commandDeck.tasks).toEqual([
      {
        id: "task_1",
        title: "Night Shift report",
        detail: "Summarize coding work",
        state: "running",
        owner: "Memory Steward",
        progress: "node test.js / 12 min / 9 tool calls",
        canQueue: false,
        canCancel: true,
      },
      {
        id: "task_2",
        title: "Memory replay",
        detail: "Replay queued memory captures",
        state: "proposed",
        owner: "Unassigned",
        progress: "No run yet",
        canQueue: true,
        canCancel: true,
      },
    ]);
    expect(model.commandDeck.approvals[0]).toMatchObject({
      id: "approval_1",
      title: "Approve repair",
      risk: "local_reversible_write",
      state: "pending",
    });
    expect(model.commandDeck.incidents[0]).toMatchObject({
      id: "incident_1",
      title: "Memory queue backlog",
      severity: "warning",
      repairLabel: "Replay memory queue",
      canRepair: true,
    });
    expect(model.commandDeck.codingReports).toEqual([
      {
        id: "coding_report_task_1",
        title: "Summarize coding work",
        detail: "succeeded / 1 changed / 1 test",
        outcome: "succeeded",
      },
    ]);
    expect(model.commandDeck.resources.map((resource) => resource.title)).toEqual([
      "Memory Steward",
      "run_task_1",
      "Review repeated Code focus",
      "Skill: Review repeated Code focus",
      "Code Focus Widget",
      "Code: SageOS",
      "Review memory queue",
    ]);
    expect(model.commandDeck.systemResources.map((resource) => resource.title)).toEqual([
      "Supervisor",
      "Security",
      "PC Management",
      "Memory",
      "Learning",
      "Sources",
      "Policy",
      "Notifications",
      "Audit",
    ]);
  });

  it("maps the full SageOS contract into overview groups", () => {
    const model = renderOverlayModel(state as never);

    expect(model.overview.map((group) => group.title)).toEqual([
      "Workforce",
      "Computer",
      "Memory",
    ]);
    expect(model.overview[0].rows).toContainEqual({
      label: "Employees",
      value: "3 active",
      detail: "7 total / 0 blocked",
    });
    expect(model.overview[1].rows).toContainEqual({
      label: "Observations",
      value: "4 recent",
      detail: "20 total / 1 failed / 2 redacted",
    });
    expect(model.overview[1].rows).toContainEqual({
      label: "Security",
      value: "0 urgent",
      detail: "1 warnings / 1 incidents",
    });
    expect(model.overview[1].rows).toContainEqual({
      label: "Policy",
      value: "execute_scoped",
      detail: "destructive, external_writes",
    });
    expect(model.overview[2].rows).toContainEqual({
      label: "Memory",
      value: "degraded",
      detail: "2 pending / 1 failed / sage-memory",
    });
    expect(model.overview[2].rows).toContainEqual({
      label: "Notifications",
      value: "1 urgent",
      detail:
        "Telegram enabled / digest 0 8 * * * / next 2026-06-02T12:00:00.000Z / batch 15m / 1 queued / due 2026-06-01T13:15:00.000Z / quiet 22:00-07:00 UTC",
    });
    expect(model.overview[2].rows).toContainEqual({
      label: "Audit",
      value: "12 events",
      detail: "events.jsonl",
    });
  });

  it("builds workspace details for selected operational targets", () => {
    const taskModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "task", id: "task_1" },
    });
    const approvalModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "approval", id: "approval_1" },
    });
    const incidentModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "incident", id: "incident_1" },
    });
    const codingReportModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "codingReport", id: "coding_report_task_1" },
    });
    const employeeModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "employee", id: "employee_memory" },
    });
    const pausedEmployeeModel = renderOverlayModel(
      {
        ...state,
        agents: [{ ...state.agents[0], status: "paused" }],
      } as never,
      {
        workspaceTarget: { kind: "employee", id: "employee_memory" },
      },
    );
    const draftEmployeeModel = renderOverlayModel(
      {
        ...state,
        agents: [{ ...state.agents[0], status: "draft" }],
      } as never,
      {
        workspaceTarget: { kind: "employee", id: "employee_memory" },
      },
    );
    const runModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "run", id: "run_task_1" },
    });
    const workflowModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "workflow", id: "workflow_1" },
    });
    const skillModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "skill", id: "skill_1" },
    });
    const appModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "app", id: "app_1" },
    });
    const observationModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "observation", id: "obs_1" },
    });
    const collaborationModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "collaboration", id: "collab_1" },
    });
    const securityModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "security" },
    });
    const pcManagementModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "pc-management" },
    });
    const memoryModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "memory" },
    });
    const policyModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "policy" },
    });
    const notificationModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "notifications" },
    });
    const auditModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "audit" },
    });

    expect(taskModel.workspace).toMatchObject({
      title: "Night Shift report",
      eyebrow: "Task / running",
      actions: [
        { kind: "cancelTask", label: "Cancel", enabled: true },
        { kind: "pauseTask", label: "Pause", enabled: true },
        { kind: "askTaskUpdate", label: "Ask for update", enabled: true },
        { kind: "increaseTaskBudget", label: "Increase budget", enabled: true },
        { kind: "reassignTask", label: "Reassign", enabled: true },
        { kind: "requestTaskReview", label: "Request review", enabled: true },
      ],
    });
    expect(taskModel.workspace.facts).toContainEqual({
      label: "Objective",
      value: "Summarize coding work",
    });
    expect(taskModel.workspace.facts).toContainEqual({
      label: "Owner",
      value: "Memory Steward",
    });
    expect(taskModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Risk", value: "medium" },
        { label: "Tool profile", value: "sageos.coding-worker" },
        { label: "Budget", value: "45 min / 80 tool calls" },
        { label: "Expected output", value: "Implementation report with tests." },
        { label: "Verification", value: "Run focused tests, Review changed files" },
        { label: "Rollback", value: "Revert the scoped branch." },
        { label: "Evidence", value: "memory:node_1" },
        { label: "Notify", value: "overlay, telegram / completed, failed" },
        { label: "Sensitivity", value: "normal" },
      ]),
    );
    expect(approvalModel.workspace).toMatchObject({
      title: "Approve repair",
      eyebrow: "Approval / pending",
      actions: [
        { kind: "approveApproval", label: "Approve", enabled: true },
        { kind: "denyApproval", label: "Deny", enabled: true },
      ],
    });
    expect(approvalModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Scope", value: "task" },
        { label: "Preview", value: "Would replay failed memory captures only." },
        { label: "Rollback", value: "Stop replay and keep failed items queued." },
        { label: "Task", value: "task_1" },
        { label: "Run", value: "run_task_1" },
        { label: "Employee", value: "employee_memory" },
        { label: "Workflow", value: "workflow_1" },
        { label: "Domain", value: "memory" },
        { label: "Requested at", value: "2026-06-01T12:58:00.000Z" },
        { label: "Expires", value: "2026-06-01T13:58:00.000Z" },
        { label: "Evidence", value: "incident_1, memory:queue" },
      ]),
    );
    expect(incidentModel.workspace).toMatchObject({
      title: "Memory queue backlog",
      eyebrow: "Incident / warning",
      actions: [{ kind: "runIncidentRepair", label: "Replay memory queue", enabled: true }],
    });
    expect(codingReportModel.workspace).toMatchObject({
      title: "Summarize coding work",
      eyebrow: "Coding report / succeeded",
      actions: [],
    });
    expect(codingReportModel.workspace.facts).toContainEqual({
      label: "Tests",
      value: "node test.js: 0",
    });
    expect(employeeModel.workspace).toMatchObject({
      title: "Memory Steward",
      eyebrow: "Employee / active",
      actions: [
        { kind: "assignEmployeeTask", label: "Assign task", enabled: true },
        { kind: "editEmployee", label: "Edit", enabled: true },
        { kind: "pauseEmployee", label: "Pause", enabled: true },
        { kind: "retireEmployee", label: "Retire", enabled: true },
      ],
    });
    expect(employeeModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Assigned tasks", value: "Night Shift report (running)" },
        { label: "Tools", value: "sage-memory" },
        { label: "Memory", value: "capture_queue" },
        { label: "Schedules", value: "gateway tick" },
        { label: "Risks", value: "incorrect replay" },
        { label: "Denied scopes", value: "memory:deny private_data_export (critical)" },
      ]),
    );
    expect(pausedEmployeeModel.workspace).toMatchObject({
      title: "Memory Steward",
      eyebrow: "Employee / paused",
      actions: [
        { kind: "assignEmployeeTask", label: "Assign task", enabled: true },
        { kind: "editEmployee", label: "Edit", enabled: true },
        { kind: "resumeEmployee", label: "Resume", enabled: true },
        { kind: "retireEmployee", label: "Retire", enabled: true },
      ],
    });
    expect(draftEmployeeModel.workspace).toMatchObject({
      title: "Memory Steward",
      eyebrow: "Employee / draft",
      actions: [
        { kind: "assignEmployeeTask", label: "Assign task", enabled: true },
        { kind: "editEmployee", label: "Edit", enabled: true },
        { kind: "activateEmployee", label: "Activate", enabled: true },
        { kind: "retireEmployee", label: "Retire", enabled: true },
      ],
    });
    expect(runModel.workspace).toMatchObject({
      title: "run_task_1",
      eyebrow: "Run / running",
    });
    expect(runModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Worker", value: "worker_task_1_1" },
        { label: "Trace", value: "trace_task_1" },
        { label: "Current tool", value: "node test.js" },
        { label: "Budget used", value: "12 min / 9 tool calls / $0.02" },
        { label: "Verification", value: "passed / Tests passed / test:node test.js" },
        {
          label: "Timeline",
          value: "Started run (running) -> run_task_1, Ran tests (running) -> test:node test.js",
        },
        { label: "Logs", value: "Started SageOS task task_1 run run_task_1" },
        { label: "Artifacts", value: "coding_report_task_1" },
      ]),
    );
    expect(workflowModel.workspace).toMatchObject({
      title: "Review repeated Code focus",
      eyebrow: "Workflow / candidate",
    });
    expect(skillModel.workspace).toMatchObject({
      title: "Skill: Review repeated Code focus",
      eyebrow: "Skill / draft",
    });
    expect(appModel.workspace).toMatchObject({
      title: "Code Focus Widget",
      eyebrow: "App / draft",
    });
    expect(observationModel.workspace).toMatchObject({
      title: "Code: SageOS",
      eyebrow: "Observation / app_focus",
    });
    expect(collaborationModel.workspace).toMatchObject({
      title: "Review memory queue",
      eyebrow: "Collaboration / handoff",
    });
    expect(securityModel.workspace).toMatchObject({
      title: "Security",
      eyebrow: "System / degraded",
    });
    expect(securityModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Urgent incidents", value: "0" },
        { label: "Warning incidents", value: "1" },
        { label: "Failing sources", value: "screen" },
      ]),
    );
    expect(pcManagementModel.workspace).toMatchObject({
      title: "PC Management",
      eyebrow: "System / observing",
    });
    expect(pcManagementModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Enabled sources", value: "apps, clipboard" },
        { label: "Recent observations", value: "4" },
        { label: "Redacted observations", value: "2" },
      ]),
    );
    expect(memoryModel.workspace).toMatchObject({
      title: "Memory",
      eyebrow: "System / degraded",
    });
    expect(memoryModel.workspace.facts).toContainEqual({
      label: "Capture queue",
      value: "2 pending / 1 failed",
    });
    expect(policyModel.workspace).toMatchObject({
      title: "Policy",
      eyebrow: "System / execute_scoped",
    });
    expect(notificationModel.workspace.facts).toEqual(
      expect.arrayContaining([
        { label: "Digest schedule", value: "0 8 * * *" },
        { label: "Digest next", value: "2026-06-02T12:00:00.000Z" },
        { label: "Digest last", value: "2026-06-01T12:00:00.000Z" },
        { label: "Batch window", value: "15m" },
        { label: "Batch queued", value: "1 pending / 1 total" },
        { label: "Batch due", value: "2026-06-01T13:15:00.000Z" },
        { label: "Batch queue", value: "notification-batch.json" },
        { label: "Quiet hours", value: "22:00-07:00 UTC" },
        { label: "Recent", value: "2 sent / 1 failed / 1 skipped" },
        { label: "Last outcome", value: "skipped" },
      ]),
    );
    expect(auditModel.workspace).toMatchObject({
      title: "Audit",
      eyebrow: "System / events",
    });
  });

  it("redacts private and secret observation bodies in overlay summaries and workspace", () => {
    const privateState = {
      ...state,
      observations: [
        ...state.observations,
        {
          id: "obs_secret",
          source: "app_focus",
          state: "captured",
          title: "Secret app focus",
          text: "Sensitive window title with a private token",
          sensitivity: "secret",
          observedAt: "2026-06-01T12:56:00.000Z",
        },
      ],
    };

    const model = renderOverlayModel(privateState as never, {
      workspaceTarget: { kind: "observation", id: "obs_secret" },
    });

    expect(
      model.commandDeck.resources.find((resource) => resource.id === "obs_secret"),
    ).toMatchObject({
      title: "Secret app focus",
      detail: "Private observation text redacted",
      state: "captured",
    });
    expect(model.workspace).toMatchObject({
      title: "Secret app focus",
      eyebrow: "Observation / app_focus",
      detail: "Private observation text redacted",
    });
    expect(model.workspace.facts).toContainEqual({ label: "Sensitivity", value: "secret" });
  });

  it("maps pinned widgets into live status summaries", () => {
    const model = renderOverlayModel(state as never);

    expect(model.pinnedWidgets).toEqual([
      {
        id: "activeOperations",
        title: "Active Operations",
        value: "1",
        detail: "1 queued / 1 blocked",
      },
      {
        id: "approvals",
        title: "Approvals",
        value: "2",
        detail: "Pending decisions",
      },
      {
        id: "incidents",
        title: "Incidents",
        value: "1",
        detail: "0 urgent / 1 warning",
      },
    ]);
  });

  it("uses configured pinned widget order to shape live summaries", () => {
    const model = renderOverlayModel(state as never, {
      pinnedWidgets: ["memoryQueue", "systemHealth", "nightShift", "appPreview"],
    });

    expect(model.pinnedWidgets).toEqual([
      {
        id: "memoryQueue",
        title: "Memory Queue",
        value: "2",
        detail: "1 failed / 6 total",
      },
      {
        id: "systemHealth",
        title: "System Health",
        value: "Degraded",
        detail: "1 failing source / 0 urgent incidents",
      },
      {
        id: "nightShift",
        title: "Night Shift",
        value: "1 queued",
        detail: "0 active / 0 blocked",
      },
      {
        id: "appPreview",
        title: "App Preview",
        value: "1 active",
        detail: "2 total / 0 blocked",
      },
    ]);
  });

  it("reads gateway settings from URL parameters before defaults", () => {
    const settings = readOverlayGatewaySettings(
      "?gatewayUrl=ws%3A%2F%2F127.0.0.1%3A18888&token=abc&password=secret",
      null,
    );

    expect(settings).toEqual({
      url: "ws://127.0.0.1:18888",
      token: "abc",
      password: "secret",
    });
  });

  it("reads and normalizes the initial overlay surface from URL parameters", () => {
    expect(readInitialOverlaySurface("?surface=hud")).toBe("hud");
    expect(readInitialOverlaySurface("?surface=edgeRail")).toBe("edgeRail");
    expect(readInitialOverlaySurface("?surface=unexpected")).toBe("commandDeck");
  });

  it("reads and normalizes overlay layout settings from URL parameters", () => {
    expect(
      readOverlayLayoutSettings(
        "?collapsedEdge=left&pinnedWidgets=nightShift,systemHealth,unknown,nightShift",
      ),
    ).toEqual({
      collapsedEdge: "left",
      pinnedWidgets: ["nightShift", "systemHealth"],
      showApprovalBadge: true,
      showIncidentBadge: true,
    });
    expect(readOverlayLayoutSettings("?collapsedEdge=center&pinnedWidgets=unknown")).toEqual({
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations", "approvals", "incidents"],
      showApprovalBadge: true,
      showIncidentBadge: true,
    });
    expect(readOverlayLayoutSettings("?showApprovalBadge=0&showIncidentBadge=false")).toEqual({
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations", "approvals", "incidents"],
      showApprovalBadge: false,
      showIncidentBadge: false,
    });
  });

  it("reads overlay interaction settings with voice disabled by default", () => {
    expect(readOverlayInteractionSettings("")).toEqual({
      voice: { enabled: false },
    });
    expect(readOverlayInteractionSettings("?voice=alwaysOn")).toEqual({
      voice: { enabled: false },
    });
  });

  it("enables push-to-talk voice entry from the renderer query", () => {
    expect(readOverlayInteractionSettings("?voice=pushToTalk")).toEqual({
      voice: { enabled: true, mode: "pushToTalk" },
    });
  });

  it("only treats voice input as available when a browser speech recognizer exists", () => {
    expect(isOverlayVoiceInputAvailable({})).toBe(false);
    expect(isOverlayVoiceInputAvailable({ SpeechRecognition: function SpeechRecognition() {} })).toBe(
      true,
    );
    expect(
      isOverlayVoiceInputAvailable({ webkitSpeechRecognition: function WebkitSpeechRecognition() {} }),
    ).toBe(true);
  });

  it("keeps full overlay, HUD, and edge rail sections mutually exclusive", () => {
    expect(getOverlaySurfaceVisibility("commandDeck")).toMatchObject({
      launcher: true,
      commandDeck: true,
      overview: true,
      operationalRows: true,
      agentWorkspace: true,
      compactHud: false,
      edgeRail: false,
    });
    expect(getOverlaySurfaceVisibility("hud")).toMatchObject({
      launcher: false,
      commandDeck: false,
      compactHud: true,
      edgeRail: false,
      pinnedWidgets: false,
    });
    expect(getOverlaySurfaceVisibility("edgeRail")).toMatchObject({
      launcher: false,
      commandDeck: false,
      compactHud: false,
      edgeRail: true,
      pinnedWidgets: true,
    });
  });

  it("renders into light DOM so the packaged overlay stylesheet applies", () => {
    const app = new SageOsOverlayApp();
    const renderRoot = (
      app as unknown as {
        createRenderRoot(): Element | DocumentFragment;
      }
    ).createRenderRoot();

    expect(renderRoot).toBe(app);
  });

  it("exposes normal stop as a first-class command deck toolbar control", () => {
    expect(getOverlayToolbarControls("commandDeck").map((control) => control.label)).toEqual([
      "Pause",
      "Resume",
      "Stop",
      "Emergency stop",
      "Full",
      "Rail",
      "Close",
    ]);
  });

  it("marks gateway mutation toolbar controls unavailable when disconnected or busy", () => {
    const disconnectedControls = getOverlayToolbarControls("commandDeck", {
      connected: false,
      loading: false,
    });
    expect(disconnectedControls.filter((control) => control.disabled).map((control) => control.kind)).toEqual([
      "pause",
      "resume",
      "stop",
      "emergencyStop",
    ]);
    expect(
      disconnectedControls.find((control) => control.kind === "pause")?.disabledReason,
    ).toBe("Gateway unavailable");
    expect(disconnectedControls.find((control) => control.kind === "close")?.disabled).toBeUndefined();

    const busyControls = getOverlayToolbarControls("commandDeck", {
      connected: true,
      loading: true,
    });
    expect(busyControls.find((control) => control.kind === "stop")?.disabledReason).toBe(
      "Gateway request in progress",
    );
  });

  it("normalizes gateway-backed action availability with operator-facing reasons", () => {
    expect(
      getOverlayGatewayActionState({
        enabled: true,
        availability: { connected: true, loading: false },
      }),
    ).toEqual({ enabled: true, disabledReason: undefined });
    expect(
      getOverlayGatewayActionState({
        enabled: true,
        availability: { connected: false, loading: false },
      }),
    ).toEqual({ enabled: false, disabledReason: "Gateway unavailable" });
    expect(
      getOverlayGatewayActionState({
        enabled: true,
        availability: { connected: true, loading: true },
      }),
    ).toEqual({ enabled: false, disabledReason: "Gateway request in progress" });
    expect(
      getOverlayGatewayActionState({
        enabled: false,
        disabledReason: "Task is not queueable",
        availability: { connected: false, loading: true },
      }),
    ).toEqual({ enabled: false, disabledReason: "Task is not queueable" });
  });

  it("disables gateway-backed workspace actions while keeping local prefill actions available", () => {
    const employeeModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "employee", id: "employee_memory" },
    });
    const employeeWorkspace = applyOverlayWorkspaceAvailability(employeeModel.workspace, {
      connected: false,
      loading: false,
    });
    const taskModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "task", id: "task_1" },
    });
    const taskWorkspace = applyOverlayWorkspaceAvailability(taskModel.workspace, {
      connected: false,
      loading: false,
    });

    expect(employeeWorkspace.actions).toEqual([
      { kind: "assignEmployeeTask", label: "Assign task", enabled: true, target: expect.any(Object) },
      { kind: "editEmployee", label: "Edit", enabled: true, target: expect.any(Object) },
      {
        kind: "pauseEmployee",
        label: "Pause",
        enabled: false,
        disabledReason: "Gateway unavailable",
        target: expect.any(Object),
      },
      {
        kind: "retireEmployee",
        label: "Retire",
        enabled: false,
        disabledReason: "Gateway unavailable",
        target: expect.any(Object),
      },
    ]);
    expect(taskWorkspace.actions).toEqual([
      {
        kind: "cancelTask",
        label: "Cancel",
        enabled: false,
        disabledReason: "Gateway unavailable",
        target: expect.any(Object),
      },
      { kind: "pauseTask", label: "Pause", enabled: true, target: expect.any(Object) },
      { kind: "askTaskUpdate", label: "Ask for update", enabled: true, target: expect.any(Object) },
      { kind: "increaseTaskBudget", label: "Increase budget", enabled: true, target: expect.any(Object) },
      { kind: "reassignTask", label: "Reassign", enabled: true, target: expect.any(Object) },
      { kind: "requestTaskReview", label: "Request review", enabled: true, target: expect.any(Object) },
    ]);
  });

  it("builds launcher prompts for local active-operation controls", () => {
    expect(buildTaskOperatorLauncherCommand(state as never, "task_1", "askTaskUpdate")).toBe(
      "Ask Memory Steward for an update on Night Shift report",
    );
    expect(buildTaskOperatorLauncherCommand(state as never, "task_1", "increaseTaskBudget")).toBe(
      "Increase budget for Night Shift report to ",
    );
    expect(buildTaskOperatorLauncherCommand(state as never, "task_1", "pauseTask")).toBe(
      "Pause Night Shift report",
    );
    expect(buildTaskOperatorLauncherCommand(state as never, "task_1", "reassignTask")).toBe(
      "Reassign Night Shift report to ",
    );
    expect(buildTaskOperatorLauncherCommand(state as never, "task_1", "requestTaskReview")).toBe(
      "Ask Reviewer to review Night Shift report",
    );
  });

  it("builds launcher prompts for local employee edit controls", () => {
    expect(buildEmployeeOperatorLauncherCommand(state as never, "employee_memory", "editEmployee")).toBe(
      "Edit employee Memory Steward: ",
    );
  });

  it("labels connection states explicitly for production overlay operation", () => {
    expect(
      getOverlayConnectionState({
        connected: true,
        loading: false,
        error: null,
        hasState: true,
      }),
    ).toEqual({
      label: "Connected",
      detail: "Live SageOS gateway state",
      tone: "success",
    });
    expect(
      getOverlayConnectionState({
        connected: false,
        loading: true,
        error: null,
        hasState: false,
      }),
    ).toMatchObject({ label: "Loading", tone: "loading" });
    expect(
      getOverlayConnectionState({
        connected: false,
        loading: false,
        error: null,
        hasState: true,
      }),
    ).toEqual({
      label: "Reconnecting",
      detail: "Showing last known SageOS state",
      tone: "warning",
    });
    expect(
      getOverlayConnectionState({
        connected: false,
        loading: false,
        error: "Error: gateway not connected",
        hasState: false,
      }),
    ).toEqual({
      label: "Error",
      detail: "gateway not connected",
      tone: "error",
    });
  });

  it("surfaces stale, empty, loading, and error callouts without hiding loaded state", () => {
    expect(
      getOverlayStateCallouts({
        connected: false,
        loading: false,
        error: null,
        hasState: true,
      }),
    ).toEqual([
      {
        message: "Gateway disconnected. Showing last known SageOS state.",
        tone: "warning",
      },
    ]);
    expect(
      getOverlayStateCallouts({
        connected: false,
        loading: false,
        error: null,
        hasState: false,
      }),
    ).toEqual([
      {
        message: "Waiting for SageOS gateway connection.",
        tone: "empty",
      },
    ]);
    expect(
      getOverlayStateCallouts({
        connected: true,
        loading: true,
        error: null,
        hasState: true,
      }),
    ).toEqual([
      {
        message: "Refreshing SageOS state...",
        tone: "loading",
      },
    ]);
    expect(
      getOverlayStateCallouts({
        connected: false,
        loading: false,
        error: "Error: gateway not connected",
        hasState: false,
      }),
    ).toEqual([
      {
        message: "gateway not connected",
        tone: "error",
      },
    ]);
  });

  it("maps overlay keyboard shortcuts to close and launcher focus actions", () => {
    const close = vi.fn();
    const focusLauncher = vi.fn();
    const preventDefault = vi.fn();

    handleOverlayKeyboardShortcut(
      {
        key: "Escape",
        target: { tagName: "MAIN" },
        preventDefault,
      } as unknown as KeyboardEvent,
      { close, focusLauncher },
    );
    handleOverlayKeyboardShortcut(
      {
        key: "k",
        ctrlKey: true,
        target: { tagName: "MAIN" },
        preventDefault,
      } as unknown as KeyboardEvent,
      { close, focusLauncher },
    );

    expect(close).toHaveBeenCalledTimes(1);
    expect(focusLauncher).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it("dismisses from text fields but does not steal command focus shortcuts from them", () => {
    const close = vi.fn();
    const focusLauncher = vi.fn();
    const preventDefault = vi.fn();
    const input = { tagName: "INPUT" };
    const textarea = { tagName: "TEXTAREA" };

    handleOverlayKeyboardShortcut(
      { key: "Escape", target: input, preventDefault } as unknown as KeyboardEvent,
      { close, focusLauncher },
    );
    handleOverlayKeyboardShortcut(
      { key: "k", metaKey: true, target: textarea, preventDefault } as unknown as KeyboardEvent,
      { close, focusLauncher },
    );

    expect(close).toHaveBeenCalledTimes(1);
    expect(focusLauncher).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("detects overlay controls that should temporarily capture pointer input", () => {
    const interactive = {
      closest: vi.fn().mockReturnValue({ tagName: "BUTTON" }),
    };
    const passive = {
      closest: vi.fn().mockReturnValue(null),
    };

    expect(isOverlayInteractiveElement(interactive as unknown as Element)).toBe(true);
    expect(isOverlayInteractiveElement(passive as unknown as Element)).toBe(false);
    expect(interactive.closest).toHaveBeenCalledWith(
      'button, input, textarea, select, a, [role="button"], [data-overlay-interactive="true"]',
    );
  });
});
