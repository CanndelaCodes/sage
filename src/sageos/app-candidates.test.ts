import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSageOsAppCandidates } from "./app-candidates.js";
import { createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAppCandidate,
  upsertSageOsObservation,
} from "./state-store.js";

describe("SageOS app candidate discovery", () => {
  it("creates one durable widget candidate from repeated non-secret observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-app-candidates-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T22:00:00.000Z";

    for (const [id, observedAt] of [
      ["obs_code_1", now],
      ["obs_code_2", "2026-05-27T22:05:00.000Z"],
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

    const result = await discoverSageOsAppCandidates({
      stateDir: root,
      minOccurrences: 2,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:app" } } },
    });

    expect(result).toMatchObject({
      observed: 2,
      created: 1,
      skipped: 0,
      candidates: [
        {
          id: "app_widget_app_focus_code_sageos_mvp",
          name: "Code SageOS MVP Widget",
          state: "draft",
          targetSurface: "widget",
          purpose: "Summarize repeated app_focus observations for Code / SageOS MVP.",
          sourceObservationIds: ["obs_code_1", "obs_code_2"],
          provenance: ["obs_code_1", "obs_code_2"],
          sensitivity: "private",
          inputs: ["captured observation pattern"],
          outputs: ["local widget candidate"],
          policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
          previewCommand: "sage os apps preview app_widget_app_focus_code_sageos_mvp",
          artifactRefs: [],
          rollbackRef: "delete apps.json entry app_widget_app_focus_code_sageos_mvp",
        },
      ],
      status: { apps: { total: 1, queued: 1 } },
    });
    expect(result.status.notifications.telegram).toMatchObject({
      enabled: true,
      target: "telegram:app",
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      apps: [{ id: "app_widget_app_focus_code_sageos_mvp", state: "draft" }],
    });
    await expect(
      readFile(createSageOsEventLog({ stateDir: root }).path, "utf8"),
    ).resolves.toContain("app_candidate_created");
  });

  it("skips existing candidates and secret observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-app-candidates-skip-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T22:20:00.000Z";
    await upsertSageOsAppCandidate(store, {
      id: "app_widget_app_focus_code_sageos_mvp",
      name: "Code SageOS MVP Widget",
      state: "draft",
      targetSurface: "widget",
      purpose: "Existing candidate.",
      sourceObservationIds: ["obs_existing_1", "obs_existing_2"],
      provenance: ["obs_existing_1", "obs_existing_2"],
      sensitivity: "private",
      inputs: ["captured observation pattern"],
      outputs: ["local widget candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      previewCommand: "sage os apps preview app_widget_app_focus_code_sageos_mvp",
      artifactRefs: [],
      rollbackRef: "delete apps.json entry app_widget_app_focus_code_sageos_mvp",
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
        text: "Do not build widgets from secret material.",
        sensitivity: "secret",
        observedAt: now,
        payload: { url: "https://example.invalid/secrets" },
        provenance: { adapter: "browser" },
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = await discoverSageOsAppCandidates({ stateDir: root, minOccurrences: 2 });

    expect(result).toMatchObject({ observed: 4, created: 0, skipped: 2, candidates: [] });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      apps: [{ id: "app_widget_app_focus_code_sageos_mvp" }],
    });
  });
});
