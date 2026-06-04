/**
 * Confirmation dialog overlay for sensitive operations.
 *
 * Renders context-appropriate dialogs based on the operation type
 * (file deletion, network request, shell command, browser automation, payment).
 * Follows the same overlay pattern as exec-approval.ts.
 */

import { html, nothing } from "lit";
import type {
  ConfirmationContext,
  ConfirmationDecision,
  ConfirmationRequest,
} from "../../../../src/config/types.confirmation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfirmationQueueEntry = {
  request: ConfirmationRequest;
};

export type ConfirmationDialogState = {
  queue: ConfirmationQueueEntry[];
  busy: boolean;
  error: string | null;
  /** Whether the user checked "remember this choice". */
  remember: boolean;
};

export function defaultConfirmationDialogState(): ConfirmationDialogState {
  return {
    queue: [],
    busy: false,
    error: null,
    remember: false,
  };
}

export type ConfirmationDialogProps = {
  state: ConfirmationDialogState;
  onDecision: (requestId: string, decision: ConfirmationDecision, remember: boolean) => void;
  onRememberToggle: (remember: boolean) => void;
};

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

// ---------------------------------------------------------------------------
// Severity / category display
// ---------------------------------------------------------------------------

function severityLabel(severity: number): string {
  if (severity <= 1) {
    return "Low";
  }
  if (severity <= 2) {
    return "Medium";
  }
  if (severity <= 3) {
    return "High";
  }
  if (severity <= 4) {
    return "Very High";
  }
  return "Critical";
}

function severityClass(severity: number): string {
  if (severity <= 2) {
    return "severity-low";
  }
  if (severity <= 3) {
    return "severity-medium";
  }
  if (severity <= 4) {
    return "severity-high";
  }
  return "severity-critical";
}

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Context-specific detail rendering
// ---------------------------------------------------------------------------

