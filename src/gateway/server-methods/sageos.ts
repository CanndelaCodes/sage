import type { GatewayRequestHandlers } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "../../sageos/event-log.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  writeSageOsControl,
  writeSageOsState,
} from "../../sageos/state-store.js";
import { createSageOsStatusSnapshot, type SageOsSupervisorStatus } from "../../sageos/types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const CONTROL_STATES = new Set(["paused", "running", "stopped"]);

type SageOsControlState = "paused" | "running" | "stopped";

function parseControlState(value: unknown): SageOsControlState | undefined {
  return typeof value === "string" && CONTROL_STATES.has(value)
    ? (value as SageOsControlState)
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

export const sageOsHandlers: GatewayRequestHandlers = {
  "sageos.status": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, state, undefined);
  },
  "sageos.agents.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { agents: state.agents }, undefined);
  },
  "sageos.tasks.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { tasks: state.tasks }, undefined);
  },
  "sageos.runs.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { runs: state.runs }, undefined);
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

    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, state, undefined);
  },
};
