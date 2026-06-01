import { defineConfig } from "tsdown";

export default defineConfig({
  dts: false,
  entry: ["src/main/main.ts", "src/preload/preload.ts", "src/renderer/overlay-app.ts"],
  external: ["electron"],
  fixedExtension: false,
  format: "esm",
  inlineOnly: [
    /^lit($|\/)/,
    /^lit-element($|\/)/,
    /^lit-html($|\/)/,
    /^@lit\//,
    /^@lit-labs\/ssr-dom-shim($|\/)/,
  ],
  noExternal: [/^lit($|\/)/, /^@lit\//, /^lit-html($|\/)/],
  outDir: "dist",
  platform: "node",
});
