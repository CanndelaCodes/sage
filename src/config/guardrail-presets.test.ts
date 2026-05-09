import { describe, expect, it } from "vitest";
import {
  allDangerCategories,
  categoryLabel,
  GUARDRAIL_PRESETS,
  mostRestrictiveBehavior,
  presetDescription,
  presetLabel,
  resolvePresetConfig,
  scoreToActionBehavior,
} from "./guardrail-presets.js";

describe("GUARDRAIL_PRESETS", () => {
  it("defines all three named presets", () => {
    expect(Object.keys(GUARDRAIL_PRESETS)).toEqual(["conservative", "balanced", "max_autonomy"]);
  });

  it("each preset covers all danger categories", () => {
    const categories = allDangerCategories();
    for (const [name, preset] of Object.entries(GUARDRAIL_PRESETS)) {
      for (const cat of categories) {
        expect(preset[cat], `${name} missing ${cat}`).toBeDefined();
      }
    }
  });

  it("conservative never allows autonomous", () => {
    const preset = GUARDRAIL_PRESETS.conservative;
    for (const behavior of Object.values(preset)) {
      expect(behavior).not.toBe("autonomous");
    }
  });

  it("conservative blocks credential_access and privilege_escalation", () => {
    expect(GUARDRAIL_PRESETS.conservative.credential_access).toBe("block");
    expect(GUARDRAIL_PRESETS.conservative.privilege_escalation).toBe("block");
  });

  it("balanced is less restrictive than conservative for network_exposure", () => {
    // balanced uses "warn", conservative uses "confirm_detailed"
    expect(GUARDRAIL_PRESETS.balanced.network_exposure).toBe("warn");
    expect(GUARDRAIL_PRESETS.conservative.network_exposure).toBe("confirm_detailed");
  });

  it("max_autonomy allows autonomous for network_exposure", () => {
    expect(GUARDRAIL_PRESETS.max_autonomy.network_exposure).toBe("autonomous");
  });
});

describe("resolvePresetConfig", () => {
  it("returns balanced for custom preset (as base)", () => {
    const config = resolvePresetConfig("custom");
    expect(config).toEqual(GUARDRAIL_PRESETS.balanced);
  });

  it("returns the correct preset for named presets", () => {
    expect(resolvePresetConfig("conservative")).toBe(GUARDRAIL_PRESETS.conservative);
    expect(resolvePresetConfig("balanced")).toBe(GUARDRAIL_PRESETS.balanced);
    expect(resolvePresetConfig("max_autonomy")).toBe(GUARDRAIL_PRESETS.max_autonomy);
  });
});

describe("mostRestrictiveBehavior", () => {
  it("block beats everything", () => {
    expect(mostRestrictiveBehavior("block", "autonomous")).toBe("block");
    expect(mostRestrictiveBehavior("autonomous", "block")).toBe("block");
  });

  it("confirm_detailed beats confirm_brief", () => {
    expect(mostRestrictiveBehavior("confirm_detailed", "confirm_brief")).toBe("confirm_detailed");
  });

  it("same behavior returns itself", () => {
    expect(mostRestrictiveBehavior("warn", "warn")).toBe("warn");
  });

  it("autonomous is least restrictive", () => {
    expect(mostRestrictiveBehavior("autonomous", "warn")).toBe("warn");
    expect(mostRestrictiveBehavior("autonomous", "autonomous")).toBe("autonomous");
  });
});

describe("scoreToActionBehavior", () => {
  it("maps score ranges to correct behaviors", () => {
    expect(scoreToActionBehavior(0.0)).toBe("block");
    expect(scoreToActionBehavior(0.1)).toBe("block");
    expect(scoreToActionBehavior(0.2)).toBe("confirm_detailed");
    expect(scoreToActionBehavior(0.3)).toBe("confirm_detailed");
    expect(scoreToActionBehavior(0.4)).toBe("confirm_brief");
    expect(scoreToActionBehavior(0.5)).toBe("confirm_brief");
    expect(scoreToActionBehavior(0.6)).toBe("warn");
    expect(scoreToActionBehavior(0.7)).toBe("warn");
    expect(scoreToActionBehavior(0.8)).toBe("autonomous");
    expect(scoreToActionBehavior(1.0)).toBe("autonomous");
  });
});

describe("allDangerCategories", () => {
  it("returns 7 categories", () => {
    expect(allDangerCategories()).toHaveLength(7);
  });
});

describe("categoryLabel", () => {
  it("returns human-readable labels", () => {
    expect(categoryLabel("file_destruction")).toBe("File Destruction");
    expect(categoryLabel("credential_access")).toBe("Credential Access");
  });
});

describe("presetLabel", () => {
  it("returns human-readable labels for all presets", () => {
    expect(presetLabel("conservative")).toBe("Conservative");
    expect(presetLabel("balanced")).toBe("Balanced");
    expect(presetLabel("max_autonomy")).toBe("Maximum Autonomy");
    expect(presetLabel("custom")).toBe("Custom");
  });
});

describe("presetDescription", () => {
  it("returns non-empty descriptions for all presets", () => {
    for (const preset of ["conservative", "balanced", "max_autonomy", "custom"] as const) {
      expect(presetDescription(preset).length).toBeGreaterThan(10);
    }
  });
});
