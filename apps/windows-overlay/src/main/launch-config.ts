import type { SageOsOverlayConfig } from "../../../../src/sageos/types.js";

export type OverlayRendererQuery = {
  gatewayUrl?: string;
  token?: string;
  password?: string;
};

export type OverlayLaunchConfig = {
  shell: SageOsOverlayConfig;
  rendererQuery: OverlayRendererQuery;
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
    }),
  };
}

function compactRendererQuery(query: OverlayRendererQuery): OverlayRendererQuery {
  return Object.fromEntries(
    Object.entries(query)
      .map(([key, value]) => [key, value?.trim()] as const)
      .filter((entry): entry is [keyof OverlayRendererQuery, string] => Boolean(entry[1])),
  );
}
