import type { GatewayRequestHandlers } from "./types.js";
import {
  getSageOsEmployeeTemplate,
  listSageOsEmployeeTemplates,
} from "../../sageos/employee-templates.js";
import { appendSageOsEvent, createSageOsEventLog } from "../../sageos/event-log.js";
import { observeAppFocusOnce } from "../../sageos/observations.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  writeSageOsControl,
  writeSageOsState,
} from "../../sageos/state-store.js";
import { collectSageOsStatus } from "../../sageos/status.js";
import {
  createSageOsStatusSnapshot,
  type SageOsApproval,
  type SageOsSupervisorStatus,
} from "../../sageos/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const CONTROL_STATES = new Set(["paused", "running", "stopped"]);
const APPROVAL_DECISIONS = new Set(["approved", "denied"]);

type SageOsControlState = "paused" | "running" | "stopped";
type SageOsApprovalDecision = "approved" | "denied";

function parseControlState(value: unknown): SageOsControlState | undefined {
  return typeof value === "string" && CONTROL_STATES.has(value)
    ? (value as SageOsControlState)
    : undefined;
}

function parseApprovalDecision(value: unknown): SageOsApprovalDecision | undefined {
  return typeof value === "string" && APPROVAL_DECISIONS.has(value)
    ? (value as SageOsApprovalDecision)
    : undefined;
}

function supervisorStatusForControl(
  state: SageOsControlState,
  opts: { reason?: string; emergency?: boolean } = {},
): SageOsSupervisorStatus {
  const now = new Date();
  const isStopped = state === "stopped";
  return {
    enabled: !isStopped,
    paused: state === "paused" || Boolean(opts.emergency),
    state,
    lastTickAt: state === "running" ? now.toISOString() : undefined,
    nextTickAt: state === "running" ? new Date(now.getTime() + 30_000).toISOString() : undefined,
    stoppedAt: isStopped ? now.toISOString() : undefined,
    lastError: opts.reason,
  };
}

async function resolveApprovalFromGateway(
  id: string,
  decision: SageOsApprovalDecision,
  opts: { reason?: string },
): Promise<SageOsApproval | undefined> {
  const stateStore = createSageOsStateStore();
  const state = await readSageOsState(stateStore);
  const approval = state.approvals.find((entry) => entry.id === id);
  if (!approval || approval.state !== "pending") {
    return undefined;
  }

  const now = new Date().toISOString();
  const nextApproval: SageOsApproval = {
    ...approval,
    state: decision,
    resolvedAt: now,
    resolvedBy: "sageos.gateway",
    resolutionReason: opts.reason?.trim() || "gateway",
    updatedAt: now,
  };
  await upsertSageOsApproval(stateStore, nextApproval);
  await appendSageOsEvent(createSageOsEventLog(), {
    type: "approval_resolved",
    actor: "sageos.gateway",
    summary: `Resolved SageOS approval ${id} as ${decision}: ${nextApproval.resolutionReason}`,
    taskId: nextApproval.taskId,
    runId: nextApproval.runId,
  });
  return nextApproval;
}

export const sageOsHandlers: GatewayRequestHandlers = {
  "sageos.status": async ({ respond }) => {
    const stateStore = createSageOsStateStore();
    const state = await readSageOsState(stateStore);
    const status = await collectSageOsStatus();
    respond(true, { ...state, status }, undefined);
  },
  "sageos.agents.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { agents: state.agents }, undefined);
  },
  "sageos.agentTemplates.list": async ({ respond }) => {
    respond(true, { templates: listSageOsEmployeeTemplates() }, undefined);
  },
  "sageos.agentTemplates.inspect": async ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id : "";
    const template = getSageOsEmployeeTemplate(id);
    if (!template) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.agentTemplates.inspect params: id"),
      );
      return;
    }
    respond(true, { template }, undefined);
  },
  "sageos.tasks.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { tasks: state.tasks }, undefined);
  },
  "sageos.runs.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { runs: state.runs }, undefined);
  },
  "sageos.approvals.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { approvals: state.approvals }, undefined);
  },
  "sageos.observations.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { observations: state.observations }, undefined);
  },
  "sageos.approvals.resolve": async ({ params, respond, context }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    const decision = parseApprovalDecision(params.decision);
    if (!id || !decision) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.approvals.resolve params: id and decision required",
        ),
      );
      return;
    }

    const approval = await resolveApprovalFromGateway(id, decision, {
      reason: typeof params.reason === "string" ? params.reason : undefined,
    });
    if (!approval) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS approval not found or not pending"),
      );
      return;
    }

    const stateStore = createSageOsStateStore();
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { approval, state }, undefined);
  },
  "sageos.observe": async ({ params, respond, context }) => {
    if (params.source !== "app_focus") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.observe params: source"),
      );
      return;
    }

    const result = await observeAppFocusOnce({ cfg: { sources: { appFocus: true } } });
    const stateStore = createSageOsStateStore();
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.control": async ({ params, respond, context }) => {
    const controlState = parseControlState(params.state);
    if (!controlState) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.control params: state required"),
      );
      return;
    }

    const reason = typeof params.reason === "string" ? params.reason : "gateway";
    const emergency = params.emergency === true;
    const status = createSageOsStatusSnapshot({
      supervisor: supervisorStatusForControl(controlState, { reason, emergency }),
    });
    const stateStore = createSageOsStateStore();
    const controlStore = createSageOsControlStore();
    const eventLog = createSageOsEventLog();
    await writeSageOsState(stateStore, status);
    await writeSageOsControl(controlStore, { state: controlState, reason, emergency });
    await appendSageOsEvent(eventLog, {
      type: emergency ? "emergency_stop" : `supervisor_${controlState}`,
      actor: "sageos.gateway",
      summary: `SageOS ${emergency ? "emergency stop" : controlState}: ${reason}`,
    });

    const statusWithAudit = await collectSageOsStatus();
    await writeSageOsState(stateStore, statusWithAudit);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, state, undefined);
  },
};
