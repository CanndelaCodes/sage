import { html } from "lit";

export type UniversalLauncherProps = {
  value: string;
  disabled?: boolean;
  onInput: (value: string) => void;
  onRun: () => void;
  onVoice: () => void;
};

export function renderUniversalLauncher(props: UniversalLauncherProps) {
  return html`
    <section class="universal-launcher">
      <input
        aria-label="SageOS command"
        placeholder="Ask SageOS..."
        .value=${props.value}
        ?disabled=${props.disabled}
        @input=${(event: InputEvent) => props.onInput((event.target as HTMLInputElement).value)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          props.onRun();
        }}
      />
      <button
        type="button"
        aria-label="Start voice command"
        ?disabled=${props.disabled}
        @click=${() => props.onVoice()}
      >
        Voice
      </button>
      <button
        type="button"
        ?disabled=${props.disabled || !props.value.trim()}
        @click=${() => props.onRun()}
      >
        Run
      </button>
    </section>
  `;
}
