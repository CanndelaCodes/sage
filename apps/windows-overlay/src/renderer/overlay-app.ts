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
  AgentWorkspaceActionKind,
  AgentWorkspaceTarget,
  AgentWorkspaceView,
} from "./components/agent-workspace.js";
import { renderCommandDeck } from "./components/command-deck.js";
import { renderCompactHud } from "./components/compact-hud.js";
import { renderEdgeRail, type EdgeRailBadge } from "./components/edge-rail.js";
import { renderPinnedWidgets } from "./components/pinned-widgets.js";
import type { PinnedWidgetView } from "./components/pinned-widgets.js";
import {
  renderUniversalLauncher,
  type UniversalLauncherQuickAction,
} from "./components/universal-launcher.js";
import { OverlayGatewayBrowserClient } from "./gateway-client.js";
import { SageOsOverlayController } from "./overlay-controller.js";
import { canRunSageOsIncidentRepair } from "./sageos-actions.js";
import type { SageOsOverlayStatusState } from "./sageos-actions.js";

export type OverlaySurface = "commandDeck" | "hud" | "edgeRail";
export type OverlayToolbarControlKind =
  | "pause"
  | "resume"
  | "stop"
  | "emergencyStop"
  | "expand"
  | "collapse"
  | "close";
export type OverlayToolbarControl = {
  kind: OverlayToolbarControlKind;
  label: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  disabledReason?: string;
};
export type OverlayToolbarAvailability = {
  connected: boolean;
  loading: boolean;
};
export type OverlayGatewayActionState = {
  enabled: boolean;
  disabledReason?: string;
};
export type OverlayGatewayActionStateParams = {
  enabled: boolean;
  disabledReason?: string;
  availability: OverlayToolbarAvailability;
};
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
export type OverlayHudView = {
  title: string;
  detail: string;
  status: string;
  target: AgentWorkspaceTarget;
  badges: OverlayBadge[];
};
export type OverlayConnectionTone = "neutral" | "success" | "loading" | "warning" | "error";
export type OverlayConnectionState = {
  label: string;
  detail: string;
  tone: OverlayConnectionTone;
};
export type OverlayStateCalloutTone =
  | "loading"
  | "error"
  | "empty"
  | "success"
  | "warning"
  | "critical"
  | "degraded";
export type OverlayStateCallout = {
  message: string;
  tone: OverlayStateCalloutTone;
};
export type OverlayConnectionStateParams = {
  connected: boolean;
  loading: boolean;
  error: string | null;
  hasState: boolean;
};
export type OverlayOverviewRow = { label: string; value: string; detail: string };
export type OverlayOverviewGroup = { title: string; rows: OverlayOverviewRow[] };
export type OverlayTaskRow = {
  id: string;
  title: string;
  detail: string;
  state: string;
  owner: string;
  progress: string;
  canQueue: boolean;
  canCancel: boolean;
};
export type OverlayApprovalRow = {
  id: string;
  title: string;
  detail: string;
  risk: string;
  state: string;
  canResolve: boolean;
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
  | "repo"
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
  showApprovalBadge: boolean;
  showIncidentBadge: boolean;
};
export type OverlayInteractionSettings = {
  voice: {
    enabled: boolean;
    mode?: "pushToTalk";
  };
};
export type OverlaySpeechRecognitionScope = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};
type OverlaySpeechRecognitionConstructor = new () => OverlaySpeechRecognition;
type OverlaySpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang?: string;
  maxAlternatives?: number;
  addEventListener(type: "end" | "error" | "result", listener: (event: unknown) => void): void;
  start(): void;
  stop?: () => void;
};
export type RenderOverlayModelOptions = {
  workspaceTarget?: AgentWorkspaceTarget;
  pinnedWidgets?: SageOsOverlayWidgetId[];
  showApprovalBadge?: boolean;
  showIncidentBadge?: boolean;
};
type OverlayRunRecord = NonNullable<SageOsOverlayStatusState["runs"]>[number];

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
const TASK_OPERATOR_ACTIONS = [
  { kind: "pauseTask", label: "Pause" },
  { kind: "askTaskUpdate", label: "Ask for update" },
  { kind: "increaseTaskBudget", label: "Increase budget" },
  { kind: "reassignTask", label: "Reassign" },
  { kind: "requestTaskReview", label: "Request review" },
] satisfies { kind: TaskOperatorActionKind; label: string }[];

export type TaskOperatorActionKind = Extract<
  AgentWorkspaceActionKind,
  "pauseTask" | "askTaskUpdate" | "increaseTaskBudget" | "reassignTask" | "requestTaskReview"
>;
export type EmployeeOperatorActionKind = Extract<AgentWorkspaceActionKind, "editEmployee">;

