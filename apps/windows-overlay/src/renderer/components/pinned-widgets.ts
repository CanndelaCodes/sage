import { html } from "lit";
import type { SageOsOverlayWidgetId } from "../../../../../src/sageos/types.js";

export type PinnedWidgetView = {
  id: SageOsOverlayWidgetId;
  title: string;
  value: string;
  detail: string;
};

export function renderPinnedWidgets(widgets: PinnedWidgetView[]) {
  return html`
    <aside class="pinned-widgets">
      ${widgets.map(
        (widget) => html`
          <section class="pinned-widget">
            <div class="pinned-widget__title">${widget.title}</div>
            <div class="pinned-widget__value">${widget.value}</div>
            <div class="pinned-widget__detail">${widget.detail}</div>
          </section>
        `,
      )}
    </aside>
  `;
}
