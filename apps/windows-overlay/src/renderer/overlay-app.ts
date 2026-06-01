import { LitElement, css, html } from "lit";
import type { SageOsOverlayStatusState } from "./sageos-actions.js";

export type OverlayCard = { title: string; value: string; detail: string };
export type OverlayBadge = { label: string; value: string };

declare global {
  interface Window {
    sageOsOverlay?: {
      expand(): Promise<void>;
      collapse(): Promise<void>;
      close(): Promise<void>;
      onSurface(callback: (surface: string) => void): void;
    };
  }
}

export function renderOverlayModel(state: SageOsOverlayStatusState) {
  const status = state.status;
  const activeTasks = String(status.tasks.active);
  const pendingApprovals = String(status.approvals.pending);
  const incidents = String(status.incidents.length);

  return {
    commandDeck: {
      cards: [
        {
          title: "Supervisor",
          value: status.supervisor.state,
          detail: status.supervisor.paused ? "Paused" : "Running",
        },
        { title: "Active Operations", value: activeTasks, detail: `${status.tasks.queued} queued` },
        { title: "Approvals", value: pendingApprovals, detail: "Pending decisions" },
        { title: "Incidents", value: incidents, detail: "Needs review" },
      ] satisfies OverlayCard[],
    },
    hud: {
      badges: [
        { label: "Tasks", value: activeTasks },
        { label: "Approvals", value: pendingApprovals },
        { label: "Incidents", value: incidents },
      ] satisfies OverlayBadge[],
    },
    edgeRail: {
      badges: [
        { kind: "health", count: status.supervisor.state === "running" ? 0 : 1 },
        { kind: "approval", count: status.approvals.pending },
        { kind: "incident", count: status.incidents.length },
      ],
    },
  };
}

export class SageOsOverlayApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: rgba(18, 20, 22, 0.72);
      backdrop-filter: blur(16px);
    }
  `;

  render() {
    return html`
      <main class="overlay-shell">
        <nav class="overlay-toolbar" aria-label="SageOS overlay controls">
          <button type="button" @click=${() => window.sageOsOverlay?.expand()}>Full</button>
          <button type="button" @click=${() => window.sageOsOverlay?.collapse()}>Rail</button>
          <button type="button" @click=${() => window.sageOsOverlay?.close()}>Close</button>
        </nav>
        <slot></slot>
      </main>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("sageos-overlay-app")) {
  customElements.define("sageos-overlay-app", SageOsOverlayApp);
}
