export const SAGEOS_AUTONOMY_MODES = [
  "off",
  "observe",
  "suggest",
  "prepare",
  "execute_scoped",
  "execute_delegated",
  "full_operator",
] as const;

export type SageOsAutonomyMode = (typeof SAGEOS_AUTONOMY_MODES)[number];

export type SageOsAutonomyTier = {
  tier: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  mode: SageOsAutonomyMode;
  label: string;
};

export const SAGEOS_AUTONOMY_TIERS: SageOsAutonomyTier[] = [
  { tier: 0, mode: "off", label: "Off" },
  { tier: 1, mode: "observe", label: "Observe" },
  { tier: 2, mode: "suggest", label: "Suggest" },
  { tier: 3, mode: "prepare", label: "Prepare" },
  { tier: 4, mode: "execute_scoped", label: "Execute scoped" },
  { tier: 5, mode: "execute_delegated", label: "Execute delegated" },
  { tier: 6, mode: "full_operator", label: "Full operator" },
];

export const DEFAULT_SAGEOS_MODE: SageOsAutonomyMode = "execute_scoped";

export function normalizeSageOsMode(value: unknown): SageOsAutonomyMode {
  return typeof value === "string" && SAGEOS_AUTONOMY_MODES.includes(value as SageOsAutonomyMode)
    ? (value as SageOsAutonomyMode)
    : DEFAULT_SAGEOS_MODE;
}

export type SageOsSensitivity = "public" | "normal" | "private" | "secret";

export const SAGEOS_TASK_STATES = [
  "proposed",
  "queued",
  "planning",
  "waiting_for_policy",
  "blocked",
  "running",
  "verifying",
  "completed",
  "failed",
  "cancelled",
  "paused",
  "expired",
] as const;

export type SageOsTaskState = (typeof SAGEOS_TASK_STATES)[number];

export const SAGEOS_OVERLAY_OPEN_MODES = ["full", "hud"] as const;
export type SageOsOverlayOpenMode = (typeof SAGEOS_OVERLAY_OPEN_MODES)[number];

export const SAGEOS_OVERLAY_EDGES = ["left", "right", "top", "bottom"] as const;
export type SageOsOverlayEdge = (typeof SAGEOS_OVERLAY_EDGES)[number];

export const SAGEOS_OVERLAY_WIDGET_IDS = [
  "activeOperations",
  "approvals",
  "incidents",
  "memoryQueue",
  "nightShift",
  "systemHealth",
  "appPreview",
] as const;
export type SageOsOverlayWidgetId = (typeof SAGEOS_OVERLAY_WIDGET_IDS)[number];

export type SageOsOverlayConfig = {
  enabled?: boolean;
  hotkey?: string;
  openMode?: SageOsOverlayOpenMode;
  hudExpandsToFull?: boolean;
  passThroughDefault?: boolean;
  collapsedEdge?: SageOsOverlayEdge;
  activeMonitor?: string;
  showApprovalBadge?: boolean;
  showIncidentBadge?: boolean;
  pinnedWidgets?: SageOsOverlayWidgetId[];
  voice?: {
    enabled?: boolean;
    mode?: "pushToTalk";
  };
};

export type SageOsSupervisorState =
  | "disabled"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "degraded";

export type SageOsSupervisorStatus = {
  enabled: boolean;
  paused: boolean;
  state: SageOsSupervisorState;
  startedAt?: string;
  stoppedAt?: string;
  lastTickAt?: string;
  nextTickAt?: string;
  lastError?: string;
};

export type SageOsSummary = {
  total: number;
  active: number;
  queued: number;
  blocked: number;
};

export type SageOsRunSummary = {
  total: number;
  active: number;
  queued: number;
  failed: number;
};

export type SageOsCollaborationSummary = {
  total: number;
  open: number;
  handoffs: number;
  reviewRequests: number;
  incidentEscalations: number;
  sharedArtifacts: number;
};

export type SageOsQueueSummary = {
  total: number;
  pending: number;
  failed: number;
  path?: string;
};

export type SageOsMemoryDoctorSummary = {
  ok: boolean;
  checkedAt: string;
  checks: number;
  warnings: number;
  failures: number;
  exportedFiles: string[];
  namespace?: string;
  diagnosticNamespace?: string;
  marker?: string;
  nodeId?: string;
  sessionNodePath?: string;
};

