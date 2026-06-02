import { Cron } from "croner";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  listLearningEventQueue,
  resolveLearningEventQueuePath,
} from "../learning/activity-queue.js";
import {
  listSageMemoryCaptureQueue,
  resolveSageMemoryCaptureQueuePath,
} from "../memory/sage-memory-capture-queue.js";
import { describeSageOsBudgetViolations } from "./budget.js";
import {
  createSageOsEventLog,
  readSageOsEvents,
  resolveSageOsStateDir,
  type SageOsEvent,
} from "./event-log.js";
import { createSageOsStateStore, readSageOsState } from "./state-store.js";
import {
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
  type SageOsConfig,
  type SageOsAgentSpec,
  type SageOsAppCandidate,
  type SageOsCodingReport,
  type SageOsCollaborationEvent,
  type SageOsIncident,
  type SageOsMemoryDoctorSummary,
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
  now?: () => Date;
};

type NotificationBatchState = NonNullable<SageOsStatusSnapshot["notifications"]["batch"]>;
type NotificationDigestState = NonNullable<SageOsStatusSnapshot["notifications"]["digest"]>;

export async function collectSageOsStatus(
  opts: CollectSageOsStatusOptions = {},
): Promise<SageOsStatusSnapshot> {
  const agentId = opts.agentId ?? "main";
  const collectedAt = opts.now?.() ?? new Date();
  const store = createSageOsStateStore({ stateDir: opts.stateDir });
  const state = await readSageOsState(store);
  const eventLog = createSageOsEventLog({ stateDir: opts.stateDir });
  const [memoryQueue, learningQueue, recentEvents, events, notificationBatch, digest] =
    await Promise.all([
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
      readSageOsEvents(eventLog, { limit: 100 }),
      summarizeNotificationBatch(opts),
      summarizeDigestSchedule(opts, collectedAt),
    ]);
  const memoryCaptureQueue = queueSummary(memoryQueue);
  const learningActivityQueue = queueSummary(learningQueue);
  const memoryDoctor = state.status.memory.doctor;
  const pendingApprovals = state.approvals.filter((approval) => approval.state === "pending");
  const policyBlockedTasks = state.tasks.filter((task) => task.state === "waiting_for_policy");
  const incidents = [
    ...state.status.incidents.filter((incident) => !isGeneratedIncidentId(incident.id)),
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
    ...sourceFailureIncidents({
      now: state.status.generatedAt,
      observations: state.observations,
    }),
    ...notificationFailureIncidents({
      events,
    }),
    ...workerFailureIncidents({
      runs: state.runs,
    }),
    ...budgetIncidents({
      tasks: state.tasks,
      runs: state.runs,
    }),
  ];

  const snapshot = createSageOsStatusSnapshot({
    ...state.status,
    generatedAt: collectedAt.toISOString(),
    employees: summarizeAgents(state.agents),
    tasks: summarizeTasks(state.tasks),
    runs: summarizeRuns(state.runs),
    workflows: summarizeWorkflows(state.workflows),
    skills: summarizeSkills(state.skills),
    apps: summarizeApps(state.apps),
    collaboration: summarizeCollaborations(state.collaborations),
    approvals: {
      pending: pendingApprovals.length,
    },
    observations: summarizeObservations(state.observations, collectedAt.getTime()),
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
    sources: summarizeSources(opts.cfg, state.observations),
    policy: summarizePolicy(opts.cfg, state.status.mode),
    coding: summarizeCoding(opts.cfg, state.codingReports),
    notifications: summarizeNotifications(opts.cfg, incidents, events, notificationBatch, digest),
    incidents,
    audit: {
      ...state.status.audit,
      recentEvents,
      eventLogPath: eventLog.path,
    },
  });
  return memoryDoctor ? applySageOsMemoryDoctorSummary(snapshot, memoryDoctor) : snapshot;
}

const GENERATED_INCIDENT_IDS = new Set([
  "incident_memory_queue_failed",
  "incident_learning_queue_failed",
  "incident_policy_blocked",
  "incident_source_failed",
  "incident_memory_doctor_failed",
  "incident_notification_failed",
  "incident_worker_failed",
  "incident_budget_exhausted",
]);

