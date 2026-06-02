import { html, nothing } from "lit";

export type UniversalLauncherProps = {
  value: string;
  disabled?: boolean;
  voiceEnabled?: boolean;
  voiceAvailable?: boolean;
  voiceListening?: boolean;
  onInput: (value: string) => void;
  onRun: () => void;
  onVoice: () => void;
};

export type UniversalLauncherVoiceState = {
  visible: boolean;
  disabled: boolean;
  title?: string;
};

export function getUniversalLauncherVoiceState(params: {
  voiceEnabled?: boolean;
  voiceAvailable?: boolean;
  voiceListening?: boolean;
  launcherDisabled?: boolean;
}): UniversalLauncherVoiceState {
  if (!params.voiceEnabled) {
    return { visible: false, disabled: true };
  }
  if (!params.voiceAvailable) {
    return {
      visible: true,
      disabled: true,
      title: "Voice input is not available in this Electron runtime.",
    };
  }
  return {
    visible: true,
    disabled: Boolean(params.launcherDisabled || params.voiceListening),
    title: undefined,
  };
}

export function renderUniversalLauncher(props: UniversalLauncherProps) {
  const voiceState = getUniversalLauncherVoiceState({
    voiceEnabled: props.voiceEnabled,
    voiceAvailable: props.voiceAvailable,
    voiceListening: props.voiceListening,
    launcherDisabled: props.disabled,
  });

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
      ${voiceState.visible
        ? html`
            <button
              class="overlay-button"
              type="button"
              aria-label="Start voice command"
              title=${voiceState.title ?? ""}
              ?disabled=${voiceState.disabled}
              @click=${() => props.onVoice()}
            >
              ${props.voiceListening ? "Listening" : "Voice"}
            </button>
          `
        : nothing}
      <button
        class="overlay-button overlay-button--primary"
        type="button"
        ?disabled=${props.disabled || !props.value.trim()}
        @click=${() => props.onRun()}
      >
        Run
      </button>
    </section>
  `;
}
