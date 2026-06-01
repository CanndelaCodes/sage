import path from "node:path";

export type OverlayAssetPaths = {
  rendererHtmlPath: string;
  preloadPath: string;
};

export function getOverlayAssetPaths(appPath: string): OverlayAssetPaths {
  return {
    rendererHtmlPath: path.join(appPath, "dist", "renderer", "index.html"),
    preloadPath: path.join(appPath, "dist", "preload.cjs"),
  };
}
