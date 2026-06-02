import { describe, expect, it } from "vitest";
import {
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
