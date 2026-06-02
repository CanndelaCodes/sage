import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { runSageOsAmbientCopilotOnce } from "../../sageos/ambient-copilot.js";
import { discoverSageOsAppCandidates } from "../../sageos/app-candidates.js";
import { resolveSageOsApproval, type SageOsApprovalDecision } from "../../sageos/approvals.js";
import { runSageOsNightShiftTask } from "../../sageos/coding/night-shift.js";
import { createSageOsTaskHandoff, requestSageOsReview } from "../../sageos/collaboration.js";
import {
  activateSageOsEmployee,
  buildSageOsEmployeeActivationPreview,
} from "../../sageos/employee-activation.js";
import { draftSageOsEmployeeFromIntent } from "../../sageos/employee-builder.js";
import {
  updateSageOsEmployeeLifecycle,
  type SageOsEmployeeLifecycleAction,
} from "../../sageos/employee-lifecycle.js";
import {
  getSageOsEmployeeTemplate,
  listSageOsEmployeeTemplates,
} from "../../sageos/employee-templates.js";
import { appendSageOsEvent, createSageOsEventLog } from "../../sageos/event-log.js";
import {
  runSageOsMemoryDoctorOnce,
  runSageOsMemoryStewardOnce,
} from "../../sageos/memory-steward.js";
import {
  buildSageOsApprovalNotification,
  buildSageOsCompletionNotification,
  buildSageOsDigestNotification,
  buildSageOsIncidentNotification,
  buildSageOsLifecycleNotification,
  sendSageOsApprovalNotificationOnce,
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
  upsertSageOsAgent,
  upsertSageOsTask,
  writeSageOsControl,
  writeSageOsState,
} from "../../sageos/state-store.js";
import { collectSageOsStatus } from "../../sageos/status.js";
import { observeSystemStatusOnce } from "../../sageos/system-observer.js";
import { createSageOsTask } from "../../sageos/task-creation.js";
import { queueSageOsTask } from "../../sageos/task-queue.js";
import { runNextSageOsTaskOnce } from "../../sageos/task-runner.js";
import {
  createSageOsStatusSnapshot,
  type SageOsPolicyScope,
  type SageOsSupervisorStatus,
} from "../../sageos/types.js";
import { discoverSageOsWorkflowCandidates } from "../../sageos/workflow-compiler.js";
import { dryRunSageOsWorkflow } from "../../sageos/workflow-runner.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const CONTROL_STATES = new Set(["paused", "running", "stopped"]);
const APPROVAL_DECISIONS = new Set(["approved", "denied"]);
const POLICY_SCOPE_KINDS = new Set<SageOsPolicyScope["kind"]>([
  "tool",
  "file",
  "repo",
  "app",
  "channel",
  "memory",
  "network",
  "system",
]);
const POLICY_SCOPE_RISKS = new Set<NonNullable<SageOsPolicyScope["risk"]>>([
  "low",
  "medium",
  "high",
  "critical",
]);

type SageOsControlState = "paused" | "running" | "stopped";
type ResolvedSageOsApproval = Extract<
  Awaited<ReturnType<typeof resolveSageOsApproval>>,
  { outcome: "resolved" }
>;

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

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayParam(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
    );
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function positiveNumberParam(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function taskBudgetParam(
  value: unknown,
): { maxMinutes?: number; maxToolCalls?: number; maxCostUsd?: number } | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const budget = {
    ...(positiveNumberParam(record.maxMinutes)
      ? { maxMinutes: positiveNumberParam(record.maxMinutes) }
      : {}),
    ...(positiveNumberParam(record.maxToolCalls)
      ? { maxToolCalls: positiveNumberParam(record.maxToolCalls) }
      : {}),
    ...(positiveNumberParam(record.maxCostUsd)
      ? { maxCostUsd: positiveNumberParam(record.maxCostUsd) }
      : {}),
  };
  return Object.keys(budget).length > 0 ? budget : undefined;
}

