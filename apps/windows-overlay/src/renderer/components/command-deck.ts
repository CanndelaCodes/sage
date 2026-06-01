import { html } from "lit";
import type { OverlayCard } from "../overlay-app.js";

export function renderCommandDeck(cards: OverlayCard[]) {
  return html`
    <section class="command-deck">
      ${cards.map(
        (card) => html`
          <article class="overlay-card">
            <div class="overlay-card__title">${card.title}</div>
            <div class="overlay-card__value">${card.value}</div>
            <div class="overlay-card__detail">${card.detail}</div>
          </article>
        `,
      )}
    </section>
  `;
}