export type SageOsHealthState = "ok" | "degraded" | "disabled" | "unknown";

export type SageOsMemoryTelegramIngestionSummary = {
  status: SageOsHealthState;
  recent: number;
  failed: number;
  lastIngestedAt?: string;
  source?: string;
  path?: string;
};

export type SageOsMemoryWikiExportSummary = {
  status: SageOsHealthState;
  exportedFiles: number;
  latestPath?: string;
  checkedAt?: string;
  proof?: string;
};

export type SageOsRecentMemorySummary = {
  total: number;
  latestAt?: string;
  refs?: string[];
};

export type SageOsMemoryReviewCardSummary = {
  total: number;
  pending: number;
  stale?: number;
  path?: string;
};

export type SageOsMemoryDuplicateStaleSummary = {
  duplicates: number;
  stale: number;
  latestRef?: string;
};

export type SageOsMemoryGraphSummary = {
  status: SageOsHealthState;
  nodes?: number;
  edges?: number;
  orphaned?: number;
  lastCheckedAt?: string;
};

export type SageOsIncidentRepairAction = {
  id: string;
  label: string;
  command?: string;
  gatewayMethod?: string;
  risk: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean;
};

export type SageOsIncident = {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  title: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  autoRepairSafe: boolean;
  repairAction?: SageOsIncidentRepairAction;
};

export type SageOsStatusSnapshot = {
  generatedAt: string;
  mode: SageOsAutonomyMode;
  supervisor: SageOsSupervisorStatus;
  employees: SageOsSummary;
  tasks: SageOsSummary;
  runs: SageOsRunSummary;
  workflows: SageOsSummary;
  skills: SageOsSummary;
  apps: SageOsSummary;
  collaboration: SageOsCollaborationSummary;
  approvals: { pending: number };
  observations: { total: number; recent: number; redacted: number; failed: number };
  memory: {
    status: SageOsHealthState;
    backend: "sage-memory" | "qmd" | "builtin" | "unknown";
    canonical: "sage-memory" | "builtin" | "unknown";
    captureQueue: SageOsQueueSummary;
    doctor?: SageOsMemoryDoctorSummary;
    telegramIngestion?: SageOsMemoryTelegramIngestionSummary;
    wikiExport?: SageOsMemoryWikiExportSummary;
    recentCaptures?: SageOsRecentMemorySummary;
    reviewCards?: SageOsMemoryReviewCardSummary;
    duplicateStaleCandidates?: SageOsMemoryDuplicateStaleSummary;
    graph?: SageOsMemoryGraphSummary;
  };
  learning: {
    status: SageOsHealthState;
    activityQueue: SageOsQueueSummary;
  };
  sources: {
    enabled: string[];
    disabled: string[];
    failing: string[];
  };
  policy: {
    mode: SageOsAutonomyMode;
    defaultTier: SageOsAutonomyMode;
    approvalsRequired: string[];
  };
  coding: {
    enabled: boolean;
    allowedRepos: string[];
    restrictions: string[];
    reports: SageOsSummary;
    lastReportId?: string;
  };
  notifications: {
    telegram: {
      enabled: boolean;
      target?: string;
      digestSchedule?: string;
      urgentOnlyDuringFocus?: boolean;
      batchWindowMinutes?: number;
      quietHours?: {
        start: string;
        end: string;
        timezone?: string;
      };
    };
    urgentPending: number;
    recent?: {
      sent: number;
      failed: number;
      skipped: number;
      lastAt?: string;
      lastOutcome?: "sent" | "failed" | "skipped";
      lastSummary?: string;
    };
    batch?: {
      path: string;
      pending: number;
      total: number;
      firstQueuedAt?: string;
      dueAt?: string;
    };
    digest?: {
      path: string;
      schedule: string;
      lastScheduledFor?: string;
      nextDueAt?: string;
      error?: string;
    };
  };
  incidents: SageOsIncident[];
  audit: { recentEvents: number; eventLogPath?: string };
};