function policyScopesParam(value: unknown): SageOsPolicyScope[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const scopes = value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const kind =
        typeof record.kind === "string" &&
        POLICY_SCOPE_KINDS.has(record.kind as SageOsPolicyScope["kind"])
          ? (record.kind as SageOsPolicyScope["kind"])
          : undefined;
      if (!kind) {
        return null;
      }
      const risk =
        typeof record.risk === "string" &&
        POLICY_SCOPE_RISKS.has(record.risk as NonNullable<SageOsPolicyScope["risk"]>)
          ? (record.risk as NonNullable<SageOsPolicyScope["risk"]>)
          : undefined;
      const allow = stringArrayParam(record.allow);
      const deny = stringArrayParam(record.deny);
      return {
        kind,
        ...(allow.length > 0 ? { allow } : {}),
        ...(deny.length > 0 ? { deny } : {}),
        ...(risk ? { risk } : {}),
      } satisfies SageOsPolicyScope;
    })
    .filter((entry): entry is SageOsPolicyScope => Boolean(entry));
  return scopes.length > 0 ? scopes : undefined;
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
): Promise<ResolvedSageOsApproval | undefined> {
  const result = await resolveSageOsApproval({
    id,
    decision,
    actor: "sageos.gateway",
    reason: opts.reason?.trim() || "gateway",
  });
  return result.outcome === "resolved" ? result : undefined;
}

