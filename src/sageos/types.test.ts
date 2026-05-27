import { describe, expect, it } from "vitest";
import {
  SAGEOS_AUTONOMY_TIERS,
  SAGEOS_TASK_STATES,
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
} from "./types.js";

describe("SageOS shared types", () => {
  it("defines the full autonomy ladder from off through full operator", () => {
    expect(SAGEOS_AUTONOMY_TIERS.map((tier) => tier.mode)).toEqual([
      "off",
      "observe",
      "suggest",
      "prepare",
      "execute_scoped",
      "execute_delegated",
      "full_operator",
    ]);
  });

  it("normalizes unknown modes to execute_scoped for Jason's private default", () => {
    expect(normalizeSageOsMode(undefined)).toBe("execute_scoped");
    expect(normalizeSageOsMode("full_operator")).toBe("full_operator");
    expect(normalizeSageOsMode("bad-value")).toBe("execute_scoped");
  });

  it("creates a complete status snapshot skeleton", () => {
    const snapshot = createSageOsStatusSnapshot({
      mode: "observe",
      supervisor: { enabled: true, paused: false, state: "running" },
    });

    expect(snapshot.mode).toBe("observe");
    expect(snapshot.supervisor.state).toBe("running");
    expect(snapshot.tasks.total).toBe(0);
    expect(snapshot.workflows.total).toBe(0);
    expect(snapshot.employees.total).toBe(0);
    expect(snapshot.incidents).toEqual([]);
  });

  it("includes durable task states needed by the command center", () => {
    expect(SAGEOS_TASK_STATES).toContain("waiting_for_policy");
    expect(SAGEOS_TASK_STATES).toContain("verifying");
    expect(SAGEOS_TASK_STATES).toContain("expired");
  });

  it("exposes resource contracts for employees, tasks, workflows, runs, and policy scopes", () => {
    const employee = {
      id: "employee_security",
      name: "Security Sentinel",
      role: "security-monitor",
      mission: "Watch local system health without exporting private data.",
      status: "active",
      autonomyTier: "observe",
      responsibilities: ["monitor"],
      allowedScopes: [{ kind: "system", allow: ["defender.status"], risk: "low" }],
      deniedScopes: [{ kind: "network", deny: ["external-upload"], risk: "high" }],
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    } satisfies import("./types.js").SageOsAgentSpec;

    const task = {
      id: "task_1",
      title: "Check Defender",
      objective: "Verify Windows Defender status",
      state: "queued",
      requestedBy: "jason",
      autonomyTier: "observe",
      policyScopes: employee.allowedScopes,
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    } satisfies import("./types.js").SageOsTaskSpec;

    const run = {
      id: "run_1",
      taskId: task.id,
      attempt: 1,
      state: "queued",
      traceId: "trc_1",
    } satisfies import("./types.js").SageOsRun;

    const workflow = {
      id: "workflow_app_focus_code_review",
      name: "Review repeated Code focus",
      state: "candidate",
      observedPattern: "app_focus:code review",
      sourceObservationIds: ["obs_1", "obs_2"],
      trigger: "Repeated app_focus observations for Code",
      inputs: ["active window title"],
      outputs: ["review task"],
      policyScopes: employee.allowedScopes,
      implementationRefs: [],
      evalRefs: [],
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    } satisfies import("./types.js").SageOsWorkflow;

    expect(task.policyScopes[0]?.kind).toBe("system");
    expect(run.taskId).toBe(task.id);
    expect(workflow.state).toBe("candidate");
    expect(workflow.sourceObservationIds).toHaveLength(2);
  });
});
