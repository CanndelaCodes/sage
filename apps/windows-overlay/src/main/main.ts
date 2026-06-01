import { app, globalShortcut } from "electron";
import path from "node:path";
import { createElectronOverlayAdapter } from "./electron-adapter.js";
import { createOverlayWindowController } from "./window-controller.js";

app.whenReady().then(() => {
  const controller = createOverlayWindowController(
    createElectronOverlayAdapter({
      rendererHtmlPath: path.join(app.getAppPath(), "dist", "renderer", "index.html"),
      preloadPath: path.join(app.getAppPath(), "dist", "preload", "preload.js"),
    }),
    {
      enabled: true,
      hotkey: process.env.SAGEOS_OVERLAY_HOTKEY ?? "Ctrl+Alt+Space",
      openMode: process.env.SAGEOS_OVERLAY_OPEN_MODE === "hud" ? "hud" : "full",
      hudExpandsToFull: true,
      passThroughDefault: false,
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations", "approvals", "incidents"],
    },
  );

  controller.start();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
