import { LitElement, css, html, nothing } from "lit";
import { renderAgentWorkspace } from "./components/agent-workspace.js";
import { renderCommandDeck } from "./components/command-deck.js";
import { renderCompactHud } from "./components/compact-hud.js";
import { renderEdgeRail } from "./components/edge-rail.js";
import { renderPinnedWidgets } from "./components/pinned-widgets.js";
import { renderUniversalLauncher } from "./components/universal-launcher.js";
import { OverlayGatewayBrowserClient } from "./gateway-client.js";
import { SageOsOverlayController } from "./overlay-controller.js";
import { canRunSageOsIncidentRepair } from "./sageos-actions.js";
import type { SageOsOverlayStatusState } from "./sageos-actions.js";

export type OverlayCard = { title: string; value: string; detail: string };
export type OverlayBadge = { label: string; value: string };
export type OverlayTaskRow = {
  id: string;
  title: string;
  detail: string;
  state: string;
  canQueue: boolean;
  canCancel: boolean;
};
export type OverlayApprovalRow = {
  id: string;
  title: string;
  detail: string;
  risk: string;
  state: string;
};
export type OverlayIncidentRow = {
  id: string;
  title: string;
  detail: string;
  severity: string;
  repairLabel?: string;
  canRepair: boolean;
};
export type OverlayGatewaySettings = {
  url: string;
  token?: string;
  password?: string;
};

declare global {
  interface Window {
    sageOsOverlay?: {
      expand(): Promise<void>;
      collapse(): Promise<void>;
      close(): Promise<void>;
      onSurface(callback: (surface: string) => void): void;
    };
  }
}

export function renderOverlayModel(state: SageOsOverlayStatusState) {
  const status = state.status;
  const activeTasks = String(status.tasks.active);
  const pendingApprovals = String(status.approvals.pending);
  const incidents = String(status.incidents.length);
  const taskRows = (state.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    detail: task.objective,
    state: task.state,
    canQueue: task.state === "proposed" || task.state === "waiting_for_policy",
    canCancel: !["completed", "failed", "cancelled", "expired"].includes(task.state),
  }));
  const approvalRows = (state.approvals ?? []).map((approval) => ({
    id: approval.id,
    title: approval.title,
    detail: approval.proposedAction,
    risk: approval.riskClass,
    state: approval.state,
  }));
  const incidentRows = status.incidents.map((incident) => ({
    id: incident.id,
    title: incident.title,
    detail: incident.summary,
    severity: incident.severity,
    repairLabel: incident.repairAction?.label,
    canRepair: canRunSageOsIncidentRepair(incident),
  }));

  return {
    commandDeck: {
      cards: [
        {
          title: "Supervisor",
          value: status.supervisor.state,
          detail: status.supervisor.paused ? "Paused" : "Running",
        },
        { title: "Active Operations", value: activeTasks, detail: `${status.tasks.queued} queued` },
        { title: "Approvals", value: pendingApprovals, detail: "Pending decisions" },
        { title: "Incidents", value: incidents, detail: "Needs review" },
      ] satisfies OverlayCard[],
      tasks: taskRows satisfies OverlayTaskRow[],
      approvals: approvalRows satisfies OverlayApprovalRow[],
      incidents: incidentRows satisfies OverlayIncidentRow[],
    },
    hud: {
      badges: [
        { label: "Tasks", value: activeTasks },
        { label: "Approvals", value: pendingApprovals },
        { label: "Incidents", value: incidents },
      ] satisfies OverlayBadge[],
    },
    edgeRail: {
      badges: [
        { kind: "health", count: status.supervisor.state === "running" ? 0 : 1 },
        { kind: "approval", count: status.approvals.pending },
        { kind: "incident", count: status.incidents.length },
      ],
    },
  };
}

export function readOverlayGatewaySettings(
  search = globalThis.location?.search ?? "",
  storage: Pick<Storage, "getItem"> | null = safeLocalStorage(),
): OverlayGatewaySettings {
  const params = new URLSearchParams(search);
  const url =
    params.get("gatewayUrl")?.trim() ||
    storage?.getItem("sageos.overlay.gatewayUrl")?.trim() ||
    "ws://127.0.0.1:18789";
  const token = params.get("token")?.trim() || storage?.getItem("sageos.overlay.token")?.trim();
  const password =
    params.get("password")?.trim() || storage?.getItem("sageos.overlay.password")?.trim();
  return {
    url,
    ...(token ? { token } : {}),
    ...(password ? { password } : {}),
  };
}