const emptySummary = (): SageOsSummary => ({ total: 0, active: 0, queued: 0, blocked: 0 });
const emptyRunSummary = (): SageOsRunSummary => ({ total: 0, active: 0, queued: 0, failed: 0 });
const emptyCollaborationSummary = (): SageOsCollaborationSummary => ({
  total: 0,
  open: 0,
  handoffs: 0,
  reviewRequests: 0,
  incidentEscalations: 0,
  sharedArtifacts: 0,
});
const emptyQueueSummary = (): SageOsQueueSummary => ({ total: 0, pending: 0, failed: 0 });

export function createSageOsStatusSnapshot(
  overrides: Partial<SageOsStatusSnapshot> = {},
): SageOsStatusSnapshot {
  const mode = normalizeSageOsMode(overrides.mode);
  return {
    generatedAt: new Date().toISOString(),
    mode,
    supervisor: {
      enabled: false,
      paused: false,
      state: "stopped",
      ...overrides.supervisor,
    },
    employees: overrides.employees ?? emptySummary(),
    tasks: overrides.tasks ?? emptySummary(),
    runs: overrides.runs ?? emptyRunSummary(),
    workflows: overrides.workflows ?? emptySummary(),
    skills: overrides.skills ?? emptySummary(),
    apps: overrides.apps ?? emptySummary(),
    collaboration: overrides.collaboration ?? emptyCollaborationSummary(),
    approvals: overrides.approvals ?? { pending: 0 },
    observations: overrides.observations ?? { total: 0, recent: 0, redacted: 0, failed: 0 },
    memory: overrides.memory ?? {
      status: "unknown",
      backend: "unknown",
      canonical: "unknown",
      captureQueue: emptyQueueSummary(),
    },
    learning: overrides.learning ?? {
      status: "unknown",
      activityQueue: emptyQueueSummary(),
    },
    sources: overrides.sources ?? { enabled: [], disabled: [], failing: [] },
    policy: overrides.policy ?? {
      mode,
      defaultTier: mode,
      approvalsRequired: [
        "destructive",
        "external_writes",
        "production",
        "credentials",
        "policy_changes",
        "private_data_export",
      ],
    },
    coding: overrides.coding ?? {
      enabled: false,
      allowedRepos: [],
      restrictions: [],
      reports: emptySummary(),
    },
    notifications: overrides.notifications ?? {
      telegram: { enabled: false },
      urgentPending: 0,
      recent: { sent: 0, failed: 0, skipped: 0 },
    },
    incidents: overrides.incidents ?? [],
    audit: overrides.audit ?? { recentEvents: 0 },
  };
}

export type SageOsPolicyScope = {
  kind: "tool" | "file" | "repo" | "app" | "channel" | "memory" | "network" | "system";
  allow?: string[];
  deny?: string[];
  risk?: "low" | "medium" | "high" | "critical";
};

