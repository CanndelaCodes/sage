import { describe, expect, it } from "vitest";
import { readOverlayLaunchConfig } from "../src/main/launch-config.js";

describe("overlay launch config", () => {
  it("maps environment settings into shell config and renderer gateway query", () => {
    const config = readOverlayLaunchConfig({
      SAGEOS_OVERLAY_HOTKEY: "Ctrl+Shift+Space",
      SAGEOS_OVERLAY_OPEN_MODE: "hud",
      SAGEOS_OVERLAY_HUD_EXPANDS_TO_FULL: "0",
      SAGEOS_OVERLAY_PASS_THROUGH_DEFAULT: "1",
      SAGEOS_OVERLAY_COLLAPSED_EDGE: "left",
      SAGEOS_OVERLAY_ACTIVE_MONITOR: "primary",
      SAGEOS_OVERLAY_PINNED_WIDGETS: "nightShift,systemHealth",
      SAGEOS_OVERLAY_VOICE_ENABLED: "1",
      SAGEOS_OVERLAY_VOICE_MODE: "pushToTalk",
      SAGEOS_OVERLAY_GATEWAY_URL: "ws://127.0.0.1:18888",
      SAGEOS_OVERLAY_TOKEN: "token-1",
      SAGEOS_OVERLAY_PASSWORD: "password-1",
      SAGEOS_OVERLAY_OPEN_ON_LAUNCH: "1",
    });

    expect(config.shell.hotkey).toBe("Ctrl+Shift+Space");
    expect(config.shell.openMode).toBe("hud");
    expect(config.shell.hudExpandsToFull).toBe(false);
    expect(config.shell.passThroughDefault).toBe(true);
    expect(config.shell.collapsedEdge).toBe("left");
    expect(config.shell.activeMonitor).toBe("primary");
    expect(config.shell.pinnedWidgets).toEqual(["nightShift", "systemHealth"]);
    expect(config.shell.voice).toEqual({ enabled: true, mode: "pushToTalk" });
    expect(config.openOnLaunch).toBe(true);
    expect(config.rendererQuery).toEqual({
      collapsedEdge: "left",
      gatewayUrl: "ws://127.0.0.1:18888",
      pinnedWidgets: "nightShift,systemHealth",
      token: "token-1",
      password: "password-1",
      surface: "hud",
      voice: "pushToTalk",
    });
  });

  it("defaults to the production MVP full overlay settings", () => {
    const config = readOverlayLaunchConfig({});

    expect(config.shell).toMatchObject({
      enabled: true,
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      hudExpandsToFull: true,
      collapsedEdge: "right",
    });
    expect(config.rendererQuery).toEqual({
      collapsedEdge: "right",
      pinnedWidgets: "activeOperations,approvals,incidents",
    });
  });

  it("does not expose voice entry when voice config is missing or disabled", () => {
    expect(
      readOverlayLaunchConfig({
        SAGEOS_OVERLAY_VOICE_ENABLED: "0",
        SAGEOS_OVERLAY_VOICE_MODE: "pushToTalk",
      }).rendererQuery,
    ).not.toHaveProperty("voice");

    expect(
      readOverlayLaunchConfig({
        SAGEOS_OVERLAY_VOICE_ENABLED: "1",
        SAGEOS_OVERLAY_VOICE_MODE: "alwaysOn",
      }).rendererQuery,
    ).not.toHaveProperty("voice");
  });
});
