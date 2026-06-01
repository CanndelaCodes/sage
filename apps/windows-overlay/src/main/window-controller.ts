import {
  createSageOsOverlayState,
  reduceSageOsOverlayState,
  type SageOsOverlayState,
} from "../../../../src/sageos/overlay-state.js";
import type { SageOsOverlayConfig } from "../../../../src/sageos/types.js";

export type OverlayShellAdapter = {
  showFullOverlay: () => void;
  showHud: () => void;
  showEdgeRail: () => void;
  hideOverlay: () => void;
  setPassThrough: (enabled: boolean) => void;
  registerHotkey: (hotkey: string, callback: () => void) => boolean;
  setTrayState: (state: SageOsOverlayState) => void;
};

export function createOverlayWindowController(
  adapter: OverlayShellAdapter,
  config: SageOsOverlayConfig,
) {
  let state = createSageOsOverlayState(config);

  const render = () => {
    if (!state.visible) {
      adapter.hideOverlay();
      adapter.setTrayState(state);
      return;
    }

    adapter.setPassThrough(state.pointerMode === "passThrough");
    if (state.surface === "hud") {
      adapter.showHud();
    } else if (state.surface === "edgeRail") {
      adapter.showEdgeRail();
    } else {
      adapter.showFullOverlay();
    }
    adapter.setTrayState(state);
  };

  const controller = {
    start() {
      const hotkey = config.hotkey ?? "Ctrl+Alt+Space";
      const hotkeyRegistered = adapter.registerHotkey(hotkey, () => controller.toggle());
      if (!hotkeyRegistered) {
        throw new Error(`SageOS overlay hotkey registration failed for ${hotkey}`);
      }
      adapter.setTrayState(state);
    },
    state() {
      return state;
    },
    toggle() {
      state = reduceSageOsOverlayState(state, { type: "toggle" });
      render();
    },
    expand() {
      state = reduceSageOsOverlayState(state, { type: "expand" });
      render();
    },
    collapse() {
      state = reduceSageOsOverlayState(state, { type: "collapse" });
      render();
    },
    close() {
      state = reduceSageOsOverlayState(state, { type: "close" });
      render();
    },
  };

  return controller;
}
