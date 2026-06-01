import { app, globalShortcut, ipcMain } from "electron";
import path from "node:path";
import { createElectronOverlayAdapter } from "./electron-adapter.js";
import { readOverlayLaunchConfig } from "./launch-config.js";
import { createOverlayWindowController } from "./window-controller.js";

app.whenReady().then(() => {
  const launchConfig = readOverlayLaunchConfig();
  const controller = createOverlayWindowController(
    createElectronOverlayAdapter({
      rendererHtmlPath: path.join(app.getAppPath(), "dist", "renderer", "index.html"),
      preloadPath: path.join(app.getAppPath(), "dist", "preload", "preload.js"),
      rendererQuery: launchConfig.rendererQuery,
    }),
    launchConfig.shell,
  );

  ipcMain.handle("sageos-overlay:expand", () => controller.expand());
  ipcMain.handle("sageos-overlay:collapse", () => controller.collapse());
  ipcMain.handle("sageos-overlay:close", () => controller.close());

  controller.start();
  if (launchConfig.openOnLaunch) {
    controller.toggle();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
