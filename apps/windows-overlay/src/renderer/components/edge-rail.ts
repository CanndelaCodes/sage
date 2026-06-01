import { html } from "lit";
import type { SageOsOverlayEdge } from "../../../../../src/sageos/types.js";

export function renderEdgeRail(
  badges: { kind: string; count: number }[],
  edge: SageOsOverlayEdge = "right",
) {
  return html`
    <nav class=${`edge-rail edge-rail--${edge}`} aria-label="SageOS edge rail">
      ${badges.map(
        (badge) =>
          html`<button class="overlay-button" type="button">${badge.kind} ${badge.count}</button>`,
      )}
    </nav>
  `;
}
