import type {
  SageOsAgentSpec,
  SageOsApproval,
  SageOsApprovalRiskClass,
  SageOsConfig,
  SageOsPolicyScope,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import { requiredSageOsApprovalRisk } from "./policy.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAgent,
  upsertSageOsApproval,
  type SageOsStateStore,
} from "./state-store.js";

export type SageOsEmployeeActivationPreview = {
  employeeId: string;
  employeeName: string;
  role: string;
  status: SageOsAgentSpec["status"];
  autonomyTier: SageOsAgentSpec["autonomyTier"];
  responsibilities: string[];
  tools: string[];
  allowedScopes: SageOsPolicyScope[];
  deniedScopes: SageOsPolicyScope[];
  memoryAccess: string[];
  schedules: string[];
  risks: string[];
  approvalRequired: boolean;
  approvalRiskClasses: SageOsApprovalRiskClass[];
};

export type SageOsEmployeeActivationResult =
  | {
      outcome: "activated";
      employee: SageOsAgentSpec;
      preview: SageOsEmployeeActivationPreview;
      approval?: SageOsApproval;
    }
  | {
      outcome: "approval_required";
      employee: SageOsAgentSpec;
      preview: SageOsEmployeeActivationPreview;
      approval: SageOsApproval;
    }
  | { outcome: "not_found"; employeeId: string; reason: "not_found" }
  | {
      outcome: "not_activatable";
      employee: SageOsAgentSpec;
      preview: SageOsEmployeeActivationPreview;
      reason: string;
    };

export function buildSageOsEmployeeActivationPreview(
  employee: SageOsAgentSpec,
  cfg?: SageOsConfig,
): SageOsEmployeeActivationPreview {
  const approvalRiskClasses = approvalRiskClassesForScopes(employee.allowedScopes, cfg);
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    role: employee.role,
    status: employee.status,
    autonomyTier: employee.autonomyTier,
    responsibilities: [...employee.responsibilities],
    tools: employee.tools?.length ? [...employee.tools] : toolsFromScopes(employee.allowedScopes),
    allowedScopes: employee.allowedScopes.map((scope) => ({ ...scope })),
    deniedScopes: employee.deniedScopes.map((scope) => ({ ...scope })),
    memoryAccess: employee.memoryScopes?.length
      ? [...employee.memoryScopes]
      : memoryAccessFromScopes(employee.allowedScopes),
    schedules: employee.schedules?.length ? [...employee.schedules] : ["manual"],
    risks: employee.risks?.length ? [...employee.risks] : risksFromScopes(employee),
    approvalRequired: approvalRiskClasses.length > 0,
    approvalRiskClasses,
  };
}

export async function activateSageOsEmployee(params: {
  employeeId: string;
  requestedBy?: string;
  reason?: string;
  now?: () => Date;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  cfg?: SageOsConfig;
}): Promise<SageOsEmployeeActivationResult> {
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(stateStore);
  const employee = state.agents.find((entry) => entry.id === params.employeeId);
  if (!employee) {
    return { outcome: "not_found", employeeId: params.employeeId, reason: "not_found" };
  }

  const preview = buildSageOsEmployeeActivationPreview(employee, params.cfg);
  if (employee.status === "active") {
    return { outcome: "activated", employee, preview };
  }
  if (employee.status !== "draft" && employee.status !== "paused") {
    return {
      outcome: "not_activatable",
      employee,
      preview,
      reason: `employee status is ${employee.status}`,
    };
  }

  const now = params.now?.() ?? new Date();
  const existingApproval = state.approvals.find(
    (approval) => approval.id === approvalId(employee.id),
  );
  if (preview.approvalRequired && existingApproval?.state !== "approved") {
    const approval = await requestEmployeeActivationApproval({
      employee,
      preview,
      stateStore,
      stateDir: params.stateDir,
      requestedBy: params.requestedBy ?? "sageos.employee_activation",
      reason: params.reason,
      now,
    });
    return { outcome: "approval_required", employee, preview, approval };
  }

  const activated: SageOsAgentSpec = {
    ...employee,
    status: "active",
    activatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await upsertSageOsAgent(stateStore, activated);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "employee_activated",
    actor: params.requestedBy ?? "sageos.employee_activation",
    summary: `Activated SageOS employee ${employee.name}: ${params.reason?.trim() || "reviewed"}`,
    sensitivity: "normal",
  });
  return { outcome: "activated", employee: activated, preview, approval: existingApproval };
}

async function requestEmployeeActivationApproval(params: {
  employee: SageOsAgentSpec;
  preview: SageOsEmployeeActivationPreview;
  stateStore: SageOsStateStore;
  stateDir?: string;
  requestedBy: string;
  reason?: string;
  now: Date;
}): Promise<SageOsApproval> {
  const riskClass = params.preview.approvalRiskClasses[0] ?? "policy_change";
  const nowIso = params.now.toISOString();
  const approval: SageOsApproval = {
    id: approvalId(params.employee.id),
    state: "pending",
    riskClass,
    title: `Activate SageOS employee: ${params.employee.name}`,
    proposedAction: `Activate ${params.employee.name} with ${params.preview.autonomyTier} autonomy.`,
    evidence: [params.employee.id],
    preview: JSON.stringify({
      tools: params.preview.tools,
      memoryAccess: params.preview.memoryAccess,
      schedules: params.preview.schedules,
      risks: params.preview.risks,
      reason: params.reason?.trim() || undefined,
    }),
    rollbackPlan: `Pause or retire ${params.employee.id} and review its event history.`,
    scope: "employee",
    employeeId: params.employee.id,
    requestedBy: params.requestedBy,
    requestedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await upsertSageOsApproval(params.stateStore, approval);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "approval_requested",
    actor: params.requestedBy,
    summary: `Requested approval ${approval.id} before activating SageOS employee ${params.employee.name}.`,
    sensitivity: "normal",
  });
  return approval;
}

function approvalRiskClassesForScopes(
  scopes: SageOsPolicyScope[],
  cfg: SageOsConfig | undefined,
): SageOsApprovalRiskClass[] {
  return [
    ...new Set(
      scopes
        .map((scope) => requiredSageOsApprovalRisk([scope], cfg))
        .filter((riskClass): riskClass is SageOsApprovalRiskClass => Boolean(riskClass)),
    ),
  ];
}

function toolsFromScopes(scopes: SageOsPolicyScope[]): string[] {
  const toolScopes = scopes
    .filter((scope) => scope.kind === "tool")
    .flatMap((scope) => scope.allow ?? []);
  return toolScopes.length > 0 ? [...new Set(toolScopes)] : ["sage"];
}

function memoryAccessFromScopes(scopes: SageOsPolicyScope[]): string[] {
  const memoryScopes = scopes
    .filter((scope) => scope.kind === "memory")
    .flatMap((scope) => scope.allow ?? []);
  return memoryScopes.length > 0 ? [...new Set(memoryScopes)] : ["local task and audit metadata"];
}

function risksFromScopes(employee: SageOsAgentSpec): string[] {
  const scopedRisks = employee.allowedScopes
    .filter((scope) => scope.risk && scope.risk !== "low")
    .map((scope) => `${scope.kind} scope is ${scope.risk} risk`);
  const deniedRisks = employee.deniedScopes
    .flatMap((scope) => scope.deny ?? [])
    .map((deny) => `Denied action: ${deny}`);
  const risks = [...scopedRisks, ...deniedRisks];
  return risks.length > 0 ? [...new Set(risks)] : ["scope drift without review"];
}

function approvalId(employeeId: string): string {
  return `approval_employee_${employeeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
