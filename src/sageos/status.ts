import { readFile } from "node:fs/promises";
import {
  listLearningEventQueue,
  resolveLearningEventQueuePath,
} from "../learning/activity-queue.js";
import {
  listSageMemoryCaptureQueue,
  resolveSageMemoryCaptureQueuePath,
} from "../memory/sage-memory-capture-queue.js";
import { createSageOsEventLog } from "./event-log.js";
import { createSageOsStateStore, readSageOsState } from "./state-store.js";
import {
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
  type SageOsConfig,
  type SageOsAgentSpec,
  type SageOsAppCandidate,
  type SageOsIncident,
  type SageOsObservation,
  type SageOsQueueSummary,
  type SageOsRun,
  type SageOsRunSummary,
  type SageOsSkillRecord,
  type SageOsStatusSnapshot,
  type SageOsSummary,
  type SageOsTaskSpec,
  type SageOsWorkflow,
} from "./types.js";

export type CollectSageOsStatusOptions = {
  stateDir?: string;
  agentId?: string;
  memoryCaptureQueuePath?: string;
  learningActivityQueuePath?: string;
  cfg?: SageOsConfig;
};

export async function collectSageOsStatus(
  opts: CollectSageOsStatusOptions = {},
): Promise<SageOsStatusSnapshot> {
  const agentId = opts.agentId ?? "main";
  const store = createSageOsStateStore({ stateDir: opts.stateDir });
  const state = await readSageOsState(store);
  const eventLog = createSageOsEventLog({ stateDir: opts.stateDir });
  const [memoryQueue, learningQueue, recentEvents] = await Promise.all([
    listSageMemoryCaptureQueue({
      queuePath:
        opts.memoryCaptureQueuePath ??
        resolveSageMemoryCaptureQueuePath({
          agentId,
          env: envForStateDir(opts.stateDir),
        }),
    }),
    listLearningEventQueue({
      queuePath:
        opts.learningActivityQueuePath ??
        resolveLearningEventQueuePath({
          agentId,
          env: envForStateDir(opts.stateDir),
        }),
    }),
    countEventLogLines(eventLog.path),
  ]);
  const memoryCaptureQueue = queueSummary(memoryQueue);
  const learningActivityQueue = queueSummary(learningQueue);
  const pendingApprovals = state.approvals.filter((approval) => approval.state === "pending");
  const policyBlockedTasks = state.tasks.filter((task) => task.state === "waiting_for_policy");
  const incidents = [
    ...state.status.incidents,
    ...queueIncidents({
      now: state.status.generatedAt,
      category: "memory",
      title: "Sage Memory capture queue has failed entries",
      summary: `${memoryCaptureQueue.failed} Sage Memory capture entr${
        memoryCaptureQueue.failed === 1 ? "y is" : "ies are"
      } failed and need replay or repair.`,
      failed: memoryCaptureQueue.failed,
    }),
    ...queueIncidents({
      now: state.status.generatedAt,
      category: "learning",
      title: "Learning activity queue has failed entries",
      summary: `${learningActivityQueue.failed} learning activity entr${
        learningActivityQueue.failed === 1 ? "y is" : "ies are"
      } failed and need replay or repair.`,
      failed: learningActivityQueue.failed,
    }),
    ...policyIncidents({
      now: state.status.generatedAt,
      pendingApprovals: pendingApprovals.length,
      waitingTasks: policyBlockedTasks.length,
    }),
  ];

  return createSageOsStatusSnapshot({
    ...state.status,
    generatedAt: new Date().toISOString(),
    employees: summarizeAgents(state.agents),
    tasks: summarizeTasks(state.tasks),
    runs: summarizeRuns(state.runs),
    workflows: summarizeWorkflows(state.workflows),
    skills: summarizeSkills(state.skills),
    apps: summarizeApps(state.apps),
    approvals: {
      pending: pendingApprovals.length,
    },
    observations: summarizeObservations(state.observations),
    memory: {
      status: memoryCaptureQueue.failed > 0 ? "degraded" : "ok",
      backend: "sage-memory",
      canonical: "sage-memory",
      captureQueue: memoryCaptureQueue,
    },
    learning: {
      status: learningActivityQueue.failed > 0 ? "degraded" : "ok",
      activityQueue: learningActivityQueue,
    },
    sources: summarizeSources(opts.cfg),
    policy: summarizePolicy(opts.cfg, state.status.mode),
    coding: summarizeCoding(opts.cfg),
    notifications: summarizeNotifications(opts.cfg, incidents),
    incidents,
    audit: {
      ...state.status.audit,
      recentEvents,
      eventLogPath: eventLog.path,
    },
  });
}