export function renderOverlayModel(
  state: SageOsOverlayStatusState,
  opts: RenderOverlayModelOptions = {},
) {
  const status = state.status;
  const activeTasks = String(status.tasks.active);
  const pendingApprovals = String(status.approvals.pending);
  const incidents = String(status.incidents.length);
  const showApprovalBadge = opts.showApprovalBadge !== false;
  const showIncidentBadge = opts.showIncidentBadge !== false;
  const employeeNames = new Map((state.agents ?? []).map((agent) => [agent.id, agent.name]));
  const runs = state.runs ?? [];
  const taskRows = (state.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    detail: task.objective,
    state: task.state,
    owner: ownerLabel(task.ownerAgentId, employeeNames),
    progress: formatRunProgress(latestRunForTask(runs, task.id)),
    canQueue: task.state === "proposed" || task.state === "waiting_for_policy",
    canCancel: !["completed", "failed", "cancelled", "expired"].includes(task.state),
  }));
  const approvalRows = (state.approvals ?? []).map((approval) => ({
    id: approval.id,
    title: approval.title,
    detail: approval.proposedAction,
    risk: approval.riskClass,
    state: approval.state,
    canResolve: approval.state === "pending",
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
  const systemResourceRows = buildSystemResourceRows(state);
  const hudBadges: OverlayBadge[] = [{ label: "Tasks", value: activeTasks }];
  if (showApprovalBadge) {
    hudBadges.push({ label: "Approvals", value: pendingApprovals });
  }
  if (showIncidentBadge) {
    hudBadges.push({ label: "Incidents", value: incidents });
  }
  const firstApprovalTarget = firstApprovalWorkspaceTarget(approvalRows);
  const firstIncidentTarget = firstIncidentWorkspaceTarget(status.incidents);
  const edgeRailBadges: EdgeRailBadge[] = [
    {
      kind: "health",
      count: status.supervisor.state === "running" ? 0 : 1,
      target: { kind: "system", id: "supervisor" },
    },
    {
      kind: "activeOperation",
      count: status.tasks.active,
      target: defaultWorkspaceTarget(state) ?? { kind: "system", id: "supervisor" },
    },
  ];
  if (showApprovalBadge) {
    edgeRailBadges.push({
      kind: "approval",
      count: status.approvals.pending,
      target: firstApprovalTarget,
    });
  }
  if (showIncidentBadge) {
    edgeRailBadges.push({
      kind: "incident",
      count: status.incidents.length,
      target: firstIncidentTarget,
    });
  }

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
    launcher: {
      quickActions: buildUniversalLauncherQuickActions(state),
    },
    overview: buildOverviewGroups(status),
    workspace: buildWorkspaceModel(state, opts.workspaceTarget ?? defaultWorkspaceTarget(state)),
    pinnedWidgets: buildPinnedWidgets(status, opts.pinnedWidgets),
    hud: buildCompactHudView(state, hudBadges),
    edgeRail: {
      badges: edgeRailBadges,
    },
  };
}

function buildCompactHudView(
  state: SageOsOverlayStatusState,
  badges: OverlayBadge[],
): OverlayHudView {
  const target = defaultWorkspaceTarget(state) ?? { kind: "system", id: "supervisor" };
  if (target.kind === "run") {
    const run = state.runs?.find((entry) => entry.id === target.id);
    const task = run ? state.tasks?.find((entry) => entry.id === run.taskId) : undefined;
    if (run) {
      return {
        title: task?.title ?? run.id,
        detail: formatRunProgress(run),
        status: run.state,
        target,
        badges,
      };
    }
  }

  const status = state.status;
  return {
    title: status.supervisor.paused ? "SageOS paused" : "SageOS",
    detail: `${status.tasks.active} active / ${status.approvals.pending} approvals / ${status.incidents.length} incidents`,
    status: status.supervisor.state,
    target,
    badges,
  };
}

export function getOverlayConnectionState(
  params: OverlayConnectionStateParams,
): OverlayConnectionState {
  const error = normalizeOverlayErrorMessage(params.error);
  if (error) {
    return { label: "Error", detail: error, tone: "error" };
  }

  if (params.loading) {
    return params.hasState
      ? { label: "Refreshing", detail: "Updating SageOS gateway state", tone: "loading" }
      : { label: "Loading", detail: "Waiting for SageOS gateway state", tone: "loading" };
  }

  if (!params.connected) {
    return params.hasState
      ? {
          label: "Reconnecting",
          detail: "Showing last known SageOS state",
          tone: "warning",
        }
      : {
          label: "Connecting",
          detail: "Waiting for SageOS gateway connection",
          tone: "neutral",
        };
  }

  return params.hasState
    ? { label: "Connected", detail: "Live SageOS gateway state", tone: "success" }
    : { label: "Connected", detail: "Waiting for first SageOS state", tone: "loading" };
}

export function getOverlayStateCallouts(
  params: OverlayConnectionStateParams,
): OverlayStateCallout[] {
  const error = normalizeOverlayErrorMessage(params.error);
  if (error) {
    return [{ message: error, tone: "error" }];
  }

  if (params.loading) {
    return [
      {
        message: params.hasState ? "Refreshing SageOS state..." : "Loading SageOS state...",
        tone: "loading",
      },
    ];
  }

  if (!params.connected) {
    return params.hasState
      ? [
          {
            message: "Gateway disconnected. Showing last known SageOS state.",
            tone: "warning",
          },
        ]
      : [
          {
            message: "Waiting for SageOS gateway connection.",
            tone: "empty",
          },
        ];
  }

  return params.hasState
    ? []
    : [{ message: "Waiting for SageOS gateway state.", tone: "empty" }];
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
    showApprovalBadge: normalizeOverlayBoolean(params.get("showApprovalBadge"), true),
    showIncidentBadge: normalizeOverlayBoolean(params.get("showIncidentBadge"), true),
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

export function isOverlayVoiceInputAvailable(
  scope: OverlaySpeechRecognitionScope = globalThis as OverlaySpeechRecognitionScope,
) {
  return typeof scope.SpeechRecognition === "function" || typeof scope.webkitSpeechRecognition === "function";
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

function normalizeOverlayBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeOverlayErrorMessage(error: string | null): string | null {
  const message = error?.trim().replace(/^Error:\s*/i, "");
  return message || null;
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

export function getOverlayToolbarControls(
  surface: OverlaySurface,
  availability: OverlayToolbarAvailability = { connected: true, loading: false },
): OverlayToolbarControl[] {
  if (surface === "edgeRail") {
    return [];
  }

  const shellControls: OverlayToolbarControl[] = [
    { kind: "expand", label: "Full", tone: "primary" },
    { kind: "close", label: "Close" },
  ];
  if (surface !== "commandDeck") {
    return shellControls;
  }

  const gatewayControls: OverlayToolbarControl[] = [
    { kind: "pause", label: "Pause" },
    { kind: "resume", label: "Resume", tone: "primary" },
    { kind: "stop", label: "Stop" },
    { kind: "emergencyStop", label: "Emergency stop", tone: "danger" },
  ];
  return [
    ...gatewayControls.map((control) => withToolbarAvailability(control, availability)),
    { kind: "expand", label: "Full", tone: "primary" },
    { kind: "collapse", label: "Rail" },
    { kind: "close", label: "Close" },
  ];
}

export function getOverlayGatewayActionState(
  params: OverlayGatewayActionStateParams,
): OverlayGatewayActionState {
  if (!params.enabled) {
    return { enabled: false, disabledReason: params.disabledReason };
  }
  if (!params.availability.connected) {
    return { enabled: false, disabledReason: "Gateway unavailable" };
  }
  if (params.availability.loading) {
    return { enabled: false, disabledReason: "Gateway request in progress" };
  }
  return { enabled: true, disabledReason: undefined };
}

export function applyOverlayWorkspaceAvailability(
  workspace: AgentWorkspaceView,
  availability: OverlayToolbarAvailability,
): AgentWorkspaceView {
  return {
    ...workspace,
    actions: workspace.actions.map((action) => {
      if (isOverlayLocalWorkspaceAction(action.kind)) {
        return action;
      }
      return {
        ...action,
        ...getOverlayGatewayActionState({
          enabled: action.enabled,
          disabledReason: action.disabledReason,
          availability,
        }),
      };
    }),
  };
}

function isOverlayLocalWorkspaceAction(kind: AgentWorkspaceActionKind): boolean {
  return (
    kind === "assignEmployeeTask" ||
    kind === "pauseTask" ||
    kind === "askTaskUpdate" ||
    kind === "increaseTaskBudget" ||
    kind === "reassignTask" ||
    kind === "requestTaskReview" ||
    kind === "editEmployee"
  );
}

function withToolbarAvailability(
  control: OverlayToolbarControl,
  availability: OverlayToolbarAvailability,
): OverlayToolbarControl {
  const disabledReason = !availability.connected
    ? "Gateway unavailable"
    : availability.loading
      ? "Gateway request in progress"
      : undefined;
  return disabledReason ? { ...control, disabled: true, disabledReason } : control;
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
  private activeVoiceRecognition: OverlaySpeechRecognition | null = null;
  private voiceAvailable = isOverlayVoiceInputAvailable();
  private voiceListening = false;
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
    this.activeVoiceRecognition?.stop?.();
    this.controller?.stop();
    this.controller = null;
    super.disconnectedCallback();
  }

  render() {
    const model = this.sageOsState
      ? renderOverlayModel(this.sageOsState, {
          workspaceTarget: this.workspaceTarget ?? undefined,
          pinnedWidgets: this.layout.pinnedWidgets,
          showApprovalBadge: this.layout.showApprovalBadge,
          showIncidentBadge: this.layout.showIncidentBadge,
        })
      : null;
    const surfaceVisibility = getOverlaySurfaceVisibility(this.surface);
    const callouts = getOverlayStateCallouts({
      connected: this.overlayConnected,
      loading: this.loading,
      error: this.error,
      hasState: Boolean(model),
    });

    return html`
      <main class=${`overlay-shell overlay-shell--${this.surface}`}>
        ${surfaceVisibility.toolbar ? this.renderToolbar() : nothing}
        <section class="overlay-content">
          ${callouts.map(
            (callout) =>
              html`<section class=${`overlay-callout overlay-callout--${callout.tone}`}>
                ${callout.message}
              </section>`,
          )}
          ${model
            ? html`
                ${surfaceVisibility.launcher
                  ? this.renderLauncher(model.launcher.quickActions)
                  : nothing}
                ${surfaceVisibility.pinnedWidgets
                  ? renderPinnedWidgets(model.pinnedWidgets, this.layout.collapsedEdge)
                  : nothing}
                ${surfaceVisibility.commandDeck ? renderCommandDeck(model.commandDeck.cards) : nothing}
                ${surfaceVisibility.overview ? this.renderOverviewGroups(model.overview) : nothing}
                ${surfaceVisibility.agentWorkspace
                  ? renderAgentWorkspace(this.workspaceWithAvailability(model.workspace), {
                      onAction: (action) => void this.runWorkspaceAction(action),
                    })
                  : nothing}
                ${surfaceVisibility.operationalRows
                  ? this.renderOperationalRows(model.commandDeck)
                  : nothing}
                ${surfaceVisibility.compactHud ? renderCompactHud(model.hud) : nothing}
                ${surfaceVisibility.edgeRail
                  ? renderEdgeRail(model.edgeRail.badges, this.layout.collapsedEdge, {
                      onBadgeClick: (badge) => this.openEdgeRailBadge(badge),
                    })
                  : nothing}
              `
            : nothing}
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
    const connection = getOverlayConnectionState({
      connected: this.overlayConnected,
      loading: this.loading,
      error: this.error,
      hasState: Boolean(this.sageOsState),
    });
    return html`
      <nav class=${`overlay-toolbar overlay-toolbar--${this.surface}`} aria-label="SageOS overlay controls">
        <span
          class=${`overlay-connection overlay-connection--${connection.tone}`}
          title=${connection.detail}
          aria-label=${`SageOS gateway: ${connection.label}. ${connection.detail}`}
          >${connection.label}</span
        >
        ${getOverlayToolbarControls(this.surface, {
          connected: this.overlayConnected,
          loading: this.loading,
        }).map(
          (control) => html`
            <button
              class=${control.tone ? `overlay-button overlay-button--${control.tone}` : "overlay-button"}
              type="button"
              title=${control.disabledReason ?? control.label}
              ?disabled=${control.disabled}
              @click=${() => this.runToolbarControl(control.kind)}
            >
              ${control.label}
            </button>
          `,
        )}
      </nav>
    `;
  }

  private runToolbarControl(kind: OverlayToolbarControlKind) {
    if (kind === "pause") {
      void this.controller?.pause();
    } else if (kind === "resume") {
      void this.controller?.resume();
    } else if (kind === "stop") {
      void this.controller?.stopSageOs();
    } else if (kind === "emergencyStop") {
      void this.controller?.emergencyStop();
    } else if (kind === "expand") {
      void window.sageOsOverlay?.expand();
    } else if (kind === "collapse") {
      void window.sageOsOverlay?.collapse();
    } else {
      void window.sageOsOverlay?.close();
    }
  }

  private renderLauncher(quickActions: UniversalLauncherQuickAction[]) {
    const launcherAction = this.gatewayActionState(true);
    return renderUniversalLauncher({
      value: this.launcherCommand,
      disabled: !launcherAction.enabled,
      disabledReason: launcherAction.disabledReason,
      voiceEnabled: this.interaction.voice.enabled,
      voiceAvailable: this.voiceAvailable,
      voiceListening: this.voiceListening,
      quickActions,
      onInput: (value) => {
        this.launcherCommand = value;
      },
      onRun: () => void this.runLauncherCommand(),
      onVoice: () => this.startVoiceCommand(),
      onQuickAction: (action) => this.applyLauncherQuickAction(action),
    });
  }

  private applyLauncherQuickAction(action: UniversalLauncherQuickAction) {
    if (action.disabled) {
      return;
    }
    this.launcherCommand = action.command;
    this.requestUpdate();
    void this.updateComplete.then(() => this.focusLauncher());
  }

  private startVoiceCommand() {
    const recognition = createOverlaySpeechRecognition();
    if (!recognition) {
      this.error = "Voice input is not available in this Electron runtime.";
      this.focusLauncher();
      this.requestUpdate();
      return;
    }

    this.error = null;
    this.voiceListening = true;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = globalThis.navigator?.language ?? "en-US";
    recognition.addEventListener("result", (event) => {
      const transcript = extractOverlayVoiceTranscript(event);
      if (transcript) {
        this.launcherCommand = transcript;
      }
      this.focusLauncher();
      this.requestUpdate();
    });
    recognition.addEventListener("error", (event) => {
      const error = typeof event === "object" && event && "error" in event ? String(event.error) : "unknown";
      this.error = `Voice input failed: ${error}`;
      this.requestUpdate();
    });
    recognition.addEventListener("end", () => {
      if (this.activeVoiceRecognition !== recognition) {
        return;
      }
      this.activeVoiceRecognition = null;
      this.voiceListening = false;
      this.requestUpdate();
    });

    this.activeVoiceRecognition = recognition;
    try {
      recognition.start();
    } catch (err) {
      this.activeVoiceRecognition = null;
      this.voiceListening = false;
      this.error = `Voice input failed: ${String(err)}`;
      this.requestUpdate();
    }
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
    const runNextAction = this.gatewayActionState(true);
    return html`
      <section class="operational-grid">
        <article class="overlay-panel overlay-panel--focus">
          <div class="overlay-panel__header">
            <h2>Active Operations</h2>
            <button
              class="overlay-button overlay-button--primary"
              type="button"
              title=${runNextAction.disabledReason ?? "Run next"}
              ?disabled=${!runNextAction.enabled}
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
                      <div class="overlay-row__meta">Progress: ${task.progress}</div>
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
                        title=${this.gatewayActionTitle("Queue", task.canQueue, "Task is not queueable")}
                        ?disabled=${this.gatewayActionDisabled(task.canQueue, "Task is not queueable")}
                        @click=${() => void this.controller?.queueTask(task.id)}
                      >
                        Queue
                      </button>
                      <button
                        class="overlay-button"
                        type="button"
                        title=${this.gatewayActionTitle("Cancel", task.canCancel, "Task is not cancellable")}
                        ?disabled=${this.gatewayActionDisabled(task.canCancel, "Task is not cancellable")}
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
                        title=${this.gatewayActionTitle("Approve", approval.canResolve, "Approval is not pending")}
                        ?disabled=${this.gatewayActionDisabled(approval.canResolve, "Approval is not pending")}
                        @click=${() => void this.controller?.approveApproval(approval.id)}
                      >
                        Approve
                      </button>
                      <button
                        class="overlay-button"
                        type="button"
                        title=${this.gatewayActionTitle("Deny", approval.canResolve, "Approval is not pending")}
                        ?disabled=${this.gatewayActionDisabled(approval.canResolve, "Approval is not pending")}
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
                        title=${this.gatewayActionTitle(
                          incident.repairLabel ?? "Run repair",
                          incident.canRepair,
                          "Repair requires review",
                        )}
                        ?disabled=${this.gatewayActionDisabled(incident.canRepair, "Repair requires review")}
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

  private openEdgeRailBadge(badge: EdgeRailBadge) {
    this.workspaceTarget = badge.target;
    this.setSurface("commandDeck");
    void window.sageOsOverlay?.expand();
    this.requestUpdate();
  }

  private workspaceWithAvailability(workspace: AgentWorkspaceView): AgentWorkspaceView {
    return applyOverlayWorkspaceAvailability(workspace, this.gatewayAvailability());
  }

  private gatewayAvailability(): OverlayToolbarAvailability {
    return { connected: this.overlayConnected, loading: this.loading };
  }

  private gatewayActionState(enabled: boolean, disabledReason?: string): OverlayGatewayActionState {
    return getOverlayGatewayActionState({
      enabled,
      disabledReason,
      availability: this.gatewayAvailability(),
    });
  }

  private gatewayActionDisabled(enabled: boolean, disabledReason?: string): boolean {
    return !this.gatewayActionState(enabled, disabledReason).enabled;
  }

  private gatewayActionTitle(label: string, enabled: boolean, disabledReason?: string): string {
    return this.gatewayActionState(enabled, disabledReason).disabledReason ?? label;
  }

  private async runWorkspaceAction(action: AgentWorkspaceAction) {
    if (!action.enabled) {
      return;
    }

    if (action.kind === "assignEmployeeTask" && action.target.kind === "employee") {
      this.prefillEmployeeTaskAssignment(action.target.id);
      return;
    }

    if (action.kind === "editEmployee" && action.target.kind === "employee") {
      this.prefillEmployeeOperatorAction(action.target.id, action.kind);
      return;
    }

    if (isTaskOperatorAction(action.kind) && action.target.kind === "task") {
      this.prefillTaskOperatorAction(action.target.id, action.kind);
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

  private prefillEmployeeOperatorAction(employeeId: string, actionKind: EmployeeOperatorActionKind) {
    if (!this.sageOsState) {
      return;
    }
    this.launcherCommand = buildEmployeeOperatorLauncherCommand(
      this.sageOsState,
      employeeId,
      actionKind,
    );
    this.requestUpdate();
    void this.updateComplete.then(() => this.focusLauncher());
  }

  private prefillTaskOperatorAction(taskId: string, actionKind: TaskOperatorActionKind) {
    if (!this.sageOsState) {
      return;
    }
    this.launcherCommand = buildTaskOperatorLauncherCommand(this.sageOsState, taskId, actionKind);
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
  const collaboration = status.collaboration ?? {
    total: 0,
    open: 0,
    handoffs: 0,
    reviewRequests: 0,
    incidentEscalations: 0,
    sharedArtifacts: 0,
  };

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
      title: "Operations",
      rows: [
        {
          label: "Active Operations",
          value: `${status.tasks.active} active`,
          detail: `${status.tasks.queued} queued / ${status.tasks.blocked} blocked / ${status.tasks.total} total`,
        },
        {
          label: "Approvals",
          value: `${status.approvals.pending} pending`,
          detail: "Pending decisions",
        },
        {
          label: "Collaboration",
          value: `${collaboration.open} open`,
          detail: [
            countLabel(collaboration.handoffs, "handoff"),
            countLabel(collaboration.reviewRequests, "review"),
            countLabel(collaboration.incidentEscalations, "escalation"),
            countLabel(collaboration.sharedArtifacts, "artifact"),
          ].join(" / "),
        },
        {
          label: "Incidents",
          value: `${status.incidents.length} active`,
          detail: `${countLabel(urgentIncidents, "urgent", "urgent")} / ${countLabel(
            warningIncidents,
            "warning",
          )}`,
        },
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
          detail: `${countLabel(warningIncidents, "warning")} / ${countLabel(
            status.incidents.length,
            "incident",
          )}`,
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
          detail: formatNotificationStatusDetail(status.notifications),
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

function countWarningIncidents(status: SageOsOverlayStatusState["status"]): number {
  return status.incidents.filter((incident) => incident.severity === "warning").length;
}

function securitySystemState(status: SageOsOverlayStatusState["status"]): "degraded" | "ok" {
  return countUrgentIncidents(status) > 0 ||
    countWarningIncidents(status) > 0 ||
    status.sources.failing.length > 0
    ? "degraded"
    : "ok";
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
    ...buildRepoResourceRows(state),
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
      detail: formatObservationText(observation),
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

function buildSystemResourceRows(state: SageOsOverlayStatusState): OverlaySystemResourceRow[] {
  const status = state.status;
  const files = fileWorkspaceSummary(state);
  const collaboration = collaborationWorkspaceSummary(state);
  return [
    {
      id: "supervisor",
      title: "Supervisor",
      detail: status.supervisor.paused ? "Paused" : "Running",
      state: status.supervisor.state,
    },
    {
      id: "security",
      title: "Security",
      detail: `${countUrgentIncidents(status)} urgent / ${countWarningIncidents(status)} warning / ${status.sources.failing.length} failing source`,
      state: securitySystemState(status),
    },
    {
      id: "pc-management",
      title: "PC Management",
      detail: `${status.observations.recent} recent observations / ${status.sources.enabled.length} enabled source`,
      state: "observing",
    },
    {
      id: "observations",
      title: "Observations",
      detail: `${status.observations.recent} recent / ${status.observations.failed} failed / ${status.observations.redacted} redacted`,
      state: "observing",
    },
    {
      id: "files",
      title: "Files",
      detail: `${files.changedFileCount} changed / ${files.cleanupPlanCount} cleanup / ${files.deleteApprovalCount} delete approvals`,
      state: "observing",
    },
    {
      id: "coding",
      title: "Coding",
      detail: `${status.coding.reports.total} reports / ${status.coding.allowedRepos.length} allowed repos`,
      state: status.coding.enabled ? "enabled" : "disabled",
    },
    {
      id: "workflows",
      title: "Workflows",
      detail: `${status.workflows.total} total / ${status.workflows.queued} queued / ${status.workflows.blocked} blocked`,
      state: `${status.workflows.active} active`,
    },
    {
      id: "skills",
      title: "Skills",
      detail: `${status.skills.total} total / ${status.skills.queued} queued / ${status.skills.blocked} blocked`,
      state: `${status.skills.active} active`,
    },
    {
      id: "apps",
      title: "Apps & Widgets",
      detail: `${status.apps.total} total / ${status.apps.queued} queued / ${status.apps.blocked} blocked`,
      state: `${status.apps.active} active`,
    },
    {
      id: "collaboration",
      title: "Collaboration",
      detail: `${collaboration.openEvents} open / ${collaboration.handoffs} handoffs / ${collaboration.reviewRequests} reviews`,
      state: `${collaboration.openEvents} open`,
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
      detail: formatNotificationStatusDetail(status.notifications),
      state: `${status.notifications.urgentPending} urgent`,
    },
    {
      id: "audit",
      title: "Audit",
      detail: status.audit.eventLogPath ?? "Event log pending",
      state: `${status.audit.recentEvents} events`,
    },
    {
      id: "settings",
      title: "Settings",
      detail: `${status.policy.mode} / ${status.sources.enabled.length} enabled source`,
      state: status.policy.mode,
    },
  ];
}

function buildUniversalLauncherQuickActions(
  state: SageOsOverlayStatusState,
): UniversalLauncherQuickAction[] {
  const codingRepo = state.status.coding.allowedRepos[0];
  const repairIncident = state.status.incidents.find((incident) =>
    canRunSageOsIncidentRepair(incident),
  );
  return [
    { id: "createEmployee", label: "New employee", command: "Create employee " },
    { id: "createTask", label: "New task", command: "Assign task " },
    {
      id: "draftWorkflow",
      label: "Workflow",
      command: "Draft workflow from repeated work",
    },
    { id: "memoryReplay", label: "Memory replay", command: "Replay memory queue" },
    {
      id: "nightShift",
      label: "Night Shift",
      command: `Start Night Shift coding in ${codingRepo ?? ""}`,
    },
    { id: "appWidget", label: "App/widget", command: "Draft app widget for " },
    ...(repairIncident
      ? [
          {
            id: "repairIncident",
            label: "Repair",
            command: `Repair ${repairIncident.title}`,
          } satisfies UniversalLauncherQuickAction,
        ]
      : []),
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
        { label: "Risk", value: task.riskClass ?? riskFromPolicyScopes(task.policyScopes ?? []) },
        { label: "Tool profile", value: task.toolProfile ?? "Unknown" },
        { label: "Budget", value: formatTaskBudget(task.budget) },
        { label: "Expected output", value: task.expectedOutput ?? "Not specified" },
        { label: "Verification", value: formatList(task.verificationPlan ?? []) },
        { label: "Rollback", value: task.rollback ?? "Not specified" },
        { label: "Evidence", value: formatList(task.evidenceRefs ?? []) },
        { label: "Notify", value: formatNotificationPolicy(task.notificationPolicy) },
        { label: "Sensitivity", value: task.sensitivity ?? "normal" },
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
        ...TASK_OPERATOR_ACTIONS.map(
          (action) =>
            ({
              ...action,
              enabled: canCancel,
              target,
            }) satisfies AgentWorkspaceAction,
        ),
      ],
    };
  }

  if (target.kind === "employee") {
    const employee = state.agents?.find((entry) => entry.id === target.id);
    if (!employee) {
      return missingWorkspaceTarget(target);
    }
    const assignedTasks = assignedTasksForEmployee(state.tasks ?? [], employee.id);
    const assignedRuns = runsForTasks(state.runs ?? [], assignedTasks);
    const assignedReports = codingReportsForTasks(state.codingReports ?? [], assignedTasks);
    return {
      title: employee.name,
      eyebrow: `Employee / ${employee.status}`,
      detail: employee.mission,
      facts: [
        { label: "Role", value: employee.role },
        { label: "Autonomy", value: employee.autonomyTier },
        { label: "Responsibilities", value: employee.responsibilities?.join(", ") || "None" },
        { label: "Current task", value: currentEmployeeTaskSummary(assignedTasks) },
        { label: "Last activity", value: employeeLastActivitySummary(employee, assignedTasks, assignedRuns, assignedReports) },
        { label: "Recent outputs", value: employeeRecentOutputsSummary(assignedReports) },
        { label: "Incidents", value: employeeIncidentSummary(employee, state.status.incidents) },
        { label: "Assigned tasks", value: assignedTasksSummary(assignedTasks) },
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
        { label: "Worker", value: run.workerSessionId ?? "Unknown" },
        { label: "Trace", value: run.traceId },
        { label: "Current tool", value: run.currentToolCall ?? "None" },
        { label: "Budget used", value: formatRunBudgetUsage(run.budgetUsed) },
        { label: "Started", value: run.startedAt ?? "Not started" },
        { label: "Finished", value: run.finishedAt ?? "Not finished" },
        { label: "Verification", value: formatRunVerification(run.verificationResult) },
        { label: "Timeline", value: formatRunTimeline(run.timeline ?? []) },
        { label: "Logs", value: formatList(run.logs ?? []) },
        { label: "Artifacts", value: formatList(run.artifacts ?? []) },
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
        { label: "Scope", value: approval.scope ?? "Unknown" },
        { label: "Requested by", value: approval.requestedBy ?? "Unknown" },
        { label: "Requested at", value: approval.requestedAt ?? "Unknown" },
        { label: "Expires", value: approval.expiresAt ?? "None" },
        { label: "Preview", value: approval.preview ?? "None" },
        { label: "Rollback", value: approval.rollbackPlan ?? "None" },
        { label: "Evidence", value: evidence.join(", ") || "None" },
        { label: "Task", value: approval.taskId ?? "None" },
        { label: "Run", value: approval.runId ?? "None" },
        { label: "Employee", value: approval.employeeId ?? "None" },
        { label: "Workflow", value: approval.workflowId ?? "None" },
        { label: "Domain", value: approval.domain ?? "None" },
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

  if (target.kind === "repo") {
    const repo = repoWorkspaceSummaryByPath(state, target.id);
    if (!repo) {
      return missingWorkspaceTarget(target);
    }
    return {
      title: repoTitle(repo.path),
      eyebrow: `Repo / ${repo.allowed ? "allowed" : "reported"}`,
      detail: repo.path,
      facts: [
        { label: "Path", value: repo.path },
        { label: "Allowed", value: String(repo.allowed) },
        { label: "Restrictions", value: formatList(state.status.coding.restrictions) },
        { label: "Reports", value: String(repo.reports.length) },
        { label: "Running workers", value: repoRunningWorkerSummary(state, repo) },
        { label: "Latest report", value: latestCodingReportSummary(repo.latestReport) },
        { label: "Changed files", value: formatList(repoChangedFiles(repo)) },
        {
          label: "Tests",
          value: formatCodingReportTests(repo.latestReport?.tests ?? []) || "None",
        },
        { label: "Blockers", value: formatList(repoBlockers(repo)) },
        { label: "Rollback", value: repo.latestReport?.rollback ?? "None" },
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
      detail: formatObservationText(observation),
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
    return systemWorkspaceModel(state, target.id);
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

function defaultWorkspaceTarget(state: SageOsOverlayStatusState): AgentWorkspaceTarget | undefined {
  const runs = state.runs ?? [];
  const run =
    runs.find((entry) => entry.state === "running" || entry.state === "queued") ??
    runs.toSorted((a, b) => b.attempt - a.attempt)[0];
  return run ? { kind: "run", id: run.id } : undefined;
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

function firstApprovalWorkspaceTarget(rows: OverlayApprovalRow[]): AgentWorkspaceTarget {
  const approval = rows.find((entry) => entry.canResolve) ?? rows[0];
  return approval ? { kind: "approval", id: approval.id } : { kind: "system", id: "policy" };
}

function firstIncidentWorkspaceTarget(
  incidents: SageOsOverlayStatusState["status"]["incidents"],
): AgentWorkspaceTarget {
  const incident =
    incidents.find((entry) => entry.severity === "critical" || entry.severity === "error") ??
    incidents[0];
  return incident ? { kind: "incident", id: incident.id } : { kind: "system", id: "sources" };
}

type FilesWorkspaceSummary = {
  recentSuggestions: string;
  duplicateCandidates: string;
  storagePressure: string;
  changedFiles: string;
  stagingMoves: string;
  cleanupPlans: string;
  approvalRequiredDeletes: string;
  changedFileCount: number;
  cleanupPlanCount: number;
  deleteApprovalCount: number;
};

type RepoWorkspaceSummary = {
  path: string;
  allowed: boolean;
  reports: OverlayCodingReportRecord[];
  latestReport?: OverlayCodingReportRecord;
};

function fileWorkspaceSummary(state: SageOsOverlayStatusState): FilesWorkspaceSummary {
  const changedFiles = uniqueStrings(
    (state.codingReports ?? []).flatMap((report) => report.diff?.changedFiles ?? []),
  );
  const fileScopedTasks = (state.tasks ?? []).filter((task) =>
    (task.policyScopes ?? []).some((scope) => scope.kind === "file"),
  );
  const cleanupTasks = (state.tasks ?? []).filter((task) =>
    textMatchesAny(`${task.title} ${task.objective}`, [
      "cleanup",
      "clean up",
      "delete",
      "duplicate",
      "archive",
      "large file",
      "storage",
      "downloads",
      "desktop",
      "documents",
    ]),
  );
  const deleteApprovals = (state.approvals ?? []).filter((approval) =>
    textMatchesAny(
      [
        approval.title,
        approval.proposedAction,
        approval.scope,
        approval.domain,
        approval.preview,
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" "),
      ["delete", "remove", "quarantine", "file"],
    ),
  );
  return {
    recentSuggestions: formatList(fileScopedTasks.map((task) => `${task.title} (${task.state})`)),
    duplicateCandidates: "Not reported",
    storagePressure: "Not reported",
    changedFiles: formatList(changedFiles),
    stagingMoves: changedFiles.length > 0 ? `${changedFiles.length} changed file(s)` : "None",
    cleanupPlans: formatList(cleanupTasks.map((task) => `${task.title} (${task.state})`)),
    approvalRequiredDeletes: formatList(
      deleteApprovals.map((approval) => `${approval.title} (${approval.state})`),
    ),
    changedFileCount: changedFiles.length,
    cleanupPlanCount: cleanupTasks.length,
    deleteApprovalCount: deleteApprovals.length,
  };
}

function buildRepoResourceRows(state: SageOsOverlayStatusState): OverlayResourceRow[] {
  return repoWorkspaceSummaries(state).map((repo) => ({
    id: repo.path,
    kind: "repo" as const,
    title: repoTitle(repo.path),
    detail: repoResourceDetail(repo),
    state: repo.allowed ? "allowed" : "reported",
  }));
}

function repoWorkspaceSummaryByPath(
  state: SageOsOverlayStatusState,
  repoPath: string,
): RepoWorkspaceSummary | undefined {
  const targetKey = normalizeRepoPath(repoPath);
  return repoWorkspaceSummaries(state).find((repo) => normalizeRepoPath(repo.path) === targetKey);
}

function repoWorkspaceSummaries(state: SageOsOverlayStatusState): RepoWorkspaceSummary[] {
  const allowedRepos = state.status.coding.allowedRepos;
  const reports = state.codingReports ?? [];
  const pathsByKey = new Map<string, string>();
  for (const path of [...allowedRepos, ...reports.map((report) => report.repoPath)]) {
    const key = normalizeRepoPath(path);
    if (key && !pathsByKey.has(key)) {
      pathsByKey.set(key, path);
    }
  }
  return [...pathsByKey.entries()].map(([key, path]) => {
    const repoReports = reports.filter((report) => normalizeRepoPath(report.repoPath) === key);
    return {
      path,
      allowed: allowedRepos.some((allowed) => normalizeRepoPath(allowed) === key),
      reports: repoReports,
      latestReport: latestByTimestamp(
        repoReports,
        (report) => report.updatedAt ?? report.finishedAt ?? report.startedAt ?? report.createdAt,
      ),
    };
  });
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function repoTitle(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const name = normalized.split("/").filter(Boolean).at(-1) ?? normalized;
  return `Repo: ${name}`;
}

function repoResourceDetail(repo: RepoWorkspaceSummary): string {
  return [
    repo.path,
    `${repo.reports.length} report${repo.reports.length === 1 ? "" : "s"}`,
    `${repoChangedFiles(repo).length} changed`,
    `${repoBlockers(repo).length} blocker${repoBlockers(repo).length === 1 ? "" : "s"}`,
  ].join(" / ");
}

function repoChangedFiles(repo: RepoWorkspaceSummary): string[] {
  return uniqueStrings(repo.reports.flatMap((report) => report.diff?.changedFiles ?? []));
}

function repoBlockers(repo: RepoWorkspaceSummary): string[] {
  return uniqueStrings(repo.reports.flatMap((report) => report.blockers ?? []));
}

function repoRunningWorkerSummary(
  state: SageOsOverlayStatusState,
  repo: RepoWorkspaceSummary,
): string {
  const taskIds = new Set(repo.reports.map((report) => report.taskId));
  const workers = uniqueStrings(
    (state.runs ?? [])
      .filter((run) => taskIds.has(run.taskId))
      .filter((run) => run.state === "running" || run.state === "queued")
      .map((run) => run.workerSessionId ?? run.id),
  );
  return formatList(workers);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))];
}

function textMatchesAny(value: string, needles: string[]): boolean {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function formatCodingReportQueue(summary: { active: number; queued: number; blocked: number }): string {
  return `${summary.queued} queued / ${summary.active} active / ${summary.blocked} blocked`;
}

function formatSummaryQueue(summary: { active: number; queued: number; blocked: number }): string {
  return `${summary.queued} queued / ${summary.active} active / ${summary.blocked} blocked`;
}

function runningWorkerSummary(state: SageOsOverlayStatusState): string {
  const workers = uniqueStrings(
    (state.runs ?? [])
      .filter((run) => run.state === "running" || run.state === "queued")
      .map((run) => run.workerSessionId ?? run.id),
  );
  return formatList(workers);
}

function latestCodingReport(
  state: SageOsOverlayStatusState,
): OverlayCodingReportRecord | undefined {
  return (state.codingReports ?? [])
    .toSorted((a, b) => codingReportTimestamp(b) - codingReportTimestamp(a))
    .at(0);
}

function codingReportTimestamp(report: OverlayCodingReportRecord): number {
  const timestamp = report.updatedAt ?? report.finishedAt ?? report.startedAt ?? report.createdAt;
  const parsed = timestamp ? Date.parse(timestamp) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestCodingReportSummary(report: OverlayCodingReportRecord | undefined): string {
  return report ? `${report.objective} (${report.outcome})` : "None";
}

function latestWorkflowRecord(state: SageOsOverlayStatusState): OverlayWorkflowRecord | undefined {
  return latestByTimestamp(
    state.workflows ?? [],
    (workflow) => workflow.updatedAt ?? workflow.createdAt,
  );
}

function latestWorkflowSummary(workflow: OverlayWorkflowRecord | undefined): string {
  return workflow ? `${workflow.name} (${workflow.state})` : "None";
}

function latestSkillRecord(state: SageOsOverlayStatusState): OverlaySkillRecord | undefined {
  return latestByTimestamp(state.skills ?? [], (skill) => skill.updatedAt ?? skill.createdAt);
}

function latestSkillSummary(skill: OverlaySkillRecord | undefined): string {
  return skill ? `${skill.name} (${skill.state})` : "None";
}

function latestAppRecord(state: SageOsOverlayStatusState): OverlayAppRecord | undefined {
  return latestByTimestamp(state.apps ?? [], (app) => app.updatedAt ?? app.createdAt);
}

function latestAppSummary(app: OverlayAppRecord | undefined): string {
  return app ? `${app.name} (${app.state})` : "None";
}

function latestObservationRecord(
  state: SageOsOverlayStatusState,
): OverlayObservationRecord | undefined {
  return latestByTimestamp(
    state.observations ?? [],
    (observation) => observation.observedAt ?? observation.updatedAt ?? observation.createdAt,
  );
}

function latestObservationSummary(observation: OverlayObservationRecord | undefined): string {
  return observation ? `${observation.title} (${observation.state})` : "None";
}

type CollaborationWorkspaceSummary = {
  openEvents: number;
  handoffs: number;
  reviewRequests: number;
  incidentEscalations: number;
  sharedArtifacts: number;
  latest?: OverlayCollaborationRecord;
};

function collaborationWorkspaceSummary(
  state: SageOsOverlayStatusState,
): CollaborationWorkspaceSummary {
  const events = state.collaborations ?? [];
  return {
    openEvents: events.filter((event) => event.state === "open").length,
    handoffs: events.filter((event) => event.kind === "handoff").length,
    reviewRequests: events.filter((event) => event.kind === "review_request").length,
    incidentEscalations: events.filter((event) => event.kind === "incident_escalation").length,
    sharedArtifacts: events.filter((event) => event.kind === "shared_artifact").length,
    latest: latestByTimestamp(events, (event) => event.updatedAt ?? event.createdAt),
  };
}

function latestCollaborationSummary(event: OverlayCollaborationRecord | undefined): string {
  return event ? `${event.title} (${event.kind} / ${event.state})` : "None";
}

function latestByTimestamp<T>(
  records: readonly T[],
  timestampForRecord: (record: T) => string | undefined,
): T | undefined {
  return records
    .toSorted((a, b) => timestampSortValue(timestampForRecord(b)) - timestampSortValue(timestampForRecord(a)))
    .at(0);
}

function timestampSortValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type AuditTimelineEntry = {
  at: string;
  summary: string;
};

function auditWorkspaceFacts(state: SageOsOverlayStatusState): AgentWorkspaceView["facts"] {
  const status = state.status;
  return [
    { label: "Recent events", value: String(status.audit.recentEvents) },
    { label: "Event log", value: status.audit.eventLogPath ?? "None" },
    { label: "Timeline", value: formatAuditTimeline(state) },
    { label: "Evidence", value: formatAuditEvidence(state) },
    { label: "Verification", value: formatAuditVerification(state) },
    { label: "Rollback", value: formatAuditRollback(state) },
    {
      label: "Filters",
      value: "employee, task, run, policy, app, repo, folder, source, incident, risk",
    },
    { label: "Incident bundle", value: formatAuditIncidentBundle(state) },
  ];
}

function formatAuditTimeline(state: SageOsOverlayStatusState): string {
  const entries: AuditTimelineEntry[] = [
    ...(state.approvals ?? []).flatMap((approval) => {
      const entriesForApproval: AuditTimelineEntry[] = [];
      if (approval.requestedAt) {
        entriesForApproval.push({
          at: approval.requestedAt,
          summary: `Approval requested: ${approval.title} (${approval.riskClass})`,
        });
      }
      if (approval.resolvedAt) {
        entriesForApproval.push({
          at: approval.resolvedAt,
          summary: `Approval ${approval.state}: ${approval.title}`,
        });
      }
      return entriesForApproval;
    }),
    ...state.status.incidents.flatMap((incident) => {
      const at = incident.lastSeenAt ?? incident.firstSeenAt;
      return at
        ? [
            {
              at,
              summary: `Incident ${incident.severity}: ${incident.title}`,
            } satisfies AuditTimelineEntry,
          ]
        : [];
    }),
    ...(state.runs ?? []).flatMap((run) =>
      (run.timeline ?? []).map((event) => ({
        at: event.at,
        summary: `Run ${run.id}: ${formatAuditRunTimelineEvent(event)}`,
      })),
    ),
    ...(state.codingReports ?? []).flatMap((report) => {
      const at = report.finishedAt ?? report.startedAt ?? report.updatedAt ?? report.createdAt;
      return at
        ? [
            {
              at,
              summary: `Coding report ${report.id}: ${report.outcome}`,
            } satisfies AuditTimelineEntry,
          ]
        : [];
    }),
    ...(state.tasks ?? []).flatMap((task) => {
      const at = task.updatedAt ?? task.createdAt;
      return at
        ? [
            {
              at,
              summary: `Task ${task.id}: ${task.title} (${task.state})`,
            } satisfies AuditTimelineEntry,
          ]
        : [];
    }),
  ];

  const visible = entries
    .filter((entry) => entry.at)
    .toSorted((a, b) => auditTimestampSortValue(b.at) - auditTimestampSortValue(a.at))
    .slice(0, 8)
    .map((entry) => `${entry.at} ${entry.summary}`);

  return visible.length > 0 ? visible.join(", ") : "No timeline events";
}

function auditTimestampSortValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAuditRunTimelineEvent(event: { label: string; state?: string; ref?: string }): string {
  const state = event.state ? ` (${event.state})` : "";
  const ref = event.ref ? ` -> ${event.ref}` : "";
  return `${event.label}${state}${ref}`;
}

function formatAuditEvidence(state: SageOsOverlayStatusState): string {
  const entries = [
    ...(state.tasks ?? [])
      .filter((task) => (task.evidenceRefs ?? []).length > 0)
      .map((task) => `${task.id}: ${formatList(task.evidenceRefs ?? [])}`),
    ...(state.approvals ?? [])
      .filter((approval) => (approval.evidence ?? []).length > 0)
      .map((approval) => `${approval.id}: ${formatList(approval.evidence ?? [])}`),
    ...(state.runs ?? [])
      .filter((run) => (run.artifacts ?? []).length > 0)
      .map((run) => `${run.id}: ${formatList(run.artifacts ?? [])}`),
  ];
  return entries.length > 0 ? entries.join("; ") : "No evidence refs";
}

function formatAuditVerification(state: SageOsOverlayStatusState): string {
  const entries = [
    ...(state.tasks ?? [])
      .filter((task) => (task.verificationPlan ?? []).length > 0)
      .map((task) => `${task.id}: ${formatList(task.verificationPlan ?? [])}`),
    ...(state.runs ?? [])
      .filter((run) => run.verificationResult)
      .map((run) => `${run.id}: ${formatRunVerification(run.verificationResult)}`),
    ...(state.codingReports ?? [])
      .filter((report) => (report.tests ?? []).length > 0)
      .map((report) => `${report.id}: ${formatCodingReportTests(report.tests ?? [])}`),
  ];
  return entries.length > 0 ? entries.join("; ") : "No verification refs";
}

function formatCodingReportTests(tests: Array<{ command: string; exitCode: number }>): string {
  return tests.map((test) => `${test.command}: ${test.exitCode}`).join(", ");
}

function formatAuditRollback(state: SageOsOverlayStatusState): string {
  const entries = [
    ...(state.tasks ?? [])
      .filter((task) => Boolean(task.rollback))
      .map((task) => `${task.id}: ${task.rollback}`),
    ...(state.approvals ?? [])
      .filter((approval) => Boolean(approval.rollbackPlan))
      .map((approval) => `${approval.id}: ${approval.rollbackPlan}`),
    ...(state.codingReports ?? [])
      .filter((report) => Boolean(report.rollback))
      .map((report) => `${report.id}: ${report.rollback}`),
  ];
  return entries.length > 0 ? entries.join("; ") : "No rollback refs";
}

function formatAuditIncidentBundle(state: SageOsOverlayStatusState): string {
  const eventLog = state.status.audit.eventLogPath ?? "event log pending";
  const bundles = state.status.incidents.map((incident) => {
    const repair = incident.repairAction?.label ?? "no repair";
    return `${incident.id}: ${incident.title} / repair ${repair} / event log ${eventLog}`;
  });
  return bundles.length > 0 ? bundles.join("; ") : `No active incidents / event log ${eventLog}`;
}

function systemWorkspaceModel(
  state: SageOsOverlayStatusState,
  id: string,
): AgentWorkspaceView {
  const status = state.status;
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
      facts: memoryWorkspaceFacts(status.memory),
      actions: [],
    };
  }

  if (id === "security") {
    return {
      title: "Security",
      eyebrow: `System / ${securitySystemState(status)}`,
      detail: "Security posture from urgent incidents, warning incidents, and failing PC sources.",
      facts: [
        { label: "Urgent incidents", value: String(countUrgentIncidents(status)) },
        { label: "Warning incidents", value: String(countWarningIncidents(status)) },
        { label: "Failing sources", value: status.sources.failing.join(", ") || "None" },
        { label: "Incident total", value: String(status.incidents.length) },
        {
          label: "Approval gates",
          value: status.policy.approvalsRequired.join(", ") || "No extra approvals",
        },
      ],
      actions: [],
    };
  }

  if (id === "pc-management") {
    return {
      title: "PC Management",
      eyebrow: "System / observing",
      detail: "Read-only full-PC observation coverage for apps, sources, and local system state.",
      facts: [
        { label: "Enabled sources", value: status.sources.enabled.join(", ") || "None" },
        { label: "Disabled sources", value: status.sources.disabled.join(", ") || "None" },
        { label: "Failing sources", value: status.sources.failing.join(", ") || "None" },
        { label: "Recent observations", value: String(status.observations.recent) },
        { label: "Redacted observations", value: String(status.observations.redacted) },
        { label: "Observation total", value: String(status.observations.total) },
      ],
      actions: [],
    };
  }

  if (id === "observations") {
    const latestObservation = latestObservationRecord(state);
    return {
      title: "Observations",
      eyebrow: "System / observing",
      detail: "Approved observation coverage, redaction posture, source failures, and latest captured signal.",
      facts: [
        { label: "Recent", value: String(status.observations.recent) },
        { label: "Total", value: String(status.observations.total) },
        { label: "Failed", value: String(status.observations.failed) },
        { label: "Redacted", value: String(status.observations.redacted) },
        { label: "Enabled sources", value: formatList(status.sources.enabled) },
        { label: "Disabled sources", value: formatList(status.sources.disabled) },
        { label: "Failing sources", value: formatList(status.sources.failing) },
        { label: "Latest observation", value: latestObservationSummary(latestObservation) },
        { label: "Latest source", value: latestObservation?.source ?? "None" },
        { label: "Latest observed", value: latestObservation?.observedAt ?? "None" },
        { label: "Latest sensitivity", value: latestObservation?.sensitivity ?? "Unknown" },
        { label: "Latest reason", value: latestObservation?.reason ?? "None" },
      ],
      actions: [],
    };
  }

  if (id === "files") {
    const files = fileWorkspaceSummary(state);
    return {
      title: "Files",
      eyebrow: "System / observing",
      detail: "File Steward readiness from file-scoped tasks, coding reports, and approval records.",
      facts: [
        { label: "Recent suggestions", value: files.recentSuggestions },
        { label: "Duplicate candidates", value: files.duplicateCandidates },
        { label: "Large files and storage pressure", value: files.storagePressure },
        { label: "Changed files", value: files.changedFiles },
        { label: "Staging moves", value: files.stagingMoves },
        { label: "Cleanup plans", value: files.cleanupPlans },
        { label: "Approval-required deletes", value: files.approvalRequiredDeletes },
      ],
      actions: [],
    };
  }

  if (id === "coding") {
    const latestReport = latestCodingReport(state);
    return {
      title: "Coding",
      eyebrow: `System / ${status.coding.enabled ? "enabled" : "disabled"}`,
      detail: "Night Shift and coding worker readiness for allowed repos, diffs, tests, blockers, and report health.",
      facts: [
        { label: "Enabled", value: String(status.coding.enabled) },
        { label: "Allowed repos", value: formatList(status.coding.allowedRepos) },
        { label: "Restrictions", value: formatList(status.coding.restrictions) },
        { label: "Report queue", value: formatCodingReportQueue(status.coding.reports) },
        { label: "Report total", value: String(status.coding.reports.total) },
        { label: "Running workers", value: runningWorkerSummary(state) },
        { label: "Latest report", value: latestCodingReportSummary(latestReport) },
        { label: "Latest diff", value: formatList(latestReport?.diff?.changedFiles ?? []) },
        { label: "Latest tests", value: formatCodingReportTests(latestReport?.tests ?? []) || "None" },
        { label: "Latest blockers", value: formatList(latestReport?.blockers ?? []) },
      ],
      actions: [],
    };
  }

  if (id === "workflows") {
    const workflow = latestWorkflowRecord(state);
    return {
      title: "Workflows",
      eyebrow: `System / ${status.workflows.total} total`,
      detail: "Workflow candidate readiness from repeated observations, trigger patterns, policy scope, dry-run refs, and implementation refs.",
      facts: [
        { label: "Queue", value: formatSummaryQueue(status.workflows) },
        { label: "Total", value: String(status.workflows.total) },
        { label: "Latest workflow", value: latestWorkflowSummary(workflow) },
        { label: "Observed patterns", value: formatList((state.workflows ?? []).map((entry) => entry.observedPattern)) },
        { label: "Triggers", value: formatList((state.workflows ?? []).map((entry) => entry.trigger)) },
        { label: "Inputs", value: formatList(workflow?.inputs ?? []) },
        { label: "Outputs", value: formatList(workflow?.outputs ?? []) },
        { label: "Source observations", value: formatList(workflow?.sourceObservationIds ?? []) },
        { label: "Policy scopes", value: formatPolicyScopes(workflow?.policyScopes ?? []) },
        { label: "Implementation refs", value: formatList(workflow?.implementationRefs ?? []) },
        { label: "Eval refs", value: formatList(workflow?.evalRefs ?? []) },
      ],
      actions: [],
    };
  }

  if (id === "skills") {
    const skill = latestSkillRecord(state);
    return {
      title: "Skills",
      eyebrow: `System / ${status.skills.total} total`,
      detail: "Skill library readiness from drafted and active skills, workflow links, provenance, tests, scopes, and rollback refs.",
      facts: [
        { label: "Queue", value: formatSummaryQueue(status.skills) },
        { label: "Total", value: String(status.skills.total) },
        { label: "Latest skill", value: latestSkillSummary(skill) },
        { label: "Workflow links", value: formatList(uniqueStrings((state.skills ?? []).flatMap((entry) => entry.workflowId ? [entry.workflowId] : []))) },
        { label: "Trigger conditions", value: formatList(skill?.triggerConditions ?? []) },
        { label: "Provenance", value: formatList(skill?.provenance ?? []) },
        { label: "Tests", value: formatList(skill?.tests ?? []) },
        { label: "Allowed scopes", value: formatPolicyScopes(skill?.allowedScopes ?? []) },
        { label: "Rollback", value: skill?.rollbackRef ?? "None" },
      ],
      actions: [],
    };
  }

  if (id === "apps") {
    const app = latestAppRecord(state);
    return {
      title: "Apps & Widgets",
      eyebrow: `System / ${status.apps.total} total`,
      detail: "Generated app and widget readiness from observed needs, preview commands, artifacts, policy scope, and rollback refs.",
      facts: [
        { label: "Queue", value: formatSummaryQueue(status.apps) },
        { label: "Total", value: String(status.apps.total) },
        { label: "Latest app", value: latestAppSummary(app) },
        { label: "Target surfaces", value: formatList(uniqueStrings((state.apps ?? []).map((entry) => entry.targetSurface))) },
        { label: "Purpose", value: app?.purpose ?? "None" },
        { label: "Preview commands", value: formatList(uniqueStrings((state.apps ?? []).flatMap((entry) => entry.previewCommand ? [entry.previewCommand] : []))) },
        { label: "Artifacts", value: formatList(app?.artifactRefs ?? []) },
        { label: "Sources", value: formatList(app?.sourceObservationIds ?? []) },
        { label: "Provenance", value: formatList(app?.provenance ?? []) },
        { label: "Inputs", value: formatList(app?.inputs ?? []) },
        { label: "Outputs", value: formatList(app?.outputs ?? []) },
        { label: "Policy scopes", value: formatPolicyScopes(app?.policyScopes ?? []) },
        { label: "Rollback", value: app?.rollbackRef ?? "None" },
      ],
      actions: [],
    };
  }

  if (id === "collaboration") {
    const collaboration = collaborationWorkspaceSummary(state);
    return {
      title: "Collaboration",
      eyebrow: `System / ${collaboration.openEvents} open`,
      detail: "Cross-employee handoffs, review requests, incident escalations, shared artifacts, and latest collaboration state.",
      facts: [
        { label: "Open events", value: String(collaboration.openEvents) },
        { label: "Handoffs", value: String(collaboration.handoffs) },
        { label: "Review requests", value: String(collaboration.reviewRequests) },
        { label: "Incident escalations", value: String(collaboration.incidentEscalations) },
        { label: "Shared artifacts", value: String(collaboration.sharedArtifacts) },
        { label: "Latest event", value: latestCollaborationSummary(collaboration.latest) },
        { label: "From", value: collaboration.latest?.fromAgentId ?? "None" },
        { label: "To", value: collaboration.latest?.toAgentId ?? "None" },
        { label: "Task", value: collaboration.latest?.taskId ?? "None" },
        { label: "Artifacts", value: formatList(collaboration.latest?.artifactRefs ?? []) },
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
      facts: notificationWorkspaceFacts(status.notifications),
      actions: [],
    };
  }

  if (id === "audit") {
    return {
      title: "Audit",
      eyebrow: "System / events",
      detail: status.audit.eventLogPath ?? "Event log path is pending.",
      facts: auditWorkspaceFacts(state),
      actions: [],
    };
  }

  if (id === "settings") {
    return {
      title: "Settings",
      eyebrow: `System / ${status.policy.mode}`,
      detail: "Runtime configuration summary for autonomy, sources, notifications, and overlay launch settings.",
      facts: [
        { label: "Autonomy mode", value: status.policy.mode },
        { label: "Default tier", value: status.policy.defaultTier },
        {
          label: "Approval gates",
          value: status.policy.approvalsRequired.join(", ") || "No extra approvals",
        },
        { label: "Sources", value: formatSourceSettings(status.sources) },
        { label: "Notifications", value: formatNotificationSettings(status.notifications) },
        { label: "Overlay config", value: "Launch environment and URL parameters" },
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

function isTaskOperatorAction(kind: AgentWorkspaceActionKind): kind is TaskOperatorActionKind {
  return TASK_OPERATOR_ACTIONS.some((action) => action.kind === kind);
}

export function buildTaskOperatorLauncherCommand(
  state: SageOsOverlayStatusState,
  taskId: string,
  actionKind: TaskOperatorActionKind,
): string {
  const task = state.tasks?.find((entry) => entry.id === taskId);
  const taskTitle = task?.title?.trim() || labelFromId(taskId);
  if (actionKind === "pauseTask") {
    return `Pause ${taskTitle}`;
  }
  if (actionKind === "askTaskUpdate") {
    return `Ask ${ownerLabelForState(state, task?.ownerAgentId)} for an update on ${taskTitle}`;
  }
  if (actionKind === "increaseTaskBudget") {
    return `Increase budget for ${taskTitle} to `;
  }
  if (actionKind === "reassignTask") {
    return `Reassign ${taskTitle} to `;
  }
  return `Ask ${reviewerLabelForState(state)} to review ${taskTitle}`;
}

function reviewerLabelForState(state: SageOsOverlayStatusState): string {
  const reviewer = state.agents?.find(
    (agent) => agent.id === "employee_reviewer" || agent.role.toLowerCase().includes("review"),
  );
  return reviewer?.name ?? "Reviewer";
}

export function buildEmployeeOperatorLauncherCommand(
  state: SageOsOverlayStatusState,
  employeeId: string,
  actionKind: EmployeeOperatorActionKind,
): string {
  const employee = state.agents?.find((entry) => entry.id === employeeId);
  const employeeLabel = employee?.name ?? labelFromId(employeeId);
  switch (actionKind) {
    case "editEmployee":
      return `Edit employee ${employeeLabel}: `;
  }
}

function ownerLabel(ownerAgentId: string | undefined, employeeNames: Map<string, string>): string {
  if (!ownerAgentId) {
    return "Unassigned";
  }
  return employeeNames.get(ownerAgentId) ?? ownerAgentId;
}

type OverlayEmployeeRecord = NonNullable<SageOsOverlayStatusState["agents"]>[number];
type OverlayTaskRecord = NonNullable<SageOsOverlayStatusState["tasks"]>[number];
type OverlayRunRecordForState = NonNullable<SageOsOverlayStatusState["runs"]>[number];
type OverlayCodingReportRecord = NonNullable<SageOsOverlayStatusState["codingReports"]>[number];
type OverlayWorkflowRecord = NonNullable<SageOsOverlayStatusState["workflows"]>[number];
type OverlaySkillRecord = NonNullable<SageOsOverlayStatusState["skills"]>[number];
type OverlayAppRecord = NonNullable<SageOsOverlayStatusState["apps"]>[number];
type OverlayObservationRecord = NonNullable<SageOsOverlayStatusState["observations"]>[number];
type OverlayCollaborationRecord = NonNullable<SageOsOverlayStatusState["collaborations"]>[number];

function assignedTasksForEmployee(tasks: OverlayTaskRecord[], employeeId: string): OverlayTaskRecord[] {
  return tasks.filter((task) => task.ownerAgentId === employeeId);
}

function assignedTasksSummary(assigned: OverlayTaskRecord[]): string {
  if (assigned.length === 0) {
    return "None";
  }
  const visible = assigned.slice(0, 3).map((task) => `${task.title} (${task.state})`);
  return assigned.length > visible.length
    ? `${visible.join(", ")}, +${assigned.length - visible.length} more`
    : visible.join(", ");
}

function currentEmployeeTaskSummary(assigned: OverlayTaskRecord[]): string {
  const current =
    assigned.find((task) => task.state === "running") ??
    assigned.find((task) => !["completed", "failed", "cancelled", "expired"].includes(task.state)) ??
    assigned[0];
  return current ? `${current.title} (${current.state})` : "None";
}

function runsForTasks(runs: OverlayRunRecordForState[], tasks: OverlayTaskRecord[]): OverlayRunRecordForState[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  return runs.filter((run) => taskIds.has(run.taskId));
}

function codingReportsForTasks(
  reports: OverlayCodingReportRecord[],
  tasks: OverlayTaskRecord[],
): OverlayCodingReportRecord[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  return reports.filter((report) => taskIds.has(report.taskId));
}

function employeeLastActivitySummary(
  employee: OverlayEmployeeRecord,
  tasks: OverlayTaskRecord[],
  runs: OverlayRunRecordForState[],
  reports: OverlayCodingReportRecord[],
): string {
  const timestamps = [
    employee.updatedAt,
    employee.activatedAt,
    employee.createdAt,
    ...tasks.flatMap((task) => [task.updatedAt, task.createdAt]),
    ...runs.flatMap((run) => [run.finishedAt, run.startedAt]),
    ...reports.flatMap((report) => [report.updatedAt, report.finishedAt, report.startedAt, report.createdAt]),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return timestamps.length > 0 ? timestamps.toSorted().at(-1) ?? "Unknown" : "Unknown";
}

function employeeRecentOutputsSummary(reports: OverlayCodingReportRecord[]): string {
  if (reports.length === 0) {
    return "None";
  }
  return reports
    .slice(0, 3)
    .map((report) => `${report.objective} (${report.outcome})`)
    .join(", ");
}

function employeeIncidentSummary(
  employee: OverlayEmployeeRecord,
  incidents: SageOsOverlayStatusState["status"]["incidents"],
): string {
  const tokens = [employee.id, employee.name, employee.role, ...(employee.responsibilities ?? [])]
    .map((value) => value.toLowerCase())
    .filter((value) => value.length > 2);
  const related = incidents.filter((incident) => {
    const haystack = [incident.category, incident.title, incident.summary].join(" ").toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
  if (related.length === 0) {
    return "None";
  }
  return related
    .slice(0, 3)
    .map((incident) => `${incident.title} (${incident.severity})`)
    .join(", ");
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
  const editAction = {
    kind: "editEmployee",
    label: "Edit",
    enabled: status !== "retired",
    target,
  } satisfies AgentWorkspaceAction;
  if (status === "active") {
    return [
      assignAction,
      editAction,
      { kind: "pauseEmployee", label: "Pause", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "paused") {
    return [
      assignAction,
      editAction,
      { kind: "resumeEmployee", label: "Resume", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "draft") {
    return [
      assignAction,
      editAction,
      { kind: "activateEmployee", label: "Activate", enabled: true, target },
      { kind: "retireEmployee", label: "Retire", enabled: true, target },
    ];
  }
  if (status === "disabled") {
    return [editAction, { kind: "retireEmployee", label: "Retire", enabled: true, target }];
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

function riskFromPolicyScopes(scopes: { risk?: string }[]): string {
  const order = ["low", "medium", "high", "critical"];
  return scopes.reduce((highest, scope) => {
    const risk = scope.risk ?? "low";
    return order.indexOf(risk) > order.indexOf(highest) ? risk : highest;
  }, "low");
}

function formatTaskBudget(budget: { maxMinutes?: number; maxToolCalls?: number; maxCostUsd?: number } | undefined): string {
  if (!budget) {
    return "Not specified";
  }
  const parts = [
    budget.maxMinutes ? `${budget.maxMinutes} min` : undefined,
    budget.maxToolCalls ? `${budget.maxToolCalls} tool calls` : undefined,
    budget.maxCostUsd ? `$${budget.maxCostUsd}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Not specified";
}

function latestRunForTask(runs: OverlayRunRecord[], taskId: string): OverlayRunRecord | undefined {
  const candidates = runs
    .filter((run) => run.taskId === taskId)
    .toSorted((a, b) => b.attempt - a.attempt);
  return (
    candidates.find((run) => run.state === "running" || run.state === "queued") ?? candidates[0]
  );
}

function formatRunProgress(run: OverlayRunRecord | undefined): string {
  if (!run) {
    return "No run yet";
  }
  const budget = formatRunBudgetUsage(run.budgetUsed, { includeCost: false });
  return run.currentToolCall ? `${run.currentToolCall} / ${budget}` : budget;
}

function formatRunBudgetUsage(
  budget: { elapsedMinutes?: number; toolCalls?: number; costUsd?: number } | undefined,
  opts: { includeCost?: boolean } = {},
): string {
  if (!budget) {
    return "Not tracked";
  }
  const includeCost = opts.includeCost ?? true;
  const parts = [
    budget.elapsedMinutes !== undefined ? `${budget.elapsedMinutes} min` : undefined,
    budget.toolCalls !== undefined ? `${budget.toolCalls} tool calls` : undefined,
    includeCost && budget.costUsd !== undefined ? formatUsd(budget.costUsd) : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Not tracked";
}

function formatRunTimeline(
  events: Array<{ label: string; state?: string; ref?: string }>,
): string {
  if (events.length === 0) {
    return "No timeline";
  }
  return events
    .map((event) => {
      const state = event.state ? ` (${event.state})` : "";
      const ref = event.ref ? ` -> ${event.ref}` : "";
      return `${event.label}${state}${ref}`;
    })
    .join(", ");
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}

function formatObservationText(observation: { text?: string; sensitivity?: string }): string {
  if (observation.sensitivity === "private" || observation.sensitivity === "secret") {
    return "Private observation text redacted";
  }
  return previewInlineText(observation.text ?? "No observation text");
}

function previewInlineText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177)}...`;
}

function formatNotificationPolicy(
  policy: { channels?: string[]; notifyOn?: string[] } | undefined,
): string {
  if (!policy) {
    return "Not specified";
  }
  return `${formatList(policy.channels ?? [])} / ${formatList(policy.notifyOn ?? [])}`;
}

type OverlayNotifications = SageOsOverlayStatusState["status"]["notifications"];
type OverlaySources = SageOsOverlayStatusState["status"]["sources"];
type OverlayMemoryStatus = SageOsOverlayStatusState["status"]["memory"];

function formatSourceSettings(sources: OverlaySources): string {
  return [
    `${formatList(sources.enabled)} enabled`,
    `${formatList(sources.disabled)} disabled`,
    `${formatList(sources.failing)} failing`,
  ].join(" / ");
}

function formatNotificationSettings(notifications: OverlayNotifications): string {
  return [
    notifications.telegram.enabled ? "Telegram enabled" : "Telegram disabled",
    `target ${notifications.telegram.target ?? "None"}`,
  ].join(" / ");
}

function memoryWorkspaceFacts(memory: OverlayMemoryStatus): AgentWorkspaceView["facts"] {
  return [
    { label: "Memory health", value: `${memory.status} / ${memory.canonical} canonical` },
    {
      label: "Capture queue",
      value: `${memory.captureQueue.pending} pending / ${memory.captureQueue.failed} failed`,
    },
    { label: "Queue total", value: String(memory.captureQueue.total) },
    { label: "Queue path", value: memory.captureQueue.path ?? "Unknown" },
    { label: "Telegram ingestion", value: formatMemoryTelegramIngestion(memory) },
    { label: "Wiki export proof", value: formatMemoryWikiExport(memory) },
    { label: "Recent memories", value: formatRecentMemories(memory) },
    { label: "Review cards", value: formatMemoryReviewCards(memory) },
    { label: "Duplicate/stale candidates", value: formatMemoryDuplicateStaleCandidates(memory) },
    { label: "Graph health", value: formatMemoryGraphHealth(memory) },
    { label: "Doctor", value: memory.doctor?.ok === false ? "Needs review" : "OK" },
  ];
}

function formatMemoryTelegramIngestion(memory: OverlayMemoryStatus): string {
  const ingestion = memory.telegramIngestion;
  if (!ingestion) {
    return "Not reported";
  }
  const parts = [
    ingestion.status,
    `${ingestion.recent} recent`,
    `${ingestion.failed} failed`,
    ingestion.lastIngestedAt ? `last ${ingestion.lastIngestedAt}` : undefined,
    ingestion.source,
    ingestion.path,
  ].filter(Boolean);
  return parts.join(" / ");
}

function formatMemoryWikiExport(memory: OverlayMemoryStatus): string {
  const wikiExport = memory.wikiExport ?? wikiExportFromDoctor(memory);
  if (!wikiExport) {
    return "Not reported";
  }
  const parts = [
    countLabel(wikiExport.exportedFiles, "file"),
    wikiExport.latestPath ? `latest ${wikiExport.latestPath}` : undefined,
    wikiExport.checkedAt ? `checked ${wikiExport.checkedAt}` : undefined,
  ].filter(Boolean);
  return parts.join(" / ");
}

function wikiExportFromDoctor(
  memory: OverlayMemoryStatus,
): NonNullable<OverlayMemoryStatus["wikiExport"]> | undefined {
  const doctor = memory.doctor;
  if (!doctor) {
    return undefined;
  }
  return {
    status: doctor.ok ? "ok" : "degraded",
    exportedFiles: doctor.exportedFiles.length,
    latestPath: doctor.exportedFiles[doctor.exportedFiles.length - 1],
    checkedAt: doctor.checkedAt,
  };
}

function formatRecentMemories(memory: OverlayMemoryStatus): string {
  const captures = memory.recentCaptures;
  if (!captures) {
    return "Not reported";
  }
  const parts = [
    `${captures.total} captured`,
    captures.latestAt ? `latest ${captures.latestAt}` : undefined,
    formatList(captures.refs ?? []),
  ].filter((part) => Boolean(part && part !== "None"));
  return parts.join(" / ");
}

function formatMemoryReviewCards(memory: OverlayMemoryStatus): string {
  const reviewCards = memory.reviewCards;
  if (!reviewCards) {
    return "Not reported";
  }
  const parts = [
    `${reviewCards.pending} pending`,
    `${reviewCards.total} total`,
    reviewCards.stale !== undefined ? `${reviewCards.stale} stale` : undefined,
    reviewCards.path,
  ].filter(Boolean);
  return parts.join(" / ");
}

function formatMemoryDuplicateStaleCandidates(memory: OverlayMemoryStatus): string {
  const candidates = memory.duplicateStaleCandidates;
  if (!candidates) {
    return "Not reported";
  }
  const parts = [
    `${candidates.duplicates} duplicate`,
    `${candidates.stale} stale`,
    candidates.latestRef,
  ].filter(Boolean);
  return parts.join(" / ");
}

function formatMemoryGraphHealth(memory: OverlayMemoryStatus): string {
  const graph = memory.graph;
  if (!graph) {
    return "Not reported";
  }
  const parts = [
    graph.status,
    graph.nodes !== undefined ? `${graph.nodes} nodes` : undefined,
    graph.edges !== undefined ? `${graph.edges} edges` : undefined,
    graph.orphaned !== undefined ? `${graph.orphaned} orphaned` : undefined,
    graph.lastCheckedAt ? `checked ${graph.lastCheckedAt}` : undefined,
  ].filter(Boolean);
  return parts.join(" / ");
}

function formatNotificationStatusDetail(notifications: OverlayNotifications): string {
  const parts = [notifications.telegram.enabled ? "Telegram enabled" : "Telegram disabled"];
  if (notifications.telegram.digestSchedule) {
    parts.push(`digest ${notifications.telegram.digestSchedule}`);
  }
  if (notifications.digest?.nextDueAt) {
    parts.push(`next ${notifications.digest.nextDueAt}`);
  }
  if (notifications.digest?.error) {
    parts.push(`digest error ${notifications.digest.error}`);
  }
  if (notifications.telegram.batchWindowMinutes) {
    parts.push(`batch ${notifications.telegram.batchWindowMinutes}m`);
  }
  if (notifications.batch) {
    parts.push(`${notifications.batch.pending} queued`);
    if (notifications.batch.dueAt) {
      parts.push(`due ${notifications.batch.dueAt}`);
    }
  }
  const quietHours = formatNotificationQuietHours(notifications.telegram.quietHours);
  if (quietHours) {
    parts.push(`quiet ${quietHours}`);
  }
  return parts.join(" / ");
}

function notificationWorkspaceFacts(
  notifications: OverlayNotifications,
): AgentWorkspaceView["facts"] {
  const facts: AgentWorkspaceView["facts"] = [
    { label: "Telegram", value: notifications.telegram.enabled ? "Enabled" : "Disabled" },
    { label: "Target", value: notifications.telegram.target ?? "None" },
    { label: "Urgent pending", value: String(notifications.urgentPending) },
  ];
  if (notifications.telegram.digestSchedule) {
    facts.push({ label: "Digest schedule", value: notifications.telegram.digestSchedule });
  }
  if (notifications.digest?.nextDueAt) {
    facts.push({ label: "Digest next", value: notifications.digest.nextDueAt });
  }
  if (notifications.digest?.lastScheduledFor) {
    facts.push({ label: "Digest last", value: notifications.digest.lastScheduledFor });
  }
  if (notifications.digest?.error) {
    facts.push({ label: "Digest error", value: notifications.digest.error });
  }
  if (notifications.telegram.batchWindowMinutes) {
    facts.push({ label: "Batch window", value: `${notifications.telegram.batchWindowMinutes}m` });
  }
  if (notifications.batch) {
    facts.push({
      label: "Batch queued",
      value: `${notifications.batch.pending} pending / ${notifications.batch.total} total`,
    });
    if (notifications.batch.firstQueuedAt) {
      facts.push({ label: "Batch first queued", value: notifications.batch.firstQueuedAt });
    }
    if (notifications.batch.dueAt) {
      facts.push({ label: "Batch due", value: notifications.batch.dueAt });
    }
    facts.push({ label: "Batch queue", value: notifications.batch.path });
  }
  const quietHours = formatNotificationQuietHours(notifications.telegram.quietHours);
  if (quietHours) {
    facts.push({ label: "Quiet hours", value: quietHours });
  }
  if (notifications.recent) {
    facts.push({
      label: "Recent",
      value: `${notifications.recent.sent} sent / ${notifications.recent.failed} failed / ${notifications.recent.skipped} skipped`,
    });
    if (notifications.recent.lastOutcome) {
      facts.push({ label: "Last outcome", value: notifications.recent.lastOutcome });
    }
  }
  return facts;
}

function formatNotificationQuietHours(
  quietHours: OverlayNotifications["telegram"]["quietHours"] | undefined,
): string | undefined {
  if (!quietHours) {
    return undefined;
  }
  return `${quietHours.start}-${quietHours.end}${quietHours.timezone ? ` ${quietHours.timezone}` : ""}`;
}

function formatRunVerification(
  verification:
    | {
        outcome?: string;
        summary?: string;
        refs?: string[];
      }
    | undefined,
): string {
  if (!verification) {
    return "Not verified";
  }
  const refs = formatList(verification.refs ?? []);
  const base = `${verification.outcome ?? "unknown"} / ${verification.summary ?? "No summary"}`;
  return refs === "None" ? base : `${base} / ${refs}`;
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

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function createOverlaySpeechRecognition(
  scope: OverlaySpeechRecognitionScope = globalThis as OverlaySpeechRecognitionScope,
): OverlaySpeechRecognition | null {
  const ctor = speechRecognitionConstructor(scope);
  return ctor ? new ctor() : null;
}

function speechRecognitionConstructor(
  scope: OverlaySpeechRecognitionScope,
): OverlaySpeechRecognitionConstructor | null {
  const candidate = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return typeof candidate === "function" ? (candidate as OverlaySpeechRecognitionConstructor) : null;
}

function extractOverlayVoiceTranscript(event: unknown): string {
  if (typeof event !== "object" || event === null || !("results" in event)) {
    return "";
  }
  const results = event.results as ArrayLike<ArrayLike<{ transcript?: unknown }>>;
  const phrases: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const alternative = results[index]?.[0];
    if (typeof alternative?.transcript === "string") {
      phrases.push(alternative.transcript.trim());
    }
  }
  return phrases.filter(Boolean).join(" ").trim();
}
