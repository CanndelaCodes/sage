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
      notifications: { telegram: { enabled: true, target: "urgent" }, urgentPending: 1 },
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
      "Memory: degraded, backend sage-memory, capture queue 0 pending / 1 failed",
    );
    expect(output).toContain("Learning: ok, activity queue 0 pending / 0 failed");
    expect(output).toContain("Policy: execute_scoped, approvals destructive, external_writes");
    expect(output).toContain("Sources: 1 enabled, 1 disabled, 0 failing");
    expect(output).toContain("Notifications: Telegram enabled, urgent pending 1");
    expect(output).toContain("Coding: enabled, 1 repos, 1 reports, restrictions no_release");
    expect(output).toContain("Audit: 4 recent events, events.jsonl");
  });
});
