import { describe, expect, it, vi } from "vitest";
import { createOverlayWindowController } from "../src/main/window-controller.js";

describe("overlay pass-through behavior", () => {
  it("uses pass-through for edge rail and restores focus for full overlay", () => {
    const adapter = {
      showFullOverlay: vi.fn(),
      showHud: vi.fn(),
      showEdgeRail: vi.fn(),
      hideOverlay: vi.fn(),
      setPassThrough: vi.fn(),
      registerHotkey: vi.fn(),
      setTrayState: vi.fn(),
    };
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
    });

    controller.toggle();
    controller.collapse();
    controller.expand();

    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(1, false);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(2, true);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(3, false);
  });

  it("temporarily captures overlay controls while a pass-through surface is visible", () => {
    const adapter = {
      showFullOverlay: vi.fn(),
      showHud: vi.fn(),
      showEdgeRail: vi.fn(),
      hideOverlay: vi.fn(),
      setPassThrough: vi.fn(),
      registerHotkey: vi.fn(),
      setTrayState: vi.fn(),
    };
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
    });

    controller.toggle();
    controller.collapse();
    controller.setInteractivePointer(true);
    controller.setInteractivePointer(false);
    controller.expand();
    controller.setInteractivePointer(true);

    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(2, true);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(3, false);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(4, true);
    expect(adapter.setPassThrough).toHaveBeenCalledTimes(5);
  });
});
