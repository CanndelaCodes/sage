import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SageOsAgentSpec } from "./types.js";
import {
  activateSageOsEmployee,
  buildSageOsEmployeeActivationPreview,
} from "./employee-activation.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAgent,
  upsertSageOsApproval,
} from "./state-store.js";

describe("SageOS employee activation", () => {
  it("builds a reviewable activation preview with tools, memory, schedule, and risk", () => {
    const now = "2026-05-27T18:30:00.000Z";
    const employee = employeeFixture({
      id: "employee_memory",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep memory healthy.",
      autonomyTier: "execute_scoped",
      responsibilities: ["replay queues"],
      allowedScopes: [
        { kind: "tool", allow: ["sage-memory"], risk: "medium" },
        { kind: "memory", allow: ["capture_queue"], risk: "medium" },
      ],
      deniedScopes: [{ kind: "memory", deny: ["private_data_export"], risk: "critical" }],
      tools: ["sage-memory"],
      memoryScopes: ["capture_queue"],
      schedules: ["gateway tick"],
      risks: ["incorrect replay"],
      createdAt: now,
      updatedAt: now,
    });

    const preview = buildSageOsEmployeeActivationPreview(employee);

    expect(preview).toMatchObject({
      employeeId: "employee_memory",
      employeeName: "Memory Steward",
      role: "memory",
      autonomyTier: "execute_scoped",
      tools: ["sage-memory"],
      memoryAccess: ["capture_queue"],
      schedules: ["gateway tick"],
      risks: ["incorrect replay"],
      approvalRequired: false,
      approvalRiskClasses: [],
    });
    expect(preview.allowedScopes).toEqual(employee.allowedScopes);
    expect(preview.deniedScopes).toEqual(employee.deniedScopes);
  });

  it("activates a low-risk draft employee and records an audit event", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-employee-activate-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-05-27T18:35:00.000Z");
    await upsertSageOsAgent(
      store,
      employeeFixture({
        id: "employee_focus",
        name: "Focus Reviewer",
        allowedScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
        tools: ["app-focus"],
        memoryScopes: ["local observation summaries"],
        schedules: ["manual"],
        risks: ["stale observations"],
      }),
    );

    const result = await activateSageOsEmployee({
      employeeId: "employee_focus",
      stateDir: root,
      stateStore: store,
      requestedBy: "test",
      reason: "reviewed",
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "activated",
      employee: {
        id: "employee_focus",
        status: "active",
        activatedAt: now.toISOString(),
      },
      preview: {
        employeeId: "employee_focus",
        approvalRequired: false,
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_focus", status: "active", activatedAt: now.toISOString() }],
      approvals: [],
    });
    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("employee_activated");
  });

  it("requires approval for risky employee scopes before activation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-employee-approval-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-05-27T18:40:00.000Z");
    await upsertSageOsAgent(
      store,
      employeeFixture({
        id: "employee_windows_admin",
        name: "Windows Admin",
        role: "windows-admin",
        allowedScopes: [{ kind: "system", allow: ["service_restart"], risk: "high" }],
        deniedScopes: [{ kind: "system", deny: ["destructive"], risk: "critical" }],
        tools: ["powershell"],
        risks: ["service interruption"],
      }),
    );

    const blocked = await activateSageOsEmployee({
      employeeId: "employee_windows_admin",
      stateDir: root,
      stateStore: store,
      requestedBy: "test",
      now: () => now,
    });

    expect(blocked).toMatchObject({
      outcome: "approval_required",
      employee: { id: "employee_windows_admin", status: "draft" },
      approval: {
        id: "approval_employee_employee_windows_admin",
        state: "pending",
        scope: "employee",
        employeeId: "employee_windows_admin",
        riskClass: "windows_setting",
      },
      preview: {
        approvalRequired: true,
        approvalRiskClasses: ["windows_setting"],
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_windows_admin", status: "draft" }],
      approvals: [{ id: "approval_employee_employee_windows_admin", state: "pending" }],
    });

    await upsertSageOsApproval(store, {
      ...blocked.approval,
      state: "approved",
      resolvedAt: "2026-05-27T18:41:00.000Z",
      resolvedBy: "jason",
      resolutionReason: "reviewed",
      updatedAt: "2026-05-27T18:41:00.000Z",
    });
    const activated = await activateSageOsEmployee({
      employeeId: "employee_windows_admin",
      stateDir: root,
      stateStore: store,
      requestedBy: "test",
      now: () => new Date("2026-05-27T18:42:00.000Z"),
    });

    expect(activated).toMatchObject({
      outcome: "activated",
      employee: { id: "employee_windows_admin", status: "active" },
    });
  });

  it("uses policy config to require approval before activating private memory export scopes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-employee-private-export-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-05-27T18:45:00.000Z");
    const employee = employeeFixture({
      id: "employee_memory_exporter",
      name: "Memory Exporter",
      role: "memory",
      allowedScopes: [{ kind: "memory", allow: ["sage_memory_export"], risk: "low" }],
      tools: ["sage-memory"],
      memoryScopes: ["sage_memory_export"],
      risks: ["private data may leave local review context"],
    });
    await upsertSageOsAgent(store, employee);

    const preview = buildSageOsEmployeeActivationPreview(employee, {
      policy: { requireApprovalForPrivateDataExport: true },
    });
    expect(preview).toMatchObject({
      approvalRequired: true,
      approvalRiskClasses: ["private_data_export"],
    });

    const blocked = await activateSageOsEmployee({
      employeeId: "employee_memory_exporter",
      stateDir: root,
      stateStore: store,
      requestedBy: "test",
      cfg: { policy: { requireApprovalForPrivateDataExport: true } },
      now: () => now,
    });

    expect(blocked).toMatchObject({
      outcome: "approval_required",
      employee: { id: "employee_memory_exporter", status: "draft" },
      preview: {
        approvalRequired: true,
        approvalRiskClasses: ["private_data_export"],
      },
      approval: {
        id: "approval_employee_employee_memory_exporter",
        state: "pending",
        riskClass: "private_data_export",
        scope: "employee",
        employeeId: "employee_memory_exporter",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_memory_exporter", status: "draft" }],
      approvals: [{ id: "approval_employee_employee_memory_exporter", state: "pending" }],
    });
  });
});

function employeeFixture(overrides: Partial<SageOsAgentSpec> = {}): SageOsAgentSpec {
  const now = "2026-05-27T18:00:00.000Z";
  return {
    id: "employee_fixture",
    name: "Fixture Employee",
    role: "general",
    mission: "Exercise employee activation.",
    status: "draft",
    autonomyTier: "suggest",
    responsibilities: ["review"],
    allowedScopes: [],
    deniedScopes: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
