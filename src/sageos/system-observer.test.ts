import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSageOsStateStore, readSageOsState, upsertSageOsObservation } from "./state-store.js";
import { observeSystemStatusOnce, readSystemStatusSnapshot } from "./system-observer.js";

describe("SageOS system observer", () => {
  it("records enabled full-PC system observations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-system-observe-"));
    const now = new Date("2026-05-27T18:00:00.000Z");

    const result = await observeSystemStatusOnce({
      stateDir: root,
      cfg: { sources: { system: true } },
      now: () => now,
      readSystemStatus: async () => ({
        platform: "win32",
        checkedAt: now.toISOString(),
        checks: [
          {
            id: "defender",
            label: "Defender",
            status: "ok",
            summary: "Real-time protection on",
          },
          {
            id: "startup",
            label: "Startup",
            status: "ok",
            summary: "3 startup item(s)",
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      status: "recorded",
      observation: {
        source: "system",
        state: "captured",
        title: "System status",
        payload: {
          platform: "win32",
          checks: [
            { id: "defender", status: "ok" },
            { id: "startup", status: "ok" },
          ],
        },
      },
    });
    await expect(
      readSageOsState(createSageOsStateStore({ stateDir: root })),
    ).resolves.toMatchObject({
      observations: [
        {
          source: "system",
          state: "captured",
          payload: { platform: "win32" },
        },
      ],
    });
    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("observation_recorded");
  });

  it("skips disabled system source without reading local PC data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-system-disabled-"));
    let readCalled = false;

    const result = await observeSystemStatusOnce({
      stateDir: root,
      cfg: { sources: { system: false } },
      readSystemStatus: async () => {
        readCalled = true;
        throw new Error("should not read");
      },
    });

    expect(result).toEqual({ status: "skipped", reason: "disabled" });
    expect(readCalled).toBe(false);
  });

  it("persists a failed observation when the system collector fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-system-failed-"));
    const now = new Date("2026-05-27T18:05:00.000Z");

    const result = await observeSystemStatusOnce({
      stateDir: root,
      cfg: { sources: { system: true } },
      now: () => now,
      readSystemStatus: async () => {
        throw new Error("collector unavailable");
      },
    });

    expect(result).toMatchObject({
      status: "recorded",
      observation: {
        source: "system",
        state: "failed",
        title: "System status unavailable",
        reason: "collector_failed",
      },
    });
    const state = await readSageOsState(createSageOsStateStore({ stateDir: root }));
    expect(state.observations).toEqual([
      expect.objectContaining({
        source: "system",
        state: "failed",
        payload: { error: "Error: collector unavailable" },
      }),
    ]);
    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("observation_failed");
  });

  it("prunes observations older than retention before recording system status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-system-retention-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-06-10T12:00:00.000Z");

    await upsertSageOsObservation(store, {
      id: "obs_old_system",
      source: "system",
      state: "captured",
      title: "Old system status",
      text: "Old system status should expire.",
      sensitivity: "private",
      observedAt: "2026-05-01T12:00:00.000Z",
      payload: {},
      provenance: {},
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
    });
    await upsertSageOsObservation(store, {
      id: "obs_recent_system",
      source: "system",
      state: "captured",
      title: "Recent system status",
      text: "Recent system status should remain.",
      sensitivity: "private",
      observedAt: "2026-06-09T12:00:00.000Z",
      payload: {},
      provenance: {},
      createdAt: "2026-06-09T12:00:00.000Z",
      updatedAt: "2026-06-09T12:00:00.000Z",
    });

    const result = await observeSystemStatusOnce({
      stateDir: root,
      cfg: {
        sources: { system: true },
        privacy: { observationRetentionDays: 7 },
      },
      now: () => now,
      readSystemStatus: async () => ({
        platform: "win32",
        checkedAt: now.toISOString(),
        checks: [{ id: "runtime", label: "Runtime", status: "ok", summary: "Runtime ok" }],
      }),
    });

    expect(result).toMatchObject({ status: "recorded" });
    const state = await readSageOsState(store);
    expect(state.observations.map((observation) => observation.id)).toEqual(
      expect.arrayContaining(["obs_recent_system", result.observation.id]),
    );
    expect(state.observations.map((observation) => observation.id)).not.toContain("obs_old_system");
  });

  it("redacts denied system checks before persisting observation details", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-system-deny-checks-"));
    const now = new Date("2026-06-02T08:45:00.000Z");

    const result = await observeSystemStatusOnce({
      stateDir: root,
      cfg: {
        sources: { system: true },
        privacy: { denySystemChecks: ["startup"] },
      },
      now: () => now,
      readSystemStatus: async () => ({
        platform: "win32",
        checkedAt: now.toISOString(),
        checks: [
          {
            id: "defender",
            label: "Defender",
            status: "ok",
            summary: "Real-time protection on",
          },
          {
            id: "startup",
            label: "Startup",
            status: "warning",
            summary: "SecretApp starts with Windows.",
            details: {
              entries: [{ name: "SecretApp", location: "HKCU", user: "jason" }],
            },
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      status: "recorded",
      observation: {
        source: "system",
        state: "captured",
        payload: {
          checks: [
            { id: "defender", status: "ok" },
            {
              id: "startup",
              label: "Startup",
              status: "redacted",
              summary: "Startup check redacted by SageOS privacy policy.",
            },
          ],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("SecretApp");
    expect(JSON.stringify(result)).not.toContain("HKCU");
  });

  it("normalizes Windows read-only checks from PowerShell JSON", async () => {
    const now = new Date("2026-05-27T18:10:00.000Z");
    const snapshot = await readSystemStatusSnapshot({
      platform: "win32",
      now: () => now,
      execPowerShellJson: async (command) => {
        if (command.includes("Get-MpComputerStatus")) {
          return {
            AntivirusEnabled: true,
            RealTimeProtectionEnabled: true,
            AntispywareEnabled: true,
            ComputerState: "0",
          };
        }
        if (command.includes("Win32_StartupCommand")) {
          return [{ Name: "OneDrive", Location: "HKCU", User: "jason", Command: "not selected" }];
        }
        if (command.includes("Win32_LogicalDisk")) {
          return [{ DeviceID: "C:", FreeSpace: 5, Size: 100 }];
        }
        if (command.includes("Get-Service")) {
          return 42;
        }
        throw new Error(`unexpected command: ${command}`);
      },
    });

    expect(snapshot).toMatchObject({
      platform: "win32",
      checkedAt: now.toISOString(),
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "defender", status: "ok" }),
        expect.objectContaining({ id: "startup", status: "ok" }),
        expect.objectContaining({ id: "disk", status: "warning" }),
        expect.objectContaining({ id: "services", status: "ok" }),
      ]),
    });
    const startup = snapshot.checks.find((check) => check.id === "startup");
    expect(JSON.stringify(startup)).not.toContain("not selected");
  });
});