export class SageOsOverlayApp extends LitElement {
  static properties = {
    overlayConnected: { state: true },
    loading: { state: true },
    error: { state: true },
    sageOsState: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: rgba(18, 20, 22, 0.72);
      backdrop-filter: blur(16px);
    }
  `;

  private controller: SageOsOverlayController | null = null;
  private overlayConnected = false;
  private loading = false;
  private error: string | null = null;
  private sageOsState: SageOsOverlayStatusState | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (this.controller) {
      return;
    }

    const settings = readOverlayGatewaySettings();
    let controller: SageOsOverlayController;
    const client = new OverlayGatewayBrowserClient({
      url: settings.url,
      token: settings.token,
      password: settings.password,
      onHello: () => void controller.loadStatus(),
      onEvent: (event) => controller.handleGatewayEvent(event),
      onClose: () => controller.setConnected(false),
    });
    controller = new SageOsOverlayController(client, () => this.syncControllerState());
    this.controller = controller;
    controller.start();
  }

  disconnectedCallback() {
    this.controller?.stop();
    this.controller = null;
    super.disconnectedCallback();
  }

  render() {
    const model = this.sageOsState ? renderOverlayModel(this.sageOsState) : null;

    return html`
      <main class="overlay-shell">
        <nav class="overlay-toolbar" aria-label="SageOS overlay controls">
          <span class="overlay-connection">${this.overlayConnected ? "Connected" : "Connecting"}</span>
          <button type="button" @click=${() => void this.controller?.pause()}>Pause</button>
          <button type="button" @click=${() => void this.controller?.resume()}>Resume</button>
          <button type="button" @click=${() => void this.controller?.emergencyStop()}>
            Emergency stop
          </button>
          <button type="button" @click=${() => window.sageOsOverlay?.expand()}>Full</button>
          <button type="button" @click=${() => window.sageOsOverlay?.collapse()}>Rail</button>
          <button type="button" @click=${() => window.sageOsOverlay?.close()}>Close</button>
        </nav>
        <section class="overlay-content">
          ${this.error ? html`<section class="overlay-callout">${this.error}</section>` : nothing}
          ${this.loading ? html`<section class="overlay-callout">Loading SageOS state...</section>` : nothing}
          ${model
            ? html`
                ${renderUniversalLauncher()}
                ${renderCommandDeck(model.commandDeck.cards)}
                ${this.renderOperationalRows(model.commandDeck)}
                ${renderAgentWorkspace(
                  "Agent Workspace",
                  "Select an employee, task, run, approval, or incident.",
                )}
                ${renderPinnedWidgets(["activeOperations", "approvals", "incidents"])}
                ${renderCompactHud(model.hud.badges)}
                ${renderEdgeRail(model.edgeRail.badges)}
              `
            : html`<section class="overlay-callout">Waiting for SageOS gateway state.</section>`}
        </section>
      </main>
    `;
  }

  private renderOperationalRows(commandDeck: ReturnType<typeof renderOverlayModel>["commandDeck"]) {
    return html`
      <section class="operational-grid">
        <article class="overlay-panel">
          <div class="overlay-panel__header">
            <h2>Active Operations</h2>
            <button type="button" @click=${() => void this.controller?.runNextTask()}>Run next</button>
          </div>
          ${commandDeck.tasks.length === 0
            ? html`<p class="overlay-muted">No tracked SageOS tasks.</p>`
            : commandDeck.tasks.map(
                (task) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${task.title}</div>
                      <div class="overlay-row__detail">${task.detail}</div>
                      <div class="overlay-row__meta">${task.id} / ${task.state}</div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        type="button"
                        ?disabled=${!task.canQueue}
                        @click=${() => void this.controller?.queueTask(task.id)}
                      >
                        Queue
                      </button>
                      <button
                        type="button"
                        ?disabled=${!task.canCancel}
                        @click=${() => void this.controller?.cancelTask(task.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                `,
              )}
        </article>

        <article class="overlay-panel">
          <div class="overlay-panel__header">
            <h2>Approvals</h2>
          </div>
          ${commandDeck.approvals.length === 0
            ? html`<p class="overlay-muted">No pending approval records.</p>`
            : commandDeck.approvals.map(
                (approval) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${approval.title}</div>
                      <div class="overlay-row__detail">${approval.detail}</div>
                      <div class="overlay-row__meta">${approval.risk} / ${approval.state}</div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        type="button"
                        @click=${() => void this.controller?.approveApproval(approval.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        @click=${() => void this.controller?.denyApproval(approval.id)}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                `,
              )}
        </article>

        <article class="overlay-panel">
          <div class="overlay-panel__header">
            <h2>Incidents</h2>
          </div>
          ${commandDeck.incidents.length === 0
            ? html`<p class="overlay-muted">No active incidents.</p>`
            : commandDeck.incidents.map(
                (incident) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${incident.title}</div>
                      <div class="overlay-row__detail">${incident.detail}</div>
                      <div class="overlay-row__meta">${incident.id} / ${incident.severity}</div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        type="button"
                        ?disabled=${!incident.canRepair}
                        @click=${() => void this.controller?.runIncidentRepair(incident.id)}
                      >
                        ${incident.repairLabel ?? "Run repair"}
                      </button>
                    </div>
                  </div>
                `,
              )}
        </article>
      </section>
    `;
  }

  private syncControllerState() {
    if (!this.controller) {
      return;
    }
    this.overlayConnected = this.controller.state.connected;
    this.loading = this.controller.state.loading;
    this.error = this.controller.state.error;
    this.sageOsState = this.controller.state.sageOsState;
    this.requestUpdate();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("sageos-overlay-app")) {
  customElements.define("sageos-overlay-app", SageOsOverlayApp);
}

function safeLocalStorage(): Pick<Storage, "getItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