function summarizeObservations(
  observations: SageOsObservation[],
): SageOsStatusSnapshot["observations"] {
  const now = Date.now();
  const recentWindowMs = 24 * 60 * 60 * 1000;
  return {
    total: observations.length,
    recent: observations.filter((observation) => {
      const observedAt = Date.parse(observation.observedAt);
      return Number.isFinite(observedAt) && Math.abs(now - observedAt) <= recentWindowMs;
    }).length,
    redacted: observations.filter((observation) => observation.state === "redacted").length,
    failed: observations.filter((observation) => observation.state === "failed").length,
  };
}

function envForStateDir(stateDir: string | undefined): NodeJS.ProcessEnv | undefined {
  return stateDir ? { ...process.env, SAGE_STATE_DIR: stateDir } : undefined;
}

function summarizeAgents(agents: SageOsAgentSpec[]): SageOsSummary {
  return {
    total: agents.length,
    active: agents.filter((agent) => agent.status === "active").length,
    queued: agents.filter((agent) => agent.status === "draft").length,
    blocked: agents.filter((agent) => agent.status === "paused" || agent.status === "disabled")
      .length,
  };
}

function summarizeTasks(tasks: SageOsTaskSpec[]): SageOsSummary {
  return {
    total: tasks.length,
    active: tasks.filter((task) => ["planning", "running", "verifying"].includes(task.state))
      .length,
    queued: tasks.filter((task) => ["proposed", "queued"].includes(task.state)).length,
    blocked: tasks.filter((task) =>
      ["waiting_for_policy", "blocked", "paused", "expired"].includes(task.state),
    ).length,
  };
}

function summarizeRuns(runs: SageOsRun[]): SageOsRunSummary {
  return {
    total: runs.length,
    active: runs.filter((run) => run.state === "running").length,
    queued: runs.filter((run) => run.state === "queued").length,
    failed: runs.filter((run) => run.state === "failed" || run.state === "timed_out").length,
  };
}

function summarizeWorkflows(workflows: SageOsWorkflow[]): SageOsSummary {
  return {
    total: workflows.length,
    active: workflows.filter((workflow) => ["dry_run_passed", "enabled"].includes(workflow.state))
      .length,
    queued: workflows.filter((workflow) =>
      ["candidate", "drafted_spec", "implemented_draft"].includes(workflow.state),
    ).length,
    blocked: workflows.filter((workflow) =>
      ["failed", "paused", "retired"].includes(workflow.state),
    ).length,
  };
}

function summarizeSkills(skills: SageOsSkillRecord[]): SageOsSummary {
  return {
    total: skills.length,
    active: skills.filter((skill) => skill.state === "active").length,
    queued: skills.filter((skill) => skill.state === "draft").length,
    blocked: skills.filter((skill) => skill.state === "deprecated" || skill.state === "retired")
      .length,
  };
}

function summarizeApps(apps: SageOsAppCandidate[]): SageOsSummary {
  return {
    total: apps.length,
    active: apps.filter((app) => app.state === "preview_ready" || app.state === "enabled").length,
    queued: apps.filter((app) => app.state === "draft").length,
    blocked: apps.filter((app) => app.state === "blocked" || app.state === "retired").length,
  };
}

function queueSummary(input: {
  path: string;
  counts: { total: number; pending: number; failed: number };
}): SageOsQueueSummary {
  return {
    path: input.path,
    total: input.counts.total,
    pending: input.counts.pending,
    failed: input.counts.failed,
  };
}

function queueIncidents(params: {
  now: string;
  category: "memory" | "learning";
  title: string;
  summary: string;
  failed: number;
}): SageOsIncident[] {
  if (params.failed === 0) {
    return [];
  }
  return [
    {
      id: `incident_${params.category}_queue_failed`,
      severity: "warning",
      category: params.category,
      title: params.title,
      summary: params.summary,
      firstSeenAt: params.now,
      lastSeenAt: params.now,
      autoRepairSafe: true,
      repairAction: queueRepairAction(params.category),
    },
  ];
}

