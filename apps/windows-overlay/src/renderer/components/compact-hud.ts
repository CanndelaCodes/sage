import { html } from "lit";
import type { OverlayBadge } from "../overlay-app.js";

export function renderCompactHud(badges: OverlayBadge[]) {
  return html`
    <section class="compact-hud">
      ${badges.map((badge) => html`<span class="hud-badge">${badge.label}: ${badge.value}</span>`)}
    </section>
  `;
}
