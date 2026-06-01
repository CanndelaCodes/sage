import { defineConfig } from "tsdown";

const litInlinePackages = [
  /^lit($|\/)/,
  /^lit-element($|\/)/,
  /^lit-html($|\/)/,
  /^@lit\//,
  /^@lit-labs\/ssr-dom-shim($|\/)/,
];

export default defineConfig([
  {
    dts: false,
    entry: ["src/main/main.ts", "src/renderer/overlay-app.ts"],
    external: ["electron"],
    fixedExtension: false,
    format: "esm",
    inlineOnly: litInlinePackages,
    noExternal: [/^lit($|\/)/, /^@lit\//, /^lit-html($|\/)/],
    outDir: "dist",
    platform: "node",
  },
  {
    dts: false,
    entry: ["src/preload/preload.ts"],
    external: ["electron"],
    fixedExtension: true,
    format: "cjs",
    clean: false,
    outDir: "dist",
    platform: "node",
  },
]);
