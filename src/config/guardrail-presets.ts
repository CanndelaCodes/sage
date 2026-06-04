/**
 * Guardrail preset definitions.
 *
 * Maps each preset to per-category behavior ceilings, controlling how much
 * autonomy the agent has in each danger category.
 */

import type {
  DangerCategory,
  GuardrailActionBehavior,
  GuardrailPreset,
} from "./types.guardrails.js";

// ---------------------------------------------------------------------------
// Preset behaviour ceilings
// ---------------------------------------------------------------------------

/** The maximum behaviour allowed per category for each preset. */
export type PresetCategoryConfig = Record<DangerCategory, GuardrailActionBehavior>;

const ALL_CATEGORIES: DangerCategory[] = [
  "file_destruction",
  "system_modification",
  "network_exposure",
  "credential_access",
  "privilege_escalation",
  "data_exfiltration",
  "irreversible_change",
];

// -- Conservative: always confirm, never auto-proceed -----------------------

const CONSERVATIVE: PresetCategoryConfig = {
  file_destruction: "confirm_detailed",
  system_modification: "confirm_detailed",
  network_exposure: "confirm_detailed",
  credential_access: "block",
  privilege_escalation: "block",
  data_exfiltration: "block",
  irreversible_change: "confirm_detailed",
};

// -- Balanced (default): confirm for dangerous, warn for moderate -----------

const BALANCED: PresetCategoryConfig = {
  file_destruction: "confirm_brief",
  system_modification: "confirm_brief",
  network_exposure: "warn",
  credential_access: "confirm_detailed",
  privilege_escalation: "confirm_detailed",
  data_exfiltration: "confirm_detailed",
  irreversible_change: "confirm_brief",
};

// -- Maximum Autonomy: warn for dangerous, auto for moderate ----------------

const MAX_AUTONOMY: PresetCategoryConfig = {
  file_destruction: "warn",
  system_modification: "warn",
  network_exposure: "autonomous",
  credential_access: "confirm_brief",
  privilege_escalation: "confirm_brief",
  data_exfiltration: "warn",
  irreversible_change: "warn",
};

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

export const GUARDRAIL_PRESETS: Record<Exclude<GuardrailPreset, "custom">, PresetCategoryConfig> = {
  conservative: CONSERVATIVE,
  balanced: BALANCED,
  max_autonomy: MAX_AUTONOMY,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ordered restrictiveness: block > confirm_detailed > confirm_brief > warn > autonomous. */
const BEHAVIOR_ORDER: GuardrailActionBehavior[] = [
  "block",
  "confirm_detailed",
  "confirm_brief",
  "warn",
  "autonomous",
];

/** Return the more restrictive of two behaviors. */
export function mostRestrictiveBehavior(
  a: GuardrailActionBehavior,
  b: GuardrailActionBehavior,
): GuardrailActionBehavior {
  const indexA = BEHAVIOR_ORDER.indexOf(a);
  const indexB = BEHAVIOR_ORDER.indexOf(b);
  return indexA <= indexB ? a : b;
}

/** Convert a numeric trust score (0-1) into a behavior. */
export function scoreToActionBehavior(score: number): GuardrailActionBehavior {
  if (score < 0.2) {
    return "block";
  }
  if (score < 0.4) {
    return "confirm_detailed";
  }
  if (score < 0.6) {
    return "confirm_brief";
  }
  if (score < 0.8) {
    return "warn";
  }
  return "autonomous";
}

/** Get the preset category config. For "custom", returns balanced as base. */
export function resolvePresetConfig(preset: GuardrailPreset): PresetCategoryConfig {
  if (preset === "custom") {
    // Custom uses balanced as the base, overrides applied separately
    return { ...BALANCED };
  }
  return GUARDRAIL_PRESETS[preset];
}

/** All danger categories. */
export function allDangerCategories(): DangerCategory[] {
  return ALL_CATEGORIES;
}

/** Human-readable label for a danger category. */
export function categoryLabel(category: DangerCategory): string {
  const labels: Record<DangerCategory, string> = {
    file_destruction: "File Destruction",
    system_modification: "System Modification",
    network_exposure: "Network Exposure",
    credential_access: "Credential Access",
    privilege_escalation: "Privilege Escalation",
    data_exfiltration: "Data Exfiltration",
    irreversible_change: "Irreversible Change",
  };
  return labels[category];
}

/** Human-readable label for a preset. */
export function presetLabel(preset: GuardrailPreset): string {
  const labels: Record<GuardrailPreset, string> = {
    conservative: "Conservative",
    balanced: "Balanced",
    max_autonomy: "Maximum Autonomy",
    custom: "Custom",
  };
  return labels[preset];
}

/** Human-readable description for a preset. */
export function presetDescription(preset: GuardrailPreset): string {
  const descriptions: Record<GuardrailPreset, string> = {
    conservative:
      "Always asks before acting. Best for new users or sensitive projects. " +
      "Blocks credential access and privilege escalation entirely.",
    balanced:
      "Asks for dangerous operations, warns for moderate ones. " +
      "The recommended default for most users.",
    max_autonomy:
      "Minimal interruptions. Warns for dangerous operations, auto-proceeds " +
      "for moderate ones. Best for experienced users who trust their setup.",
    custom:
      "Fine-grained control over each danger category. " +
      "Start from Balanced and customize individual categories.",
  };
  return descriptions[preset];
}
