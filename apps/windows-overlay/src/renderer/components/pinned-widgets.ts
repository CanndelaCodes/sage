import { html } from "lit";
import type { SageOsOverlayWidgetId } from "../../../../../src/sageos/types.js";

export function renderPinnedWidgets(widgets: SageOsOverlayWidgetId[]) {
  return html`
    <aside class="pinned-widgets">
      ${widgets.map((widget) => html`<section class="pinned-widget">${widget}</section>`)}
    </aside>
  `;
}
