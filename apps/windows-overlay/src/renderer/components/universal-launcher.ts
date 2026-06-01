import { html } from "lit";

export function renderUniversalLauncher() {
  return html`
    <section class="universal-launcher">
      <input aria-label="SageOS command" placeholder="Ask SageOS..." />
      <button type="button" aria-label="Start voice command">Voice</button>
      <button type="button">Run</button>
    </section>
  `;
}