function renderContextDetails(context: ConfirmationContext) {
  switch (context.kind) {
    case "shell_command":
      return html`
        <div class="confirm-detail-section">
          <div class="confirm-command mono">${context.command}</div>
          ${context.cwd ? html`<div class="confirm-meta-row"><span>Working directory</span><span class="mono">${context.cwd}</span></div>` : nothing}
          ${
            context.hasPipes
              ? html`
                  <div class="confirm-flag warn">Contains pipe operators</div>
                `
              : nothing
          }
          ${
            context.hasChains
              ? html`
                  <div class="confirm-flag warn">Contains chained commands</div>
                `
              : nothing
          }
        </div>
      `;

    case "file_destruction":
      return html`
        <div class="confirm-detail-section">
          <div class="confirm-file-list">
            ${context.paths.map((p) => html`<div class="confirm-file-path mono">${p}</div>`)}
          </div>
          ${
            context.recursive
              ? html`
                  <div class="confirm-flag danger">Recursive deletion</div>
                `
              : nothing
          }
          ${
            context.outsideProject
              ? html`
                  <div class="confirm-flag danger">Files outside project directory</div>
                `
              : nothing
          }
          ${context.totalBytes != null ? html`<div class="confirm-meta-row"><span>Estimated size</span><span>${formatBytes(context.totalBytes)}</span></div>` : nothing}
        </div>
      `;

    case "network_exposure":
      return html`
        <div class="confirm-detail-section">
          <div class="confirm-meta-row"><span>URL</span><span class="mono">${context.url}</span></div>
          <div class="confirm-meta-row"><span>Method</span><span class="mono">${context.method}</span></div>
          ${
            context.external
              ? html`
                  <div class="confirm-flag warn">External request</div>
                `
              : nothing
          }
          ${
            context.sendsData
              ? html`
                  <div class="confirm-flag warn">Sends data</div>
                `
              : nothing
          }
          ${context.dataSummary ? html`<div class="confirm-data-preview"><span>Data preview</span><pre class="mono">${context.dataSummary}</pre></div>` : nothing}
        </div>
      `;

    case "browser_automation":
      return html`
        <div class="confirm-detail-section">
          <div class="confirm-meta-row"><span>URL</span><span class="mono">${context.url}</span></div>
          <div class="confirm-meta-row"><span>Action</span><span>${context.action}</span></div>
          ${
            context.interactsWithForms
              ? html`
                  <div class="confirm-flag warn">Interacts with forms</div>
                `
              : nothing
          }
          ${
            context.triggersNavigation
              ? html`
                  <div class="confirm-flag warn">Triggers navigation</div>
                `
              : nothing
          }
        </div>
      `;

    case "payment":
      return html`
        <div class="confirm-detail-section confirm-payment">
          <div class="confirm-payment-amount">${context.currency} ${context.amount.toFixed(2)}</div>
          <div class="confirm-meta-row"><span>Merchant</span><span>${context.merchant}</span></div>
          <div class="confirm-meta-row"><span>Description</span><span>${context.description}</span></div>
          <div class="confirm-flag danger">Financial transaction - cannot be auto-approved</div>
        </div>
      `;

    case "generic":
      return html`
        <div class="confirm-detail-section">
          <div class="confirm-meta-row"><span>Category</span><span>${categoryLabel(context.category)}</span></div>
          <div class="confirm-meta-row"><span>Description</span><span>${context.description}</span></div>
        </div>
      `;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function contextTitle(context: ConfirmationContext): string {
  switch (context.kind) {
    case "shell_command":
      return "Shell Command";
    case "file_destruction":
      return "File Deletion";
    case "network_exposure":
      return "Network Request";
    case "browser_automation":
      return "Browser Automation";
    case "payment":
      return "Payment Authorization";
    case "generic":
      return "Sensitive Operation";
  }
}

function contextIcon(context: ConfirmationContext): string {
  switch (context.kind) {
    case "shell_command":
      return ">";
    case "file_destruction":
      return "X";
    case "network_exposure":
      return "@";
    case "browser_automation":
      return "#";
    case "payment":
      return "$";
    case "generic":
      return "!";
  }
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderConfirmationDialog(props: ConfirmationDialogProps) {
  const active = props.state.queue[0];
  if (!active) {
    return nothing;
  }

  const request = active.request;
  const remainingMs = request.expiresAtMs - Date.now();
  const remaining = remainingMs > 0 ? `expires in ${formatRemaining(remainingMs)}` : "expired";
  const queueCount = props.state.queue.length;
  const isPayment = request.context.kind === "payment";

  return html`
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="confirm-card confirm-card--${request.context.kind}">
        <div class="confirm-header">
          <div class="confirm-header-left">
            <span class="confirm-icon confirm-icon--${request.context.kind}">${contextIcon(request.context)}</span>
            <div>
              <div class="confirm-title">${contextTitle(request.context)} Confirmation</div>
              <div class="confirm-sub">${remaining}</div>
            </div>
          </div>
          <div class="confirm-header-right">
            <span class="confirm-severity ${severityClass(request.severity)}">${severityLabel(request.severity)}</span>
            ${queueCount > 1 ? html`<span class="confirm-queue-badge">${queueCount} pending</span>` : nothing}
          </div>
        </div>

        <div class="confirm-category">
          <span>${categoryLabel(request.category)}</span>
        </div>

        ${renderContextDetails(request.context)}

        ${request.reason ? html`<div class="confirm-reason">${request.reason}</div>` : nothing}

        ${props.state.error ? html`<div class="confirm-error">${props.state.error}</div>` : nothing}

        ${
          !isPayment
            ? html`
                <label class="confirm-remember">
                  <input
                    type="checkbox"
                    .checked=${props.state.remember}
                    @change=${(e: Event) => props.onRememberToggle((e.target as HTMLInputElement).checked)}
                  />
                  <span>Remember this choice</span>
                </label>
              `
            : nothing
        }

        <div class="confirm-actions">
          <button
            class="btn primary"
            ?disabled=${props.state.busy}
            @click=${() =>
              props.onDecision(
                request.id,
                props.state.remember ? "allow-always" : "allow-once",
                props.state.remember,
              )}
          >
            ${props.state.remember ? "Always allow" : "Allow once"}
          </button>
          <button
            class="btn danger"
            ?disabled=${props.state.busy}
            @click=${() =>
              props.onDecision(
                request.id,
                props.state.remember ? "deny-always" : "deny",
                props.state.remember,
              )}
          >
            ${props.state.remember ? "Always deny" : "Deny"}
          </button>
        </div>

        ${
          request.approvalsUntilPromotion != null
            ? html`<div class="confirm-trust-hint">${request.approvalsUntilPromotion} more approval${request.approvalsUntilPromotion === 1 ? "" : "s"} until this action is auto-approved</div>`
            : nothing
        }
      </div>
    </div>
  `;
}
