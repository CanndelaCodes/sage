/**
 * Confirmation dialog engine.
 *
 * Bridges the guardrail permission system with user-facing confirmation dialogs.
 * Creates typed confirmation requests, manages remembered choices,
 * and handles timeout-based auto-resolution.
 */

import crypto from "node:crypto";
import type {
  ConfirmationContext,
  ConfirmationDecision,
  ConfirmationRequest,
  ConfirmationResponse,
  RememberedChoice,
} from "../config/types.confirmation.js";
import type {
  DangerCategory,
  GuardrailActionBehavior,
  GuardrailConfig,
  PermissionCheckResult,
  TrustProfile,
} from "../config/types.guardrails.js";
import { checkPermission, classifyCommand, normalizeToPattern } from "./guardrails.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;
const PAYMENT_TIMEOUT_MS = 60_000;
const WARN_AUTO_APPROVE_DEFAULT_MS = 3_000;
const MAX_REMEMBERED_CHOICES = 200;

// ---------------------------------------------------------------------------
// Confirmation request creation
// ---------------------------------------------------------------------------

/** Create a confirmation request from a guardrail check result and operation context. */
export function createConfirmationRequest(
  operation: string,
  context: ConfirmationContext,
  checkResult: PermissionCheckResult,
  category: DangerCategory,
  severity: number,
  config?: GuardrailConfig,
  agentId?: string,
): ConfirmationRequest {
  const now = Date.now();
  const timeoutMs = resolveTimeout(context, checkResult.behavior, config);

  return {
    id: crypto.randomUUID(),
    operation,
    behavior: checkResult.behavior,
    context,
    category,
    severity,
    trustScore: checkResult.trustScore,
    approvalsUntilPromotion: checkResult.approvalsUntilPromotion,
    reason: checkResult.reason,
    createdAtMs: now,
    expiresAtMs: now + timeoutMs,
    agentId,
  };
}

