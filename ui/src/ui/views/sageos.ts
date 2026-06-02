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

type SageOsStatusSnapshot = SageOsPersistedState["status"];
type SageOsMemoryStatus = SageOsStatusSnapshot["memory"];
type SageOsLearningStatus = SageOsStatusSnapshot["learning"];
type SageOsPolicyStatus = SageOsStatusSnapshot["policy"];
type SageOsSourceStatus = SageOsStatusSnapshot["sources"];
type SageOsAuditStatus = SageOsStatusSnapshot["audit"];
type SageOsObservationList = SageOsPersistedState["observations"];
type SageOsWorkflowList = SageOsPersistedState["workflows"];
type SageOsSkillList = SageOsPersistedState["skills"];
type SageOsAppList = SageOsPersistedState["apps"];
type SageOsCodingReportList = SageOsPersistedState["codingReports"];

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
              ${renderObservations(state.observations)}
              ${renderMemoryQueue(status.memory)}
              ${renderLearningQueue(status.learning)}
              ${renderWorkflows(state.workflows)}
              ${renderSkills(state.skills)}
              ${renderApps(state.apps)}
              ${renderCodingReports(state.codingReports)}
              ${renderPolicyAndSources(status.policy, status.sources)}
              ${renderAuditTrail(status.audit)}
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

