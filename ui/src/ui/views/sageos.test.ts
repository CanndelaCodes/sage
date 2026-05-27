import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../../../../src/sageos/types.js";
import { renderSageOs, type SageOsViewProps } from "./sageos.ts";

const now = "2026-05-27T22:30:00.000Z";

function createState(): SageOsPersistedState {
  return {
    version: 1,
    updatedAt: now,
    status: createSageOsStatusSnapshot({
      mode: "execute_scoped",
      supervisor: { enabled: true, paused: false, state: "running", lastTickAt: now },
      employees: { total: 3, active: 2, queued: 1, blocked: 0 },
      tasks: { total: 2, active: 0, queued: 1, blocked: 1 },
      workflows: { total: 1, active: 0, queued: 1, blocked: 0 },
      skills: { total: 1, active: 0, queued: 1, blocked: 0 },
      apps: { total: 1, active: 0, queued: 1, blocked: 0 },
      approvals: { pending: 1 },
      observations: { total: 4, recent: 2, redacted: 1, failed: 0 },
      memory: {
        status: "ok",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 3, pending: 1, failed: 0 },
      },
      learning: {
        status: "ok",
        activityQueue: { total: 2, pending: 1, failed: 0 },
      },
      policy: {
        mode: "execute_scoped",
        defaultTier: "suggest",
        approvalsRequired: ["destructive", "external_writes"],
      },
      coding: {
        enabled: true,
        allowedRepos: ["C:/Users/jason/Desktop/sage"],
        restrictions: ["clean-worktree"],
        reports: { total: 1, active: 0, queued: 0, blocked: 0 },
        lastReportId: "coding_report_1",
      },
      notifications: { telegram: { enabled: true, target: "telegram:123" }, urgentPending: 1 },
      incidents: [
        {
          id: "incident_memory",
          severity: "warning",
          category: "memory",
          title: "Memory queue backlog",
          summary: "One memory replay item is waiting.",
          firstSeenAt: now,
          lastSeenAt: now,
          autoRepairSafe: true,
          repairAction: {
            id: "repair_memory_replay",
            label: "Replay memory queue",
            risk: "medium",
            approvalRequired: false,
            command: "sage os memory replay",
            gatewayMethod: "sageos.memory.replay",
          },
        },
      ],
      audit: { recentEvents: 8, eventLogPath: "C:/state/sageos/events.jsonl" },
    }),
    agents: [],
    tasks: [
      {
        id: "task_review",
        title: "Review observation",
        objective: "Review a repeated app-focus observation.",
        state: "proposed",
        requestedBy: "sageos.ambient_copilot",
        autonomyTier: "suggest",
        policyScopes: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "task_run",
        title: "Run queued check",
        objective: "Run a dry-run worker check.",
        state: "queued",
        requestedBy: "sageos.cli",
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
    collaborations: [
      {
        id: "collab_review",
        kind: "review_request",
        fromAgentId: "employee_coding",
        toAgentId: "employee_reviewer",
        taskId: "task_run",
        title: "Review coding report",
        summary: "Check diff and tests.",
        artifactRefs: ["coding_report_1"],
        state: "open",
        createdAt: now,
        updatedAt: now,
      },
    ],
    codingReports: [],
    approvals: [
      {
        id: "approval_task",
        state: "pending",
        riskClass: "external_write",
        title: "Send completion update",
        proposedAction: "Send a redacted task completion summary.",
        evidence: ["task_run"],
        preview: "Task run completed.",
        rollbackPlan: "Delete the message.",
        scope: "task",
        taskId: "task_run",
        requestedBy: "sageos.task_runner",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    observations: [],
  };
}

function createProps(overrides: Partial<SageOsViewProps> = {}): SageOsViewProps {
  return {
    connected: true,
    loading: false,
    busy: null,
    error: null,
    state: createState(),
    onRefresh: () => undefined,
    onControl: () => undefined,
    onResolveApproval: () => undefined,
    onQueueTask: () => undefined,
    onRunNextTask: () => undefined,
    onCancelTask: () => undefined,
    ...overrides,
  };
}

describe("SageOS view", () => {
  it("renders Command Center sections and actions", () => {
    const container = document.createElement("div");
    const onControl = vi.fn();
    const onResolveApproval = vi.fn();
    const onQueueTask = vi.fn();
    const onCancelTask = vi.fn();

    render(
      renderSageOs(
        createProps({
          onControl,
          onResolveApproval,
          onQueueTask,
          onCancelTask,
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    for (const label of [
      "SageOS Command Center",
      "Supervisor",
      "Observations",
      "Memory",
      "Learning",
      "Tasks",
      "Workflows",
      "Skills",
      "Coding",
      "Apps",
      "Notifications",
      "Policy",
      "Incidents",
      "Audit",
      "Approvals",
      "Collaboration",
    ]) {
      expect(text).toContain(label);
    }

    clickButton(container, "Pause");
    expect(onControl).toHaveBeenCalledWith("paused");

    clickButton(container, "Approve");
    expect(onResolveApproval).toHaveBeenCalledWith("approval_task", "approved");

    clickButton(container, "Queue");
    expect(onQueueTask).toHaveBeenCalledWith("task_review");

    clickButton(container, "Cancel", "task_run");
    expect(onCancelTask).toHaveBeenCalledWith("task_run");
  });
});

function clickButton(container: HTMLElement, label: string, rowText?: string) {
  const scope = rowText
    ? Array.from(container.querySelectorAll(".list-item")).find((entry) =>
        entry.textContent?.includes(rowText),
      )
    : container;
  expect(scope, `row ${rowText}`).not.toBeUndefined();
  const button = Array.from(scope?.querySelectorAll("button") ?? []).find(
    (entry) => entry.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).not.toBeUndefined();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}
