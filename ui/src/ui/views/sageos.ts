import { html, nothing } from "lit";
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import type {
  SageOsApproval,
  SageOsCollaborationEvent,
  SageOsIncident,
  SageOsPolicyScope,
  SageOsTaskSpec,
} from "../../../../src/sageos/types.js";
import type { SageOsApprovalDecision, SageOsControlAction } from "../controllers/sageos.ts";
import { icons } from "../icons.ts";

export type SageOsViewProps = {
  connected: boolean;
  loading: boolean;
  busy: string | null;
  error: string | null;
  state: SageOsPersistedState | null;
  onRefresh: () => void;
  onControl: (action: SageOsControlAction) => void;
  onResolveApproval: (id: string, decision: SageOsApprovalDecision) => void;
  onQueueTask: (id: string) => void;
  onRunNextTask: () => void;
  onCancelTask: (id: string) => void;
  onRunRepair: (id: string) => void;
};

const terminalTaskStates = new Set(["completed", "failed", "cancelled", "expired"]);

export function renderSageOs(props: SageOsViewProps) {
  const state = props.state;
  const status = state?.status;
  const queuedTasks = state?.tasks.filter((task) => task.state === "queued").length ?? 0;

  return html`
    <section class="sageos-dashboard">
      <div class="sageos-header">
        <div>
          <div class="card-title">SageOS Command Center</div>
          <div class="card-sub">
            ${
              status
                ? `${status.mode} mode, ${status.employees.active} active employee(s), ${status.approvals.pending} pending approval(s)`
                : "Connect to the gateway to load SageOS state."
            }
          </div>
        </div>
        <div class="sageos-action-row">
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${() => props.onRefresh()}>
            ${icons.loader} Refresh
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${!props.connected || isBusy(props)}
            @click=${() => props.onControl("paused")}
          >
            Pause
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${!props.connected || isBusy(props)}
            @click=${() => props.onControl("running")}
          >
            Resume
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${!props.connected || isBusy(props)}
            @click=${() => props.onControl("stopped")}
          >
            Stop
          </button>
          <button
            class="btn btn--sm danger"
            ?disabled=${!props.connected || isBusy(props)}
            @click=${() => props.onControl("emergency_stop")}
          >
            Emergency stop
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      ${
        !props.connected
          ? html`
              <div class="callout">Gateway disconnected.</div>
            `
          : nothing
      }
      ${
        props.loading
          ? html`
              <div class="callout">Loading SageOS state...</div>
            `
          : nothing
      }
      ${
        status
          ? html`
            <section class="sageos-kpi-grid">
              ${renderKpi("Supervisor", status.supervisor.state, status.supervisor.paused ? "paused" : "active")}
              ${renderKpi(
                "Observations",
                String(status.observations.recent),
                `${status.observations.redacted} redacted / ${status.observations.failed} failed`,
              )}
              ${renderKpi(
                "Memory",
                status.memory.status,
                `${status.memory.backend}, ${status.memory.captureQueue.pending} queued`,
              )}
              ${renderKpi(
                "Learning",
                status.learning.status,
                `${status.learning.activityQueue.pending} pending activity event(s)`,
              )}
              ${renderKpi(
                "Tasks",
                String(status.tasks.total),
                `${status.tasks.queued} queued / ${status.tasks.blocked} blocked`,
              )}
              ${renderKpi(
                "Workflows",
                String(status.workflows.total),
                `${status.workflows.queued} candidate / ${status.workflows.blocked} blocked`,
              )}
              ${renderKpi(
                "Skills",
                String(status.skills.total),
                `${status.skills.queued} draft / ${status.skills.active} active`,
              )}
              ${renderKpi(
                "Coding",
                status.coding.enabled ? "enabled" : "disabled",
                `${status.coding.reports.total} report(s)`,
              )}
              ${renderKpi("Apps", String(status.apps.total), `${status.apps.queued} draft`)}
              ${renderKpi(
                "Notifications",
                status.notifications.telegram.enabled ? "Telegram on" : "Telegram off",
                `${status.notifications.urgentPending} urgent pending`,
              )}
              ${renderKpi(
                "Policy",
                status.policy.mode,
                `${status.policy.approvalsRequired.length} approval gate(s)`,
              )}
              ${renderKpi(
                "Audit",
                String(status.audit.recentEvents),
                status.audit.eventLogPath ?? "event log unavailable",
              )}
            </section>

            <section class="sageos-section-grid">
              ${renderTasks(props, state.tasks, queuedTasks)}
              ${renderApprovals(props, state.approvals)}
              ${renderIncidents(props, status.incidents)}
              ${renderCollaborations(state.collaborations)}
            </section>
          `
          : nothing
      }
    </section>
  `;
}

