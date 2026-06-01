import { html } from "lit";

export type AgentWorkspaceTarget = {
  kind:
    | "employee"
    | "run"
    | "task"
    | "approval"
    | "incident"
    | "codingReport"
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
  | "approveApproval"
  | "denyApproval"
  | "pauseEmployee"
  | "resumeEmployee"
  | "retireEmployee"
  | "runIncidentRepair";

export type AgentWorkspaceAction = {
  kind: AgentWorkspaceActionKind;
  label: string;
  enabled: boolean;
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
