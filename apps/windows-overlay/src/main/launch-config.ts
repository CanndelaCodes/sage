import type { SageOsOverlayConfig } from "../../../../src/sageos/types.js";

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
      hudExpandsToFull: true,
      passThroughDefault: false,
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations", "approvals", "incidents"],
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
