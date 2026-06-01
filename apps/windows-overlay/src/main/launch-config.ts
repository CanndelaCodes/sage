import {
  SAGEOS_OVERLAY_EDGES,
  SAGEOS_OVERLAY_WIDGET_IDS,
  type SageOsOverlayConfig,
  type SageOsOverlayEdge,
  type SageOsOverlayWidgetId,
} from "../../../../src/sageos/types.js";

export type OverlayRendererQuery = {
  gatewayUrl?: string;
  token?: string;
  password?: string;
  surface?: string;
};

export type OverlayLaunchConfig = {
  shell: SageOsOverlayConfig;
  rendererQuery: OverlayRendererQuery;
  openOnLaunch: boolean;
};

export function readOverlayLaunchConfig(
  env: Record<string, string | undefined> = process.env,
): OverlayLaunchConfig {
  return {
    shell: {
      enabled: true,
      hotkey: env.SAGEOS_OVERLAY_HOTKEY?.trim() || "Ctrl+Alt+Space",
      openMode: env.SAGEOS_OVERLAY_OPEN_MODE === "hud" ? "hud" : "full",
      hudExpandsToFull: booleanEnv(env.SAGEOS_OVERLAY_HUD_EXPANDS_TO_FULL, true),
      passThroughDefault: booleanEnv(env.SAGEOS_OVERLAY_PASS_THROUGH_DEFAULT, false),
      collapsedEdge: overlayEdgeEnv(env.SAGEOS_OVERLAY_COLLAPSED_EDGE),
      pinnedWidgets: overlayWidgetsEnv(env.SAGEOS_OVERLAY_PINNED_WIDGETS),
    },
    rendererQuery: compactRendererQuery({
      gatewayUrl: env.SAGEOS_OVERLAY_GATEWAY_URL,
      token: env.SAGEOS_OVERLAY_TOKEN,
      password: env.SAGEOS_OVERLAY_PASSWORD,
      surface: env.SAGEOS_OVERLAY_OPEN_MODE === "hud" ? "hud" : undefined,
    }),
    openOnLaunch: isEnabled(env.SAGEOS_OVERLAY_OPEN_ON_LAUNCH),
  };
}

function compactRendererQuery(query: OverlayRendererQuery): OverlayRendererQuery {
  return Object.fromEntries(
    Object.entries(query)
      .map(([key, value]) => [key, value?.trim()] as const)
      .filter((entry): entry is [keyof OverlayRendererQuery, string] => Boolean(entry[1])),
  );
}

function isEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function overlayEdgeEnv(value: string | undefined): SageOsOverlayEdge {
  const edge = value?.trim();
  return SAGEOS_OVERLAY_EDGES.includes(edge as SageOsOverlayEdge)
    ? (edge as SageOsOverlayEdge)
    : "right";
}

function overlayWidgetsEnv(value: string | undefined): SageOsOverlayWidgetId[] {
  const widgets = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is SageOsOverlayWidgetId =>
      SAGEOS_OVERLAY_WIDGET_IDS.includes(entry as SageOsOverlayWidgetId),
    );
  return widgets?.length ? widgets : ["activeOperations", "approvals", "incidents"];
}
