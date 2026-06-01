import { html } from "lit";

export function renderEdgeRail(badges: { kind: string; count: number }[]) {
  return html`
    <nav class="edge-rail" aria-label="SageOS edge rail">
      ${badges.map((badge) => html`<button type="button">${badge.kind} ${badge.count}</button>`)}
    </nav>
  `;
}
