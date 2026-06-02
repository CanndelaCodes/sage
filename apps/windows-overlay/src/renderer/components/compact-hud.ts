import { html } from "lit";
import type { OverlayHudView } from "../overlay-app.js";

export function renderCompactHud(hud: OverlayHudView) {
  return html`
    <section class="compact-hud" data-overlay-interactive="true">
      <div class="compact-hud__main">
        <div class="compact-hud__meta">
          <span>${hud.status}</span>
          <span>${hud.target.kind}</span>
        </div>
        <div class="compact-hud__title">${hud.title}</div>
        <div class="compact-hud__detail">${hud.detail}</div>
      </div>
      <div class="compact-hud__badges">
        ${hud.badges.map((badge) => html`<span class="hud-badge">${badge.label}: ${badge.value}</span>`)}
      </div>
    </section>
  `;
}
