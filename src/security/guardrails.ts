/**
 * Guardrail permission check middleware.
 *
 * Evaluates whether an operation should be allowed, confirmed, warned about,
 * or blocked based on the active guardrail preset, category trust scores,
 * and learned operation patterns.
 */

import {
  allDangerCategories,
  mostRestrictiveBehavior,
  resolvePresetConfig,
  scoreToActionBehavior,
} from "../config/guardrail-presets.js";
import type {
  DangerCategory,
  GuardrailActionBehavior,
  GuardrailConfig,
  OperationPattern,
  PermissionCheckRequest,
  PermissionCheckResult,
  TrustAuditEntry,
  TrustProfile,
  TrustScore,
} from "../config/types.guardrails.js";

// ---------------------------------------------------------------------------
// Hard-blocked patterns (never autonomous regardless of trust)
// ---------------------------------------------------------------------------

const BUILTIN_HARD_BLOCKS: RegExp[] = [
  /rm\s+-rf\s+\/[^.]/,         // rm -rf on root paths
  /sudo\s+rm/,                  // sudo rm anything
  /chmod\s+777/,                // world-writable permissions
  /curl.*\|\s*bash/,            // pipe to bash
  /wget.*\|\s*sh/,              // pipe to sh
  /eval\(/,                     // eval in code
  /DROP\s+DATABASE/i,           // database drops
  /DELETE\s+FROM.*WHERE\s*1/i,  // delete all rows
  /:()\{.*\|.*&\}.*;:/,         // fork bomb
  /dd\s+if=\/dev\/(zero|random)/, // disk wipe
  /mkfs/,                       // format filesystem
];

// ---------------------------------------------------------------------------
// Default config values
// ---------------------------------------------------------------------------

const DEFAULT_GUARDRAIL_CONFIG: Required<
  Pick<GuardrailConfig, "preset" | "warnAutoApproveSeconds" | "adaptiveTrust">
> = {
  preset: "balanced",
  warnAutoApproveSeconds: 3,
  adaptiveTrust: true,
};

const DEFAULT_DECAY = {
  gracePeriodDays: 14,
  dailyDecayRate: 0.01,
  floorScore: 0.2,
};

const DEFAULT_RATE_LIMITS = {
  maxDailyIncrease: 0.2,
  minApprovalIntervalSeconds: 60,
  maxAutonomousPerHour: 50,
};

const MAX_AUDIT_LOG_ENTRIES = 500;
const DEFAULT_PROMOTION_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Trust profile factory
// ---------------------------------------------------------------------------

function defaultTrustScore(): TrustScore {
  return {
    score: 0.5,
    approvalCount: 0,
    denialCount: 0,
    successCount: 0,
    failureCount: 0,
  };
}

/** Create a fresh trust profile with all categories at neutral (0.5). */
export function createTrustProfile(): TrustProfile {
  const scores: Record<string, TrustScore> = {};
  for (const cat of allDangerCategories()) {
    scores[cat] = defaultTrustScore();
  }
  const now = new Date().toISOString();
  return {
    version: 1,
    categoryScores: scores as Record<DangerCategory, TrustScore>,
    operationPatterns: [],
    auditLog: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Operation pattern matching
// ---------------------------------------------------------------------------

/** Normalize a command into a matchable pattern. */
export function normalizeToPattern(command: string): string {
  return command
    .trim()
    .replace(/\s+/g, " ")
    // Replace absolute paths with wildcards
    .replace(/\/[\w./-]+/g, (m) => {
      const parts = m.split("/").filter(Boolean);
      if (parts.length <= 1) { return m; }
      return "/" + parts.slice(0, -1).join("/") + "/*";
    })
    // Replace quoted strings with *
    .replace(/"[^"]*"/g, '"*"')
    .replace(/'[^']*'/g, "'*'");
}

function findMatchingPattern(
  command: string,
  patterns: OperationPattern[],
): OperationPattern | undefined {
  const normalized = normalizeToPattern(command);
  return patterns.find((p) => p.pattern === normalized);
}

// ---------------------------------------------------------------------------
// Core permission check
// ---------------------------------------------------------------------------

export function checkPermission(
  request: PermissionCheckRequest,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
): PermissionCheckResult {
  const cfg = config ?? {};
  const preset = cfg.preset ?? DEFAULT_GUARDRAIL_CONFIG.preset;
  const adaptiveTrust = cfg.adaptiveTrust ?? DEFAULT_GUARDRAIL_CONFIG.adaptiveTrust;

  // 1. Check hard blocks
  const allHardBlockPatterns = [
    ...BUILTIN_HARD_BLOCKS,
    ...(cfg.hardBlockPatterns ?? []).map((p) => new RegExp(p)),
  ];
  for (const pattern of allHardBlockPatterns) {
    if (pattern.test(request.operation)) {
      return {
        allowed: false,
        behavior: "block",
        trustScore: 0,
        reason: `Hard-blocked: operation matches safety pattern "${pattern.source}"`,
        hardBlocked: true,
        trustedPattern: false,
      };
    }
  }

  // 2. Check user-trusted patterns
  const trustedPatterns = cfg.trustedPatterns ?? [];
  const normalizedOp = normalizeToPattern(request.operation);
  if (trustedPatterns.includes(normalizedOp)) {
    return {
      allowed: true,
      behavior: "autonomous",
      trustScore: 1.0,
      reason: "User-trusted pattern",
      hardBlocked: false,
      trustedPattern: true,
    };
  }

  // 3. Get preset ceiling for this category
  const presetConfig = resolvePresetConfig(preset);
  let ceiling: GuardrailActionBehavior = presetConfig[request.category];

  // 4. Apply custom overrides if preset is "custom"
  if (preset === "custom" && cfg.categories?.[request.category]) {
    const override = cfg.categories[request.category];
    if (override?.behavior) {
      ceiling = override.behavior;
    }
    if (override?.neverAutonomous && ceiling === "autonomous") {
      ceiling = "warn";
    }
  }

  // 5. Get trust-based behavior (if adaptive trust is on)
  const categoryScore = profile.categoryScores[request.category] ?? defaultTrustScore();
  let scoreBehavior: GuardrailActionBehavior;

  if (adaptiveTrust) {
    // Check for pattern-specific trust
    const matchedPattern = findMatchingPattern(request.operation, profile.operationPatterns);
    if (matchedPattern && matchedPattern.approvalCount >= matchedPattern.promotionThreshold) {
      scoreBehavior = "autonomous";
    } else {
      scoreBehavior = scoreToActionBehavior(categoryScore.score);
    }

    const approvalsUntilPromotion = matchedPattern
      ? Math.max(0, matchedPattern.promotionThreshold - matchedPattern.approvalCount)
      : DEFAULT_PROMOTION_THRESHOLD;

    // Use the more restrictive of score-based and preset ceiling
    const effectiveBehavior = mostRestrictiveBehavior(scoreBehavior, ceiling);

    return {
      allowed: effectiveBehavior !== "block",
      behavior: effectiveBehavior,
      trustScore: categoryScore.score,
      reason: `Preset "${preset}" ceiling: ${ceiling}, trust score: ${categoryScore.score.toFixed(2)} -> ${scoreBehavior}`,
      hardBlocked: false,
      trustedPattern: false,
      approvalsUntilPromotion,
    };
  }

  // Adaptive trust disabled: use preset ceiling directly
  return {
    allowed: ceiling !== "block",
    behavior: ceiling,
    trustScore: categoryScore.score,
    reason: `Preset "${preset}" -> ${ceiling} (adaptive trust disabled)`,
    hardBlocked: false,
    trustedPattern: false,
  };
}

// ---------------------------------------------------------------------------
// Trust evolution
// ---------------------------------------------------------------------------

export type TrustFeedback = {
  category: DangerCategory;
  operation: string;
  approved: boolean;
  executionSuccess: boolean;
  userModified: boolean;
  severity: number;
};

/** Update trust scores after a user approval/denial. */
export function applyTrustFeedback(
  profile: TrustProfile,
  feedback: TrustFeedback,
  config: GuardrailConfig | undefined,
): TrustProfile {
  const updated = { ...profile, updatedAt: new Date().toISOString() };
  const scores = { ...updated.categoryScores };
  const currentScore = { ...(scores[feedback.category] ?? defaultTrustScore()) };
  const oldScoreValue = currentScore.score;

  if (feedback.approved) {
    currentScore.approvalCount += 1;
    currentScore.lastApproval = new Date().toISOString();

    if (feedback.executionSuccess) {
      currentScore.successCount += 1;
      // Trust increase with diminishing returns
      const baseRate = 0.05 * (6 - feedback.severity);
      const diminishing = 1 - currentScore.score;
      const modPenalty = feedback.userModified ? 0.5 : 1.0;
      const increase = baseRate * diminishing * modPenalty;
      const maxDaily = config?.rateLimits?.maxDailyIncrease ?? DEFAULT_RATE_LIMITS.maxDailyIncrease;
      currentScore.score = Math.min(1.0, currentScore.score + Math.min(increase, maxDaily));
    } else {
      currentScore.failureCount += 1;
      // Approved but failed: decrease trust
      const decrease = 0.05 * (1 + feedback.severity / 10);
      currentScore.score = Math.max(0, currentScore.score - decrease);
    }
  } else {
    // Denied
    currentScore.denialCount += 1;
    currentScore.lastDenial = new Date().toISOString();
    const decrease = 0.15 * (1 + feedback.severity / 10);
    currentScore.score = Math.max(0, currentScore.score - decrease);
  }

  scores[feedback.category] = currentScore;
  updated.categoryScores = scores;

  // Update operation pattern learning
  const patterns = [...updated.operationPatterns];
  const normalized = normalizeToPattern(feedback.operation);
  let patternEntry = patterns.find((p) => p.pattern === normalized);

  if (!patternEntry) {
    patternEntry = {
      pattern: normalized,
      trustScore: 0.5,
      approvalCount: 0,
      promotionThreshold: DEFAULT_PROMOTION_THRESHOLD,
      lastUsed: new Date().toISOString(),
    };
    patterns.push(patternEntry);
  }

  if (feedback.approved && feedback.executionSuccess) {
    patternEntry.approvalCount += 1;
    patternEntry.lastUsed = new Date().toISOString();
    if (patternEntry.approvalCount >= patternEntry.promotionThreshold) {
      patternEntry.trustScore = 0.9;
    }
  } else if (!feedback.approved) {
    patternEntry.approvalCount = Math.max(0, patternEntry.approvalCount - 3);
    patternEntry.trustScore = Math.max(0.2, patternEntry.trustScore - 0.2);
  }

  updated.operationPatterns = patterns;

  // Add audit log entry
  const auditEntry: TrustAuditEntry = {
    timestamp: new Date().toISOString(),
    action: feedback.approved ? "approval" : "denial",
    category: feedback.category,
    pattern: normalized,
    oldScore: oldScoreValue,
    newScore: currentScore.score,
  };
  updated.auditLog = [...updated.auditLog.slice(-(MAX_AUDIT_LOG_ENTRIES - 1)), auditEntry];

  return updated;
}

// ---------------------------------------------------------------------------
// Trust decay
// ---------------------------------------------------------------------------

/** Apply time-based trust decay to all categories. */
export function applyTrustDecay(
  profile: TrustProfile,
  config: GuardrailConfig | undefined,
): TrustProfile {
  const decay = {
    ...DEFAULT_DECAY,
    ...config?.decay,
  };

  const now = Date.now();
  const updated = { ...profile, updatedAt: new Date().toISOString() };
  const scores = { ...updated.categoryScores };

  for (const cat of allDangerCategories()) {
    const current = { ...(scores[cat] ?? defaultTrustScore()) };
    const lastUsed = current.lastApproval ? new Date(current.lastApproval).getTime() : 0;
    if (lastUsed === 0) { continue; }

    const daysSinceUse = (now - lastUsed) / (1000 * 60 * 60 * 24);
    if (daysSinceUse <= decay.gracePeriodDays) { continue; }

    const decayDays = daysSinceUse - decay.gracePeriodDays;
    const decayAmount = decayDays * decay.dailyDecayRate;
    const newScore = Math.max(decay.floorScore, current.score - decayAmount);

    if (newScore < current.score) {
      const auditEntry: TrustAuditEntry = {
        timestamp: new Date().toISOString(),
        action: "decay",
        category: cat,
        oldScore: current.score,
        newScore,
      };
      updated.auditLog = [...updated.auditLog.slice(-(MAX_AUDIT_LOG_ENTRIES - 1)), auditEntry];
      current.score = newScore;
      current.lastDecay = new Date().toISOString();
    }

    scores[cat] = current;
  }

  updated.categoryScores = scores;
  return updated;
}

// ---------------------------------------------------------------------------
// Category classification helpers
// ---------------------------------------------------------------------------

/** Classify a shell command into a danger category and severity. */
export function classifyCommand(command: string): {
  category: DangerCategory;
  severity: number;
} {
  const cmd = command.trim().toLowerCase();

  // File destruction
  if (/\brm\b/.test(cmd) || /\bdel\b/.test(cmd) || /\bunlink\b/.test(cmd)) {
    const isRecursive = /\s-r\b|\s-rf\b|\s--recursive\b/.test(cmd);
    return { category: "file_destruction", severity: isRecursive ? 4 : 2 };
  }

  // System modification
  if (/\bchmod\b|\bchown\b|\bchgrp\b/.test(cmd) ||
      /\bsystemctl\b|\bservice\b/.test(cmd) ||
      /\breg\s+(add|delete)\b/.test(cmd)) {
    return { category: "system_modification", severity: 3 };
  }

  // Network exposure
  if (/\bcurl\b|\bwget\b|\bfetch\b/.test(cmd) && /\bhttp/.test(cmd)) {
    return { category: "network_exposure", severity: 2 };
  }
  if (/\bngrok\b|\btailscale\s+funnel\b/.test(cmd)) {
    return { category: "network_exposure", severity: 4 };
  }

  // Credential access
  if (/\benv\b.*\b(key|token|secret|password)\b/i.test(cmd) ||
      /\b(keychain|credential|vault)\b/i.test(cmd)) {
    return { category: "credential_access", severity: 4 };
  }

  // Privilege escalation
  if (/\bsudo\b|\brunas\b|\bdoas\b/.test(cmd)) {
    return { category: "privilege_escalation", severity: 5 };
  }

  // Data exfiltration
  if (/\bcurl\b.*\b-d\b|\bcurl\b.*\b--data\b/.test(cmd) ||
      /\bscp\b|\brsync\b.*\b:\b/.test(cmd)) {
    return { category: "data_exfiltration", severity: 3 };
  }

  // Irreversible changes
  if (/\bgit\s+push\b.*\s--force\b/.test(cmd) ||
      /\bgit\s+reset\s+--hard\b/.test(cmd) ||
      /\bdrop\s+(table|database)\b/i.test(cmd)) {
    return { category: "irreversible_change", severity: 4 };
  }

  // Default: system modification with low severity
  return { category: "system_modification", severity: 1 };
}

// ---------------------------------------------------------------------------
// Profile reset
// ---------------------------------------------------------------------------

/** Reset trust for a specific category. */
export function resetCategoryTrust(
  profile: TrustProfile,
  category: DangerCategory,
): TrustProfile {
  const updated = { ...profile, updatedAt: new Date().toISOString() };
  const scores = { ...updated.categoryScores };
  const old = scores[category];

  const auditEntry: TrustAuditEntry = {
    timestamp: new Date().toISOString(),
    action: "reset",
    category,
    oldScore: old?.score ?? 0.5,
    newScore: 0.5,
  };

  scores[category] = defaultTrustScore();
  updated.categoryScores = scores;
  updated.auditLog = [...updated.auditLog.slice(-(MAX_AUDIT_LOG_ENTRIES - 1)), auditEntry];
  return updated;
}

/** Reset all trust to defaults. */
export function resetAllTrust(profile: TrustProfile): TrustProfile {
  const fresh = createTrustProfile();
  fresh.auditLog = [
    ...profile.auditLog.slice(-(MAX_AUDIT_LOG_ENTRIES - 1)),
    {
      timestamp: new Date().toISOString(),
      action: "reset" as const,
      category: "system_modification" as DangerCategory,
      oldScore: 0,
      newScore: 0.5,
    },
  ];
  return fresh;
}

// ---------------------------------------------------------------------------
// Confirmation request (serializable data contract for Electron IPC)
// ---------------------------------------------------------------------------

/**
 * Serializable confirmation request sent to the Sage VDE Electron shell
 * when the guardrails system determines an operation needs user approval.
 *
 * This is the data contract for Phase 2 gRPC integration.
 */
export type ConfirmationRequest = {
  /** Unique identifier for this confirmation request. */
  id: string;
  /** The operation being attempted (command, tool call, etc.). */
  operation: string;
  /** Danger category classification. */
  category: DangerCategory;
  /** Severity of the operation (1-5). */
  severity: number;
  /** Guardrail behavior that triggered this confirmation. */
  behavior: GuardrailActionBehavior;
  /** Human-readable reason for requiring confirmation. */
  reason: string;
  /** Current trust score for this category (0.0-1.0). */
  trustScore: number;
  /** How many more approvals until this pattern auto-promotes (if applicable). */
  approvalsUntilPromotion?: number;
  /** Human-readable description of what will happen. */
  description?: string;
  /** Resources that will be affected. */
  affectedResources?: string[];
};

let confirmationCounter = 0;

/**
 * Build a confirmation request from a permission check request and result.
 *
 * Returns `null` for behaviors that don't need user interaction:
 * - `autonomous`: already allowed, no confirmation needed
 * - `block`: hard-blocked, no confirmation can override
 */
export function buildConfirmationRequest(
  request: PermissionCheckRequest,
  result: PermissionCheckResult,
): ConfirmationRequest | null {
  if (result.behavior === "autonomous" || result.behavior === "block") {
    return null;
  }

  confirmationCounter += 1;
  return {
    id: `confirm-${Date.now()}-${confirmationCounter}`,
    operation: request.operation,
    category: request.category,
    severity: request.severity,
    behavior: result.behavior,
    reason: result.reason,
    trustScore: result.trustScore,
    approvalsUntilPromotion: result.approvalsUntilPromotion,
    description: request.description,
    affectedResources: request.affectedResources,
  };
}
