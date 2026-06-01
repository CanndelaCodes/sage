import path from "node:path";
import { describe, expect, it } from "vitest";
import { getOverlayAssetPaths } from "../src/main/asset-paths.js";

describe("overlay asset paths", () => {
  it("uses a CommonJS preload bridge so Electron exposes renderer IPC APIs", () => {
    const appPath = path.join("C:", "Sage", "windows-overlay");

    expect(getOverlayAssetPaths(appPath)).toEqual({
      rendererHtmlPath: path.join(appPath, "dist", "renderer", "index.html"),
      preloadPath: path.join(appPath, "dist", "preload.cjs"),
    });
  });
});
