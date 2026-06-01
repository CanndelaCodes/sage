import { describe, expect, it, vi } from "vitest";
import {
  createOverlayWindowController,
  type OverlayShellAdapter,
} from "../src/main/window-controller.js";

function fakeAdapter(): OverlayShellAdapter {
  return {
    showFullOverlay: vi.fn(),
    showHud: vi.fn(),
    showEdgeRail: vi.fn(),
    hideOverlay: vi.fn(),
    setPassThrough: vi.fn(),
    registerHotkey: vi.fn(),
    setTrayState: vi.fn(),
  };
}

describe("overlay window controller", () => {
  it("registers the configured hotkey and toggles full overlay", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      passThroughDefault: false,
    });

    controller.start();
    controller.toggle();

    expect(adapter.registerHotkey).toHaveBeenCalledWith("Ctrl+Alt+Space", expect.any(Function));
    expect(adapter.showFullOverlay).toHaveBeenCalledTimes(1);
    expect(adapter.setPassThrough).toHaveBeenCalledWith(false);
  });

  it("opens HUD first when configured", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "hud",
      hudExpandsToFull: true,
      passThroughDefault: true,
    });

    controller.toggle();

    expect(adapter.showHud).toHaveBeenCalledTimes(1);
    expect(adapter.setPassThrough).toHaveBeenCalledWith(true);
  });
});
