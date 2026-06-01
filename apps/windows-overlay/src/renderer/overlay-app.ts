import { LitElement, html, nothing } from "lit";
import {
  SAGEOS_OVERLAY_EDGES,
  SAGEOS_OVERLAY_WIDGET_IDS,
  type SageOsOverlayEdge,
  type SageOsOverlayWidgetId,
} from "../../../../src/sageos/types.js";
import { renderAgentWorkspace } from "./components/agent-workspace.js";
import type {
  AgentWorkspaceAction,
  AgentWorkspaceTarget,
  AgentWorkspaceView,
} from "./components/agent-workspace.js";
import { renderCommandDeck } from "./components/command-deck.js";
import { renderCompactHud } from "./components/compact-hud.js";
import { renderEdgeRail } from "./components/edge-rail.js";
import { renderPinnedWidgets } from "./components/pinned-widgets.js";
import type { PinnedWidgetView } from "./components/pinned-widgets.js";
import { renderUniversalLauncher } from "./components/universal-launcher.js";
import { OverlayGatewayBrowserClient } from "./gateway-client.js";
import { SageOsOverlayController } from "./overlay-controller.js";
import { canRunSageOsIncidentRepair } from "./sageos-actions.js";
import type { SageOsOverlayStatusState } from "./sageos-actions.js";

export type OverlaySurface = "commandDeck" | "hud" | "edgeRail";
export type OverlaySurfaceVisibility = {
  toolbar: boolean;
  launcher: boolean;
  commandDeck: boolean;
  overview: boolean;
  operationalRows: boolean;
  agentWorkspace: boolean;
  pinnedWidgets: boolean;
  compactHud: boolean;
  edgeRail: boolean;
};
export type OverlayCard = { title: string; value: string; detail: string };
export type OverlayBadge = { label: string; value: string };
export type OverlayOverviewRow = { label: string; value: string; detail: string };
export type OverlayOverviewGroup = { title: string; rows: OverlayOverviewRow[] };
export type OverlayTaskRow = {
  id: string;
  title: string;
  detail: string;
  state: string;
  owner: string;
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
export type OverlayCodingReportRow = {
  id: string;
  title: string;
  detail: string;
  outcome: string;
};
export type OverlayResourceKind =
  | "employee"
  | "run"
  | "workflow"
  | "skill"
  | "app"
  | "observation"
  | "collaboration";
export type OverlayResourceRow = {
  id: string;
  kind: OverlayResourceKind;
  title: string;
  detail: string;
  state: string;
};
export type OverlaySystemResourceRow = {
  id: string;
  title: string;
  detail: string;
  state: string;
};
export type OverlayGatewaySettings = {
  url: string;
  token?: string;
  password?: string;
};
export type OverlayLayoutSettings = {
  collapsedEdge: SageOsOverlayEdge;
  pinnedWidgets: SageOsOverlayWidgetId[];
};
export type OverlayInteractionSettings = {
  voice: {
    enabled: boolean;
    mode?: "pushToTalk";
  };
};
export type RenderOverlayModelOptions = {
  workspaceTarget?: AgentWorkspaceTarget;
  pinnedWidgets?: SageOsOverlayWidgetId[];
};

const DEFAULT_PINNED_WIDGETS = [
  "activeOperations",
  "approvals",
  "incidents",
] as const satisfies SageOsOverlayWidgetId[];

declare global {
  interface Window {
    sageOsOverlay?: {
      expand(): Promise<void>;
      collapse(): Promise<void>;
      close(): Promise<void>;
      setInteractivePointer(active: boolean): Promise<void>;
      onSurface(callback: (surface: string) => void): void;
    };
  }
}

const OVERLAY_INTERACTIVE_SELECTOR =
  'button, input, textarea, select, a, [role="button"], [data-overlay-interactive="true"]';

export function renderOverlayModel(
  state: SageOsOverlayStatusState,
  opts: RenderOverlayModelOptions = {},
) {
  const status = state.status;
  const activeTasks = String(status.tasks.active);
  const pendingApprovals = String(status.approvals.pending);
  const incidents = String(status.incidents.length);
  const employeeNames = new Map((state.agents ?? []).map((agent) => [agent.id, agent.name]));
  const taskRows = (state.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    detail: task.objective,
    state: task.state,
    owner: ownerLabel(task.ownerAgentId, employeeNames),
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
  const codingReportRows = (state.codingReports ?? []).map((report) => ({
    id: report.id,
    title: report.objective,
    detail: [
      report.outcome,
      `${report.diff.changedFiles.length} changed`,
      `${report.tests.length} ${report.tests.length === 1 ? "test" : "tests"}`,
    ].join(" / "),
    outcome: report.outcome,
  }));
  const resourceRows = buildResourceRows(state);
  const systemResourceRows = buildSystemResourceRows(status);

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
      codingReports: codingReportRows satisfies OverlayCodingReportRow[],
      resources: resourceRows satisfies OverlayResourceRow[],
      systemResources: systemResourceRows satisfies OverlaySystemResourceRow[],
    },
    overview: buildOverviewGroups(status),
    workspace: buildWorkspaceModel(state, opts.workspaceTarget),
    pinnedWidgets: buildPinnedWidgets(status, opts.pinnedWidgets),
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

export function readInitialOverlaySurface(search = globalThis.location?.search ?? ""): OverlaySurface {
  return normalizeOverlaySurface(new URLSearchParams(search).get("surface"));
}

export function readOverlayLayoutSettings(
  search = globalThis.location?.search ?? "",
): OverlayLayoutSettings {
  const params = new URLSearchParams(search);
  return {
    collapsedEdge: normalizeOverlayEdge(params.get("collapsedEdge")),
    pinnedWidgets: normalizePinnedWidgets(params.get("pinnedWidgets")),
  };
}

export function readOverlayInteractionSettings(
  search = globalThis.location?.search ?? "",
): OverlayInteractionSettings {
  const params = new URLSearchParams(search);
  return params.get("voice") === "pushToTalk"
    ? { voice: { enabled: true, mode: "pushToTalk" } }
    : { voice: { enabled: false } };
}

export function normalizeOverlaySurface(value: unknown): OverlaySurface {
  return value === "hud" || value === "edgeRail" ? value : "commandDeck";
}

function normalizeOverlayEdge(value: unknown): SageOsOverlayEdge {
  return typeof value === "string" && SAGEOS_OVERLAY_EDGES.includes(value as SageOsOverlayEdge)
    ? (value as SageOsOverlayEdge)
    : "right";
}

function normalizePinnedWidgets(value: unknown): SageOsOverlayWidgetId[] {
  if (typeof value !== "string") {
    return [...DEFAULT_PINNED_WIDGETS];
  }

  const widgets = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is SageOsOverlayWidgetId =>
      SAGEOS_OVERLAY_WIDGET_IDS.includes(entry as SageOsOverlayWidgetId),
    );
  const uniqueWidgets = [...new Set(widgets)];
  return uniqueWidgets.length ? uniqueWidgets : [...DEFAULT_PINNED_WIDGETS];
}

export function getOverlaySurfaceVisibility(surface: OverlaySurface): OverlaySurfaceVisibility {
  if (surface === "hud") {
    return {
      toolbar: true,
      launcher: false,
      commandDeck: false,
      overview: false,
      operationalRows: false,
      agentWorkspace: false,
      pinnedWidgets: false,
      compactHud: true,
      edgeRail: false,
    };
  }

  if (surface === "edgeRail") {
    return {
      toolbar: false,
      launcher: false,
      commandDeck: false,
      overview: false,
      operationalRows: false,
      agentWorkspace: false,
      pinnedWidgets: true,
      compactHud: false,
      edgeRail: true,
    };
  }

  return {
    toolbar: true,
    launcher: true,
    commandDeck: true,
    overview: true,
    operationalRows: true,
    agentWorkspace: true,
    pinnedWidgets: true,
    compactHud: false,
    edgeRail: false,
  };
}

export function isOverlayInteractiveElement(element: Element | null): boolean {
  return Boolean(element?.closest(OVERLAY_INTERACTIVE_SELECTOR));
}

export type OverlayKeyboardActions = {
  close: () => void;
  focusLauncher: () => void;
};

export function handleOverlayKeyboardShortcut(
  event: KeyboardEvent,
  actions: OverlayKeyboardActions,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    actions.close();
    return;
  }

  const target = event.target as Partial<HTMLElement> | null;
  const tagName = target?.tagName?.toLowerCase();
  const isTextEditing =
    tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable;
  if (isTextEditing) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    actions.focusLauncher();
  }
}

