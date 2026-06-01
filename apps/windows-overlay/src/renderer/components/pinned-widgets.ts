import { html } from "lit";
import type {
  SageOsOverlayEdge,
  SageOsOverlayWidgetId,
} from "../../../../../src/sageos/types.js";

export type PinnedWidgetView = {
  id: SageOsOverlayWidgetId;
  title: string;
  value: string;
  detail: string;
};

export function renderPinnedWidgets(
  widgets: PinnedWidgetView[],
  edge: SageOsOverlayEdge = "right",
) {
  return html`
    <aside class=${`pinned-widgets pinned-widgets--${edge}`} aria-label="Pinned SageOS widgets">
      ${widgets.map(
        (widget) => html`
          <section class="pinned-widget pinned-widget--ambient">
            <div class="pinned-widget__title">${widget.title}</div>
            <div class="pinned-widget__value">${widget.value}</div>
            <div class="pinned-widget__detail">${widget.detail}</div>
          </section>
        `,
      )}
    </aside>
  `;
}
