import { BrowserWindow, Tray, globalShortcut, nativeImage, screen, type Display } from "electron";
import path from "node:path";
import type { SageOsOverlayState } from "../../../../src/sageos/overlay-state.js";
import type { OverlayRendererQuery } from "./launch-config.js";
import type { OverlayShellAdapter } from "./window-controller.js";

export function createElectronOverlayAdapter(params: {
  rendererHtmlPath: string;
  preloadPath: string;
  rendererQuery?: OverlayRendererQuery;
  activeMonitor?: string;
}): OverlayShellAdapter {
  let window: BrowserWindow | null = null;
  let tray: Tray | null = null;

  const ensureWindow = () => {
    if (window) {
      return window;
    }

    const display = selectOverlayDisplay(params.activeMonitor);
    window = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      show: false,
      webPreferences: {
        preload: params.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    void window.loadFile(params.rendererHtmlPath, {
      query: params.rendererQuery,
    });
    return window;
  };

  const ensureTray = () => {
    if (tray) {
      return tray;
    }

    const icon = nativeImage.createFromPath(path.join(process.cwd(), "assets", "sage.png"));
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    return tray;
  };

  return {
    showFullOverlay() {
      const overlay = ensureWindow();
      overlay.setFullScreenable(false);
      overlay.show();
      overlay.focus();
      overlay.webContents.send("sageos-overlay:surface", "commandDeck");
    },
    showHud() {
      const overlay = ensureWindow();
      overlay.showInactive();
      overlay.webContents.send("sageos-overlay:surface", "hud");
    },
    showEdgeRail() {
      const overlay = ensureWindow();
      overlay.showInactive();
      overlay.webContents.send("sageos-overlay:surface", "edgeRail");
    },
    hideOverlay() {
      window?.hide();
    },
    setPassThrough(enabled) {
      window?.setIgnoreMouseEvents(enabled, { forward: true });
    },
    registerHotkey(hotkey, callback) {
      globalShortcut.unregister(hotkey);
      return globalShortcut.register(hotkey, callback);
    },
    setTrayState(state: SageOsOverlayState) {
      ensureTray().setToolTip(
        state.visible ? `SageOS overlay: ${state.surface}` : "SageOS overlay hidden",
      );
    },
  };
}

function selectOverlayDisplay(activeMonitor: string | undefined): Display {
  const monitor = activeMonitor?.trim();
  if (monitor === "primary") {
    return screen.getPrimaryDisplay();
  }

  if (monitor && monitor !== "auto") {
    const normalized = monitor.toLowerCase();
    const configured = screen.getAllDisplays().find(
      (display) =>
        String(display.id) === monitor || display.label?.trim().toLowerCase() === normalized,
    );
    if (configured) {
      return configured;
    }
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}