function queueRepairAction(category: "memory" | "learning"): SageOsIncident["repairAction"] {
  return {
    id: `repair_${category}_queue_replay`,
    label: category === "memory" ? "Replay memory queues" : "Replay learning queues",
    command: "sage os memory replay --json",
    gatewayMethod: "sageos.memory.replay",
    risk: "low",
    approvalRequired: false,
  };
}

function policyIncidents(params: {
  now: string;
  pendingApprovals: number;
  waitingTasks: number;
}): SageOsIncident[] {
  if (params.pendingApprovals === 0 && params.waitingTasks === 0) {
    return [];
  }
  return [
    {
      id: "incident_policy_blocked",
      severity: "warning",
      category: "policy",
      title: "SageOS work is waiting for policy review",
      summary: `${params.pendingApprovals} approval(s) pending and ${params.waitingTasks} task(s) waiting for policy.`,
      firstSeenAt: params.now,
      lastSeenAt: params.now,
      autoRepairSafe: false,
      repairAction: {
        id: "repair_policy_review",
        label: "Review SageOS approvals",
        command: "sage os approvals --json",
        gatewayMethod: "sageos.approvals.list",
        risk: "medium",
        approvalRequired: false,
      },
    },
  ];
}

function summarizeSources(cfg: SageOsConfig | undefined): SageOsStatusSnapshot["sources"] {
  const entries = Object.entries(cfg?.sources ?? {});
  return {
    enabled: entries.filter(([, enabled]) => enabled).map(([source]) => source),
    disabled: entries.filter(([, enabled]) => !enabled).map(([source]) => source),
    failing: [],
  };
}

function summarizePolicy(
  cfg: SageOsConfig | undefined,
  fallbackMode: SageOsStatusSnapshot["mode"],
): SageOsStatusSnapshot["policy"] {
  const mode = normalizeSageOsMode(cfg?.mode ?? fallbackMode);
  return {
    mode,
    defaultTier: normalizeSageOsMode(cfg?.policy?.defaultTier ?? mode),
    approvalsRequired: [
      cfg?.policy?.requireApprovalForDestructive === false ? undefined : "destructive",
      cfg?.policy?.requireApprovalForExternalWrites === false ? undefined : "external_writes",
      cfg?.policy?.requireApprovalForProduction === false ? undefined : "production",
      cfg?.policy?.requireApprovalForCredentials === false ? undefined : "credentials",
      cfg?.policy?.requireApprovalForPolicyChanges === false ? undefined : "policy_changes",
      cfg?.policy?.requireApprovalForPrivateDataExport === false
        ? undefined
        : "private_data_export",
    ].filter((value): value is string => Boolean(value)),
  };
}

function summarizeCoding(cfg: SageOsConfig | undefined): SageOsStatusSnapshot["coding"] {
  const restrictions = [
    cfg?.coding?.allowDependencyChanges ? undefined : "dependency_changes_require_approval",
    cfg?.coding?.allowRelease ? undefined : "release_requires_approval",
    cfg?.coding?.allowDeploy ? undefined : "deploy_requires_approval",
  ].filter((value): value is string => Boolean(value));
  return {
    enabled: cfg?.coding?.enabled === true,
    allowedRepos: cfg?.coding?.allowedRepos ?? [],
    restrictions,
  };
}

function summarizeNotifications(
  cfg: SageOsConfig | undefined,
  incidents: SageOsIncident[],
): SageOsStatusSnapshot["notifications"] {
  const target = cfg?.notifications?.telegram?.target?.trim();
  return {
    telegram: {
      enabled: cfg?.notifications?.telegram?.enabled === true,
      ...(target ? { target } : {}),
    },
    urgentPending: incidents.filter(
      (incident) => incident.severity === "error" || incident.severity === "critical",
    ).length,
  };
}

async function countEventLogLines(logPath: string): Promise<number> {
  try {
    const raw = await readFile(logPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return 0;
    }
    throw err;
  }
}
