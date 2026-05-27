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

export type SageOsQueueSummary = {
  total: number;
  pending: number;
  failed: number;
  path?: string;
};

export type SageOsHealthState = "ok" | "degraded" | "disabled" | "unknown";

export type SageOsIncident = {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  title: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  autoRepairSafe: boolean;
};

export type SageOsStatusSnapshot = {
  generatedAt: string;
  mode: SageOsAutonomyMode;
  supervisor: SageOsSupervisorStatus;
  employees: SageOsSummary;
  tasks: SageOsSummary;
  runs: SageOsRunSummary;
  approvals: { pending: number };
  memory: {
    status: SageOsHealthState;
    backend: "sage-memory" | "qmd" | "builtin" | "unknown";
    canonical: "sage-memory" | "builtin" | "unknown";
    captureQueue: SageOsQueueSummary;
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
  };
  notifications: {
    telegram: {
      enabled: boolean;
      target?: string;
    };
    urgentPending: number;
  };
  incidents: SageOsIncident[];
  audit: { recentEvents: number; eventLogPath?: string };
};

const emptySummary = (): SageOsSummary => ({ total: 0, active: 0, queued: 0, blocked: 0 });
const emptyRunSummary = (): SageOsRunSummary => ({ total: 0, active: 0, queued: 0, failed: 0 });
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
    approvals: overrides.approvals ?? { pending: 0 },
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
    coding: overrides.coding ?? { enabled: false, allowedRepos: [], restrictions: [] },
    notifications: overrides.notifications ?? {
      telegram: { enabled: false },
      urgentPending: 0,
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
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type SageOsRun = {
  id: string;
  taskId: string;
  attempt: number;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  traceId: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
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
    };
  };
};
