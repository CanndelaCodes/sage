import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { runSageOsAmbientCopilotOnce } from "../../sageos/ambient-copilot.js";
import { discoverSageOsAppCandidates } from "../../sageos/app-candidates.js";
import { runSageOsNightShiftTask } from "../../sageos/coding/night-shift.js";
import {
  getSageOsEmployeeTemplate,
  listSageOsEmployeeTemplates,
} from "../../sageos/employee-templates.js";
import { appendSageOsEvent, createSageOsEventLog } from "../../sageos/event-log.js";
import { runSageOsMemoryStewardOnce } from "../../sageos/memory-steward.js";
import {
  buildSageOsCompletionNotification,
  buildSageOsDigestNotification,
  buildSageOsIncidentNotification,
  buildSageOsLifecycleNotification,
  sendSageOsCompletionNotificationOnce,
  sendSageOsIncidentNotificationOnce,
  sendSageOsLifecycleNotificationOnce,
  sendSageOsTelegramDigestOnce,
} from "../../sageos/notifications.js";
import { observeAppFocusOnce } from "../../sageos/observations.js";
import { draftSageOsSkillFromWorkflow } from "../../sageos/skill-steward.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  writeSageOsControl,
  writeSageOsState,
} from "../../sageos/state-store.js";
import { collectSageOsStatus } from "../../sageos/status.js";
import { queueSageOsTask } from "../../sageos/task-queue.js";
import { runNextSageOsTaskOnce } from "../../sageos/task-runner.js";
import {
  createSageOsStatusSnapshot,
  type SageOsApproval,
  type SageOsSupervisorStatus,
} from "../../sageos/types.js";
import { discoverSageOsWorkflowCandidates } from "../../sageos/workflow-compiler.js";
import { dryRunSageOsWorkflow } from "../../sageos/workflow-runner.js";
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

