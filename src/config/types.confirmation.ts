/**
 * Confirmation dialog types for sensitive operations.
 *
 * Each operation type has a specialized confirmation request that carries
 * the context needed to display an informative dialog to the user.
 */

import type { DangerCategory, GuardrailActionBehavior } from "./types.guardrails.js";

// ---------------------------------------------------------------------------
// Operation-specific confirmation context
// ---------------------------------------------------------------------------

export type FileDestructionContext = {
  kind: "file_destruction";
  /** Files/directories that will be deleted. */
  paths: string[];
  /** Whether the deletion is recursive. */
  recursive: boolean;
  /** Estimated total size in bytes (if known). */
  totalBytes?: number;
  /** Whether any files are outside the project directory. */
  outsideProject?: boolean;
};

export type NetworkRequestContext = {
  kind: "network_exposure";
  /** URL being accessed. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Whether data is being sent (POST/PUT body). */
  sendsData: boolean;
  /** Summary of data being sent (if applicable, truncated). */
  dataSummary?: string;
  /** Whether the request is to an external host. */
  external: boolean;
};

export type ShellCommandContext = {
  kind: "shell_command";
  /** The full command string. */
  command: string;
  /** Working directory. */
  cwd?: string;
  /** Resolved executable path. */
  resolvedPath?: string;
  /** Whether the command includes pipes. */
  hasPipes: boolean;
  /** Whether the command includes chained operators (&&, ||, ;). */
  hasChains: boolean;
};

export type BrowserAutomationContext = {
  kind: "browser_automation";
  /** Target URL. */
  url: string;
  /** Action being performed. */
  action: string;
  /** Whether the action interacts with form inputs. */
  interactsWithForms: boolean;
  /** Whether the action triggers navigation. */
  triggersNavigation: boolean;
};

export type PaymentContext = {
  kind: "payment";
  /** Amount in currency units. */
  amount: number;
  /** Currency code (e.g., "USD"). */
  currency: string;
  /** Merchant/service name. */
  merchant: string;
  /** Description of what is being purchased. */
  description: string;
};

export type GenericOperationContext = {
  kind: "generic";
  /** Category of the operation. */
  category: DangerCategory;
  /** Human-readable description. */
  description: string;
};

/** Union of all operation-specific context types. */
export type ConfirmationContext =
  | FileDestructionContext
  | NetworkRequestContext
  | ShellCommandContext
  | BrowserAutomationContext
  | PaymentContext
  | GenericOperationContext;

// ---------------------------------------------------------------------------
// Confirmation request (sent to the UI)
// ---------------------------------------------------------------------------

export type ConfirmationRequest = {
  /** Unique request ID. */
  id: string;
  /** The raw operation string. */
  operation: string;
  /** Guardrail behavior for this operation. */
  behavior: GuardrailActionBehavior;
  /** Operation-specific context for display. */
  context: ConfirmationContext;
  /** Danger category. */
  category: DangerCategory;
  /** Severity (1-5). */
  severity: number;
  /** Current trust score for this category. */
  trustScore: number;
  /** Approvals remaining until auto-promotion (if applicable). */
  approvalsUntilPromotion?: number;
  /** Reason string from the guardrail check. */
  reason: string;
  /** When the request was created (epoch ms). */
  createdAtMs: number;
  /** When the request expires (epoch ms). */
  expiresAtMs: number;
  /** Agent ID that initiated this operation. */
  agentId?: string;
};

// ---------------------------------------------------------------------------
// Confirmation response (from the UI)
// ---------------------------------------------------------------------------

export type ConfirmationDecision = "allow-once" | "allow-always" | "deny" | "deny-always";

export type ConfirmationResponse = {
  /** Request ID being responded to. */
  requestId: string;
  /** User's decision. */
  decision: ConfirmationDecision;
  /** Whether the user chose "remember this choice". */
  remember: boolean;
  /** Timestamp of the decision. */
  decidedAtMs: number;
};

// ---------------------------------------------------------------------------
// Remembered choices (persisted to trust profile)
// ---------------------------------------------------------------------------

export type RememberedChoice = {
  /** Normalized operation pattern. */
  pattern: string;
  /** What the user decided. */
  decision: ConfirmationDecision;
  /** Danger category. */
  category: DangerCategory;
  /** When this was remembered. */
  rememberedAt: string;
  /** How many times this pattern was auto-applied. */
  appliedCount: number;
};
