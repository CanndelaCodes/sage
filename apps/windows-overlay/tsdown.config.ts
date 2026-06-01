import { defineConfig } from "tsdown";

export default defineConfig({
  dts: false,
  entry: ["src/main/main.ts", "src/preload/preload.ts", "src/renderer/overlay-app.ts"],
  external: ["electron"],
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
});
