/**
 * Sage Guardrail/Permission types.
 *
 * Provides user-configurable autonomy presets that wrap the underlying
 * exec-approval, tool-policy, and elevated-exec systems into intuitive
 * levels for vibecoders.
 */

// ---------------------------------------------------------------------------
// Danger categories (from Autonomy Evolution spec)
// ---------------------------------------------------------------------------

export type DangerCategory =
  | "file_destruction"
  | "system_modification"
  | "network_exposure"
  | "credential_access"
  | "privilege_escalation"
  | "data_exfiltration"
  | "irreversible_change";

// ---------------------------------------------------------------------------
// Trust score tracking (per-category)
// ---------------------------------------------------------------------------

export type TrustScore = {
  /** 0.0 (no trust) to 1.0 (full trust). */
  score: number;
  /** Total approvals in this category. */
  approvalCount: number;
  /** Total denials in this category. */
  denialCount: number;
  /** Successful executions post-approval. */
  successCount: number;
  /** Failed/reverted executions. */
  failureCount: number;
  /** ISO timestamp of last approval. */
  lastApproval?: string;
  /** ISO timestamp of last denial. */
  lastDenial?: string;
  /** ISO timestamp of last decay application. */
  lastDecay?: string;
};

// ---------------------------------------------------------------------------
// Guardrail presets
// ---------------------------------------------------------------------------

/** User-facing preset names. */
export type GuardrailPreset = "conservative" | "balanced" | "max_autonomy" | "custom";

/** Behavior for a specific action when guardrails evaluate it. */
export type GuardrailActionBehavior =
  | "block"
  | "confirm_detailed"
  | "confirm_brief"
  | "warn"
  | "autonomous";

// ---------------------------------------------------------------------------
// Guardrail configuration (stored in sage.json under "guardrails")
// ---------------------------------------------------------------------------

export type GuardrailCategoryOverride = {
  /** Override behavior for this category. */
  behavior?: GuardrailActionBehavior;
  /** Hard-lock: never allow autonomous for this category regardless of trust. */
  neverAutonomous?: boolean;
};

export type GuardrailConfig = {
  /** Active preset. Default: "balanced". */
  preset?: GuardrailPreset;

  /** Custom category-level overrides (only used when preset="custom"). */
  categories?: Partial<Record<DangerCategory, GuardrailCategoryOverride>>;

  /** Maximum auto-proceed timeout in seconds for "warn" behavior. Default: 3. */
  warnAutoApproveSeconds?: number;

  /** Enable adaptive trust evolution. Default: true. */
  adaptiveTrust?: boolean;

  /** Trust decay config. */
  decay?: {
    /** Days before decay starts. Default: 14. */
    gracePeriodDays?: number;
    /** Daily decay rate (0-1). Default: 0.01. */
    dailyDecayRate?: number;
    /** Minimum score after decay. Default: 0.2. */
    floorScore?: number;
  };

  /** Rate limits for trust evolution. */
  rateLimits?: {
    /** Maximum trust increase per day (0-1). Default: 0.2. */
    maxDailyIncrease?: number;
    /** Minimum seconds between approvals for same pattern. Default: 60. */
    minApprovalIntervalSeconds?: number;
    /** Maximum autonomous operations per hour. Default: 50. */
    maxAutonomousPerHour?: number;
  };

  /** Patterns that are always blocked regardless of trust level. */
  hardBlockPatterns?: string[];

  /** Patterns that have been explicitly trusted by the user. */
  trustedPatterns?: string[];
};

// ---------------------------------------------------------------------------
// Trust profile (runtime state, stored separately from config)
// ---------------------------------------------------------------------------

export type TrustProfile = {
  version: number;
  /** Category-specific trust scores. */
  categoryScores: Record<DangerCategory, TrustScore>;
  /** Operation-specific learned patterns. */
  operationPatterns: OperationPattern[];
  /** Audit log (last N entries). */
  auditLog: TrustAuditEntry[];
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
};

export type OperationPattern = {
  /** Glob-style pattern (e.g. "rm ./node_modules/*"). */
  pattern: string;
  /** Learned trust score for this pattern. */
  trustScore: number;
  /** How many times this pattern was approved. */
  approvalCount: number;
  /** Approvals needed to skip confirmation. */
  promotionThreshold: number;
  /** ISO timestamp of last use. */
  lastUsed?: string;
};

export type TrustAuditEntry = {
  /** ISO timestamp. */
  timestamp: string;
  /** What happened. */
  action: "approval" | "denial" | "auto_run" | "decay" | "reset" | "block";
  /** Danger category involved. */
  category: DangerCategory;
  /** Operation pattern if applicable. */
  pattern?: string;
  /** Score before the change. */
  oldScore: number;
  /** Score after the change. */
  newScore: number;
};

// ---------------------------------------------------------------------------
// Permission check request/result
// ---------------------------------------------------------------------------

export type PermissionCheckRequest = {
  /** The operation being attempted. */
  operation: string;
  /** Danger category classification. */
  category: DangerCategory;
  /** Severity of the operation (1-5, higher = more dangerous). */
  severity: number;
  /** Agent ID requesting the operation. */
  agentId?: string;
  /** Human-readable description of what will happen. */
  description?: string;
  /** Resources that will be affected (file paths, URLs, etc.). */
  affectedResources?: string[];
};

export type PermissionCheckResult = {
  /** Whether the operation is allowed to proceed. */
  allowed: boolean;
  /** What behavior should be shown to the user. */
  behavior: GuardrailActionBehavior;
  /** Current trust score for this category. */
  trustScore: number;
  /** Why this decision was made. */
  reason: string;
  /** Whether this matched a hard-block pattern. */
  hardBlocked: boolean;
  /** Whether this matched a trusted pattern. */
  trustedPattern: boolean;
  /** How many more approvals until this pattern auto-promotes. */
  approvalsUntilPromotion?: number;
};
