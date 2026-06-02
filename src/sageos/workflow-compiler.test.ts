import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsObservation,
  upsertSageOsWorkflow,
} from "./state-store.js";
import { discoverSageOsWorkflowCandidates } from "./workflow-compiler.js";

describe("SageOS workflow compiler", () => {
  it("creates one durable candidate from repeated non-secret observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-workflow-compiler-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T20:00:00.000Z";

    for (const [id, observedAt] of [
      ["obs_code_1", now],
      ["obs_code_2", "2026-05-27T20:05:00.000Z"],
    ] as const) {
      await upsertSageOsObservation(store, {
        id,
        source: "app_focus",
        state: "captured",
        title: "Code: SageOS MVP",
        text: "Active app focus: Code - SageOS MVP",
        sensitivity: "private",
        observedAt,
        payload: { processName: "Code", windowTitle: "SageOS MVP" },
        provenance: { adapter: "app_focus" },
        createdAt: observedAt,
        updatedAt: observedAt,
      });
    }

    const result = await discoverSageOsWorkflowCandidates({
      stateDir: root,
      minOccurrences: 2,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:workflow" } } },
    });

    expect(result).toMatchObject({
      observed: 2,
      created: 1,
      candidates: [
        {
          id: "workflow_app_focus_code_sageos_mvp",
          state: "candidate",
          observedPattern: "app_focus:code:sageos_mvp",
          sourceObservationIds: ["obs_code_1", "obs_code_2"],
          policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
        },
      ],
      status: { workflows: { total: 1, queued: 1 } },
    });
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:workflow",
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      workflows: [{ id: "workflow_app_focus_code_sageos_mvp", state: "candidate" }],
    });
    await expect(
      readFile(createSageOsEventLog({ stateDir: root }).path, "utf8"),
    ).resolves.toContain("workflow_candidate_created");
  });

  it("skips existing candidates and secret observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-workflow-compiler-skip-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T20:20:00.000Z";
    await upsertSageOsWorkflow(store, {
      id: "workflow_app_focus_code_sageos_mvp",
      name: "Review repeated Code focus",
      state: "candidate",
      observedPattern: "app_focus:code:sageos_mvp",
      sourceObservationIds: ["obs_existing_1", "obs_existing_2"],
      trigger: "Existing candidate",
      inputs: ["app focus"],
      outputs: ["candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      implementationRefs: [],
      evalRefs: [],
      createdAt: now,
      updatedAt: now,
    });
    for (const id of ["obs_code_1", "obs_code_2"]) {
      await upsertSageOsObservation(store, {
        id,
        source: "app_focus",
        state: "captured",
        title: "Code: SageOS MVP",
        text: "Active app focus: Code - SageOS MVP",
        sensitivity: "private",
        observedAt: now,
        payload: { processName: "Code", windowTitle: "SageOS MVP" },
        provenance: { adapter: "app_focus" },
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const id of ["obs_secret_1", "obs_secret_2"]) {
      await upsertSageOsObservation(store, {
        id,
        source: "browser",
        state: "captured",
        title: "Secrets console",
        text: "Do not automate secret material.",
        sensitivity: "secret",
        observedAt: now,
        payload: { url: "https://example.invalid/secrets" },
        provenance: { adapter: "browser" },
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = await discoverSageOsWorkflowCandidates({ stateDir: root, minOccurrences: 2 });

    expect(result).toMatchObject({ observed: 4, created: 0, skipped: 2, candidates: [] });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      workflows: [{ id: "workflow_app_focus_code_sageos_mvp" }],
    });
  });
});
