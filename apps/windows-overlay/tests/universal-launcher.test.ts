import { describe, expect, it } from "vitest";
import {
  getUniversalLauncherQuickActionFocusIndex,
  getUniversalLauncherRunState,
  getUniversalLauncherVoiceState,
} from "../src/renderer/components/universal-launcher.js";

describe("Universal Launcher voice control", () => {
  it("omits the voice button when voice entry is not configured", () => {
    expect(
      getUniversalLauncherVoiceState({
        voiceEnabled: false,
        voiceAvailable: true,
        launcherDisabled: false,
      }),
    ).toEqual({ visible: false, disabled: true });
  });

  it("renders configured voice entry as disabled when speech recognition is unavailable", () => {
    expect(
      getUniversalLauncherVoiceState({
        voiceEnabled: true,
        voiceAvailable: false,
        launcherDisabled: false,
      }),
    ).toEqual({
      visible: true,
      disabled: true,
      title: "Voice input is not available in this Electron runtime.",
    });
  });

  it("enables push-to-talk when voice is configured and speech recognition exists", () => {
    expect(
      getUniversalLauncherVoiceState({
        voiceEnabled: true,
        voiceAvailable: true,
        launcherDisabled: false,
      }),
    ).toEqual({ visible: true, disabled: false, title: undefined });
  });

  it("explains why voice and run controls are disabled", () => {
    expect(
      getUniversalLauncherVoiceState({
        voiceEnabled: true,
        voiceAvailable: true,
        launcherDisabled: true,
        disabledReason: "Gateway unavailable",
      }),
    ).toEqual({
      visible: true,
      disabled: true,
      title: "Gateway unavailable",
    });
    expect(getUniversalLauncherRunState({ value: "", launcherDisabled: false })).toEqual({
      disabled: true,
      title: "Enter a SageOS command.",
    });
    expect(
      getUniversalLauncherRunState({
        value: "check SageOS health",
        launcherDisabled: true,
        disabledReason: "Gateway request in progress",
      }),
    ).toEqual({
      disabled: true,
      title: "Gateway request in progress",
    });
    expect(
      getUniversalLauncherRunState({ value: "check SageOS health", launcherDisabled: false }),
    ).toEqual({ disabled: false, title: undefined });
  });
});

describe("Universal Launcher keyboard navigation", () => {
  it("moves quick-action focus with arrow, home, and end keys while skipping disabled actions", () => {
    const enabledActions = [true, false, true, true];

    expect(getUniversalLauncherQuickActionFocusIndex(0, enabledActions, "ArrowRight")).toBe(2);
    expect(getUniversalLauncherQuickActionFocusIndex(2, enabledActions, "ArrowLeft")).toBe(0);
    expect(getUniversalLauncherQuickActionFocusIndex(3, enabledActions, "ArrowRight")).toBe(0);
    expect(getUniversalLauncherQuickActionFocusIndex(0, enabledActions, "ArrowLeft")).toBe(3);
    expect(getUniversalLauncherQuickActionFocusIndex(3, enabledActions, "Home")).toBe(0);
    expect(getUniversalLauncherQuickActionFocusIndex(0, enabledActions, "End")).toBe(3);
    expect(getUniversalLauncherQuickActionFocusIndex(0, [false, false], "ArrowRight")).toBeNull();
    expect(getUniversalLauncherQuickActionFocusIndex(0, enabledActions, "Tab")).toBeNull();
  });
});