export class SageOsOverlayApp extends LitElement {
  static properties = {
    surface: { state: true },
    overlayConnected: { state: true },
    loading: { state: true },
    error: { state: true },
    sageOsState: { state: true },
    launcherCommand: { state: true },
    workspaceTarget: { state: true },
  };

  private controller: SageOsOverlayController | null = null;
  private surface = readInitialOverlaySurface();
  private layout = readOverlayLayoutSettings();
  private interaction = readOverlayInteractionSettings();
  private overlayConnected = false;
  private loading = false;
  private error: string | null = null;
  private sageOsState: SageOsOverlayStatusState | null = null;
  private launcherCommand = "";
  private workspaceTarget: AgentWorkspaceTarget | null = null;
  private interactivePointerActive = false;
  private readonly onOverlayKeyDown = (event: KeyboardEvent) =>
    handleOverlayKeyboardShortcut(event, {
      close: () => void window.sageOsOverlay?.close(),
      focusLauncher: () => this.focusLauncher(),
    });
  private readonly onOverlayPointerMove = (event: MouseEvent) => this.syncInteractivePointer(event);

  protected createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.syncSurfaceAttribute();
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
    window.sageOsOverlay?.onSurface((surface) => this.setSurface(surface));
    window.addEventListener("keydown", this.onOverlayKeyDown);
    window.addEventListener("mousemove", this.onOverlayPointerMove);
    controller.start();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onOverlayKeyDown);
    window.removeEventListener("mousemove", this.onOverlayPointerMove);
    this.controller?.stop();
    this.controller = null;
    super.disconnectedCallback();
  }

  render() {
    const model = this.sageOsState
      ? renderOverlayModel(this.sageOsState, {
          workspaceTarget: this.workspaceTarget ?? undefined,
          pinnedWidgets: this.layout.pinnedWidgets,
        })
      : null;
    const surfaceVisibility = getOverlaySurfaceVisibility(this.surface);

    return html`
      <main class=${`overlay-shell overlay-shell--${this.surface}`}>
        ${surfaceVisibility.toolbar ? this.renderToolbar() : nothing}
        <section class="overlay-content">
          ${this.error
            ? html`<section class="overlay-callout overlay-callout--error">${this.error}</section>`
            : nothing}
          ${this.loading
            ? html`<section class="overlay-callout overlay-callout--loading">Loading SageOS state...</section>`
            : nothing}
          ${model
            ? html`
                ${surfaceVisibility.launcher ? this.renderLauncher() : nothing}
                ${surfaceVisibility.pinnedWidgets
                  ? renderPinnedWidgets(model.pinnedWidgets, this.layout.collapsedEdge)
                  : nothing}
                ${surfaceVisibility.commandDeck ? renderCommandDeck(model.commandDeck.cards) : nothing}
                ${surfaceVisibility.overview ? this.renderOverviewGroups(model.overview) : nothing}
                ${surfaceVisibility.operationalRows
                  ? this.renderOperationalRows(model.commandDeck)
                  : nothing}
                ${surfaceVisibility.agentWorkspace
                  ? renderAgentWorkspace(model.workspace, {
                      onAction: (action) => void this.runWorkspaceAction(action),
                    })
                  : nothing}
                ${surfaceVisibility.compactHud ? renderCompactHud(model.hud.badges) : nothing}
                ${surfaceVisibility.edgeRail
                  ? renderEdgeRail(model.edgeRail.badges, this.layout.collapsedEdge)
                  : nothing}
              `
            : html`<section class="overlay-callout overlay-callout--empty">Waiting for SageOS gateway state.</section>`}
        </section>
      </main>
    `;
  }

  protected updated() {
    this.syncSurfaceAttribute();
  }

  private setSurface(surface: unknown) {
    const next = normalizeOverlaySurface(surface);
    if (this.surface === next) {
      return;
    }
    this.surface = next;
    this.syncSurfaceAttribute();
    this.requestUpdate();
  }

  private syncSurfaceAttribute() {
    this.dataset.surface = this.surface;
  }

  private syncInteractivePointer(event: MouseEvent) {
    const element = this.ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const active = isOverlayInteractiveElement(element);
    if (active === this.interactivePointerActive) {
      return;
    }
    this.interactivePointerActive = active;
    void window.sageOsOverlay?.setInteractivePointer(active);
  }

  private renderToolbar() {
    const isCommandDeck = this.surface === "commandDeck";
    return html`
      <nav class=${`overlay-toolbar overlay-toolbar--${this.surface}`} aria-label="SageOS overlay controls">
        <span class="overlay-connection">${this.overlayConnected ? "Connected" : "Connecting"}</span>
        ${isCommandDeck
          ? html`
              <button class="overlay-button" type="button" @click=${() => void this.controller?.pause()}>Pause</button>
              <button
                class="overlay-button overlay-button--primary"
                type="button"
                @click=${() => void this.controller?.resume()}
              >
                Resume
              </button>
              <button
                class="overlay-button overlay-button--danger"
                type="button"
                @click=${() => void this.controller?.emergencyStop()}
              >
                Emergency stop
              </button>
            `
          : nothing}
        <button
          class="overlay-button overlay-button--primary"
          type="button"
          @click=${() => window.sageOsOverlay?.expand()}
        >
          Full
        </button>
        ${isCommandDeck
          ? html`<button class="overlay-button" type="button" @click=${() => window.sageOsOverlay?.collapse()}>Rail</button>`
          : nothing}
        <button class="overlay-button" type="button" @click=${() => window.sageOsOverlay?.close()}>Close</button>
      </nav>
    `;
  }

  private renderLauncher() {
    return renderUniversalLauncher({
      value: this.launcherCommand,
      disabled: this.loading || !this.overlayConnected,
      voiceEnabled: this.interaction.voice.enabled,
      onInput: (value) => {
        this.launcherCommand = value;
      },
      onRun: () => void this.runLauncherCommand(),
      onVoice: () => this.focusLauncher(),
    });
  }

  private async runLauncherCommand() {
    const command = this.launcherCommand.trim();
    if (!command || !this.controller) {
      return;
    }
    await this.controller.sendLauncherCommand(command);
    if (!this.controller.state.error) {
      this.launcherCommand = "";
    }
    this.requestUpdate();
  }

  private focusLauncher() {
    this.renderRoot.querySelector<HTMLInputElement>('input[aria-label="SageOS command"]')?.focus();
  }

  private renderOverviewGroups(groups: ReturnType<typeof renderOverlayModel>["overview"]) {
    return html`
      <section class="overview-grid">
        ${groups.map(
          (group) => html`
            <article class="overlay-panel overlay-panel--focus overview-panel">
              <div class="overlay-panel__header">
                <h2>${group.title}</h2>
              </div>
              ${group.rows.map(
                (row) => html`
                  <div class="overview-row">
                    <span class="overview-row__label">${row.label}</span>
                    <span class="overview-row__value">${row.value}</span>
                    <span class="overview-row__detail">${row.detail}</span>
                  </div>
                `,
              )}
            </article>
          `,
        )}
      </section>
    `;
  }

  private renderOperationalRows(commandDeck: ReturnType<typeof renderOverlayModel>["commandDeck"]) {
    return html`
      <section class="operational-grid">
        <article class="overlay-panel overlay-panel--focus">
          <div class="overlay-panel__header">
            <h2>Active Operations</h2>
            <button
              class="overlay-button overlay-button--primary"
              type="button"
              @click=${() => void this.controller?.runNextTask()}
            >
              Run next
            </button>
          </div>
          ${commandDeck.tasks.length === 0
            ? html`<p class="overlay-muted">No tracked SageOS tasks.</p>`
            : commandDeck.tasks.map(
                (task) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${task.title}</div>
                      <div class="overlay-row__detail">${task.detail}</div>
                      <div class="overlay-row__meta">${task.id} / ${task.state} / ${task.owner}</div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        class="overlay-button"
                        type="button"
                        @click=${() => this.openWorkspace({ kind: "task", id: task.id })}
                      >
                        Open
                      </button>
                      <button
                        class="overlay-button overlay-button--primary"
                        type="button"
                        ?disabled=${!task.canQueue}
                        @click=${() => void this.controller?.queueTask(task.id)}
                      >
                        Queue
                      </button>
                      <button
                        class="overlay-button"
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

        <article class="overlay-panel overlay-panel--summit">
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
                        class="overlay-button"
                        type="button"
                        @click=${() =>
                          this.openWorkspace({ kind: "approval", id: approval.id })}
                      >
                        Open
                      </button>
                      <button
                        class="overlay-button overlay-button--primary"
                        type="button"
                        @click=${() => void this.controller?.approveApproval(approval.id)}
                      >
                        Approve
                      </button>
                      <button
                        class="overlay-button"
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

        <article class="overlay-panel overlay-panel--focus">
          <div class="overlay-panel__header">
            <h2>Night Shift</h2>
          </div>
          ${commandDeck.codingReports.length === 0
            ? html`<p class="overlay-muted">No coding reports yet.</p>`
            : commandDeck.codingReports.map(
                (report) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${report.title}</div>
                      <div class="overlay-row__detail">${report.detail}</div>
                      <div class="overlay-row__meta">${report.id} / ${report.outcome}</div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        class="overlay-button"
                        type="button"
                        @click=${() =>
                          this.openWorkspace({ kind: "codingReport", id: report.id })}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                `,
              )}
        </article>

        <article class="overlay-panel overlay-panel--summit">
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
                        class="overlay-button"
                        type="button"
                        @click=${() =>
                          this.openWorkspace({ kind: "incident", id: incident.id })}
                      >
                        Open
                      </button>
                      <button
                        class=${`overlay-button ${incident.canRepair ? "overlay-button--primary" : ""}`}
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

        <article class="overlay-panel overlay-panel--focus">
          <div class="overlay-panel__header">
            <h2>Resources</h2>
          </div>
          ${commandDeck.resources.length === 0
            ? html`<p class="overlay-muted">No SageOS resources yet.</p>`
            : commandDeck.resources.map(
                (resource) => html`
                  <div class="overlay-row">
                    <div>
                      <div class="overlay-row__title">${resource.title}</div>
                      <div class="overlay-row__detail">${resource.detail}</div>
                      <div class="overlay-row__meta">
                        ${resource.kind} / ${resource.state}
                      </div>
                    </div>
                    <div class="overlay-row__actions">
                      <button
                        class="overlay-button"
                        type="button"
                        @click=${() =>
                          this.openWorkspace({ kind: resource.kind, id: resource.id })}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                `,
              )}
        </article>

        <article class="overlay-panel overlay-panel--focus">
          <div class="overlay-panel__header">
            <h2>System</h2>
          </div>
          ${commandDeck.systemResources.map(
            (resource) => html`
              <div class="overlay-row">
                <div>
                  <div class="overlay-row__title">${resource.title}</div>
                  <div class="overlay-row__detail">${resource.detail}</div>
                  <div class="overlay-row__meta">${resource.state}</div>
                </div>
                <div class="overlay-row__actions">
                  <button
                    class="overlay-button"
                    type="button"
                    @click=${() => this.openWorkspace({ kind: "system", id: resource.id })}
                  >
                    Open
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

  private openWorkspace(target: AgentWorkspaceTarget) {
    this.workspaceTarget = target;
    this.requestUpdate();
  }

  private async runWorkspaceAction(action: AgentWorkspaceAction) {
    if (!action.enabled) {
      return;
    }

    if (action.kind === "assignEmployeeTask" && action.target.kind === "employee") {
      this.prefillEmployeeTaskAssignment(action.target.id);
      return;
    }

    if (!this.controller) {
      return;
    }

    if (action.kind === "queueTask" && action.target.kind === "task") {
      await this.controller.queueTask(action.target.id);
    } else if (action.kind === "cancelTask" && action.target.kind === "task") {
      await this.controller.cancelTask(action.target.id);
    } else if (action.kind === "approveApproval" && action.target.kind === "approval") {
      await this.controller.approveApproval(action.target.id);
    } else if (action.kind === "denyApproval" && action.target.kind === "approval") {
      await this.controller.denyApproval(action.target.id);
    } else if (action.kind === "activateEmployee" && action.target.kind === "employee") {
      await this.controller.activateEmployee(action.target.id);
    } else if (action.kind === "pauseEmployee" && action.target.kind === "employee") {
      await this.controller.pauseEmployee(action.target.id);
    } else if (action.kind === "resumeEmployee" && action.target.kind === "employee") {
      await this.controller.resumeEmployee(action.target.id);
    } else if (action.kind === "retireEmployee" && action.target.kind === "employee") {
      await this.controller.retireEmployee(action.target.id);
    } else if (action.kind === "runIncidentRepair" && action.target.kind === "incident") {
      await this.controller.runIncidentRepair(action.target.id);
    }
  }

  private prefillEmployeeTaskAssignment(employeeId: string) {
    const employee = this.sageOsState?.agents?.find((entry) => entry.id === employeeId);
    this.launcherCommand = `Assign ${employee?.name ?? labelFromId(employeeId)} to `;
    this.requestUpdate();
    void this.updateComplete.then(() => this.focusLauncher());
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

function buildOverviewGroups(
  status: SageOsOverlayStatusState["status"],
): OverlayOverviewGroup[] {
  const urgentIncidents = countUrgentIncidents(status);
  const warningIncidents = status.incidents.filter(
    (incident) => incident.severity === "warning",
  ).length;

  return [
    {
      title: "Workforce",
      rows: [
        summaryRow("Employees", status.employees),
        summaryRow("Tasks", status.tasks),
        runSummaryRow("Runs", status.runs),
        summaryRow("Workflows", status.workflows),
        summaryRow("Skills", status.skills),
        summaryRow("Apps", status.apps),
      ],
    },
    {
      title: "Computer",
      rows: [
        {
          label: "Observations",
          value: `${status.observations.recent} recent`,
          detail: [
            `${status.observations.total} total`,
            `${status.observations.failed} failed`,
            `${status.observations.redacted} redacted`,
          ].join(" / "),
        },
        {
          label: "Security",
          value: `${urgentIncidents} urgent`,
          detail: `${warningIncidents} warnings / ${status.incidents.length} incidents`,
        },
        {
          label: "Sources",
          value: `${status.sources.enabled.length} enabled`,
          detail: `${status.sources.disabled.length} disabled / ${status.sources.failing.length} failing`,
        },
        {
          label: "Coding",
          value: status.coding.enabled ? "Enabled" : "Disabled",
          detail: `${status.coding.reports.total} reports / ${status.coding.allowedRepos.length} repos`,
        },
        {
          label: "Policy",
          value: status.policy.mode,
          detail: status.policy.approvalsRequired.join(", ") || "No extra approvals",
        },
      ],
    },
    {
      title: "Memory",
      rows: [
        {
          label: "Memory",
          value: status.memory.status,
          detail: [
            `${status.memory.captureQueue.pending} pending`,
            `${status.memory.captureQueue.failed} failed`,
            status.memory.backend,
          ].join(" / "),
        },
        {
          label: "Learning",
          value: status.learning.status,
          detail: `${status.learning.activityQueue.pending} pending / ${status.learning.activityQueue.failed} failed`,
        },
        {
          label: "Notifications",
          value: `${status.notifications.urgentPending} urgent`,
          detail: status.notifications.telegram.enabled ? "Telegram enabled" : "Telegram disabled",
        },
        {
          label: "Audit",
          value: `${status.audit.recentEvents} events`,
          detail: status.audit.eventLogPath ?? "Event log pending",
        },
      ],
    },
  ];
}

function countUrgentIncidents(status: SageOsOverlayStatusState["status"]): number {
  return status.incidents.filter(
    (incident) => incident.severity === "critical" || incident.severity === "error",
  ).length;
}

function buildResourceRows(state: SageOsOverlayStatusState): OverlayResourceRow[] {
  return [
    ...(state.agents ?? []).map((agent) => ({
      id: agent.id,
      kind: "employee" as const,
      title: agent.name,
      detail: agent.mission,
      state: agent.status,
    })),
    ...(state.runs ?? []).map((run) => ({
      id: run.id,
      kind: "run" as const,
      title: run.id,
      detail: `${run.taskId} / attempt ${run.attempt}`,
      state: run.state,
    })),
    ...(state.workflows ?? []).map((workflow) => ({
      id: workflow.id,
      kind: "workflow" as const,
      title: workflow.name,
      detail: workflow.trigger,
      state: workflow.state,
    })),
    ...(state.skills ?? []).map((skill) => ({
      id: skill.id,
      kind: "skill" as const,
      title: skill.name,
      detail: skill.triggerConditions?.join(", ") || skill.workflowId || "No trigger",
      state: skill.state,
    })),
    ...(state.apps ?? []).map((app) => ({
      id: app.id,
      kind: "app" as const,
      title: app.name,
      detail: app.purpose,
      state: app.state,
    })),
    ...(state.observations ?? []).map((observation) => ({
      id: observation.id,
      kind: "observation" as const,
      title: observation.title,
      detail: observation.text,
      state: observation.state,
    })),
    ...(state.collaborations ?? []).map((collaboration) => ({
      id: collaboration.id,
      kind: "collaboration" as const,
      title: collaboration.title,
      detail: collaboration.summary,
      state: collaboration.state,
    })),
  ];
}

function buildSystemResourceRows(
  status: SageOsOverlayStatusState["status"],
): OverlaySystemResourceRow[] {
  return [
    {
      id: "supervisor",
      title: "Supervisor",
      detail: status.supervisor.paused ? "Paused" : "Running",
      state: status.supervisor.state,
    },
    {
      id: "memory",
      title: "Memory",
      detail: `${status.memory.captureQueue.pending} pending / ${status.memory.captureQueue.failed} failed`,
      state: status.memory.status,
    },
    {
      id: "learning",
      title: "Learning",
      detail: `${status.learning.activityQueue.pending} pending / ${status.learning.activityQueue.failed} failed`,
      state: status.learning.status,
    },
    {
      id: "sources",
      title: "Sources",
      detail: `${status.sources.enabled.length} enabled / ${status.sources.failing.length} failing`,
      state: status.sources.failing.length > 0 ? "degraded" : "ok",
    },
    {
      id: "policy",
      title: "Policy",
      detail: status.policy.approvalsRequired.join(", ") || "No extra approvals",
      state: status.policy.mode,
    },
    {
      id: "notifications",
      title: "Notifications",
      detail: status.notifications.telegram.enabled ? "Telegram enabled" : "Telegram disabled",
      state: `${status.notifications.urgentPending} urgent`,
    },
    {
      id: "audit",
      title: "Audit",
      detail: status.audit.eventLogPath ?? "Event log pending",
      state: `${status.audit.recentEvents} events`,
    },
  ];
}

function buildWorkspaceModel(
  state: SageOsOverlayStatusState,
  target: AgentWorkspaceTarget | undefined,
): AgentWorkspaceView {
  if (!target) {
    return {
      title: "Agent Workspace",
      eyebrow: "Selection",
      detail: "Select an operation, approval, or incident to inspect scope, evidence, and actions.",
      facts: [
        { label: "Active tasks", value: String(state.status.tasks.active) },
        { label: "Pending approvals", value: String(state.status.approvals.pending) },
        { label: "Incidents", value: String(state.status.incidents.length) },
      ],
      actions: [],
    };
  }

  if (target.kind === "task") {
    const task = state.tasks?.find((entry) => entry.id === target.id);
    if (!task) {
      return missingWorkspaceTarget(target);
    }
    const canQueue = task.state === "proposed" || task.state === "waiting_for_policy";
    const canCancel = !["completed", "failed", "cancelled", "expired"].includes(task.state);
    return {
      title: task.title,
      eyebrow: `Task / ${task.state}`,
      detail: task.objective,
      facts: [
        { label: "Objective", value: task.objective },
        { label: "Owner", value: ownerLabelForState(state, task.ownerAgentId) },
        { label: "Autonomy", value: task.autonomyTier ?? "Unknown" },
        { label: "Requested by", value: task.requestedBy ?? "Unknown" },
        { label: "Policy scope", value: formatPolicyScopes(task.policyScopes ?? []) },
      ],
      actions: [
        ...(canQueue
          ? [
              {
                kind: "queueTask",
                label: "Queue",
                enabled: true,
                target,
              } satisfies AgentWorkspaceAction,
            ]
          : []),
        {
          kind: "cancelTask",
          label: "Cancel",
          enabled: canCancel,
          target,
        },
      ],
    };
  }

  if (target.kind === "employee") {
    const employee = state.agents?.find((entry) => entry.id === target.id);
    if (!employee) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: employee.name,
      eyebrow: `Employee / ${employee.status}`,
      detail: employee.mission,
      facts: [
        { label: "Role", value: employee.role },
        { label: "Autonomy", value: employee.autonomyTier },
        { label: "Responsibilities", value: employee.responsibilities?.join(", ") || "None" },
        { label: "Assigned tasks", value: assignedTasksSummary(state.tasks ?? [], employee.id) },
        { label: "Tools", value: employee.tools?.join(", ") || "None" },
        { label: "Memory", value: employee.memoryScopes?.join(", ") || "None" },
        { label: "Schedules", value: employee.schedules?.join(", ") || "Manual" },
        { label: "Risks", value: employee.risks?.join(", ") || "None" },
        { label: "Allowed scopes", value: formatPolicyScopes(employee.allowedScopes ?? []) },
        { label: "Denied scopes", value: formatPolicyScopes(employee.deniedScopes ?? []) },
      ],
      actions: buildEmployeeWorkspaceActions(target, employee.status),
    };
  }

  if (target.kind === "run") {
    const run = state.runs?.find((entry) => entry.id === target.id);
    if (!run) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: run.id,
      eyebrow: `Run / ${run.state}`,
      detail: `${run.taskId} / ${run.traceId}`,
      facts: [
        { label: "Task", value: run.taskId },
        { label: "Attempt", value: String(run.attempt) },
        { label: "Started", value: run.startedAt ?? "Not started" },
        { label: "Finished", value: run.finishedAt ?? "Not finished" },
        { label: "Error", value: run.error ?? "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "approval") {
    const approval = state.approvals?.find((entry) => entry.id === target.id);
    if (!approval) {
      return missingWorkspaceTarget(target);
    }
    const pending = approval.state === "pending";
    const evidence = Array.isArray(approval.evidence) ? approval.evidence : [];
    return {
      title: approval.title,
      eyebrow: `Approval / ${approval.state}`,
      detail: approval.proposedAction,
      facts: [
        { label: "Action", value: approval.proposedAction },
        { label: "Risk", value: approval.riskClass },
        { label: "Requested by", value: approval.requestedBy ?? "Unknown" },
        { label: "Evidence", value: evidence.join(", ") || "None" },
      ],
      actions: [
        { kind: "approveApproval", label: "Approve", enabled: pending, target },
        { kind: "denyApproval", label: "Deny", enabled: pending, target },
      ],
    };
  }

  if (target.kind === "codingReport") {
    const report = state.codingReports?.find((entry) => entry.id === target.id);
    if (!report) {
      return missingWorkspaceTarget(target);
    }
    const changedFiles = report.diff?.changedFiles ?? [];
    const tests = report.tests ?? [];
    const blockers = report.blockers ?? [];
    return {
      title: report.objective,
      eyebrow: `Coding report / ${report.outcome}`,
      detail: `${report.repoPath} / ${changedFiles.length} changed file(s)`,
      facts: [
        { label: "Outcome", value: report.outcome },
        { label: "Repo", value: report.repoPath },
        { label: "Changed files", value: changedFiles.join(", ") || "None" },
        {
          label: "Tests",
          value: tests.map((test) => `${test.command}: ${test.exitCode}`).join(", ") || "None",
        },
        { label: "Blockers", value: blockers.join("; ") || "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "workflow") {
    const workflow = state.workflows?.find((entry) => entry.id === target.id);
    if (!workflow) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: workflow.name,
      eyebrow: `Workflow / ${workflow.state}`,
      detail: workflow.trigger,
      facts: [
        { label: "Pattern", value: workflow.observedPattern },
        { label: "Inputs", value: workflow.inputs?.join(", ") || "None" },
        { label: "Outputs", value: workflow.outputs?.join(", ") || "None" },
        {
          label: "Observations",
          value: workflow.sourceObservationIds?.join(", ") || "None",
        },
      ],
      actions: [],
    };
  }

  if (target.kind === "skill") {
    const skill = state.skills?.find((entry) => entry.id === target.id);
    if (!skill) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: skill.name,
      eyebrow: `Skill / ${skill.state}`,
      detail: skill.triggerConditions?.join(", ") || "No trigger conditions",
      facts: [
        { label: "Workflow", value: skill.workflowId ?? "None" },
        { label: "Provenance", value: skill.provenance?.join(", ") || "None" },
        { label: "Tests", value: skill.tests?.join(", ") || "None" },
        { label: "Rollback", value: skill.rollbackRef ?? "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "app") {
    const app = state.apps?.find((entry) => entry.id === target.id);
    if (!app) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: app.name,
      eyebrow: `App / ${app.state}`,
      detail: app.purpose,
      facts: [
        { label: "Surface", value: app.targetSurface },
        { label: "Preview", value: app.previewCommand ?? "None" },
        { label: "Artifacts", value: app.artifactRefs?.join(", ") || "None" },
        { label: "Sources", value: app.sourceObservationIds?.join(", ") || "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "observation") {
    const observation = state.observations?.find((entry) => entry.id === target.id);
    if (!observation) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: observation.title,
      eyebrow: `Observation / ${observation.source}`,
      detail: observation.text,
      facts: [
        { label: "State", value: observation.state },
        { label: "Observed", value: observation.observedAt },
        { label: "Sensitivity", value: observation.sensitivity ?? "Unknown" },
        { label: "Reason", value: observation.reason ?? "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "collaboration") {
    const collaboration = state.collaborations?.find((entry) => entry.id === target.id);
    if (!collaboration) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: collaboration.title,
      eyebrow: `Collaboration / ${collaboration.kind}`,
      detail: collaboration.summary,
      facts: [
        { label: "State", value: collaboration.state },
        { label: "From", value: collaboration.fromAgentId },
        { label: "To", value: collaboration.toAgentId ?? "None" },
        { label: "Artifacts", value: collaboration.artifactRefs?.join(", ") || "None" },
      ],
      actions: [],
    };
  }

  if (target.kind === "system") {
    return systemWorkspaceModel(state.status, target.id);
  }

  const incident = state.status.incidents.find((entry) => entry.id === target.id);
  if (!incident) {
    return missingWorkspaceTarget(target);
  }
  return {
    title: incident.title,
    eyebrow: `Incident / ${incident.severity}`,
    detail: incident.summary,
    facts: [
      { label: "Severity", value: incident.severity },
      { label: "Auto repair", value: incident.autoRepairSafe ? "Safe" : "Review required" },
      {
        label: "Repair method",
        value: incident.repairAction?.gatewayMethod ?? "No repair method",
      },
      { label: "Last seen", value: incident.lastSeenAt ?? "Unknown" },
    ],
    actions: [
      {
        kind: "runIncidentRepair",
        label: incident.repairAction?.label ?? "Run repair",
        enabled: canRunSageOsIncidentRepair(incident),
        target,
      },
    ],
  };
}

function buildPinnedWidgets(
  status: SageOsOverlayStatusState["status"],
  pinnedWidgets: readonly SageOsOverlayWidgetId[] = DEFAULT_PINNED_WIDGETS,
): PinnedWidgetView[] {
  const urgentIncidents = countUrgentIncidents(status);
  const warningIncidents = status.incidents.filter(
    (incident) => incident.severity === "warning",
  ).length;
  const failingSources = status.sources.failing.length;
  const widgetCatalog: Record<SageOsOverlayWidgetId, PinnedWidgetView> = {
    activeOperations: {
      id: "activeOperations",
      title: "Active Operations",
      value: String(status.tasks.active),
      detail: `${status.tasks.queued} queued / ${status.tasks.blocked} blocked`,
    },
    approvals: {
      id: "approvals",
      title: "Approvals",
      value: String(status.approvals.pending),
      detail: "Pending decisions",
    },
    incidents: {
      id: "incidents",
      title: "Incidents",
      value: String(status.incidents.length),
      detail: `${urgentIncidents} urgent / ${warningIncidents} warning`,
    },
    memoryQueue: {
      id: "memoryQueue",
      title: "Memory Queue",
      value: String(status.memory.captureQueue.pending),
      detail: `${status.memory.captureQueue.failed} failed / ${status.memory.captureQueue.total} total`,
    },
    nightShift: {
      id: "nightShift",
      title: "Night Shift",
      value: `${status.coding.reports.queued} queued`,
      detail: `${status.coding.reports.active} active / ${status.coding.reports.blocked} blocked`,
    },
    systemHealth: {
      id: "systemHealth",
      title: "System Health",
      value: failingSources > 0 || urgentIncidents > 0 ? "Degraded" : "OK",
      detail: `${failingSources} failing source / ${urgentIncidents} urgent incidents`,
    },
    appPreview: {
      id: "appPreview",
      title: "App Preview",
      value: `${status.apps.active} active`,
      detail: `${status.apps.total} total / ${status.apps.blocked} blocked`,
    },
  };

  return pinnedWidgets.map((widget) => widgetCatalog[widget]);
}

function systemWorkspaceModel(
  status: SageOsOverlayStatusState["status"],
  id: string,
): AgentWorkspaceView {
  if (id === "supervisor") {
    return {
      title: "Supervisor",
      eyebrow: `System / ${status.supervisor.state}`,
      detail: status.supervisor.paused ? "SageOS autonomous work is paused." : "SageOS is running.",
      facts: [
        { label: "Enabled", value: String(status.supervisor.enabled) },
        { label: "Paused", value: String(status.supervisor.paused) },
        { label: "Last tick", value: status.supervisor.lastTickAt ?? "None" },
        { label: "Next tick", value: status.supervisor.nextTickAt ?? "None" },
      ],
      actions: [],
    };
  }

  if (id === "memory") {
    return {
      title: "Memory",
      eyebrow: `System / ${status.memory.status}`,
      detail: `${status.memory.backend} is canonical through ${status.memory.canonical}.`,
      facts: [
        {
          label: "Capture queue",
          value: `${status.memory.captureQueue.pending} pending / ${status.memory.captureQueue.failed} failed`,
        },
        { label: "Queue total", value: String(status.memory.captureQueue.total) },
        { label: "Queue path", value: status.memory.captureQueue.path ?? "Unknown" },
        { label: "Doctor", value: status.memory.doctor?.ok === false ? "Needs review" : "OK" },
      ],
      actions: [],
    };
  }

  if (id === "learning") {
    return {
      title: "Learning",
      eyebrow: `System / ${status.learning.status}`,
      detail: "Learning activity queue health and replay state.",
      facts: [
        {
          label: "Activity queue",
          value: `${status.learning.activityQueue.pending} pending / ${status.learning.activityQueue.failed} failed`,
        },
        { label: "Queue total", value: String(status.learning.activityQueue.total) },
        { label: "Queue path", value: status.learning.activityQueue.path ?? "Unknown" },
      ],
      actions: [],
    };
  }

  if (id === "sources") {
    return {
      title: "Sources",
      eyebrow: `System / ${status.sources.failing.length > 0 ? "degraded" : "ok"}`,
      detail: "Observation source enablement and failures.",
      facts: [
        { label: "Enabled", value: status.sources.enabled.join(", ") || "None" },
        { label: "Disabled", value: status.sources.disabled.join(", ") || "None" },
        { label: "Failing", value: status.sources.failing.join(", ") || "None" },
      ],
      actions: [],
    };
  }

  if (id === "policy") {
    return {
      title: "Policy",
      eyebrow: `System / ${status.policy.mode}`,
      detail: `Default autonomy tier: ${status.policy.defaultTier}.`,
      facts: [
        { label: "Mode", value: status.policy.mode },
        { label: "Default tier", value: status.policy.defaultTier },
        {
          label: "Approvals",
          value: status.policy.approvalsRequired.join(", ") || "No extra approvals",
        },
      ],
      actions: [],
    };
  }

  if (id === "notifications") {
    return {
      title: "Notifications",
      eyebrow: `System / ${status.notifications.telegram.enabled ? "enabled" : "disabled"}`,
      detail: "Telegram and urgent notification state.",
      facts: [
        { label: "Telegram", value: status.notifications.telegram.enabled ? "Enabled" : "Disabled" },
        { label: "Target", value: status.notifications.telegram.target ?? "None" },
        { label: "Urgent pending", value: String(status.notifications.urgentPending) },
      ],
      actions: [],
    };
  }

  if (id === "audit") {
    return {
      title: "Audit",
      eyebrow: "System / events",
      detail: status.audit.eventLogPath ?? "Event log path is pending.",
      facts: [
        { label: "Recent events", value: String(status.audit.recentEvents) },
        { label: "Event log", value: status.audit.eventLogPath ?? "None" },
      ],
      actions: [],
    };
  }

  return missingWorkspaceTarget({ kind: "system", id });
}

function missingWorkspaceTarget(target: AgentWorkspaceTarget): AgentWorkspaceView {
  return {
    title: "Selection unavailable",
    eyebrow: `${target.kind} / missing`,
    detail: "The selected record is no longer present in the latest SageOS state.",
    facts: [{ label: "ID", value: target.id }],
    actions: [],
  };
}

function ownerLabelForState(state: SageOsOverlayStatusState, ownerAgentId: string | undefined): string {
  return ownerLabel(
    ownerAgentId,
    new Map((state.agents ?? []).map((agent) => [agent.id, agent.name])),
  );
}

function ownerLabel(ownerAgentId: string | undefined, employeeNames: Map<string, string>): string {
  if (!ownerAgentId) {
    return "Unassigned";
  }
  return employeeNames.get(ownerAgentId) ?? ownerAgentId;
}

function assignedTasksSummary(
  tasks: NonNullable<SageOsOverlayStatusState["tasks"]>,
  employeeId: string,
): string {
  const assigned = tasks.filter((task) => task.ownerAgentId === employeeId);
  if (assigned.length === 0) {
    return "None";
  }
  const visible = assigned.slice(0, 3).map((task) => `${task.title} (${task.state})`);
  return assigned.length > visible.length
    ? `${visible.join(", ")}, +${assigned.length - visible.length} more`
    : visible.join(", ");
}

function labelFromId(id: string): string {
  return id
    .replace(/^employee_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildEmployeeWorkspaceActions(
  target: AgentWorkspaceTarget,
  status: NonNullable<SageOsOverlayStatusState["agents"]>[number]["status"],
): AgentWorkspaceAction[] {
  const assignAction = {
    kind: "assignEmployeeTask",
    label: "Assign task",
    enabled: status !== "retired" && status !== "disabled",
    target,
  } satisfies AgentWorkspaceAction;
  if (status === "active") {
    return [
      assignAction,
      { kind: "pauseEmployee", label: "Pause", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "paused") {
    return [
      assignAction,
      { kind: "resumeEmployee", label: "Resume", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "draft") {
    return [
      assignAction,
      { kind: "activateEmployee", label: "Activate", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "disabled") {
    return [{ kind: "retireEmployee", label: "Retire", enabled: true, target }];
  }
  return [];
}

function formatPolicyScopes(
  scopes: { kind: string; allow?: string[]; deny?: string[]; risk?: string }[],
): string {
  if (scopes.length === 0) {
    return "None";
  }
  return scopes
    .map((scope) => {
      const mode = scope.deny?.length ? `deny ${scope.deny.join("|")}` : scope.allow?.join("|") || "*";
      return `${scope.kind}:${mode} (${scope.risk ?? "low"})`;
    })
    .join(", ");
}

function summaryRow(
  label: string,
  summary: { total: number; active: number; blocked: number },
): OverlayOverviewRow {
  return {
    label,
    value: `${summary.active} active`,
    detail: `${summary.total} total / ${summary.blocked} blocked`,
  };
}

function runSummaryRow(
  label: string,
  summary: { total: number; active: number; failed: number },
): OverlayOverviewRow {
  return {
    label,
    value: `${summary.active} active`,
    detail: `${summary.total} total / ${summary.failed} failed`,
  };
}
