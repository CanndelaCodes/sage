import { html } from "lit";

export type AgentWorkspaceTarget = {
  kind:
    | "employee"
    | "run"
    | "task"
    | "approval"
    | "incident"
    | "codingReport"
    | "repo"
    | "workflow"
    | "skill"
    | "app"
    | "observation"
    | "collaboration"
    | "system";
  id: string;
};

export type AgentWorkspaceActionKind =
  | "queueTask"
  | "cancelTask"
  | "pauseTask"
  | "askTaskUpdate"
  | "increaseTaskBudget"
  | "reassignTask"
  | "requestTaskReview"
  | "approveApproval"
  | "denyApproval"
  | "assignEmployeeTask"
  | "editEmployee"
  | "activateEmployee"
  | "pauseEmployee"
  | "resumeEmployee"
  | "retireEmployee"
  | "runIncidentRepair";

export type AgentWorkspaceAction = {
  kind: AgentWorkspaceActionKind;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  target: AgentWorkspaceTarget;
};

export type AgentWorkspaceView = {
  title: string;
  eyebrow: string;
  detail: string;
  facts: { label: string; value: string }[];
  actions: AgentWorkspaceAction[];
};

export function renderAgentWorkspace(
  workspace: AgentWorkspaceView,
  opts: { onAction?: (action: AgentWorkspaceAction) => void } = {},
) {
  return html`
    <section class="agent-workspace">
      <div class="agent-workspace__header">
        <span class="agent-workspace__eyebrow">${workspace.eyebrow}</span>
        <h2>${workspace.title}</h2>
      </div>
      <p>${workspace.detail}</p>
      <dl class="agent-workspace__facts">
        ${workspace.facts.map(
          (fact) => html`
            <div class="agent-workspace__fact">
              <dt>${fact.label}</dt>
              <dd>${fact.value}</dd>
            </div>
          `,
        )}
      </dl>
      <div class="agent-workspace__actions">
        ${workspace.actions.map(
          (action) => html`
            <button
              class="overlay-button"
              type="button"
              title=${action.disabledReason ?? action.label}
              ?disabled=${!action.enabled}
              @click=${() => opts.onAction?.(action)}
            >
              ${action.label}
            </button>
          `,
        )}
      </div>
    </section>
  `;
}
