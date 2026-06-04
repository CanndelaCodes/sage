import { html, nothing } from "lit";

export type UniversalLauncherProps = {
  value: string;
  disabled?: boolean;
  disabledReason?: string;
  voiceEnabled?: boolean;
  voiceAvailable?: boolean;
  voiceListening?: boolean;
  quickActions?: UniversalLauncherQuickAction[];
  onInput: (value: string) => void;
  onRun: () => void;
  onVoice: () => void;
  onQuickAction?: (action: UniversalLauncherQuickAction) => void;
};

export type UniversalLauncherQuickAction = {
  id: string;
  label: string;
  command: string;
  disabled?: boolean;
  disabledReason?: string;
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

export function getUniversalLauncherQuickActionFocusIndex(
  currentIndex: number,
  enabledActions: boolean[],
  key: string,
): number | null {
  const enabledIndexes = enabledActions
    .map((enabled, index) => (enabled ? index : -1))
    .filter((index) => index >= 0);
  if (!enabledIndexes.length) {
    return null;
  }

  if (key === "Home") {
    return enabledIndexes[0] ?? null;
  }
  if (key === "End") {
    return enabledIndexes[enabledIndexes.length - 1] ?? null;
  }

  const direction =
    key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!direction) {
    return null;
  }

  const currentEnabledIndex = enabledIndexes.indexOf(currentIndex);
  const baseIndex = currentEnabledIndex >= 0 ? currentEnabledIndex : 0;
  const nextIndex = (baseIndex + direction + enabledIndexes.length) % enabledIndexes.length;
  return enabledIndexes[nextIndex] ?? null;
}

function focusUniversalLauncherQuickAction(
  event: KeyboardEvent,
  currentIndex: number,
  actions: UniversalLauncherQuickAction[],
) {
  const nextIndex = getUniversalLauncherQuickActionFocusIndex(
    currentIndex,
    actions.map((action) => !action.disabled),
    event.key,
  );
  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  const actionButtons = Array.from(
    ((event.currentTarget as HTMLElement).parentElement ?? null)?.querySelectorAll<HTMLButtonElement>(
      "[data-launcher-quick-action]",
    ) ?? [],
  );
  actionButtons[nextIndex]?.focus();
}

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
      ${props.quickActions?.length
        ? html`
            <div class="universal-launcher__quick-actions" aria-label="SageOS quick actions">
              ${props.quickActions.map(
                (action, index) => html`
                  <button
                    class="overlay-button"
                    type="button"
                    data-launcher-quick-action=${action.id}
                    title=${action.disabledReason ?? action.command}
                    ?disabled=${action.disabled}
                    @click=${() => props.onQuickAction?.(action)}
                    @keydown=${(event: KeyboardEvent) =>
                      focusUniversalLauncherQuickAction(event, index, props.quickActions ?? [])}
                  >
                    ${action.label}
                  </button>
                `,
              )}
            </div>
          `
        : nothing}
    </section>
  `;
}