export type SageOsAgentSpec = {
  id: string;
  name: string;
  role: string;
  mission: string;
  description?: string;
  status: "draft" | "active" | "paused" | "disabled" | "retired";
  autonomyTier: SageOsAutonomyMode;
  responsibilities: string[];
  allowedScopes: SageOsPolicyScope[];
  deniedScopes: SageOsPolicyScope[];
  tools?: string[];
  memoryScopes?: string[];
  schedules?: string[];
  risks?: string[];
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SageOsTaskSpec = {
  id: string;
  title: string;
  objective: string;
  state: SageOsTaskState;
  ownerAgentId?: string;
  requestedBy: string;
  autonomyTier: SageOsAutonomyMode;
  policyScopes: SageOsPolicyScope[];
  evidenceRefs?: string[];
  riskClass?: "low" | "medium" | "high" | "critical";
  toolProfile?: string;
  budget?: SageOsTaskBudget;
  expectedOutput?: string;
  verificationPlan?: string[];
  execution?: SageOsTaskExecutionPlan;
  rollback?: string;
  notificationPolicy?: SageOsTaskNotificationPolicy;
  sensitivity?: SageOsSensitivity;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type SageOsTaskBudget = {
  maxMinutes?: number;
  maxToolCalls?: number;
  maxCostUsd?: number;
};

export type SageOsTaskNotificationPolicy = {
  channels: string[];
  notifyOn: Array<"queued" | "started" | "completed" | "failed" | "blocked">;
};

export type SageOsTaskExecutionPlan = {
  kind: "coding";
  append?: {
    relativePath: string;
    text: string;
  };
  testCommand?: string;
};

export type SageOsRunVerificationResult = {
  outcome: "passed" | "failed" | "skipped";
  summary: string;
  refs?: string[];
};

export type SageOsRunBudgetUsage = {
  elapsedMinutes?: number;
  toolCalls?: number;
  costUsd?: number;
};

export type SageOsRunTimelineEvent = {
  at: string;
  label: string;
  state?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  ref?: string;
};

export type SageOsRun = {
  id: string;
  taskId: string;
  attempt: number;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  traceId: string;
  workerSessionId?: string;
  currentToolCall?: string;
  budgetUsed?: SageOsRunBudgetUsage;
  timeline?: SageOsRunTimelineEvent[];
  logs?: string[];
  artifacts?: string[];
  verificationResult?: SageOsRunVerificationResult;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

export type SageOsRepoState = {
  branch?: string;
  dirty: boolean;
  changedFiles: string[];
};

export type SageOsCodingDiff = {
  stat: string;
  preview: string;
  changedFiles: string[];
};

export type SageOsCodingTestResult = {
  command: string;
  exitCode: number;
  stdoutPreview: string;
  stderrPreview: string;
};

export type SageOsCodingReportOutcome = "succeeded" | "failed" | "blocked";

export type SageOsCodingReport = {
  id: string;
  taskId: string;
  runId: string;
  repoPath: string;
  objective: string;
  outcome: SageOsCodingReportOutcome;
  startedAt: string;
  finishedAt: string;
  preState: SageOsRepoState;
  postState: SageOsRepoState;
  diff: SageOsCodingDiff;
  tests: SageOsCodingTestResult[];
  blockers: string[];
  verificationRefs: string[];
  rollback: string;
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_WORKFLOW_STATES = [
  "candidate",
  "drafted_spec",
  "implemented_draft",
  "dry_run_passed",
  "enabled",
  "paused",
  "failed",
  "retired",
] as const;

export type SageOsWorkflowState = (typeof SAGEOS_WORKFLOW_STATES)[number];

export type SageOsWorkflow = {
  id: string;
  name: string;
  state: SageOsWorkflowState;
  observedPattern: string;
  sourceObservationIds: string[];
  trigger: string;
  inputs: string[];
  outputs: string[];
  policyScopes: SageOsPolicyScope[];
  implementationRefs: string[];
  evalRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_SKILL_STATES = ["draft", "active", "deprecated", "retired"] as const;

export type SageOsSkillState = (typeof SAGEOS_SKILL_STATES)[number];

export type SageOsSkillRecord = {
  id: string;
  name: string;
  state: SageOsSkillState;
  workflowId?: string;
  provenance: string[];
  triggerConditions: string[];
  tests: string[];
  allowedScopes: SageOsPolicyScope[];
  rollbackRef?: string;
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_APP_CANDIDATE_STATES = [
  "draft",
  "preview_ready",
  "enabled",
  "blocked",
  "retired",
] as const;

export type SageOsAppCandidateState = (typeof SAGEOS_APP_CANDIDATE_STATES)[number];

export type SageOsAppTargetSurface = "widget" | "dashboard" | "tool" | "script" | "canvas";

export type SageOsAppCandidate = {
  id: string;
  name: string;
  state: SageOsAppCandidateState;
  targetSurface: SageOsAppTargetSurface;
  purpose: string;
  sourceObservationIds: string[];
  provenance: string[];
  sensitivity: SageOsSensitivity;
  inputs: string[];
  outputs: string[];
  policyScopes: SageOsPolicyScope[];
  previewCommand?: string;
  artifactRefs: string[];
  rollbackRef?: string;
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_COLLABORATION_KINDS = [
  "handoff",
  "review_request",
  "incident_escalation",
  "shared_artifact",
] as const;

export type SageOsCollaborationKind = (typeof SAGEOS_COLLABORATION_KINDS)[number];

export const SAGEOS_COLLABORATION_STATES = ["open", "acknowledged", "closed"] as const;

export type SageOsCollaborationState = (typeof SAGEOS_COLLABORATION_STATES)[number];

export type SageOsCollaborationEvent = {
  id: string;
  kind: SageOsCollaborationKind;
  fromAgentId: string;
  toAgentId?: string;
  taskId?: string;
  title: string;
  summary: string;
  artifactRefs: string[];
  state: SageOsCollaborationState;
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_APPROVAL_STATES = ["pending", "approved", "denied", "expired"] as const;

export type SageOsApprovalState = (typeof SAGEOS_APPROVAL_STATES)[number];

export const SAGEOS_APPROVAL_RISK_CLASSES = [
  "destructive",
  "security_remediation",
  "windows_setting",
  "external_write",
  "production",
  "credentials",
  "policy_change",
  "private_data_export",
] as const;

export type SageOsApprovalRiskClass = (typeof SAGEOS_APPROVAL_RISK_CLASSES)[number];

export type SageOsApprovalScope = "one_time" | "task" | "workflow" | "employee" | "domain";

export type SageOsApproval = {
  id: string;
  state: SageOsApprovalState;
  riskClass: SageOsApprovalRiskClass;
  title: string;
  proposedAction: string;
  evidence: string[];
  preview?: string;
  rollbackPlan?: string;
  scope: SageOsApprovalScope;
  taskId?: string;
  runId?: string;
  employeeId?: string;
  workflowId?: string;
  domain?: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export const SAGEOS_OBSERVATION_SOURCES = [
  "sage_session",
  "browser",
  "app_focus",
  "tool_usage",
  "queue",
  "coding_workspace",
  "system",
] as const;

export type SageOsObservationSource = (typeof SAGEOS_OBSERVATION_SOURCES)[number];

export const SAGEOS_OBSERVATION_STATES = ["captured", "redacted", "skipped", "failed"] as const;

export type SageOsObservationState = (typeof SAGEOS_OBSERVATION_STATES)[number];

export type SageOsObservation = {
  id: string;
  source: SageOsObservationSource;
  state: SageOsObservationState;
  title: string;
  text: string;
  sensitivity: SageOsSensitivity;
  observedAt: string;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  reason?: string;
  eventId?: string;
  learningEventId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SageOsConfig = {
  enabled?: boolean;
  mode?: SageOsAutonomyMode;
  supervisor?: {
    intervalSeconds?: number;
    maxConcurrentTasks?: number;
    idleAfterSeconds?: number;
    nightShiftEnabled?: boolean;
    nightShiftWindow?: string;
  };
  commandCenter?: { enabled?: boolean };
  overlay?: SageOsOverlayConfig;
  sources?: Partial<Record<string, boolean>>;
  privacy?: {
    localOnlyDefault?: boolean;
    storeRawScreenshots?: boolean;
    storeRawAudio?: boolean;
    telegramPrivateContent?: boolean;
    secretRedaction?: boolean;
    denyApps?: string[];
    denyWindowTitlePatterns?: string[];
    denyFilePatterns?: string[];
    denySystemChecks?: string[];
    observationRetentionDays?: number;
  };
  policy?: {
    defaultTier?: SageOsAutonomyMode;
    requireApprovalForDestructive?: boolean;
    requireApprovalForExternalWrites?: boolean;
    requireApprovalForProduction?: boolean;
    requireApprovalForCredentials?: boolean;
    requireApprovalForPolicyChanges?: boolean;
    requireApprovalForPrivateDataExport?: boolean;
  };
  memory?: {
    autoCapture?: boolean;
    replayQueues?: boolean;
    consolidate?: boolean;
    exportWiki?: boolean;
  };
  coding?: {
    enabled?: boolean;
    allowedRepos?: string[];
    requireCleanGit?: boolean;
    allowDependencyChanges?: boolean;
    allowRelease?: boolean;
    allowDeploy?: boolean;
  };
  notifications?: {
    telegram?: {
      enabled?: boolean;
      target?: string;
      digestSchedule?: string;
      urgentOnlyDuringFocus?: boolean;
      batchWindowMinutes?: number;
      quietHours?: {
        start: string;
        end: string;
        timezone?: string;
      };
    };
  };
};