function renderKpi(label: string, value: string, sub: string) {
  return html`
    <div class="stat sageos-kpi">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="muted">${sub}</div>
    </div>
  `;
}

function renderTasks(props: SageOsViewProps, tasks: SageOsTaskSpec[], queuedTasks: number) {
  return html`
    <section class="card sageos-section">
      <div class="sageos-section-header">
        <div>
          <div class="card-title">Tasks</div>
          <div class="card-sub">${tasks.length} task(s), ${queuedTasks} queued.</div>
        </div>
        <button
          class="btn btn--sm primary"
          ?disabled=${queuedTasks === 0 || isBusy(props)}
          @click=${() => props.onRunNextTask()}
        >
          Run next
        </button>
      </div>
      <div class="list sageos-list">
        ${
          tasks.length === 0
            ? html`
                <div class="muted">No SageOS tasks.</div>
              `
            : tasks.map((task) => renderTaskRow(props, task))
        }
      </div>
    </section>
  `;
}

function renderTaskRow(props: SageOsViewProps, task: SageOsTaskSpec) {
  const canQueue = task.state === "proposed" || task.state === "waiting_for_policy";
  const canCancel = !terminalTaskStates.has(task.state);
  return html`
    <div class="list-item sageos-list-item">
      <div class="list-main">
        <div class="list-title">${task.title}</div>
        <div class="list-sub mono">${task.id}</div>
        <div class="list-sub">${task.objective}</div>
        ${renderTaskDetails(task)}
      </div>
      <div class="list-meta">
        <span class="chip">${task.state}</span>
        <span>${task.autonomyTier}</span>
        <div class="sageos-row-actions">
          ${
            canQueue
              ? html`
                <button
                  class="btn btn--sm"
                  ?disabled=${isBusy(props)}
                  @click=${() => props.onQueueTask(task.id)}
                >
                  Queue
                </button>
              `
              : nothing
          }
          ${
            canCancel
              ? html`
                <button
                  class="btn btn--sm danger"
                  ?disabled=${isBusy(props)}
                  @click=${() => props.onCancelTask(task.id)}
                >
                  Cancel
                </button>
              `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

function renderTaskDetails(task: SageOsTaskSpec) {
  return html`
    <details class="sageos-details">
      <summary>Details</summary>
      <div class="sageos-detail-grid">
        <span>Requested by</span>
        <span>${task.requestedBy}</span>
        <span>Created</span>
        <span>${task.createdAt}</span>
        <span>Updated</span>
        <span>${task.updatedAt}</span>
        <span>Rollback</span>
        <span>${task.rollback ?? "No rollback note."}</span>
        <span>Policy</span>
        <span>${formatPolicyScopes(task.policyScopes)}</span>
      </div>
    </details>
  `;
}

function renderApprovals(props: SageOsViewProps, approvals: SageOsApproval[]) {
  const pending = approvals.filter((approval) => approval.state === "pending");
  return html`
    <section class="card sageos-section">
      <div class="card-title">Approvals</div>
      <div class="card-sub">${pending.length} pending approval(s).</div>
      <div class="list sageos-list">
        ${
          pending.length === 0
            ? html`
                <div class="muted">No pending SageOS approvals.</div>
              `
            : pending.map((approval) => renderApprovalRow(props, approval))
        }
      </div>
    </section>
  `;
}

function renderApprovalRow(props: SageOsViewProps, approval: SageOsApproval) {
  return html`
    <div class="list-item sageos-list-item">
      <div class="list-main">
        <div class="list-title">${approval.title}</div>
        <div class="list-sub mono">${approval.id}</div>
        <div class="list-sub">${approval.proposedAction}</div>
        <div class="list-sub">Rollback: ${approval.rollbackPlan}</div>
      </div>
      <div class="list-meta">
        <span class="chip chip-warn">${approval.riskClass}</span>
        <div class="sageos-row-actions">
          <button
            class="btn btn--sm primary"
            ?disabled=${isBusy(props)}
            @click=${() => props.onResolveApproval(approval.id, "approved")}
          >
            Approve
          </button>
          <button
            class="btn btn--sm danger"
            ?disabled=${isBusy(props)}
            @click=${() => props.onResolveApproval(approval.id, "denied")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderIncidents(props: SageOsViewProps, incidents: SageOsIncident[]) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Incidents</div>
      <div class="card-sub">${incidents.length} incident(s).</div>
      <div class="list sageos-list">
        ${
          incidents.length === 0
            ? html`
                <div class="muted">No SageOS incidents.</div>
              `
            : incidents.map(
                (incident) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${incident.title}</div>
                    <div class="list-sub mono">${incident.id}</div>
                    <div class="list-sub">${incident.summary}</div>
                    <div class="list-sub">
                      Repair:
                      ${
                        incident.repairAction
                          ? `${incident.repairAction.label} (${incident.repairAction.gatewayMethod ?? incident.repairAction.command ?? "manual"})`
                          : "manual review"
                      }
                    </div>
                    ${
                      canRunIncidentRepair(incident)
                        ? html`
                          <div class="sageos-row-actions sageos-repair-actions">
                            <button
                              class="btn btn--sm"
                              ?disabled=${isBusy(props)}
                              @click=${() => props.onRunRepair(incident.id)}
                            >
                              Run repair
                            </button>
                          </div>
                        `
                        : nothing
                    }
                  </div>
                  <div class="list-meta">
                    <span class="chip ${incident.severity === "error" || incident.severity === "critical" ? "chip-warn" : ""}">
                      ${incident.severity}
                    </span>
                    <span>${incident.category}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function canRunIncidentRepair(incident: SageOsIncident): boolean {
  return Boolean(
    incident.autoRepairSafe &&
    incident.repairAction &&
    !incident.repairAction.approvalRequired &&
    incident.repairAction.gatewayMethod,
  );
}

function formatPolicyScopes(scopes: SageOsPolicyScope[]): string {
  if (scopes.length === 0) {
    return "No policy scopes.";
  }
  return scopes.map(formatPolicyScope).join(" | ");
}

function formatPolicyScope(scope: SageOsPolicyScope): string {
  const parts = [
    scope.allow?.length ? `allow ${scope.allow.join(", ")}` : undefined,
    scope.deny?.length ? `deny ${scope.deny.join(", ")}` : undefined,
    scope.risk ? `risk ${scope.risk}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return `${scope.kind}: ${parts.length > 0 ? parts.join("; ") : "scoped"}`;
}

function renderCollaborations(collaborations: SageOsCollaborationEvent[]) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Collaboration</div>
      <div class="card-sub">${collaborations.length} structured event(s).</div>
      <div class="list sageos-list">
        ${
          collaborations.length === 0
            ? html`
                <div class="muted">No SageOS collaboration events.</div>
              `
            : collaborations.slice(0, 6).map(
                (collaboration) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${collaboration.title}</div>
                    <div class="list-sub mono">${collaboration.id}</div>
                    <div class="list-sub">${collaboration.summary}</div>
                  </div>
                  <div class="list-meta">
                    <span class="chip">${collaboration.kind}</span>
                    <span>${collaboration.state}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function isBusy(props: SageOsViewProps): boolean {
  return Boolean(props.busy);
}