function renderObservations(observations: SageOsObservationList) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Observation Stream</div>
      <div class="card-sub">${observations.length} captured observation(s).</div>
      <div class="list sageos-list">
        ${
          observations.length === 0
            ? html`
                <div class="muted">No recent SageOS observations.</div>
              `
            : observations.slice(0, 8).map(
                (observation) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${observation.title}</div>
                    <div class="list-sub mono">${observation.id}</div>
                    <div class="list-sub">${observation.text}</div>
                  </div>
                  <div class="list-meta">
                    <span class="chip">${observation.source}</span>
                    <span>${observation.state}</span>
                    <span>${observation.sensitivity}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function renderMemoryQueue(memory: SageOsMemoryStatus) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Memory Queue</div>
      <div class="card-sub">${formatMemoryBackend(memory.canonical)} is the canonical backend.</div>
      <div class="list sageos-list">
        <div class="list-item sageos-list-item">
          <div class="list-main">
            <div class="list-title">${formatMemoryBackend(memory.backend)}</div>
            <div class="list-sub">
              ${memory.captureQueue.pending} pending / ${memory.captureQueue.failed} failed /
              ${memory.captureQueue.total} total capture item(s)
            </div>
            ${
              memory.doctor
                ? html`
                  <div class="list-sub">
                    Doctor: ${memory.doctor.checks} checks / ${memory.doctor.warnings} warnings /
                    ${memory.doctor.failures} failures
                  </div>
                `
                : nothing
            }
          </div>
          <div class="list-meta">
            <span class="chip">${memory.status}</span>
            <span>${memory.canonical}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderLearningQueue(learning: SageOsLearningStatus) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Learning Queue</div>
      <div class="card-sub">
        ${learning.activityQueue.pending} pending activity event(s).
      </div>
      <div class="list sageos-list">
        <div class="list-item sageos-list-item">
          <div class="list-main">
            <div class="list-title">activity event</div>
            <div class="list-sub">
              ${learning.activityQueue.pending} pending / ${learning.activityQueue.failed} failed /
              ${learning.activityQueue.total} total learning item(s)
            </div>
          </div>
          <div class="list-meta">
            <span class="chip">${learning.status}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderWorkflows(workflows: SageOsWorkflowList) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Workflow Candidates</div>
      <div class="card-sub">${workflows.length} workflow candidate(s).</div>
      <div class="list sageos-list">
        ${
          workflows.length === 0
            ? html`
                <div class="muted">No SageOS workflow candidates.</div>
              `
            : workflows.map(
                (workflow) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${workflow.name}</div>
                    <div class="list-sub mono">${workflow.id}</div>
                    <div class="list-sub">${workflow.trigger}</div>
                    <div class="list-sub">Pattern: ${workflow.observedPattern}</div>
                    <div class="list-sub">Outputs: ${formatList(workflow.outputs)}</div>
                  </div>
                  <div class="list-meta">
                    <span class="chip">${workflow.state}</span>
                    <span>${formatPolicyScopes(workflow.policyScopes)}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function renderSkills(skills: SageOsSkillList) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Skill Candidates</div>
      <div class="card-sub">${skills.length} skill candidate(s).</div>
      <div class="list sageos-list">
        ${
          skills.length === 0
            ? html`
                <div class="muted">No SageOS skill candidates.</div>
              `
            : skills.map(
                (skill) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${skill.name}</div>
                    <div class="list-sub mono">${skill.id}</div>
                    <div class="list-sub">Provenance: ${formatList(skill.provenance)}</div>
                    <div class="list-sub">Tests: ${formatList(skill.tests)}</div>
                    <div class="list-sub">Triggers: ${formatList(skill.triggerConditions)}</div>
                  </div>
                  <div class="list-meta">
                    <span class="chip">${skill.state}</span>
                    ${skill.workflowId ? html`<span>${skill.workflowId}</span>` : nothing}
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function renderApps(apps: SageOsAppList) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">App Candidates</div>
      <div class="card-sub">${apps.length} app candidate(s).</div>
      <div class="list sageos-list">
        ${
          apps.length === 0
            ? html`
                <div class="muted">No SageOS app candidates.</div>
              `
            : apps.map(
                (app) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${app.name}</div>
                    <div class="list-sub mono">${app.id}</div>
                    <div class="list-sub">${app.purpose}</div>
                    <div class="list-sub">Inputs: ${formatList(app.inputs)}</div>
                    <div class="list-sub">Outputs: ${formatList(app.outputs)}</div>
                    ${app.previewCommand ? html`<div class="list-sub mono">${app.previewCommand}</div>` : nothing}
                  </div>
                  <div class="list-meta">
                    <span class="chip">${app.state}</span>
                    <span>${app.targetSurface}</span>
                    <span>${app.sensitivity}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function renderCodingReports(reports: SageOsCodingReportList) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Coding Reports</div>
      <div class="card-sub">${reports.length} coding report(s).</div>
      <div class="list sageos-list">
        ${
          reports.length === 0
            ? html`
                <div class="muted">No SageOS coding reports.</div>
              `
            : reports.map(
                (report) => html`
                <div class="list-item sageos-list-item">
                  <div class="list-main">
                    <div class="list-title">${report.objective}</div>
                    <div class="list-sub mono">${report.id}</div>
                    <div class="list-sub">${report.repoPath}</div>
                    <div class="list-sub">Diff: ${report.diff.stat}</div>
                    <div class="list-sub">Tests: ${formatList(report.tests.map((test) => test.command))}</div>
                    <div class="list-sub">Rollback: ${report.rollback}</div>
                  </div>
                  <div class="list-meta">
                    <span class="chip">${report.outcome}</span>
                    <span>${report.taskId}</span>
                    <span>${report.runId}</span>
                  </div>
                </div>
              `,
              )
        }
      </div>
    </section>
  `;
}

function renderPolicyAndSources(policy: SageOsPolicyStatus, sources: SageOsSourceStatus) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Policy & Sources</div>
      <div class="card-sub">${policy.mode} mode with ${policy.defaultTier} default tier.</div>
      <div class="list sageos-list">
        <div class="list-item sageos-list-item">
          <div class="list-main">
            <div class="list-title">Approval gates</div>
            <div class="list-sub">Required: ${formatList(policy.approvalsRequired)}</div>
            <div class="list-sub">Enabled sources: ${formatList(sources.enabled)}</div>
            <div class="list-sub">Disabled sources: ${formatList(sources.disabled)}</div>
            <div class="list-sub">Failing sources: ${formatList(sources.failing)}</div>
          </div>
          <div class="list-meta">
            <span class="chip">${policy.mode}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAuditTrail(audit: SageOsAuditStatus) {
  return html`
    <section class="card sageos-section">
      <div class="card-title">Audit Trail</div>
      <div class="card-sub">${audit.recentEvents} recent event(s).</div>
      <div class="list sageos-list">
        <div class="list-item sageos-list-item">
          <div class="list-main">
            <div class="list-title">${audit.eventLogPath ?? "Event log unavailable"}</div>
            <div class="list-sub">Recent events: ${audit.recentEvents}</div>
          </div>
          <div class="list-meta">
            <span class="chip">audit</span>
          </div>
        </div>
      </div>
    </section>
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

function formatList(values: string[]): string {
  if (values.length === 0) {
    return "none";
  }
  return values.join(", ");
}

function formatMemoryBackend(backend: SageOsMemoryStatus["backend"]): string {
  switch (backend) {
    case "sage-memory":
      return "Sage Memory";
    case "qmd":
      return "QMD";
    case "builtin":
      return "Built-in";
    case "unknown":
      return "Unknown";
  }
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
