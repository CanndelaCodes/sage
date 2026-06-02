import { describe, expect, it } from "vitest";
import type { SageOsPersistedState } from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";
import {
  formatSageOsApprovalsForTui,
  formatSageOsAppsForTui,
  formatSageOsAuditForTui,
  formatSageOsCodingReportsForTui,
  formatSageOsCommandCenterForTui,
  formatSageOsCollaborationsForTui,
  formatSageOsEmployeeDetailForTui,
  formatSageOsEmployeesForTui,
  formatSageOsIncidentsForTui,
  formatSageOsObservationDetailForTui,
  formatSageOsObservationsForTui,
  formatSageOsRunDetailForTui,
  formatSageOsRunsForTui,
  formatSageOsSkillsForTui,
  formatSageOsTaskDetailForTui,
  formatSageOsTasksForTui,
  formatSageOsWorkflowsForTui,
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

  it("renders employee, run, and observation drilldowns without leaking private bodies", () => {
    const state = commandCenterState();

    expect(formatSageOsEmployeesForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS employees",
        "- agent_memory | active | Memory Steward | execute_scoped",
      ]),
    );
    expect(formatSageOsEmployeeDetailForTui(state, "agent_memory")).toEqual(
      expect.arrayContaining([
        "SageOS employee agent_memory",
        "Mission: Keep memory healthy.",
        "Responsibilities: memory",
        "Memory scopes: memory_health",
      ]),
    );
    expect(formatSageOsRunsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS runs",
        "- run_1 | running | task task_running | trace trace_1 | tool pnpm test",
      ]),
    );
    expect(formatSageOsRunDetailForTui(state, "run_1")).toEqual(
      expect.arrayContaining([
        "SageOS run run_1",
        "State: running",
        "Current tool: pnpm test",
        "Timeline: queued -> running",
        "Artifacts: report.md",
      ]),
    );
    expect(formatSageOsObservationsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS observations",
        "- obs_private | app_focus | captured | private | Private app focus",
      ]),
    );
    expect(formatSageOsObservationDetailForTui(state, "obs_private")).toEqual(
      expect.arrayContaining([
        "SageOS observation obs_private",
        "Sensitivity: private",
        "Text: redacted in TUI summary",
      ]),
    );
  });

  it("renders workflow, skill, app, coding, collaboration, and audit resources", () => {
    const state = commandCenterState();

    expect(formatSageOsWorkflowsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS workflows",
        "- workflow_focus | candidate | Focus digest | Repeated app focus",
      ]),
    );
    expect(formatSageOsSkillsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS skills",
        "- skill_focus | draft | Focus Summarizer | workflow workflow_focus",
      ]),
    );
    expect(formatSageOsAppsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS apps and widgets",
        "- app_focus | preview_ready | Focus Widget | widget | normal",
      ]),
    );
    expect(formatSageOsCodingReportsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS coding reports",
        "- coding_report_1 | succeeded | C:/repo | task task_running | tests 1 | changed src/ui.ts",
      ]),
    );
    expect(formatSageOsCollaborationsForTui(state)).toEqual(
      expect.arrayContaining([
        "SageOS collaborations",
        "- collab_review | review_request | open | agent_memory -> agent_reviewer | Review memory repair",
      ]),
    );
    expect(formatSageOsAuditForTui(state)).toEqual(
      expect.arrayContaining(["SageOS audit", "Recent events: 6", "Event log: events.jsonl"]),
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
        tools: ["sage-memory"],
        memoryScopes: ["memory_health"],
        schedules: ["daily"],
        risks: ["queue backlog"],
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
    runs: [
      {
        id: "run_1",
        taskId: "task_running",
        attempt: 1,
        state: "running",
        traceId: "trace_1",
        currentToolCall: "pnpm test",
        timeline: [
          { at: now, label: "queued", state: "queued" },
          { at: now, label: "running", state: "running" },
        ],
        artifacts: ["report.md"],
      },
    ],
    workflows: [
      {
        id: "workflow_focus",
        name: "Focus digest",
        state: "candidate",
        observedPattern: "Repeated app focus",
        sourceObservationIds: ["obs_private"],
        trigger: "Repeated app focus observations",
        inputs: ["app_focus"],
        outputs: ["summary"],
        policyScopes: [],
        implementationRefs: [],
        evalRefs: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    skills: [
      {
        id: "skill_focus",
        name: "Focus Summarizer",
        state: "draft",
        workflowId: "workflow_focus",
        provenance: ["workflow_focus"],
        triggerConditions: ["Repeated app focus"],
        tests: ["pnpm test"],
        allowedScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    apps: [
      {
        id: "app_focus",
        name: "Focus Widget",
        state: "preview_ready",
        targetSurface: "widget",
        purpose: "Show focus trends.",
        sourceObservationIds: ["obs_private"],
        provenance: ["workflow_focus"],
        sensitivity: "normal",
        inputs: ["app_focus"],
        outputs: ["widget"],
        policyScopes: [],
        artifactRefs: ["widgets/focus"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    collaborations: [
      {
        id: "collab_review",
        kind: "review_request",
        fromAgentId: "agent_memory",
        toAgentId: "agent_reviewer",
        taskId: "task_running",
        title: "Review memory repair",
        summary: "Check the memory doctor repair plan.",
        artifactRefs: ["report.md"],
        state: "open",
        createdAt: now,
        updatedAt: now,
      },
    ],
    codingReports: [
      {
        id: "coding_report_1",
        taskId: "task_running",
        runId: "run_1",
        repoPath: "C:/repo",
        objective: "Improve SageOS UI.",
        outcome: "succeeded",
        startedAt: now,
        finishedAt: now,
        preState: { branch: "main", dirty: false, changedFiles: [] },
        postState: { branch: "main", dirty: true, changedFiles: ["src/ui.ts"] },
        diff: {
          stat: "1 file changed",
          preview: "+ render command center",
          changedFiles: ["src/ui.ts"],
        },
        tests: [
          {
            command: "pnpm test",
            exitCode: 0,
            stdoutPreview: "passed",
            stderrPreview: "",
          },
        ],
        blockers: [],
        verificationRefs: ["pnpm test"],
        rollback: "revert commit",
        createdAt: now,
        updatedAt: now,
      },
    ],
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
    observations: [
      {
        id: "obs_private",
        source: "app_focus",
        state: "captured",
        title: "Private app focus",
        text: "Sensitive window title",
        sensitivity: "private",
        observedAt: now,
        payload: { processName: "Code" },
        provenance: { source: "test" },
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}
