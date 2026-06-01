import { describe, expect, it } from "vitest";
import { createSageOsOverlayState, reduceSageOsOverlayState } from "./overlay-state.js";

describe("SageOS overlay state", () => {
  it("opens full overlay by default", () => {
    const state = createSageOsOverlayState({ openMode: "full" });
    expect(state.visible).toBe(false);

    const opened = reduceSageOsOverlayState(state, { type: "toggle" });
    expect(opened.visible).toBe(true);
    expect(opened.surface).toBe("commandDeck");
    expect(opened.pointerMode).toBe("focused");
  });

  it("opens HUD first and expands to the full overlay", () => {
    const state = createSageOsOverlayState({ openMode: "hud", hudExpandsToFull: true });
    const hud = reduceSageOsOverlayState(state, { type: "toggle" });
    const full = reduceSageOsOverlayState(hud, { type: "expand" });

    expect(hud.surface).toBe("hud");
    expect(hud.pointerMode).toBe("passThrough");
    expect(full.surface).toBe("commandDeck");
    expect(full.pointerMode).toBe("focused");
  });

  it("keeps pinned widgets pass-through capable", () => {
    const state = createSageOsOverlayState({
      pinnedWidgets: ["approvals"],
      passThroughDefault: true,
    });
    const opened = reduceSageOsOverlayState(state, { type: "toggle" });

    expect(opened.pointerMode).toBe("passThrough");
    expect(opened.pinnedWidgets).toEqual(["approvals"]);
  });
});
