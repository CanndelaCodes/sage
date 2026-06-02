import type { SageOsRunBudgetUsage, SageOsTaskBudget } from "./types.js";

export function describeSageOsBudgetViolations(
  budget: SageOsTaskBudget | undefined,
  usage: SageOsRunBudgetUsage | undefined,
): string[] {
  if (!budget || !usage) {
    return [];
  }
  const violations: string[] = [];
  if (exceeds(usage.elapsedMinutes, budget.maxMinutes)) {
    violations.push(
      `elapsed minutes ${formatBudgetValue(usage.elapsedMinutes!)}/${formatBudgetValue(budget.maxMinutes!)}`,
    );
  }
  if (exceeds(usage.toolCalls, budget.maxToolCalls)) {
    violations.push(
      `tool calls ${formatBudgetValue(usage.toolCalls!)}/${formatBudgetValue(budget.maxToolCalls!)}`,
    );
  }
  if (exceeds(usage.costUsd, budget.maxCostUsd)) {
    violations.push(
      `cost USD ${formatBudgetValue(usage.costUsd!)}/${formatBudgetValue(budget.maxCostUsd!)}`,
    );
  }
  return violations;
}

function exceeds(value: number | undefined, max: number | undefined): boolean {
  return finiteNonNegative(value) && finiteNonNegative(max) && value > max;
}

function finiteNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatBudgetValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/g, "").replace(/\.$/g, "");
}
