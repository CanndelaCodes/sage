import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SageOsWorkflow } from "./types.js";
import { createSageOsEventLog, readSageOsEvents } from "./event-log.js";
import { draftSageOsSkillFromWorkflow } from "./skill-steward.js";
import { createSageOsStateStore, readSageOsState, upsertSageOsWorkflow } from "./state-store.js";

describe("SageOS skill steward", () => {
  it("creates a draft skill from a workflow candidate with provenance and policy scopes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-skill-steward-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T21:00:00.000Z";
    await upsertSageOsWorkflow(store, workflowFixture(now));

    const result = await draftSageOsSkillFromWorkflow({
      stateDir: root,
      workflowId: "workflow_focus_code",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "drafted",
      skill: {
        id: "skill_focus_code",
        name: "Skill: Review repeated Code focus",
        state: "draft",
        workflowId: "workflow_focus_code",
        provenance: ["workflow_focus_code", "obs_1", "obs_2"],
        triggerConditions: ["Repeated app_focus observations for Code"],
        tests: ["obs_1", "obs_2"],
        allowedScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      },
      status: { skills: { total: 1, active: 0, queued: 1, blocked: 0 } },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      skills: [{ id: "skill_focus_code", workflowId: "workflow_focus_code" }],
    });
    await expect(readSageOsEvents(createSageOsEventLog({ stateDir: root }))).resolves.toEqual([
      expect.objectContaining({
        type: "skill_draft_created",
        actor: "sageos.skill_steward",
        summary: expect.stringContaining("skill_focus_code"),
      }),
    ]);
  });

  it("returns the existing skill when a workflow has already been drafted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-skill-steward-existing-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T21:10:00.000Z";
    await upsertSageOsWorkflow(store, workflowFixture(now));

    await draftSageOsSkillFromWorkflow({
      stateDir: root,
      workflowId: "workflow_focus_code",
      now: () => new Date(now),
    });
    const result = await draftSageOsSkillFromWorkflow({
      stateDir: root,
      workflowId: "workflow_focus_code",
      now: () => new Date("2026-05-27T21:11:00.000Z"),
    });

    expect(result).toMatchObject({
      outcome: "existing",
      skill: { id: "skill_focus_code", updatedAt: now },
      status: { skills: { total: 1, queued: 1 } },
    });
    const events = await readSageOsEvents(createSageOsEventLog({ stateDir: root }));
    expect(events.filter((event) => event.type === "skill_draft_created")).toHaveLength(1);
  });

  it("reports a missing workflow without creating a skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-skill-steward-missing-"));

    const result = await draftSageOsSkillFromWorkflow({
      stateDir: root,
      workflowId: "workflow_missing",
      now: () => new Date("2026-05-27T21:20:00.000Z"),
    });

    expect(result).toMatchObject({
      outcome: "missing_workflow",
      status: { skills: { total: 0 } },
    });
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({
      skills: [],
    });
    await expect(readSageOsEvents(createSageOsEventLog({ stateDir: root }))).resolves.toEqual([]);
  });
});

function workflowFixture(now: string): SageOsWorkflow {
  return {
    id: "workflow_focus_code",
    name: "Review repeated Code focus",
    state: "candidate",
    observedPattern: "app_focus:code",
    sourceObservationIds: ["obs_1", "obs_2"],
    trigger: "Repeated app_focus observations for Code",
    inputs: ["window title"],
    outputs: ["workflow candidate"],
    policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
    implementationRefs: [],
    evalRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}
