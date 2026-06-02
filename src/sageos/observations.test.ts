import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listLearningEventQueue } from "../learning/activity-queue.js";
import { normalizeLearningEvent } from "../learning/events.js";
import { observeAppFocusOnce } from "./observations.js";
import { createSageOsStateStore, readSageOsState, upsertSageOsObservation } from "./state-store.js";

describe("SageOS observations", () => {
  it("records enabled app-focus observations and learning events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-observe-enabled-"));
    const now = new Date("2026-05-27T16:10:00.000Z");

    const result = await observeAppFocusOnce({
      stateDir: root,
      agentId: "main",
      cfg: { sources: { appFocus: true } },
      now: () => now,
      readFocus: async () => ({
        supported: true,
        event: normalizeLearningEvent(
          {
            source: "app_focus",
            actor: "local-user",
            title: "Code: SageOS",
            text: "Active app focus: Code - SageOS",
            payload: { processName: "Code", pid: 123, windowTitle: "SageOS" },
          },
          { now: () => now, idFactory: () => "learning_app_focus" },
        ),
      }),
    });

    expect(result).toMatchObject({
      status: "recorded",
      observation: {
        source: "app_focus",
        state: "captured",
        title: "Code: SageOS",
        learningEventId: "learning_app_focus",
      },
    });
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({
      observations: [
        {
          source: "app_focus",
          state: "captured",
          payload: { processName: "Code", pid: 123, windowTitle: "SageOS" },
        },
      ],
    });
    await expect(
      listLearningEventQueue({
        queuePath: path.join(root, "agents", "main", "learning", "activity-queue.json"),
      }),
    ).resolves.toMatchObject({
      counts: { total: 1, pending: 1, failed: 0 },
      entries: [{ event: { id: "learning_app_focus", source: "app_focus" } }],
    });
  });

  it("skips disabled app-focus source without reading focus data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-observe-disabled-"));
    let readFocusCalled = false;

    const result = await observeAppFocusOnce({
      stateDir: root,
      cfg: { sources: { appFocus: false } },
      readFocus: async () => {
        readFocusCalled = true;
        throw new Error("should not read focus");
      },
    });

    expect(result).toEqual({ status: "skipped", reason: "disabled" });
    expect(readFocusCalled).toBe(false);
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({ observations: [] });
  });

  it("redacts denylisted app-focus observations before storage and learning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-observe-redacted-"));
    const now = new Date("2026-05-27T16:15:00.000Z");

    const result = await observeAppFocusOnce({
      stateDir: root,
      agentId: "main",
      cfg: {
        sources: { appFocus: true },
        privacy: {
          denyApps: ["1Password"],
          denyWindowTitlePatterns: ["Vault"],
        },
      },
      now: () => now,
      readFocus: async () => ({
        supported: true,
        event: normalizeLearningEvent(
          {
            source: "app_focus",
            actor: "local-user",
            title: "1Password: Jason Vault",
            text: "Active app focus: 1Password - Jason Vault",
            payload: { processName: "1Password", pid: 456, windowTitle: "Jason Vault" },
          },
          { now: () => now, idFactory: () => "learning_secret_focus" },
        ),
      }),
    });

    expect(result).toMatchObject({
      status: "recorded",
      observation: {
        source: "app_focus",
        state: "redacted",
        reason: "deny_app",
      },
    });
    const state = await readSageOsState(createSageOsStateStore({ stateDir: root }));
    const observation = state.observations[0];
    expect(JSON.stringify(observation)).not.toContain("1Password");
    expect(JSON.stringify(observation)).not.toContain("Jason Vault");
    expect(observation).toMatchObject({
      title: "App focus redacted",
      text: "Active app focus redacted by SageOS privacy policy.",
      payload: { redacted: true, reason: "deny_app" },
    });

    const queue = await listLearningEventQueue({
      queuePath: path.join(root, "agents", "main", "learning", "activity-queue.json"),
    });
    const queuedEvent = queue.entries[0].event;
    expect(JSON.stringify(queuedEvent)).not.toContain("1Password");
    expect(JSON.stringify(queuedEvent)).not.toContain("Jason Vault");
    expect(queuedEvent).toMatchObject({
      title: "App focus redacted",
      payload: { redacted: true, reason: "deny_app" },
    });

    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("observation_redacted");
    expect(eventLog).not.toContain("1Password");
    expect(eventLog).not.toContain("Jason Vault");
  });

  it("prunes observations older than the configured retention window before recording", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-observe-retention-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-06-10T12:00:00.000Z");

    await upsertSageOsObservation(store, {
      id: "obs_old",
      source: "app_focus",
      state: "captured",
      title: "Old focus",
      text: "Old focus should expire.",
      sensitivity: "public",
      observedAt: "2026-05-01T12:00:00.000Z",
      payload: {},
      provenance: {},
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
    });
    await upsertSageOsObservation(store, {
      id: "obs_recent",
      source: "app_focus",
      state: "captured",
      title: "Recent focus",
      text: "Recent focus should remain.",
      sensitivity: "public",
      observedAt: "2026-06-09T12:00:00.000Z",
      payload: {},
      provenance: {},
      createdAt: "2026-06-09T12:00:00.000Z",
      updatedAt: "2026-06-09T12:00:00.000Z",
    });

    const result = await observeAppFocusOnce({
      stateDir: root,
      agentId: "main",
      cfg: {
        sources: { appFocus: true },
        privacy: { observationRetentionDays: 7 },
      },
      now: () => now,
      readFocus: async () => ({
        supported: true,
        event: normalizeLearningEvent(
          {
            source: "app_focus",
            actor: "local-user",
            title: "Code: Fresh work",
            text: "Active app focus: Code - Fresh work",
            payload: { processName: "Code", pid: 789, windowTitle: "Fresh work" },
          },
          { now: () => now, idFactory: () => "learning_fresh_focus" },
        ),
      }),
    });

    expect(result).toMatchObject({ status: "recorded" });
    const state = await readSageOsState(store);
    expect(state.observations.map((observation) => observation.id)).toEqual(
      expect.arrayContaining(["obs_recent", result.observation.id]),
    );
    expect(state.observations.map((observation) => observation.id)).not.toContain("obs_old");
  });
});