function parseLimit(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
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
  "sageos.tasks.queue": async ({ params, respond, context }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.tasks.queue params: id required"),
      );
      return;
    }
    const result = await queueSageOsTask({
      taskId: id,
      requestedBy: "sageos.gateway",
      reason: typeof params.reason === "string" ? params.reason : undefined,
    });
    const state = await readSageOsState(createSageOsStateStore());
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.tasks.runNext": async ({ params, respond, context }) => {
    const notify = params.notify === true;
    const result = await runNextSageOsTaskOnce({
      requestedBy: "sageos.gateway",
      notify,
      cfg: notify ? loadConfig().sageos : undefined,
    });
    const state = await readSageOsState(createSageOsStateStore());
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.runs.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { runs: state.runs }, undefined);
  },
  "sageos.workflows.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { workflows: state.workflows }, undefined);
  },
  "sageos.workflows.discover": async ({ params, respond, context }) => {
    const result = await discoverSageOsWorkflowCandidates({
      minOccurrences: parseLimit(params.min, 2),
    });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.workflows.dryRun": async ({ params, respond, context }) => {
    const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim() : "";
    if (!workflowId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.workflows.dryRun params: workflowId",
        ),
      );
      return;
    }
    const result = await dryRunSageOsWorkflow({ workflowId });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.skills.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { skills: state.skills }, undefined);
  },
  "sageos.skills.draft": async ({ params, respond, context }) => {
    const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim() : "";
    if (!workflowId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.skills.draft params: workflowId"),
      );
      return;
    }
    const result = await draftSageOsSkillFromWorkflow({ workflowId });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.apps.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { apps: state.apps }, undefined);
  },
  "sageos.apps.discover": async ({ params, respond, context }) => {
    const result = await discoverSageOsAppCandidates({
      minOccurrences: parseLimit(params.min, 2),
    });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.coding.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { reports: state.codingReports }, undefined);
  },
  "sageos.coding.run": async ({ params, respond, context }) => {
    const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
    if (!taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.coding.run params: taskId"),
      );
      return;
    }
    const appendFile = typeof params.appendFile === "string" ? params.appendFile.trim() : "";
    const appendText = typeof params.appendText === "string" ? params.appendText : undefined;
    if (Boolean(appendFile) !== (appendText !== undefined)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.coding.run params: appendFile and appendText must be paired",
        ),
      );
      return;
    }
    const result = await runSageOsNightShiftTask({
      taskId,
      cfg: loadConfig().sageos,
      append: appendFile ? { relativePath: appendFile, text: appendText ?? "" } : undefined,
      testCommand:
        typeof params.testCommand === "string" && params.testCommand.trim()
          ? params.testCommand.trim()
          : undefined,
      requestedBy: "sageos.gateway",
    });
    const state = await readSageOsState(createSageOsStateStore());
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
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
  "sageos.copilot.suggest": async ({ params, respond, context }) => {
    const result = await runSageOsAmbientCopilotOnce({
      cfg: loadConfig().sageos,
      maxSuggestions: parseLimit(params.max, 5),
    });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.memory.replay": async ({ params, respond, context }) => {
    const agentId =
      typeof params.agentId === "string" && params.agentId.trim() ? params.agentId.trim() : "main";
    const result = await runSageOsMemoryStewardOnce({ cfg: loadConfig(), agentId });
    const stateStore = createSageOsStateStore();
    await writeSageOsState(stateStore, result.status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.notifications.digest": async ({ params, respond, context }) => {
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsTelegramDigestOnce({ cfg, target });
      await writeSageOsState(stateStore, result.status);
      const state = await readSageOsState(stateStore);
      context.broadcast("sageos", state, { dropIfSlow: true });
      respond(true, { result, state }, undefined);
      return;
    }

    const status = await collectSageOsStatus({ cfg });
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    const notification = buildSageOsDigestNotification({ state, status, cfg, target });
    respond(true, { notification, state }, undefined);
  },
  "sageos.notifications.startup": async ({ params, respond, context }) => {
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsLifecycleNotificationOnce({
        kind: "startup",
        cfg,
        target,
      });
      await writeSageOsState(stateStore, result.status);
      const state = await readSageOsState(stateStore);
      context.broadcast("sageos", state, { dropIfSlow: true });
      respond(true, { result, state }, undefined);
      return;
    }

    const status = await collectSageOsStatus({ cfg });
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    const notification = buildSageOsLifecycleNotification({
      kind: "startup",
      status,
      cfg,
      target,
    });
    respond(true, { notification, state }, undefined);
  },
  "sageos.notifications.incident": async ({ params, respond, context }) => {
    const incidentId = typeof params.incidentId === "string" ? params.incidentId.trim() : "";
    if (!incidentId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.notifications.incident params: incidentId",
        ),
      );
      return;
    }
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsIncidentNotificationOnce({ incidentId, cfg, target });
      await writeSageOsState(stateStore, result.status);
      const state = await readSageOsState(stateStore);
      context.broadcast("sageos", state, { dropIfSlow: true });
      respond(true, { result, state }, undefined);
      return;
    }

    const status = await collectSageOsStatus({ cfg });
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    const incident = status.incidents.find((entry) => entry.id === incidentId);
    if (!incident) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS incident not found"),
      );
      return;
    }
    const notification = buildSageOsIncidentNotification({ incident, status, cfg, target });
    respond(true, { notification, state }, undefined);
  },
  "sageos.notifications.completion": async ({ params, respond, context }) => {
    const reportId = typeof params.reportId === "string" ? params.reportId.trim() : "";
    if (!reportId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.notifications.completion params: reportId",
        ),
      );
      return;
    }
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsCompletionNotificationOnce({ reportId, cfg, target });
      await writeSageOsState(stateStore, result.status);
      const state = await readSageOsState(stateStore);
      context.broadcast("sageos", state, { dropIfSlow: true });
      respond(true, { result, state }, undefined);
      return;
    }

    const status = await collectSageOsStatus({ cfg });
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    const report = state.codingReports.find((entry) => entry.id === reportId);
    if (!report) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS coding report not found"),
      );
      return;
    }
    const notification = buildSageOsCompletionNotification({ report, status, cfg, target });
    respond(true, { notification, state }, undefined);
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