async function runEmployeeLifecycleGatewayAction(
  action: SageOsEmployeeLifecycleAction,
  params: Record<string, unknown>,
  respond: Parameters<GatewayRequestHandlers[string]>[0]["respond"],
  context: Parameters<GatewayRequestHandlers[string]>[0]["context"],
) {
  const id = stringParam(params, "id");
  if (!id) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `invalid sageos.agents.${action} params: id required`),
    );
    return;
  }

  const stateStore = createSageOsStateStore();
  const result = await updateSageOsEmployeeLifecycle({
    employeeId: id,
    action,
    requestedBy: "sageos.gateway",
    reason: stringParam(params, "reason") || undefined,
    stateStore,
  });
  if (result.outcome === "not_found") {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "SageOS employee not found"));
    return;
  }
  if (result.outcome === "invalid_transition") {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.reason));
    return;
  }

  const status = await collectSageOsStatus();
  await writeSageOsState(stateStore, status);
  const state = await readSageOsState(stateStore);
  context.broadcast("sageos", state, { dropIfSlow: true });
  respond(true, { result, state }, undefined);
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
  "sageos.agents.create": async ({ params, respond, context }) => {
    const description = stringParam(params, "description");
    if (!description) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.agents.create params: description required",
        ),
      );
      return;
    }

    let employee: ReturnType<typeof draftSageOsEmployeeFromIntent>;
    try {
      employee = draftSageOsEmployeeFromIntent({
        description,
        name: stringParam(params, "name") || undefined,
        role: stringParam(params, "role") || undefined,
        autonomyTier:
          stringParam(params, "tier") || stringParam(params, "autonomyTier") || undefined,
        templateId:
          stringParam(params, "templateId") || stringParam(params, "template") || undefined,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          err instanceof Error ? err.message : "Unable to draft SageOS employee.",
        ),
      );
      return;
    }

    const preview = buildSageOsEmployeeActivationPreview(employee);
    const stateStore = createSageOsStateStore();
    await upsertSageOsAgent(stateStore, employee);
    await appendSageOsEvent(createSageOsEventLog(), {
      type: "employee_drafted",
      actor: "sageos.gateway",
      summary: `Drafted SageOS employee ${employee.name}`,
      sensitivity: "normal",
    });
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { employee, preview, state }, undefined);
  },
  "sageos.agents.activationPreview": async ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.agents.activationPreview params: id",
        ),
      );
      return;
    }
    const state = await readSageOsState(createSageOsStateStore());
    const employee = state.agents.find((agent) => agent.id === id);
    if (!employee) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS employee not found"),
      );
      return;
    }
    respond(true, { preview: buildSageOsEmployeeActivationPreview(employee) }, undefined);
  },
  "sageos.agents.activate": async ({ params, respond, context }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.agents.activate params: id"),
      );
      return;
    }
    const result = await activateSageOsEmployee({
      employeeId: id,
      requestedBy: "sageos.gateway",
      reason: typeof params.reason === "string" ? params.reason : undefined,
    });
    if (result.outcome === "not_found") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS employee not found"),
      );
      return;
    }
    if (result.outcome === "not_activatable") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `SageOS employee cannot be activated: ${result.reason}`,
        ),
      );
      return;
    }
    const stateStore = createSageOsStateStore();
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.agents.pause": async ({ params, respond, context }) =>
    runEmployeeLifecycleGatewayAction("pause", params, respond, context),
  "sageos.agents.resume": async ({ params, respond, context }) =>
    runEmployeeLifecycleGatewayAction("resume", params, respond, context),
  "sageos.agents.retire": async ({ params, respond, context }) =>
    runEmployeeLifecycleGatewayAction("retire", params, respond, context),
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
  "sageos.collaboration.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { collaborations: state.collaborations }, undefined);
  },
  "sageos.collaboration.handoff": async ({ params, respond, context }) => {
    const fromAgentId = stringParam(params, "fromAgentId");
    const toAgentId = stringParam(params, "toAgentId");
    const title = stringParam(params, "title");
    const objective = stringParam(params, "objective");
    if (!fromAgentId || !toAgentId || !title || !objective) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.collaboration.handoff params: fromAgentId, toAgentId, title, and objective required",
        ),
      );
      return;
    }
    const stateStore = createSageOsStateStore();
    const result = await createSageOsTaskHandoff({
      stateStore,
      fromAgentId,
      toAgentId,
      title,
      objective,
    });
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.collaboration.requestReview": async ({ params, respond, context }) => {
    const fromAgentId = stringParam(params, "fromAgentId");
    const reviewerAgentId = stringParam(params, "reviewerAgentId");
    const title = stringParam(params, "title");
    const summary = stringParam(params, "summary");
    if (!fromAgentId || !reviewerAgentId || !title || !summary) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.collaboration.requestReview params: fromAgentId, reviewerAgentId, title, and summary required",
        ),
      );
      return;
    }
    const stateStore = createSageOsStateStore();
    const result = await requestSageOsReview({
      stateStore,
      fromAgentId,
      reviewerAgentId,
      title,
      summary,
      taskId: stringParam(params, "taskId") || undefined,
      artifactRefs: stringArrayParam(params.artifactRefs),
    });
    const status = await collectSageOsStatus();
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
  },
  "sageos.tasks.list": async ({ respond }) => {
    const state = await readSageOsState(createSageOsStateStore());
    respond(true, { tasks: state.tasks }, undefined);
  },
  "sageos.tasks.create": async ({ params, respond, context }) => {
    const title = stringParam(params, "title");
    const objective = stringParam(params, "objective");
    if (!title || !objective) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.tasks.create params: title and objective required",
        ),
      );
      return;
    }
    const result = await createSageOsTask({
      title,
      objective,
      ownerAgentId: stringParam(params, "ownerAgentId") || stringParam(params, "employeeId"),
      autonomyTier: stringParam(params, "autonomyTier") || undefined,
      requestedBy: "sageos.gateway",
      policyScopes: policyScopesParam(params.policyScopes),
      evidenceRefs: stringArrayParam(params.evidenceRefs),
      expectedOutput: stringParam(params, "expectedOutput") || undefined,
      verificationPlan: stringArrayParam(params.verificationPlan),
      budget: taskBudgetParam(params.budget),
      toolProfile: stringParam(params, "toolProfile") || undefined,
    });
    if (result.outcome === "invalid_owner") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `SageOS employee is not available: ${result.ownerAgentId}`,
        ),
      );
      return;
    }
    const state = await readSageOsState(createSageOsStateStore());
    context.broadcast("sageos", state, { dropIfSlow: true });
    respond(true, { result, state }, undefined);
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
  "sageos.tasks.cancel": async ({ params, respond, context }) => {
    const id = stringParam(params, "id");
    if (!id) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.tasks.cancel params: id required"),
      );
      return;
    }
    const stateStore = createSageOsStateStore();
    const state = await readSageOsState(stateStore);
    const task = state.tasks.find((entry) => entry.id === id);
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "SageOS task not found"));
      return;
    }
    const nextTask = { ...task, state: "cancelled" as const, updatedAt: new Date().toISOString() };
    await upsertSageOsTask(stateStore, nextTask);
    await appendSageOsEvent(createSageOsEventLog(), {
      type: "task_cancelled",
      actor: "sageos.gateway",
      summary: `Cancelled SageOS task ${id}: ${stringParam(params, "reason") || "manual"}`,
      taskId: id,
      sensitivity: "normal",
    });
    const nextState = await readSageOsState(stateStore);
    context.broadcast("sageos", nextState, { dropIfSlow: true });
    respond(true, { task: nextTask, state: nextState }, undefined);
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

    const result = await resolveApprovalFromGateway(id, decision, {
      reason: typeof params.reason === "string" ? params.reason : undefined,
    });
    if (!result) {
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
    respond(true, { approval: result.approval, task: result.task, state }, undefined);
  },
  "sageos.observe": async ({ params, respond, context }) => {
    if (params.source !== "app_focus" && params.source !== "system") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid sageos.observe params: source"),
      );
      return;
    }

    const result =
      params.source === "app_focus"
        ? await observeAppFocusOnce({ cfg: { sources: { appFocus: true } } })
        : await observeSystemStatusOnce({ cfg: { sources: { system: true } } });
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
  "sageos.memory.doctor": async ({ params, respond, context }) => {
    const agentId =
      typeof params.agentId === "string" && params.agentId.trim() ? params.agentId.trim() : "main";
    const namespace =
      typeof params.namespace === "string" && params.namespace.trim()
        ? params.namespace.trim()
        : undefined;
    const result = await runSageOsMemoryDoctorOnce({ cfg: loadConfig(), agentId, namespace });
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
  "sageos.notifications.shutdown": async ({ params, respond, context }) => {
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsLifecycleNotificationOnce({
        kind: "shutdown",
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
      kind: "shutdown",
      status,
      cfg,
      target,
    });
    respond(true, { notification, state }, undefined);
  },
  "sageos.notifications.approval": async ({ params, respond, context }) => {
    const approvalId = typeof params.approvalId === "string" ? params.approvalId.trim() : "";
    if (!approvalId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid sageos.notifications.approval params: approvalId",
        ),
      );
      return;
    }
    const cfg = loadConfig().sageos;
    const target =
      typeof params.target === "string" && params.target.trim() ? params.target.trim() : undefined;
    const stateStore = createSageOsStateStore();
    if (params.send === true) {
      const result = await sendSageOsApprovalNotificationOnce({ approvalId, cfg, target });
      await writeSageOsState(stateStore, result.status);
      const state = await readSageOsState(stateStore);
      context.broadcast("sageos", state, { dropIfSlow: true });
      respond(true, { result, state }, undefined);
      return;
    }

    const status = await collectSageOsStatus({ cfg });
    await writeSageOsState(stateStore, status);
    const state = await readSageOsState(stateStore);
    const approval = state.approvals.find((entry) => entry.id === approvalId);
    if (!approval) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "SageOS approval not found"),
      );
      return;
    }
    const notification = buildSageOsApprovalNotification({ approval, status, cfg, target });
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
