import type {
  SageOsAutonomyMode,
  SageOsPolicyScope,
  SageOsSensitivity,
  SageOsStatusSnapshot,
  SageOsTaskBudget,
  SageOsTaskNotificationPolicy,
  SageOsTaskSpec,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { normalizeSageOsMode } from "./types.js";

export type SageOsTaskCreationResult =
  | {
      outcome: "created";
      task: SageOsTaskSpec;
      status: SageOsStatusSnapshot;
    }
  | {
      outcome: "invalid_owner";
      ownerAgentId: string;
      reason: "not_found" | "unavailable";
    };

export async function createSageOsTask(params: {
  title?: string;
  objective: string;
  ownerAgentId?: string;
  requestedBy?: string;
  autonomyTier?: string;
  policyScopes?: SageOsPolicyScope[];
  evidenceRefs?: string[];
  riskClass?: SageOsTaskSpec["riskClass"];
  toolProfile?: string;
  budget?: SageOsTaskBudget;
  expectedOutput?: string;
  verificationPlan?: string[];
  rollback?: string;
  notificationPolicy?: SageOsTaskNotificationPolicy;
  sensitivity?: SageOsSensitivity;
  id?: string;
  now?: () => Date;
  stateDir?: string;
  stateStore?: SageOsStateStore;
}): Promise<SageOsTaskCreationResult> {
  const objective = params.objective.trim();
  if (!objective) {
    throw new Error("SageOS task objective required.");
  }

  const title = params.title?.trim() || titleFromObjective(objective);
  const requestedBy = params.requestedBy?.trim() || "sageos.task_creation";
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const ownerAgentId = params.ownerAgentId?.trim() || undefined;

  if (ownerAgentId) {
    const owner = state.agents.find((entry) => entry.id === ownerAgentId);
    if (!owner) {
      return { outcome: "invalid_owner", ownerAgentId, reason: "not_found" };
    }
    if (owner.status === "disabled" || owner.status === "retired") {
      return { outcome: "invalid_owner", ownerAgentId, reason: "unavailable" };
    }
  }

  const now = (params.now?.() ?? new Date()).toISOString();
  const policyScopes =
    params.policyScopes && params.policyScopes.length > 0
      ? clonePolicyScopes(params.policyScopes)
      : inferTaskPolicyScopes(`${title} ${objective}`);
  const task: SageOsTaskSpec = {
    id: nextTaskId(params.id?.trim() || `task_${safeId(title)}`, state.tasks),
    title,
    objective,
    state: "proposed",
    ...(ownerAgentId ? { ownerAgentId } : {}),
    requestedBy,
    autonomyTier: resolveAutonomyTier(params.autonomyTier),
    policyScopes,
    evidenceRefs: uniqueStrings(params.evidenceRefs ?? []),
    riskClass: params.riskClass ?? highestRisk(policyScopes),
    toolProfile: params.toolProfile?.trim() || "sageos.default",
    budget: normalizeBudget(params.budget),
    expectedOutput:
      params.expectedOutput?.trim() ||
      "Summary of task outcome, evidence, blockers, and next steps.",
    verificationPlan: uniqueStrings(
      params.verificationPlan ?? ["Confirm the task outcome with available local evidence."],
    ),
    rollback:
      params.rollback?.trim() ||
      "Cancel before execution or review generated artifacts before applying changes.",
    notificationPolicy: normalizeNotificationPolicy(params.notificationPolicy),
    sensitivity: params.sensitivity ?? "normal",
    createdAt: now,
    updatedAt: now,
  };

  await upsertSageOsTask(store, task);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "task_created",
    actor: requestedBy,
    summary: `Created SageOS task ${task.id}${ownerAgentId ? ` for ${ownerAgentId}` : ""}: ${task.title}`,
    taskId: task.id,
    sensitivity: "normal",
  });
  const status = await collectSageOsStatus({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  return { outcome: "created", task, status };
}

function resolveAutonomyTier(value: string | undefined): SageOsAutonomyMode {
  return value?.trim() ? normalizeSageOsMode(value) : "suggest";
}

function inferTaskPolicyScopes(text: string): SageOsPolicyScope[] {
  const normalized = text.toLowerCase();
  const scopes: SageOsPolicyScope[] = [];

  if (/\b(send|post|email|telegram|slack|discord|reply|publish)\b/.test(normalized)) {
    scopes.push({ kind: "channel", allow: ["external_message"], risk: "high" });
  }
  if (/\b(delete|remove|wipe|destroy|destructive|overwrite)\b/.test(normalized)) {
    scopes.push({ kind: "file", allow: ["local_files"], risk: "high" });
  }
  if (
    /\b(registry|firewall|service|startup|windows setting|powershell|restart|install|uninstall)\b/.test(
      normalized,
    )
  ) {
    scopes.push({ kind: "system", allow: ["windows_system"], risk: "medium" });
  }
  if (/\b(deploy|production|network|api|webhook)\b/.test(normalized)) {
    scopes.push({ kind: "network", allow: ["configured_network"], risk: "medium" });
  }
  if (/\b(memory|obsidian|capture|queue|consolidate|export wiki)\b/.test(normalized)) {
    scopes.push({ kind: "memory", allow: ["sage_memory"], risk: "low" });
  }
  if (/\b(code|repo|test|build|commit|pull request|pr)\b/.test(normalized)) {
    scopes.push({ kind: "repo", allow: ["configured_repositories"], risk: "medium" });
  }

  return scopes.length > 0
    ? uniquePolicyScopes(scopes)
    : [{ kind: "tool", allow: ["sage"], risk: "low" }];
}

function highestRisk(policyScopes: SageOsPolicyScope[]): NonNullable<SageOsTaskSpec["riskClass"]> {
  const order = ["low", "medium", "high", "critical"] as const;
  return policyScopes.reduce<NonNullable<SageOsTaskSpec["riskClass"]>>((highest, scope) => {
    const risk = scope.risk ?? "low";
    return order.indexOf(risk) > order.indexOf(highest) ? risk : highest;
  }, "low");
}

function normalizeBudget(budget: SageOsTaskBudget | undefined): SageOsTaskBudget {
  return {
    maxMinutes: positiveNumber(budget?.maxMinutes) ?? 30,
    maxToolCalls: positiveNumber(budget?.maxToolCalls) ?? 50,
    ...(positiveNumber(budget?.maxCostUsd) !== undefined
      ? { maxCostUsd: positiveNumber(budget?.maxCostUsd) }
      : {}),
  };
}

function normalizeNotificationPolicy(
  policy: SageOsTaskNotificationPolicy | undefined,
): SageOsTaskNotificationPolicy {
  return {
    channels: uniqueStrings(policy?.channels?.length ? policy.channels : ["overlay"]),
    notifyOn: policy?.notifyOn?.length
      ? [...new Set(policy.notifyOn)]
      : ["completed", "failed", "blocked"],
  };
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function uniquePolicyScopes(scopes: SageOsPolicyScope[]): SageOsPolicyScope[] {
  const seen = new Set<string>();
  const unique: SageOsPolicyScope[] = [];
  for (const scope of scopes) {
    const key = `${scope.kind}:${(scope.allow ?? []).join(",")}:${(scope.deny ?? []).join(",")}:${scope.risk ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(scope);
  }
  return unique;
}

function clonePolicyScopes(scopes: SageOsPolicyScope[]): SageOsPolicyScope[] {
  return scopes.map((scope) => ({
    ...scope,
    ...(scope.allow ? { allow: [...scope.allow] } : {}),
    ...(scope.deny ? { deny: [...scope.deny] } : {}),
  }));
}

function nextTaskId(baseId: string, tasks: SageOsTaskSpec[]): string {
  const base = safeId(baseId);
  const existing = new Set(tasks.map((task) => task.id));
  if (!existing.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `${base}_${Date.now().toString(36)}`;
}

function titleFromObjective(objective: string): string {
  const words = objective.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function safeId(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return safe || "task";
}
