import { describe, expect, it } from "vitest";
import {
  getOverlaySurfaceVisibility,
  readInitialOverlaySurface,
  readOverlayGatewaySettings,
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
  tasks: [
    { id: "task_1", title: "Night Shift report", objective: "Summarize coding work", state: "running" },
    { id: "task_2", title: "Memory replay", objective: "Replay queued memory captures", state: "proposed" },
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
});
