import type { SageOsOverlayConfig, SageOsOverlayEdge, SageOsOverlayWidgetId } from "./types.js";

export type SageOsOverlaySurface = "commandDeck" | "launcher" | "workspace" | "hud" | "edgeRail";

export type SageOsOverlayPointerMode = "focused" | "passThrough";

export type SageOsOverlayWorkspaceTarget = {
  kind:
    | "employee"
    | "task"
    | "run"
    | "approval"
    | "incident"
    | "repo"
    | "workflow"
    | "skill"
    | "app";
  id: string;
};

export type SageOsOverlayState = {
  visible: boolean;
  surface: SageOsOverlaySurface;
  pointerMode: SageOsOverlayPointerMode;
  collapsedEdge: SageOsOverlayEdge;
  pinnedWidgets: SageOsOverlayWidgetId[];
  workspaceTarget?: SageOsOverlayWorkspaceTarget;
};

export type SageOsOverlayAction =
  | { type: "toggle" }
  | { type: "close" }
  | { type: "expand" }
  | { type: "collapse" }
  | { type: "showHud" }
  | { type: "showLauncher" }
  | { type: "showCommandDeck" }
  | { type: "showWorkspace"; target: SageOsOverlayWorkspaceTarget }
  | { type: "setPointerMode"; pointerMode: SageOsOverlayPointerMode }
  | { type: "pinWidget"; widget: SageOsOverlayWidgetId }
  | { type: "unpinWidget"; widget: SageOsOverlayWidgetId };

export function createSageOsOverlayState(config: SageOsOverlayConfig = {}): SageOsOverlayState {
  return {
    visible: false,
    surface: config.openMode === "hud" ? "hud" : "commandDeck",
    pointerMode: config.passThroughDefault ? "passThrough" : "focused",
    collapsedEdge: config.collapsedEdge ?? "right",
    pinnedWidgets: [...(config.pinnedWidgets ?? ["activeOperations", "approvals", "incidents"])],
  };
}

export function reduceSageOsOverlayState(
  state: SageOsOverlayState,
  action: SageOsOverlayAction,
): SageOsOverlayState {
  switch (action.type) {
    case "toggle":
      if (state.visible) {
        return { ...state, visible: false };
      }
      return {
        ...state,
        visible: true,
        pointerMode:
          state.surface === "hud" || state.surface === "edgeRail"
            ? "passThrough"
            : state.pointerMode,
      };
    case "close":
      return { ...state, visible: false };
    case "expand":
    case "showCommandDeck":
      return { ...state, visible: true, surface: "commandDeck", pointerMode: "focused" };
    case "collapse":
      return { ...state, visible: true, surface: "edgeRail", pointerMode: "passThrough" };
    case "showHud":
      return { ...state, visible: true, surface: "hud", pointerMode: "passThrough" };
    case "showLauncher":
      return { ...state, visible: true, surface: "launcher", pointerMode: "focused" };
    case "showWorkspace":
      return {
        ...state,
        visible: true,
        surface: "workspace",
        pointerMode: "focused",
        workspaceTarget: action.target,
      };
    case "setPointerMode":
      return { ...state, pointerMode: action.pointerMode };
    case "pinWidget":
      return state.pinnedWidgets.includes(action.widget)
        ? state
        : { ...state, pinnedWidgets: [...state.pinnedWidgets, action.widget] };
    case "unpinWidget":
      return {
        ...state,
        pinnedWidgets: state.pinnedWidgets.filter((widget) => widget !== action.widget),
      };
  }
}
