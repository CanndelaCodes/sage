import { describe, expect, it } from "vitest";
import type { SageOsPersistedState } from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";
import {
  formatSageOsApprovalsForTui,
  formatSageOsCommandCenterForTui,
  formatSageOsIncidentsForTui,
  formatSageOsTaskDetailForTui,
  formatSageOsTasksForTui,
} from "./tui-sageos-command-center.js";

describe("TUI SageOS Command Center formatter", () => {
  it("renders the shared SageOS status contract as Command Center sections", () => {
    const lines = formatSageOsCommandCenterForTui(commandCenterState());

    expect(lines).toEqual(
      expect.arrayContaining([
        "SageOS Command Center",
        "Overview: running, mode execute_scoped, 1 employee(s), 1 pending approval(s)",
        "Tasks: 1 active, 1 queued, 1 blocked, 3 total",
        "Memory: degraded, backend sage-memory, capture queue 1 pending / 1 failed, doctor fail, wiki exports 1",
        "Learning: degraded, activity queue 1 pending / 1 failed",
        "Observations: 2 recent, 1 redacted, 1 failed, 4 total",
        "Workflows: 1 active, 1 candidate, 0 blocked, 2 total",
        "Skills: 1 active, 1 draft, 0 blocked, 2 total",
        "Apps: 1 active, 1 draft, 0 blocked, 2 total",
        "Coding: enabled, 1 repo(s), 1 report(s), restrictions no_release",
        "Notifications: Telegram enabled, urgent pending 1",
        "Policy: execute_scoped, approvals destructive, external_writes",
        "Audit: 6 recent event(s), events.jsonl",
        "Incidents: 1",
      ]),
    );
    expect(lines).toContain("Top task: task_running | running | Verify SageOS UI");
    expect(lines).toContain(
      "Top incident: incident_memory_doctor_failed | memory | Run memory doctor",
    );
  });

  it("renders task, incident, and approval drilldowns", () => {
    const state = commandCenterState();

    expect(formatSageOsTasksForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS tasks",
        "- task_running | running | Verify SageOS UI",
        "- task_queued | queued | Queue memory check",
      ]),
    );
    expect(formatSageOsTaskDetailForTui(state, "task_running")).toEqual(
      expect.arrayContaining([
        "SageOS task task_running",
        "Title: Verify SageOS UI",
        "State: running",
        "Rollback: Stop the run and revert local edits.",
      ]),
    );
    expect(formatSageOsIncidentsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS incidents",
        "- incident_memory_doctor_failed | error | Sage Memory doctor reported failures",
        "  Repair: Run memory doctor via sageos.memory.doctor",
      ]),
    );
    expect(formatSageOsApprovalsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS approvals",
        "- approval_external | external_write | Send Telegram update",
      ]),
    );
  });
});

function commandCenterState(): SageOsPersistedState {
  const now = "2026-05-27T18:00:00.000Z";
  return {
    version: 1,
    status: createSageOsStatusSnapshot({
      mode: "execute_scoped",
      supervisor: { enabled: true, paused: false, state: "running" },
      employees: { total: 1, active: 1, queued: 0, blocked: 0 },
      tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
      runs: { total: 1, active: 1, queued: 0, failed: 0 },
      workflows: { total: 2, active: 1, queued: 1, blocked: 0 },
      skills: { total: 2, active: 1, queued: 1, blocked: 0 },
      apps: { total: 2, active: 1, queued: 1, blocked: 0 },
      approvals: { pending: 1 },
      observations: { total: 4, recent: 2, redacted: 1, failed: 1 },
      memory: {
        status: "degraded",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 2, pending: 1, failed: 1 },
        doctor: {
          ok: false,
          checkedAt: now,
          checks: 8,
          warnings: 1,
          failures: 1,
          exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
          diagnosticNamespace: "sage.sessions.diagnostics",
        },
      },
      learning: {
        status: "degraded",
        activityQueue: { total: 2, pending: 1, failed: 1 },
      },
      policy: {
        mode: "execute_scoped",
        defaultTier: "execute_scoped",
        approvalsRequired: ["destructive", "external_writes"],
      },
      coding: {
        enabled: true,
        allowedRepos: ["C:/repo"],
        restrictions: ["no_release"],
        reports: { total: 1, active: 1, queued: 0, blocked: 0 },
      },
      notifications: {
        telegram: { enabled: true, target: "telegram:123" },
        urgentPending: 1,
      },
      incidents: [
        {
          id: "incident_memory_doctor_failed",
          severity: "error",
          category: "memory",
          title: "Sage Memory doctor reported failures",
          summary: "Sage Memory doctor reported one failure.",
          firstSeenAt: now,
          lastSeenAt: now,
          autoRepairSafe: true,
          repairAction: {
            id: "repair_memory_doctor",
            label: "Run memory doctor",
            gatewayMethod: "sageos.memory.doctor",
            risk: "low",
            approvalRequired: false,
          },
        },
      ],
      audit: { recentEvents: 6, eventLogPath: "events.jsonl" },
    }),
    agents: [
      {
        id: "agent_memory",
        name: "Memory Steward",
        role: "memory",
        mission: "Keep memory healthy.",
        status: "active",
        autonomyTier: "execute_scoped",
        responsibilities: ["memory"],
        allowedScopes: [],
        deniedScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    tasks: [
      {
        id: "task_running",
        title: "Verify SageOS UI",
        objective: "Render Command Center state in TUI.",
        state: "running",
        requestedBy: "test",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        rollback: "Stop the run and revert local edits.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "task_queued",
        title: "Queue memory check",
        objective: "Run doctor later.",
        state: "queued",
        requestedBy: "test",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [],
    workflows: [],
    skills: [],
    apps: [],
    codingReports: [],
    approvals: [
      {
        id: "approval_external",
        state: "pending",
        riskClass: "external_write",
        title: "Send Telegram update",
        proposedAction: "Send a summary.",
        evidence: ["task_running"],
        scope: "task",
        taskId: "task_running",
        requestedBy: "test",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    observations: [],
    updatedAt: now,
  };
}
