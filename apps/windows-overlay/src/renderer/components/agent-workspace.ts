import { html } from "lit";

export function renderAgentWorkspace(title: string, detail: string) {
  return html`
    <section class="agent-workspace">
      <h2>${title}</h2>
      <p>${detail}</p>
    </section>
  `;
}
