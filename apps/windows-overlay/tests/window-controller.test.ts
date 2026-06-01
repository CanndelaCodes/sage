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
    registerHotkey: vi.fn().mockReturnValue(true),
    setTrayState: vi.fn(),
    setTrayActions: vi.fn(),
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

  it("opens and closes through the registered global hotkey callback", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      passThroughDefault: false,
    });

    controller.start();
    const callback = vi.mocked(adapter.registerHotkey).mock.calls[0]?.[1];
    expect(callback).toEqual(expect.any(Function));

    callback?.();
    callback?.();

    expect(adapter.showFullOverlay).toHaveBeenCalledTimes(1);
    expect(adapter.hideOverlay).toHaveBeenCalledTimes(1);
  });

  it("fails startup when the requested global hotkey cannot be registered", () => {
    const adapter = fakeAdapter();
    vi.mocked(adapter.registerHotkey).mockReturnValue(false);
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      passThroughDefault: false,
    });

    expect(() => controller.start()).toThrow(
      "SageOS overlay hotkey registration failed for Ctrl+Alt+Space",
    );
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

  it("can show HUD directly for mouse-first tray commands", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      passThroughDefault: false,
    });

    controller.showHud();

    expect(adapter.showHud).toHaveBeenCalledTimes(1);
    expect(adapter.setPassThrough).toHaveBeenCalledWith(true);
  });
});
