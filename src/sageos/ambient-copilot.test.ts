import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSageOsAmbientCopilotOnce } from "./ambient-copilot.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsObservation,
  upsertSageOsTask,
} from "./state-store.js";

describe("SageOS Ambient Copilot", () => {
  it("creates an auditable proposed task from a captured observation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-ambient-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T17:00:00.000Z";
    await upsertSageOsObservation(store, {
      id: "obs_focus",
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

    const result = await runSageOsAmbientCopilotOnce({
      stateDir: root,
      now: () => new Date(now),
    });

    expect(result).toMatchObject({ observed: 1, proposed: 1, skipped: 0 });
    expect(result.tasks[0]).toMatchObject({
      id: "task_observation_obs_focus",
      state: "proposed",
      title: "Review observed work: Code: SageOS MVP",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "suggest",
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
    });
    expect(result.tasks[0]?.objective).toContain("obs_focus");
    expect(result.status.tasks).toMatchObject({ total: 1, queued: 1 });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_observation_obs_focus", state: "proposed" }],
    });
    const log = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(log).toContain("ambient_suggestion_created");
    expect(log).toContain("task_observation_obs_focus");
  });

  it("skips duplicates, redacted observations, and secret observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-ambient-skip-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = "2026-05-27T17:05:00.000Z";
    await upsertSageOsObservation(store, {
      id: "obs_focus",
      source: "app_focus",
      state: "captured",
      title: "Terminal: Sage",
      text: "Active app focus: Terminal - Sage",
      sensitivity: "private",
      observedAt: now,
      payload: { processName: "Terminal", windowTitle: "Sage" },
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
      payload: { redacted: true },
      provenance: { adapter: "app_focus" },
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsObservation(store, {
      id: "obs_secret",
      source: "app_focus",
      state: "captured",
      title: "Secret work",
      text: "Secret work should not become a proposed task.",
      sensitivity: "secret",
      observedAt: now,
      payload: { processName: "SecretApp" },
      provenance: { adapter: "app_focus" },
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_observation_obs_focus",
      title: "Review observed work: Terminal: Sage",
      objective: "Existing suggestion.",
      state: "proposed",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "suggest",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const result = await runSageOsAmbientCopilotOnce({
      stateDir: root,
      now: () => new Date(now),
    });

    expect(result).toMatchObject({ observed: 3, proposed: 0, skipped: 3 });
    expect(result.tasks).toEqual([]);
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_observation_obs_focus" }],
    });
  });
});