function isGeneratedIncidentId(id: string): boolean {
  return GENERATED_INCIDENT_IDS.has(id);
}

export function applySageOsMemoryDoctorSummary(
  snapshot: SageOsStatusSnapshot,
  doctor: SageOsMemoryDoctorSummary,
): SageOsStatusSnapshot {
  return createSageOsStatusSnapshot({
    ...snapshot,
    memory: {
      ...snapshot.memory,
      status: snapshot.memory.status === "degraded" || !doctor.ok ? "degraded" : "ok",
      doctor,
    },
    incidents: [
      ...snapshot.incidents.filter((incident) => incident.id !== "incident_memory_doctor_failed"),
      ...memoryDoctorIncidents({ now: snapshot.generatedAt, doctor }),
    ],
  });
}

function summarizeObservations(
  observations: SageOsObservation[],
  now: number,
): SageOsStatusSnapshot["observations"] {
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

function summarizeCollaborations(
  collaborations: SageOsCollaborationEvent[],
): SageOsStatusSnapshot["collaboration"] {
  return {
    total: collaborations.length,
    open: collaborations.filter((collaboration) => collaboration.state === "open").length,
    handoffs: collaborations.filter((collaboration) => collaboration.kind === "handoff").length,
    reviewRequests: collaborations.filter(
      (collaboration) => collaboration.kind === "review_request",
    ).length,
    incidentEscalations: collaborations.filter(
      (collaboration) => collaboration.kind === "incident_escalation",
    ).length,
    sharedArtifacts: collaborations.filter(
      (collaboration) => collaboration.kind === "shared_artifact",
    ).length,
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

function memoryDoctorIncidents(params: {
  now: string;
  doctor?: SageOsMemoryDoctorSummary;
}): SageOsIncident[] {
  if (!params.doctor || params.doctor.ok) {
    return [];
  }
  return [
    {
      id: "incident_memory_doctor_failed",
      severity: params.doctor.failures > 0 ? "error" : "warning",
      category: "memory",
      title: "Sage Memory doctor reported failures",
      summary: `Sage Memory doctor reported ${params.doctor.failures} failure(s), ${params.doctor.warnings} warning(s), and ${params.doctor.exportedFiles.length} wiki export file(s).`,
      firstSeenAt: params.doctor.checkedAt,
      lastSeenAt: params.now,
      autoRepairSafe: true,
      repairAction: {
        id: "repair_memory_doctor",
        label: "Run memory doctor",
        command: "sage os memory doctor --json",
        gatewayMethod: "sageos.memory.doctor",
        risk: "low",
        approvalRequired: false,
      },
    },
  ];
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

function sourceFailureIncidents(params: {
  now: string;
  observations: SageOsObservation[];
}): SageOsIncident[] {
  const failedSources = activeFailedObservationSources(params.observations);
  if (failedSources.length === 0) {
    return [];
  }
  return [
    {
      id: "incident_source_failed",
      severity: "warning",
      category: "observations",
      title: "SageOS observation source failed",
      summary: `SageOS observation source failure(s): ${failedSources.join(", ")}.`,
      firstSeenAt: params.now,
      lastSeenAt: params.now,
      autoRepairSafe: true,
      repairAction: {
        id: "repair_observation_sources",
        label: "Review SageOS observations",
        command: "sage os observations --json",
        gatewayMethod: "sageos.observations.list",
        risk: "low",
        approvalRequired: false,
      },
    },
  ];
}

function notificationFailureIncidents(params: { events: SageOsEvent[] }): SageOsIncident[] {
  const lastNotificationEvent = params.events
    .filter((event) =>
      ["notification_sent", "notification_failed", "notification_skipped"].includes(event.type),
    )
    .at(-1);
  if (lastNotificationEvent?.type !== "notification_failed") {
    return [];
  }
  return [
    {
      id: "incident_notification_failed",
      severity: "warning",
      category: "notifications",
      title: "SageOS notification delivery failed",
      summary: `The latest SageOS notification attempt failed: ${lastNotificationEvent.summary}`,
      firstSeenAt: lastNotificationEvent.ts,
      lastSeenAt: lastNotificationEvent.ts,
      autoRepairSafe: true,
      repairAction: {
        id: "repair_notification_preview",
        label: "Preview Telegram digest",
        command: "sage os notifications digest --json",
        gatewayMethod: "sageos.notifications.digest",
        risk: "low",
        approvalRequired: false,
      },
    },
  ];
}

function workerFailureIncidents(params: { runs: SageOsRun[] }): SageOsIncident[] {
  const failedRuns = params.runs.filter(
    (run) => run.state === "failed" || run.state === "timed_out",
  );
  const latest = failedRuns.toSorted((a, b) => runSortTime(b) - runSortTime(a))[0];
  if (!latest) {
    return [];
  }
  const first = failedRuns.toSorted((a, b) => runSortTime(a) - runSortTime(b))[0] ?? latest;
  const timedOut = failedRuns.filter((run) => run.state === "timed_out").length;
  const failed = failedRuns.length - timedOut;
  const summary = [
    `${failedRuns.length} SageOS worker run${failedRuns.length === 1 ? "" : "s"} failed or timed out (${failed} failed / ${timedOut} timed out).`,
    `Latest: ${latest.id} for task ${latest.taskId}.`,
    latest.error ? `Error: ${latest.error}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
  return [
    {
      id: "incident_worker_failed",
      severity: "error",
      category: "worker",
      title: "SageOS worker run failed",
      summary,
      firstSeenAt: first.finishedAt ?? first.startedAt ?? new Date(0).toISOString(),
      lastSeenAt: latest.finishedAt ?? latest.startedAt ?? new Date(0).toISOString(),
      autoRepairSafe: true,
      repairAction: {
        id: "repair_worker_runs_review",
        label: "Inspect failed runs",
        command: "sage os status --json",
        gatewayMethod: "sageos.runs.list",
        risk: "low",
        approvalRequired: false,
      },
    },
  ];
}

function budgetIncidents(params: { tasks: SageOsTaskSpec[]; runs: SageOsRun[] }): SageOsIncident[] {
  const tasksById = new Map(params.tasks.map((task) => [task.id, task]));
  const exhausted = params.runs
    .map((run) => {
      const task = tasksById.get(run.taskId);
      const violations = describeSageOsBudgetViolations(task?.budget, run.budgetUsed);
      return task && violations.length > 0 ? { run, task, violations } : undefined;
    })
    .filter((entry): entry is { run: SageOsRun; task: SageOsTaskSpec; violations: string[] } =>
      Boolean(entry),
    );
  const latest = exhausted.toSorted((a, b) => runSortTime(b.run) - runSortTime(a.run))[0];
  if (!latest) {
    return [];
  }
  const first = exhausted.toSorted((a, b) => runSortTime(a.run) - runSortTime(b.run))[0] ?? latest;
  return [
    {
      id: "incident_budget_exhausted",
      severity: "warning",
      category: "budget",
      title: "SageOS task budget exhausted",
      summary: `${exhausted.length} SageOS run${exhausted.length === 1 ? "" : "s"} exceeded delegated budget. Latest: ${latest.run.id} for task ${latest.task.id} (${latest.violations.join(", ")}).`,
      firstSeenAt: first.run.finishedAt ?? first.run.startedAt ?? new Date(0).toISOString(),
      lastSeenAt: latest.run.finishedAt ?? latest.run.startedAt ?? new Date(0).toISOString(),
      autoRepairSafe: true,
      repairAction: {
        id: "repair_budget_tasks_review",
        label: "Inspect budgeted tasks",
        command: "sage os tasks --json",
        gatewayMethod: "sageos.tasks.list",
        risk: "low",
        approvalRequired: false,
      },
    },
  ];
}

function summarizeSources(
  cfg: SageOsConfig | undefined,
  observations: SageOsObservation[],
): SageOsStatusSnapshot["sources"] {
  const entries = Object.entries(cfg?.sources ?? {});
  const failing = activeFailedObservationSources(observations);
  return {
    enabled: entries.filter(([, enabled]) => enabled).map(([source]) => source),
    disabled: entries.filter(([, enabled]) => !enabled).map(([source]) => source),
    failing,
  };
}

function activeFailedObservationSources(observations: SageOsObservation[]): string[] {
  const latestBySource = new Map<string, SageOsObservation>();
  for (const observation of observations) {
    const existing = latestBySource.get(observation.source);
    if (!existing || observationSortTime(observation) >= observationSortTime(existing)) {
      latestBySource.set(observation.source, observation);
    }
  }
  return [...latestBySource.values()]
    .filter((observation) => observation.state === "failed")
    .map((observation) => observation.source);
}

function observationSortTime(observation: SageOsObservation): number {
  for (const timestamp of [observation.observedAt, observation.updatedAt, observation.createdAt]) {
    const millis = Date.parse(timestamp);
    if (Number.isFinite(millis)) {
      return millis;
    }
  }
  return 0;
}

function runSortTime(run: SageOsRun): number {
  for (const timestamp of [run.finishedAt, run.startedAt]) {
    const millis = Date.parse(timestamp ?? "");
    if (Number.isFinite(millis)) {
      return millis;
    }
  }
  return 0;
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

function summarizeCoding(
  cfg: SageOsConfig | undefined,
  reports: SageOsCodingReport[],
): SageOsStatusSnapshot["coding"] {
  const restrictions = [
    cfg?.coding?.requireCleanGit === false ? undefined : "clean_git_required",
    cfg?.coding?.allowDependencyChanges ? undefined : "dependency_changes_require_approval",
    cfg?.coding?.allowRelease ? undefined : "release_requires_approval",
    cfg?.coding?.allowDeploy ? undefined : "deploy_requires_approval",
  ].filter((value): value is string => Boolean(value));
  const lastReport = reports.toSorted(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )[0];
  return {
    enabled: cfg?.coding?.enabled === true,
    allowedRepos: cfg?.coding?.allowedRepos ?? [],
    restrictions,
    reports: {
      total: reports.length,
      active: reports.filter((report) => report.outcome === "succeeded").length,
      queued: 0,
      blocked: reports.filter((report) => report.outcome === "blocked").length,
    },
    lastReportId: lastReport?.id,
  };
}

function summarizeNotifications(
  cfg: SageOsConfig | undefined,
  incidents: SageOsIncident[],
  events: SageOsEvent[],
  batch: NotificationBatchState | undefined,
  digest: NotificationDigestState | undefined,
): SageOsStatusSnapshot["notifications"] {
  const target = cfg?.notifications?.telegram?.target?.trim();
  const digestSchedule = cfg?.notifications?.telegram?.digestSchedule?.trim();
  const batchWindowMinutes = cfg?.notifications?.telegram?.batchWindowMinutes;
  const quietHours = cfg?.notifications?.telegram?.quietHours;
  const quietStart = quietHours?.start.trim();
  const quietEnd = quietHours?.end.trim();
  const quietTimezone = quietHours?.timezone?.trim();
  const recent = summarizeNotificationEvents(events);
  return {
    telegram: {
      enabled: cfg?.notifications?.telegram?.enabled === true,
      ...(target ? { target } : {}),
      ...(digestSchedule ? { digestSchedule } : {}),
      ...(typeof batchWindowMinutes === "number" &&
      Number.isFinite(batchWindowMinutes) &&
      batchWindowMinutes > 0
        ? { batchWindowMinutes }
        : {}),
      ...(quietStart && quietEnd
        ? {
            quietHours: {
              start: quietStart,
              end: quietEnd,
              ...(quietTimezone ? { timezone: quietTimezone } : {}),
            },
          }
        : {}),
      ...(cfg?.notifications?.telegram?.urgentOnlyDuringFocus === true
        ? { urgentOnlyDuringFocus: true }
        : {}),
    },
    urgentPending: incidents.filter(
      (incident) => incident.severity === "error" || incident.severity === "critical",
    ).length,
    recent,
    ...(batch ? { batch } : {}),
    ...(digest ? { digest } : {}),
  };
}

async function summarizeNotificationBatch(
  opts: CollectSageOsStatusOptions,
): Promise<NotificationBatchState | undefined> {
  const batchWindowMinutes = opts.cfg?.notifications?.telegram?.batchWindowMinutes;
  const configured =
    typeof batchWindowMinutes === "number" &&
    Number.isFinite(batchWindowMinutes) &&
    batchWindowMinutes > 0;
  const batchPath = path.join(resolveSageOsStateDir(opts.stateDir), "notification-batch.json");
  const entries = await readNotificationBatchEntries(batchPath);
  if (!configured && entries.length === 0) {
    return undefined;
  }
  const pendingEntries = entries.filter((entry) => entry.status === "pending");
  const firstQueuedAt = pendingEntries
    .map((entry) => entry.createdAt)
    .filter((createdAt): createdAt is string => typeof createdAt === "string")
    .toSorted((a, b) => Date.parse(a) - Date.parse(b))[0];
  const dueAt =
    firstQueuedAt && configured ? addMinutesIso(firstQueuedAt, batchWindowMinutes) : undefined;
  return {
    path: batchPath,
    total: entries.length,
    pending: pendingEntries.length,
    ...(firstQueuedAt ? { firstQueuedAt } : {}),
    ...(dueAt ? { dueAt } : {}),
  };
}

async function summarizeDigestSchedule(
  opts: CollectSageOsStatusOptions,
  now: Date,
): Promise<NotificationDigestState | undefined> {
  const schedule = opts.cfg?.notifications?.telegram?.digestSchedule?.trim();
  if (!schedule) {
    return undefined;
  }
  const digestPath = path.join(resolveSageOsStateDir(opts.stateDir), "notification-digest.json");
  const state = await readDigestState(digestPath);
  const nextDue = nextDigestDueAt(schedule, now);
  return {
    path: digestPath,
    schedule,
    ...(state.lastScheduledFor ? { lastScheduledFor: state.lastScheduledFor } : {}),
    ...(nextDue.nextDueAt ? { nextDueAt: nextDue.nextDueAt } : {}),
    ...(nextDue.error ? { error: nextDue.error } : {}),
  };
}

async function readNotificationBatchEntries(
  batchPath: string,
): Promise<Array<{ status?: string; createdAt?: string }>> {
  try {
    const raw = await readFile(batchPath, "utf8");
    const parsed = JSON.parse(raw) as { entries?: unknown };
    return Array.isArray(parsed.entries)
      ? parsed.entries.filter((entry): entry is { status?: string; createdAt?: string } =>
          Boolean(entry && typeof entry === "object"),
        )
      : [];
  } catch {
    return [];
  }
}

async function readDigestState(digestPath: string): Promise<{ lastScheduledFor?: string }> {
  try {
    const raw = await readFile(digestPath, "utf8");
    const parsed = JSON.parse(raw) as { lastScheduledFor?: unknown };
    return typeof parsed.lastScheduledFor === "string"
      ? { lastScheduledFor: parsed.lastScheduledFor }
      : {};
  } catch {
    return {};
  }
}

function addMinutesIso(value: string, minutes: number): string | undefined {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + minutes * 60_000).toISOString() : undefined;
}

function nextDigestDueAt(schedule: string, now: Date): { nextDueAt?: string; error?: string } {
  try {
    const next = new Cron(schedule, { catch: false }).nextRun(now);
    return next ? { nextDueAt: next.toISOString() } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function summarizeNotificationEvents(
  events: SageOsEvent[],
): SageOsStatusSnapshot["notifications"]["recent"] {
  const notificationEvents = events.filter((event) =>
    ["notification_sent", "notification_failed", "notification_skipped"].includes(event.type),
  );
  const last = notificationEvents.at(-1);
  const lastOutcome =
    last?.type === "notification_sent"
      ? "sent"
      : last?.type === "notification_failed"
        ? "failed"
        : last?.type === "notification_skipped"
          ? "skipped"
          : undefined;
  return {
    sent: notificationEvents.filter((event) => event.type === "notification_sent").length,
    failed: notificationEvents.filter((event) => event.type === "notification_failed").length,
    skipped: notificationEvents.filter((event) => event.type === "notification_skipped").length,
    ...(last ? { lastAt: last.ts, lastSummary: last.summary } : {}),
    ...(lastOutcome ? { lastOutcome } : {}),
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
