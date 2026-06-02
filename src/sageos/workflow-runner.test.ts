import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SageOsWorkflow } from "./types.js";
import { createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsObservation,
  upsertSageOsWorkflow,
} from "./state-store.js";
import { dryRunSageOsWorkflow } from "./workflow-runner.js";

describe("SageOS workflow dry runner", () => {
  it("passes a workflow dry run against captured non-secret examples", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-workflow-runner-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T23:00:00.000Z";
    await seedObservation(store, "obs_1", now, "private");
    await seedObservation(store, "obs_2", "2026-05-27T23:05:00.000Z", "private");
    await upsertSageOsWorkflow(store, workflowFixture(now, ["obs_1", "obs_2"]));

    const result = await dryRunSageOsWorkflow({
      stateDir: root,
      workflowId: "workflow_focus_code",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:workflow" } } },
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "passed",
      report: {
        id: "eval_workflow_focus_code_20260527T230000000Z",
        workflowId: "workflow_focus_code",
        passed: true,
        checkedObservationIds: ["obs_1", "obs_2"],
        missingObservationIds: [],
        secretObservationIds: [],
      },
      workflow: {
        id: "workflow_focus_code",
        state: "dry_run_passed",
        evalRefs: ["eval_workflow_focus_code_20260527T230000000Z"],
      },
      status: { workflows: { total: 1, active: 1, blocked: 0 } },
    });
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:workflow",
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      workflows: [
        {
          id: "workflow_focus_code",
          state: "dry_run_passed",
          evalRefs: ["eval_workflow_focus_code_20260527T230000000Z"],
        },
      ],
    });
    await expect(
      readFile(createSageOsEventLog({ stateDir: root }).path, "utf8"),
    ).resolves.toContain("workflow_dry_run_passed");
  });

  it("reports missing workflow without creating audit noise", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-workflow-runner-missing-"));

    const result = await dryRunSageOsWorkflow({
      stateDir: root,
      workflowId: "workflow_missing",
      now: () => new Date("2026-05-27T23:10:00.000Z"),
    });

    expect(result).toMatchObject({
      outcome: "missing_workflow",
      status: { workflows: { total: 0 } },
    });
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({
      workflows: [],
    });
  });

  it("fails a workflow dry run when examples are missing or secret", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-workflow-runner-fail-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T23:20:00.000Z";
    await seedObservation(store, "obs_present", now, "private");
    await seedObservation(store, "obs_secret", now, "secret");
    await upsertSageOsWorkflow(
      store,
      workflowFixture(now, ["obs_present", "obs_missing", "obs_secret"]),
    );

    const result = await dryRunSageOsWorkflow({
      stateDir: root,
      workflowId: "workflow_focus_code",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "failed",
      report: {
        passed: false,
        checkedObservationIds: ["obs_present"],
        missingObservationIds: ["obs_missing"],
        secretObservationIds: ["obs_secret"],
      },
      workflow: { id: "workflow_focus_code", state: "failed" },
      status: { workflows: { total: 1, active: 0, blocked: 1 } },
    });
    await expect(
      readFile(createSageOsEventLog({ stateDir: root }).path, "utf8"),
    ).resolves.toContain("workflow_dry_run_failed");
  });
});

async function seedObservation(
  store: ReturnType<typeof createSageOsStateStore>,
  id: string,
  observedAt: string,
  sensitivity: "normal" | "private" | "secret",
) {
  await upsertSageOsObservation(store, {
    id,
    source: "app_focus",
    state: "captured",
    title: "Code: SageOS MVP",
    text: "Active app focus: Code - SageOS MVP",
    sensitivity,
    observedAt,
    payload: { processName: "Code", windowTitle: "SageOS MVP" },
    provenance: { adapter: "app_focus" },
    createdAt: observedAt,
    updatedAt: observedAt,
  });
}

function workflowFixture(now: string, sourceObservationIds: string[]): SageOsWorkflow {
  return {
    id: "workflow_focus_code",
    name: "Review repeated Code focus",
    state: "candidate",
    observedPattern: "app_focus:code",
    sourceObservationIds,
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
