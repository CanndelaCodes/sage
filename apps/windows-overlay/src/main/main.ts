import { app, globalShortcut, ipcMain } from "electron";
import { getOverlayAssetPaths } from "./asset-paths.js";
import { createElectronOverlayAdapter } from "./electron-adapter.js";
import { readOverlayLaunchConfig } from "./launch-config.js";
import { createOverlayWindowController } from "./window-controller.js";

void app
  .whenReady()
  .then(() => {
    const launchConfig = readOverlayLaunchConfig();
    const assetPaths = getOverlayAssetPaths(app.getAppPath());
    const controller = createOverlayWindowController(
      createElectronOverlayAdapter({
        rendererHtmlPath: assetPaths.rendererHtmlPath,
        preloadPath: assetPaths.preloadPath,
        rendererQuery: launchConfig.rendererQuery,
        activeMonitor: launchConfig.shell.activeMonitor,
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
  })
  .catch((err: unknown) => {
    console.error("Failed to start SageOS overlay", err);
    app.quit();
  });

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
