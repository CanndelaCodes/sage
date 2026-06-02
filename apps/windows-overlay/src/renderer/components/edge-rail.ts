import { html } from "lit";
import type { SageOsOverlayEdge } from "../../../../../src/sageos/types.js";
import type { AgentWorkspaceTarget } from "./agent-workspace.js";

export type EdgeRailBadgeKind = "health" | "approval" | "incident";
export type EdgeRailBadge = {
  kind: EdgeRailBadgeKind;
  count: number;
  target: AgentWorkspaceTarget;
};

export function renderEdgeRail(
  badges: EdgeRailBadge[],
  edge: SageOsOverlayEdge = "right",
  opts: { onBadgeClick?: (badge: EdgeRailBadge) => void } = {},
) {
  return html`
    <nav class=${`edge-rail edge-rail--${edge}`} aria-label="SageOS edge rail">
      ${badges.map(
        (badge) =>
          html`
            <button
              class="overlay-button"
              type="button"
              title=${opts.onBadgeClick
                ? `Open ${edgeRailBadgeLabel(badge.kind)}`
                : "Edge rail navigation unavailable"}
              ?disabled=${!opts.onBadgeClick}
              @click=${() => opts.onBadgeClick?.(badge)}
            >
              ${edgeRailBadgeLabel(badge.kind)} ${badge.count}
            </button>
          `,
      )}
    </nav>
  `;
}

function edgeRailBadgeLabel(kind: EdgeRailBadgeKind): string {
  if (kind === "approval") {
    return "Approvals";
  }
  if (kind === "incident") {
    return "Incidents";
  }
  return "Health";
}
