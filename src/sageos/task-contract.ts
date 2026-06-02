import type {
  SageOsPolicyScope,
  SageOsTaskBudget,
  SageOsTaskNotificationPolicy,
  SageOsTaskSpec,
} from "./types.js";

export const DEFAULT_SAGEOS_TASK_EXPECTED_OUTPUT =
  "Summary of task outcome, evidence, blockers, and next steps.";
export const DEFAULT_SAGEOS_TASK_VERIFICATION_PLAN = [
  "Confirm the task outcome with available local evidence.",
];
export const DEFAULT_SAGEOS_TASK_ROLLBACK =
  "Cancel before execution or review generated artifacts before applying changes.";
export const DEFAULT_SAGEOS_TASK_TOOL_PROFILE = "sageos.default";
export const DEFAULT_SAGEOS_TASK_BUDGET: Required<
  Pick<SageOsTaskBudget, "maxMinutes" | "maxToolCalls">
> = {
  maxMinutes: 30,
  maxToolCalls: 50,
};

export function applySageOsTaskExecutionContract(task: SageOsTaskSpec): SageOsTaskSpec {
  const evidenceRefs = uniqueStrings(task.evidenceRefs ?? []);
  const verificationPlan = uniqueStrings(task.verificationPlan ?? []);
  return {
    ...task,
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : [task.id || "task"],
    riskClass: task.riskClass ?? highestRisk(task.policyScopes),
    toolProfile: task.toolProfile?.trim() || DEFAULT_SAGEOS_TASK_TOOL_PROFILE,
    budget: normalizeSageOsTaskBudget(task.budget),
    expectedOutput: task.expectedOutput?.trim() || DEFAULT_SAGEOS_TASK_EXPECTED_OUTPUT,
    verificationPlan:
      verificationPlan.length > 0 ? verificationPlan : [...DEFAULT_SAGEOS_TASK_VERIFICATION_PLAN],
    rollback: task.rollback?.trim() || DEFAULT_SAGEOS_TASK_ROLLBACK,
    notificationPolicy: normalizeSageOsTaskNotificationPolicy(task.notificationPolicy),
    sensitivity: task.sensitivity ?? "normal",
  };
}

export function normalizeSageOsTaskBudget(budget: SageOsTaskBudget | undefined): SageOsTaskBudget {
  return {
    maxMinutes: positiveNumber(budget?.maxMinutes) ?? DEFAULT_SAGEOS_TASK_BUDGET.maxMinutes,
    maxToolCalls: positiveNumber(budget?.maxToolCalls) ?? DEFAULT_SAGEOS_TASK_BUDGET.maxToolCalls,
    ...(positiveNumber(budget?.maxCostUsd) !== undefined
      ? { maxCostUsd: positiveNumber(budget?.maxCostUsd) }
      : {}),
  };
}

export function normalizeSageOsTaskNotificationPolicy(
  policy: SageOsTaskNotificationPolicy | undefined,
): SageOsTaskNotificationPolicy {
  return {
    channels: uniqueStrings(policy?.channels?.length ? policy.channels : ["overlay"]),
    notifyOn: policy?.notifyOn?.length
      ? [...new Set(policy.notifyOn)]
      : ["completed", "failed", "blocked"],
  };
}

function highestRisk(policyScopes: SageOsPolicyScope[]): NonNullable<SageOsTaskSpec["riskClass"]> {
  const order = ["low", "medium", "high", "critical"] as const;
  return policyScopes.reduce<NonNullable<SageOsTaskSpec["riskClass"]>>((highest, scope) => {
    const risk = scope.risk ?? "low";
    return order.indexOf(risk) > order.indexOf(highest) ? risk : highest;
  }, "low");
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
