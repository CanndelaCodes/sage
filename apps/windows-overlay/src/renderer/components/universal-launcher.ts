import { html, nothing } from "lit";

export type UniversalLauncherProps = {
  value: string;
  disabled?: boolean;
  disabledReason?: string;
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
export type UniversalLauncherRunState = {
  disabled: boolean;
  title?: string;
};

export function getUniversalLauncherVoiceState(params: {
  voiceEnabled?: boolean;
  voiceAvailable?: boolean;
  voiceListening?: boolean;
  launcherDisabled?: boolean;
  disabledReason?: string;
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
  if (params.launcherDisabled) {
    return {
      visible: true,
      disabled: true,
      title: params.disabledReason ?? "SageOS command entry is unavailable.",
    };
  }
  if (params.voiceListening) {
    return {
      visible: true,
      disabled: true,
      title: "Voice input is already listening.",
    };
  }
  return {
    visible: true,
    disabled: false,
    title: undefined,
  };
}

export function getUniversalLauncherRunState(params: {
  value: string;
  launcherDisabled?: boolean;
  disabledReason?: string;
}): UniversalLauncherRunState {
  if (params.launcherDisabled) {
    return {
      disabled: true,
      title: params.disabledReason ?? "SageOS command entry is unavailable.",
    };
  }
  return params.value.trim()
    ? { disabled: false, title: undefined }
    : { disabled: true, title: "Enter a SageOS command." };
}

export function renderUniversalLauncher(props: UniversalLauncherProps) {
  const voiceState = getUniversalLauncherVoiceState({
    voiceEnabled: props.voiceEnabled,
    voiceAvailable: props.voiceAvailable,
    voiceListening: props.voiceListening,
    launcherDisabled: props.disabled,
    disabledReason: props.disabledReason,
  });
  const runState = getUniversalLauncherRunState({
    value: props.value,
    launcherDisabled: props.disabled,
    disabledReason: props.disabledReason,
  });

  return html`
    <section class="universal-launcher">
      <input
        aria-label="SageOS command"
        placeholder="Ask SageOS..."
        title=${props.disabled ? props.disabledReason ?? "SageOS command entry is unavailable." : ""}
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
        title=${runState.title ?? "Run SageOS command"}
        ?disabled=${runState.disabled}
        @click=${() => props.onRun()}
      >
        Run
      </button>
    </section>
  `;
}
