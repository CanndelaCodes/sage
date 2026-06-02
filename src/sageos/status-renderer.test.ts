import { describe, expect, it } from "vitest";
import { renderSageOsStatus } from "./status-renderer.js";
import { createSageOsStatusSnapshot } from "./types.js";

describe("SageOS status renderer", () => {
  it("renders the core Command Center sections from one status snapshot", () => {
    const snapshot = createSageOsStatusSnapshot({
      mode: "execute_scoped",
      supervisor: { enabled: true, paused: false, state: "running" },
      employees: { total: 2, active: 1, queued: 1, blocked: 0 },
      tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
      runs: { total: 2, active: 1, queued: 0, failed: 1 },
      workflows: { total: 2, active: 1, queued: 1, blocked: 0 },
      skills: { total: 2, active: 1, queued: 1, blocked: 0 },
      apps: { total: 2, active: 1, queued: 1, blocked: 0 },
      observations: { total: 5, recent: 3, redacted: 1, failed: 1 },
      memory: {
        status: "degraded",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 1, pending: 0, failed: 1, path: "capture-queue.json" },
        doctor: {
          ok: false,
          checkedAt: "2026-05-27T17:30:00.000Z",
          checks: 8,
          warnings: 1,
          failures: 1,
          exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
          diagnosticNamespace: "sage.sessions.diagnostics",
          sessionNodePath: "sage-memory/node_doctor",
        },
      },
      learning: {
        status: "ok",
        activityQueue: { total: 0, pending: 0, failed: 0, path: "activity-queue.json" },
      },
      policy: {
        mode: "execute_scoped",
        defaultTier: "execute_scoped",
        approvalsRequired: ["destructive", "external_writes"],
      },
      sources: { enabled: ["sageSessions"], disabled: ["browser"], failing: [] },
      notifications: {
        telegram: {
          enabled: true,
          target: "urgent",
          digestSchedule: "0 8 * * *",
          urgentOnlyDuringFocus: true,
          batchWindowMinutes: 15,
          quietHours: { start: "22:00", end: "07:00", timezone: "UTC" },
        },
        urgentPending: 1,
        recent: {
          sent: 2,
          failed: 1,
          skipped: 3,
          lastOutcome: "failed",
          lastAt: "2026-05-27T12:00:00.000Z",
          lastSummary: "Failed to send digest.",
        },
      },
      coding: {
        enabled: true,
        allowedRepos: ["C:/repo"],
        restrictions: ["no_release"],
        reports: { total: 1, active: 1, queued: 0, blocked: 0 },
        lastReportId: "coding_report_1",
      },
      audit: { recentEvents: 4, eventLogPath: "events.jsonl" },
    });

    const output = renderSageOsStatus(snapshot);

    expect(output).toContain("SageOS Command Center");
    expect(output).toContain("Employees: 1/2 active, 1 draft, 0 blocked");
    expect(output).toContain("Tasks: 1 active, 1 queued, 1 blocked, 3 total");
    expect(output).toContain("Runs: 1 active, 0 queued, 1 failed, 2 total");
    expect(output).toContain("Workflows: 1 active, 1 candidate, 0 blocked, 2 total");
    expect(output).toContain("Skills: 1 active, 1 draft, 0 blocked, 2 total");
    expect(output).toContain("Apps: 1 active, 1 draft, 0 blocked, 2 total");
    expect(output).toContain("Observations: 3 recent, 1 redacted, 1 failed, 5 total");
    expect(output).toContain(
      "Memory: degraded, backend sage-memory, capture queue 0 pending / 1 failed, doctor fail, wiki exports 1",
    );
    expect(output).toContain("Learning: ok, activity queue 0 pending / 0 failed");
    expect(output).toContain("Policy: execute_scoped, approvals destructive, external_writes");
    expect(output).toContain("Sources: 1 enabled, 1 disabled, 0 failing");
    expect(output).toContain(
      "Notifications: Telegram enabled, urgent pending 1, digest 0 8 * * *, batch 15m, quiet 22:00-07:00 UTC, focus urgent-only, recent 2 sent / 1 failed / 3 skipped, last failed",
    );
    expect(output).toContain("Coding: enabled, 1 repos, 1 reports, restrictions no_release");
    expect(output).toContain("Audit: 4 recent events, events.jsonl");
  });
});
