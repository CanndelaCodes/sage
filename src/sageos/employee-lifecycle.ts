import type { SageOsAgentSpec } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAgent,
  type SageOsStateStore,
} from "./state-store.js";

export const SAGEOS_EMPLOYEE_LIFECYCLE_ACTIONS = ["pause", "resume", "retire"] as const;
export type SageOsEmployeeLifecycleAction = (typeof SAGEOS_EMPLOYEE_LIFECYCLE_ACTIONS)[number];

export type SageOsEmployeeLifecycleResult =
  | {
      outcome: "updated";
      employee: SageOsAgentSpec;
      previousStatus: SageOsAgentSpec["status"];
      action: SageOsEmployeeLifecycleAction;
    }
  | {
      outcome: "invalid_transition";
      employee: SageOsAgentSpec;
      action: SageOsEmployeeLifecycleAction;
      reason: string;
    }
  | {
      outcome: "not_found";
      employeeId: string;
    };

export async function updateSageOsEmployeeLifecycle(params: {
  employeeId: string;
  action: SageOsEmployeeLifecycleAction;
  requestedBy?: string;
  reason?: string;
  now?: () => Date;
  stateDir?: string;
  stateStore?: SageOsStateStore;
}): Promise<SageOsEmployeeLifecycleResult> {
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(stateStore);
  const employee = state.agents.find((entry) => entry.id === params.employeeId);
  if (!employee) {
    return { outcome: "not_found", employeeId: params.employeeId };
  }

  const nextStatus = nextEmployeeStatus(employee.status, params.action);
  if (!nextStatus) {
    return {
      outcome: "invalid_transition",
      employee,
      action: params.action,
      reason: `${params.action} is not valid for employee status ${employee.status}`,
    };
  }

  const now = params.now?.() ?? new Date();
  const updated: SageOsAgentSpec = {
    ...employee,
    status: nextStatus,
    updatedAt: now.toISOString(),
  };
  await upsertSageOsAgent(stateStore, updated);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: eventTypeForAction(params.action),
    actor: params.requestedBy ?? "sageos.employee_lifecycle",
    summary: `${eventLabelForAction(params.action)} SageOS employee ${employee.name} (${employee.id}): ${
      params.reason?.trim() || "manual"
    }`,
    sensitivity: "normal",
  });

  return {
    outcome: "updated",
    employee: updated,
    previousStatus: employee.status,
    action: params.action,
  };
}

function nextEmployeeStatus(
  status: SageOsAgentSpec["status"],
  action: SageOsEmployeeLifecycleAction,
): SageOsAgentSpec["status"] | null {
  if (action === "pause") {
    return status === "active" ? "paused" : null;
  }
  if (action === "resume") {
    return status === "paused" ? "active" : null;
  }
  if (status === "retired") {
    return null;
  }
  return "retired";
}

function eventTypeForAction(action: SageOsEmployeeLifecycleAction): string {
  return action === "pause"
    ? "employee_paused"
    : action === "resume"
      ? "employee_resumed"
      : "employee_retired";
}

function eventLabelForAction(action: SageOsEmployeeLifecycleAction): string {
  return action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Retired";
}