/** Resolve the timeout for a confirmation request based on context and behavior. */
function resolveTimeout(
  context: ConfirmationContext,
  behavior: GuardrailActionBehavior,
  config?: GuardrailConfig,
): number {
  // Payment confirmations always get the longest timeout
  if (context.kind === "payment") {
    return PAYMENT_TIMEOUT_MS;
  }

  // Warn behavior uses the configured auto-approve timeout
  if (behavior === "warn") {
    const seconds = config?.warnAutoApproveSeconds ?? 3;
    return seconds > 0 ? seconds * 1000 : WARN_AUTO_APPROVE_DEFAULT_MS;
  }

  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Full confirmation flow
// ---------------------------------------------------------------------------

export type ConfirmationCheckResult = {
  /** Whether the operation needs user confirmation. */
  needsConfirmation: boolean;
  /** If blocked, the operation cannot proceed at all. */
  blocked: boolean;
  /** If auto-allowed, the operation proceeds without confirmation. */
  autoAllowed: boolean;
  /** The confirmation request to show to the user (if needsConfirmation). */
  request?: ConfirmationRequest;
  /** The guardrail check result. */
  checkResult: PermissionCheckResult;
  /** If a remembered choice was applied. */
  rememberedChoice?: RememberedChoice;
};

/**
 * Run the full confirmation check for an operation.
 *
 * This is the main entry point for determining whether an operation needs
 * user confirmation. It:
 * 1. Runs the guardrail permission check
 * 2. Checks for remembered choices
 * 3. Creates a confirmation request if needed
 */
export function checkConfirmation(
  operation: string,
  context: ConfirmationContext,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  agentId?: string,
): ConfirmationCheckResult {
  // Classify the command if context is shell_command
  const classification =
    context.kind === "shell_command"
      ? classifyCommand(operation)
      : { category: mapContextToCategory(context), severity: contextSeverity(context) };

  const checkResult = checkPermission(
    {
      operation,
      category: classification.category,
      severity: classification.severity,
      agentId,
    },
    config,
    profile,
  );

  // Hard-blocked: cannot proceed
  if (checkResult.hardBlocked) {
    return {
      needsConfirmation: false,
      blocked: true,
      autoAllowed: false,
      checkResult,
    };
  }

  // Autonomous: no confirmation needed
  if (checkResult.behavior === "autonomous") {
    return {
      needsConfirmation: false,
      blocked: false,
      autoAllowed: true,
      checkResult,
    };
  }

  // Payment operations always require confirmation, regardless of remembered choices
  if (context.kind === "payment") {
    const request = createConfirmationRequest(
      operation,
      context,
      checkResult,
      classification.category,
      classification.severity,
      config,
      agentId,
    );
    return {
      needsConfirmation: true,
      blocked: false,
      autoAllowed: false,
      request,
      checkResult,
    };
  }

  // Check remembered choices
  const normalized = normalizeToPattern(operation);
  const remembered = rememberedChoices.find(
    (c) => c.pattern === normalized && c.category === classification.category,
  );

  if (remembered) {
    if (remembered.decision === "allow-always") {
      return {
        needsConfirmation: false,
        blocked: false,
        autoAllowed: true,
        checkResult,
        rememberedChoice: remembered,
      };
    }
    if (remembered.decision === "deny-always") {
      return {
        needsConfirmation: false,
        blocked: true,
        autoAllowed: false,
        checkResult,
        rememberedChoice: remembered,
      };
    }
  }

  // Blocked by guardrails (non-hard-block): still needs confirmation for the block message
  if (checkResult.behavior === "block") {
    return {
      needsConfirmation: false,
      blocked: true,
      autoAllowed: false,
      checkResult,
    };
  }

  // Needs confirmation (confirm_detailed, confirm_brief, or warn)
  const request = createConfirmationRequest(
    operation,
    context,
    checkResult,
    classification.category,
    classification.severity,
    config,
    agentId,
  );

  return {
    needsConfirmation: true,
    blocked: false,
    autoAllowed: false,
    request,
    checkResult,
  };
}

// ---------------------------------------------------------------------------
// Context classification helpers
// ---------------------------------------------------------------------------

function mapContextToCategory(context: ConfirmationContext): DangerCategory {
  switch (context.kind) {
    case "file_destruction":
      return "file_destruction";
    case "network_exposure":
      return context.sendsData ? "data_exfiltration" : "network_exposure";
    case "shell_command":
      return "system_modification";
    case "browser_automation":
      return "network_exposure";
    case "payment":
      return "credential_access";
    case "generic":
      return context.category;
  }
}

function contextSeverity(context: ConfirmationContext): number {
  switch (context.kind) {
    case "file_destruction":
      return context.recursive ? 4 : 2;
    case "network_exposure":
      return context.sendsData ? 3 : 2;
    case "shell_command":
      return context.hasPipes || context.hasChains ? 3 : 2;
    case "browser_automation":
      return context.interactsWithForms ? 3 : 2;
    case "payment":
      return 5;
    case "generic":
      return 3;
  }
}

// ---------------------------------------------------------------------------
// Remembered choices management
// ---------------------------------------------------------------------------

/** Process a confirmation response and optionally create a remembered choice. */
export function processConfirmationResponse(
  response: ConfirmationResponse,
  request: ConfirmationRequest,
  existingChoices: RememberedChoice[],
): RememberedChoice[] {
  if (!response.remember) {
    return existingChoices;
  }

  const normalized = normalizeToPattern(request.operation);
  const existing = existingChoices.findIndex(
    (c) => c.pattern === normalized && c.category === request.category,
  );

  const newChoice: RememberedChoice = {
    pattern: normalized,
    decision: response.decision,
    category: request.category,
    rememberedAt: new Date().toISOString(),
    appliedCount: 0,
  };

  const choices = [...existingChoices];
  if (existing >= 0) {
    choices[existing] = newChoice;
  } else {
    choices.push(newChoice);
  }

  // Trim to max
  if (choices.length > MAX_REMEMBERED_CHOICES) {
    return choices.slice(-MAX_REMEMBERED_CHOICES);
  }

  return choices;
}

/** Remove a remembered choice for a specific pattern and category. */
export function removeRememberedChoice(
  choices: RememberedChoice[],
  pattern: string,
  category: DangerCategory,
): RememberedChoice[] {
  return choices.filter((c) => !(c.pattern === pattern && c.category === category));
}

/** Clear all remembered choices. */
export function clearRememberedChoices(): RememberedChoice[] {
  return [];
}

/** Increment the applied count for a remembered choice. */
export function markRememberedChoiceApplied(
  choices: RememberedChoice[],
  pattern: string,
  category: DangerCategory,
): RememberedChoice[] {
  return choices.map((c) => {
    if (c.pattern === pattern && c.category === category) {
      return { ...c, appliedCount: c.appliedCount + 1 };
    }
    return c;
  });
}

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

/** Check if a confirmation request has expired. */
export function isExpired(request: ConfirmationRequest): boolean {
  return Date.now() >= request.expiresAtMs;
}

/**
 * Resolve an expired confirmation request.
 * - "warn" behavior: auto-approves (allow-once)
 * - All others: auto-denies
 */
export function resolveExpired(request: ConfirmationRequest): ConfirmationDecision {
  if (request.behavior === "warn") {
    return "allow-once";
  }
  return "deny";
}

// ---------------------------------------------------------------------------
// Convenience: shell command confirmation
// ---------------------------------------------------------------------------

/** Create a confirmation check for a shell command. */
export function checkShellCommandConfirmation(
  command: string,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  cwd?: string,
  agentId?: string,
): ConfirmationCheckResult {
  const context: ConfirmationContext = {
    kind: "shell_command",
    command,
    cwd,
    hasPipes: /\|(?!\|)/.test(command),
    hasChains: /&&|\|\||;/.test(command),
  };
  return checkConfirmation(command, context, config, profile, rememberedChoices, agentId);
}

/** Create a confirmation check for a file deletion. */
export function checkFileDeleteConfirmation(
  paths: string[],
  recursive: boolean,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  agentId?: string,
): ConfirmationCheckResult {
  const operation = recursive
    ? `rm -rf ${paths.join(" ")}`
    : `rm ${paths.join(" ")}`;
  const context: ConfirmationContext = {
    kind: "file_destruction",
    paths,
    recursive,
  };
  return checkConfirmation(operation, context, config, profile, rememberedChoices, agentId);
}

/** Create a confirmation check for a network request. */
export function checkNetworkConfirmation(
  url: string,
  method: string,
  sendsData: boolean,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  agentId?: string,
): ConfirmationCheckResult {
  const operation = `${method} ${url}`;
  const context: ConfirmationContext = {
    kind: "network_exposure",
    url,
    method,
    sendsData,
    external: !isLocalUrl(url),
  };
  return checkConfirmation(operation, context, config, profile, rememberedChoices, agentId);
}

/** Create a confirmation check for a browser automation action. */
export function checkBrowserConfirmation(
  url: string,
  action: string,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  agentId?: string,
): ConfirmationCheckResult {
  const operation = `browser: ${action} on ${url}`;
  const context: ConfirmationContext = {
    kind: "browser_automation",
    url,
    action,
    interactsWithForms: /fill|type|submit|click.*button/i.test(action),
    triggersNavigation: /navigate|goto|click.*link/i.test(action),
  };
  return checkConfirmation(operation, context, config, profile, rememberedChoices, agentId);
}

/** Create a confirmation check for a payment. Always requires confirmation. */
export function checkPaymentConfirmation(
  amount: number,
  currency: string,
  merchant: string,
  description: string,
  config: GuardrailConfig | undefined,
  profile: TrustProfile,
  rememberedChoices: RememberedChoice[],
  agentId?: string,
): ConfirmationCheckResult {
  const operation = `payment: ${currency} ${amount} to ${merchant}`;
  const context: ConfirmationContext = {
    kind: "payment",
    amount,
    currency,
    merchant,
    description,
  };
  return checkConfirmation(operation, context, config, profile, rememberedChoices, agentId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host === "0.0.0.0"
    );
  } catch {
    return false;
  }
}
