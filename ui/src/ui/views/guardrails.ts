import { html, nothing, type TemplateResult } from "lit";
import type {
  DangerCategory,
  GuardrailActionBehavior,
  GuardrailPreset,
} from "../../config/types.guardrails.js";
import {
  allDangerCategories,
  categoryLabel,
  presetDescription,
  presetLabel,
  resolvePresetConfig,
} from "../../config/guardrail-presets.js";

// ---------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------

export type GuardrailsViewState = {
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  preset: GuardrailPreset;
  customOverrides: Partial<Record<DangerCategory, GuardrailActionBehavior>>;
  adaptiveTrust: boolean;
  warnAutoApproveSeconds: number;
};

export function defaultGuardrailsViewState(): GuardrailsViewState {
  return {
    loading: false,
    saving: false,
    dirty: false,
    preset: "balanced",
    customOverrides: {},
    adaptiveTrust: true,
    warnAutoApproveSeconds: 3,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type GuardrailsProps = {
  state: GuardrailsViewState;
  onPresetChange: (preset: GuardrailPreset) => void;
  onCategoryOverride: (category: DangerCategory, behavior: GuardrailActionBehavior) => void;
  onAdaptiveTrustToggle: (enabled: boolean) => void;
  onWarnAutoApproveChange: (seconds: number) => void;
  onSave: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Behavior display helpers
// ---------------------------------------------------------------------------

const BEHAVIOR_LABELS: Record<GuardrailActionBehavior, string> = {
  block: "Block",
  confirm_detailed: "Confirm (detailed)",
  confirm_brief: "Confirm (brief)",
  warn: "Warn",
  autonomous: "Autonomous",
};

const BEHAVIOR_DESCRIPTIONS: Record<GuardrailActionBehavior, string> = {
  block: "Always blocked. Agent cannot perform this action.",
  confirm_detailed: "Requires detailed confirmation with full context.",
  confirm_brief: "Requires quick confirmation before proceeding.",
  warn: "Shows a warning, auto-proceeds after timeout.",
  autonomous: "Agent proceeds without asking.",
};

const BEHAVIOR_ORDER: GuardrailActionBehavior[] = [
  "block",
  "confirm_detailed",
  "confirm_brief",
  "warn",
  "autonomous",
];

function behaviorClass(behavior: GuardrailActionBehavior): string {
  switch (behavior) {
    case "block":
      return "guardrail-behavior--block";
    case "confirm_detailed":
    case "confirm_brief":
      return "guardrail-behavior--confirm";
    case "warn":
      return "guardrail-behavior--warn";
    case "autonomous":
      return "guardrail-behavior--auto";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderGuardrails(props: GuardrailsProps): TemplateResult {
  const { state } = props;
  const resolvedConfig = resolvePresetConfig(state.preset);

  return html`
    <section class="card guardrails-section">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">Agent Guardrails</div>
          <div class="card-sub">
            Control how much autonomy the agent has for potentially dangerous operations.
          </div>
        </div>
        ${
          state.dirty
            ? html`
                <button
                  class="btn primary"
                  ?disabled=${state.saving}
                  @click=${() => props.onSave()}
                >
                  ${state.saving ? "Saving..." : "Save Changes"}
                </button>
              `
            : nothing
        }
      </div>

      ${renderPresetSelector(props)}
      ${renderCategoryGrid(props, resolvedConfig)}
      ${renderAdvancedSettings(props)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Preset selector
// ---------------------------------------------------------------------------

function renderPresetSelector(props: GuardrailsProps): TemplateResult {
  const presets: GuardrailPreset[] = ["conservative", "balanced", "max_autonomy", "custom"];
  return html`
    <div class="guardrails-presets" style="margin-top: 20px;">
      <div class="guardrails-presets-label">Safety Preset</div>
      <div class="guardrails-presets-grid">
        ${presets.map((p) => renderPresetCard(props, p))}
      </div>
    </div>
  `;
}

function renderPresetCard(props: GuardrailsProps, preset: GuardrailPreset): TemplateResult {
  const active = props.state.preset === preset;
  return html`
    <button
      class="guardrails-preset-card ${active ? "guardrails-preset-card--active" : ""}"
      @click=${() => props.onPresetChange(preset)}
    >
      <div class="guardrails-preset-card__name">${presetLabel(preset)}</div>
      <div class="guardrails-preset-card__desc">${presetDescription(preset)}</div>
    </button>
  `;
}

// ---------------------------------------------------------------------------
// Category grid
// ---------------------------------------------------------------------------

function renderCategoryGrid(
  props: GuardrailsProps,
  resolvedConfig: Record<DangerCategory, GuardrailActionBehavior>,
): TemplateResult {
  const categories = allDangerCategories();
  const isCustom = props.state.preset === "custom";
  return html`
    <div class="guardrails-categories" style="margin-top: 20px;">
      <div class="guardrails-categories-label">
        Category Behaviors
        ${isCustom ? html`<span class="muted"> (click to customize)</span>` : nothing}
      </div>
      <div class="guardrails-category-grid">
        ${categories.map((cat) => {
          const effectiveBehavior = isCustom
            ? (props.state.customOverrides[cat] ?? resolvedConfig[cat])
            : resolvedConfig[cat];
          return renderCategoryRow(props, cat, effectiveBehavior, isCustom);
        })}
      </div>
    </div>
  `;
}

function renderCategoryRow(
  props: GuardrailsProps,
  category: DangerCategory,
  behavior: GuardrailActionBehavior,
  editable: boolean,
): TemplateResult {
  return html`
    <div class="guardrails-category-row">
      <div class="guardrails-category-row__name">${categoryLabel(category)}</div>
      <div class="guardrails-category-row__behavior">
        ${
          editable
            ? html`
                <select
                  class="guardrails-behavior-select ${behaviorClass(behavior)}"
                  .value=${behavior}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement;
                    props.onCategoryOverride(
                      category,
                      target.value as GuardrailActionBehavior,
                    );
                  }}
                >
                  ${BEHAVIOR_ORDER.map(
                    (b) => html`
                      <option value=${b} ?selected=${b === behavior}>
                        ${BEHAVIOR_LABELS[b]}
                      </option>
                    `,
                  )}
                </select>
              `
            : html`
                <span
                  class="guardrails-behavior-badge ${behaviorClass(behavior)}"
                  title=${BEHAVIOR_DESCRIPTIONS[behavior]}
                >
                  ${BEHAVIOR_LABELS[behavior]}
                </span>
              `
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Advanced settings
// ---------------------------------------------------------------------------

function renderAdvancedSettings(props: GuardrailsProps): TemplateResult {
  const { state } = props;
  return html`
    <details class="guardrails-advanced" style="margin-top: 20px;">
      <summary>Advanced Settings</summary>
      <div class="guardrails-advanced-content" style="margin-top: 12px;">
        <div class="guardrails-setting-row">
          <label class="guardrails-setting-label">
            <input
              type="checkbox"
              .checked=${state.adaptiveTrust}
              @change=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                props.onAdaptiveTrustToggle(target.checked);
              }}
            />
            Adaptive Trust
          </label>
          <div class="guardrails-setting-desc">
            When enabled, the agent learns from your approval patterns and gradually
            reduces confirmation prompts for operations you consistently approve.
          </div>
        </div>
        <div class="guardrails-setting-row" style="margin-top: 12px;">
          <label class="guardrails-setting-label">
            Auto-approve timeout (seconds)
          </label>
          <input
            type="number"
            class="guardrails-number-input"
            min="0"
            max="30"
            .value=${String(state.warnAutoApproveSeconds)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              props.onWarnAutoApproveChange(Number(target.value));
            }}
          />
          <div class="guardrails-setting-desc">
            For "warn" behavior, how long to display the warning before auto-proceeding.
            Set to 0 to require manual dismissal.
          </div>
        </div>
      </div>
    </details>
  `;
}
