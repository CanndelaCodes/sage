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
    const adapter = createElectronOverlayAdapter({
      rendererHtmlPath: assetPaths.rendererHtmlPath,
      preloadPath: assetPaths.preloadPath,
      rendererQuery: launchConfig.rendererQuery,
      activeMonitor: launchConfig.shell.activeMonitor,
    });
    const controller = createOverlayWindowController(adapter, launchConfig.shell);
    adapter.setTrayActions({
      open: () => controller.expand(),
      showHud: () => controller.showHud(),
      collapse: () => controller.collapse(),
      hide: () => controller.close(),
      quit: () => app.quit(),
    });

    ipcMain.handle("sageos-overlay:expand", () => controller.expand());
    ipcMain.handle("sageos-overlay:collapse", () => controller.collapse());
    ipcMain.handle("sageos-overlay:close", () => controller.close());
    ipcMain.handle("sageos-overlay:interactive-pointer", (_event, active: unknown) =>
      controller.setInteractivePointer(Boolean(active)),
    );

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
