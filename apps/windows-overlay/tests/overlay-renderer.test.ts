import { describe, expect, it } from "vitest";
import { readOverlayGatewaySettings, renderOverlayModel } from "../src/renderer/overlay-app.js";

const state = {
  status: {
    mode: "execute_scoped",
    supervisor: { state: "running", enabled: true, paused: false },
    approvals: { pending: 2 },
    tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
    incidents: [{ id: "incident_1", severity: "warning", title: "Memory queue backlog" }],
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
});
