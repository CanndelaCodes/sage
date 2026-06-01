import { describe, expect, it, vi } from "vitest";
import {
  getOverlaySurfaceVisibility,
  handleOverlayKeyboardShortcut,
  readInitialOverlaySurface,
  readOverlayGatewaySettings,
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
    notifications: { telegram: { enabled: true, target: "Jason" }, urgentPending: 1 },
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
      deniedScopes: [],
    },
  ],
  tasks: [
    { id: "task_1", title: "Night Shift report", objective: "Summarize coding work", state: "running" },
    { id: "task_2", title: "Memory replay", objective: "Replay queued memory captures", state: "proposed" },
  ],
  runs: [
    {
      id: "run_task_1",
      taskId: "task_1",
      attempt: 1,
      state: "running",
      traceId: "trace_task_1",
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
    expect(model.edgeRail.badges).toContainEqual({ kind: "approval", count: 2 });
  });

  it("maps tasks, approvals, and incidents into operational rows", () => {
    const model = renderOverlayModel(state as never);

    expect(model.commandDeck.tasks).toEqual([
      {
        id: "task_1",
        title: "Night Shift report",
        detail: "Summarize coding work",
        state: "running",
        canQueue: false,
        canCancel: true,
      },
      {
        id: "task_2",
        title: "Memory replay",
        detail: "Replay queued memory captures",
        state: "proposed",
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
    const memoryModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "memory" },
    });
    const policyModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "policy" },
    });
    const auditModel = renderOverlayModel(state as never, {
      workspaceTarget: { kind: "system", id: "audit" },
    });

    expect(taskModel.workspace).toMatchObject({
      title: "Night Shift report",
      eyebrow: "Task / running",
      actions: [{ kind: "cancelTask", label: "Cancel", enabled: true }],
    });
    expect(taskModel.workspace.facts).toContainEqual({
      label: "Objective",
      value: "Summarize coding work",
    });
    expect(approvalModel.workspace).toMatchObject({
      title: "Approve repair",
      eyebrow: "Approval / pending",
      actions: [
        { kind: "approveApproval", label: "Approve", enabled: true },
        { kind: "denyApproval", label: "Deny", enabled: true },
      ],
    });
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
    });
    expect(runModel.workspace).toMatchObject({
      title: "run_task_1",
      eyebrow: "Run / running",
    });
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
    expect(auditModel.workspace).toMatchObject({
      title: "Audit",
      eyebrow: "System / events",
    });
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
    });
    expect(readOverlayLayoutSettings("?collapsedEdge=center&pinnedWidgets=unknown")).toEqual({
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations", "approvals", "incidents"],
    });
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
});
