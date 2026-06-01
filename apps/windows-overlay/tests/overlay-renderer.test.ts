import { describe, expect, it } from "vitest";
import { renderOverlayModel } from "../src/renderer/overlay-app.js";

const state = {
  status: {
    mode: "execute_scoped",
    supervisor: { state: "running", enabled: true, paused: false },
    approvals: { pending: 2 },
    tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
    incidents: [{ id: "incident_1", severity: "warning", title: "Memory queue backlog" }],
  },
  tasks: [{ id: "task_1", title: "Night Shift report", state: "running" }],
  approvals: [{ id: "approval_1", title: "Approve repair", state: "pending" }],
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
});
