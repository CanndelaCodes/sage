# SageOS Windows Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-usable Windows overlay shell that becomes SageOS's primary MVP UI.

**Architecture:** Add overlay config and a pure overlay state machine to core SageOS, then add a Windows desktop overlay package under `apps/windows-overlay/`. The overlay shell owns global hotkey, transparent always-on-top windows, tray status, pass-through pinned widgets, and renderer IPC; the renderer consumes existing `sageos.*` gateway RPC methods and presents Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, and Pinned Widgets.

**Tech Stack:** TypeScript, Electron, Lit, Vitest, existing gateway WebSocket RPC protocol, pnpm workspaces, Windows user-session startup.

## Execution Status

Status: implemented and verified for the Windows overlay MVP shell as of 2026-06-02.

Current evidence:

- `pnpm exec vitest run --config vitest.config.ts src/config/sageos-schema.test.ts src/sageos/overlay-state.test.ts` passed with 8 tests.
- `pnpm --dir apps/windows-overlay test` passed with 78 tests.
- `pnpm --dir apps/windows-overlay typecheck` passed.
- `pnpm --dir apps/windows-overlay build` passed.
- `pnpm tsgo`, `pnpm lint`, and `pnpm build` passed during the same 2026-06-02 continuation after the startup CLI integration.
- `git diff --check` passed for the startup CLI slice and this plan reconciliation.
- `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md` records the current smoke evidence, screenshot paths, keyboard checks, pass-through probe, tray controls, voice availability behavior, gateway connection/action availability behavior, Edge Rail drill-down targets, Universal Launcher disabled-state behavior, and Liquid Linear visual contract evidence.
- Follow-up CLI integration is complete in `sage os overlay startup install|status|uninstall`, so the active-user Windows startup shortcut can be managed from SageOS config instead of only the package script.

The checked steps below reflect completed implementation work. Keep the original task details as the implementation recipe and acceptance mapping for future audits.

---

## File Structure

- Modify `pnpm-workspace.yaml`: include `apps/windows-overlay` as a workspace package.
- Modify `src/sageos/types.ts`: add overlay config/status types.
- Create `src/sageos/overlay-state.ts`: pure reducer for open mode, collapsed mode, pass-through mode, active surface, active workspace target, and pinned widgets.
- Create `src/sageos/overlay-state.test.ts`: unit tests for overlay state transitions.
- Modify `src/config/zod-schema.ts`: validate `sageos.overlay`.
- Modify `src/config/sageos-schema.test.ts`: cover accepted and rejected overlay config.
- Create `apps/windows-overlay/package.json`: app package scripts and dependencies.
- Create `apps/windows-overlay/tsconfig.json`: TypeScript config for main, preload, renderer, and tests.
- Create `apps/windows-overlay/vitest.config.ts`: Vitest config for pure modules and renderer tests.
- Create `apps/windows-overlay/src/main/window-controller.ts`: platform-neutral overlay window state controller.
- Create `apps/windows-overlay/src/main/electron-adapter.ts`: Electron BrowserWindow, globalShortcut, Tray, and screen adapter.
- Create `apps/windows-overlay/src/main/main.ts`: application entrypoint.
- Create `apps/windows-overlay/src/preload/preload.ts`: typed IPC bridge exposed to the renderer.
- Create `apps/windows-overlay/src/renderer/gateway-client.ts`: gateway WebSocket RPC client adapted from `ui/src/ui/gateway.ts`.
- Create `apps/windows-overlay/src/renderer/sageos-actions.ts`: overlay RPC wrappers for status, controls, approvals, tasks, and repairs.
- Create `apps/windows-overlay/src/renderer/overlay-app.ts`: Lit root component and surface routing.
- Create `apps/windows-overlay/src/renderer/components/*.ts`: Command Deck, Launcher, Workspace, HUD, Edge Rail, and Pinned Widget components.
- Create `apps/windows-overlay/src/renderer/styles.css`: overlay-specific layout and states.
- Create `apps/windows-overlay/src/renderer/index.html`: renderer host.
- Create `apps/windows-overlay/tests/*.test.ts`: app-level tests for shell, gateway actions, and renderer behavior.
- Create `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`: manual Windows smoke checklist and captured results.

## Task 1: Overlay Config Contract

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/config/zod-schema.ts`
- Modify: `src/config/sageos-schema.test.ts`

- [x] **Step 1: Write failing config tests**

Add these cases to `src/config/sageos-schema.test.ts`.

```ts
it("accepts the SageOS Windows overlay config namespace", () => {
  const parsed = SageSchema.parse({
    sageos: {
      overlay: {
        enabled: true,
        hotkey: "Ctrl+Alt+Space",
        openMode: "full",
        hudExpandsToFull: true,
        passThroughDefault: false,
        collapsedEdge: "right",
        activeMonitor: "auto",
        showApprovalBadge: true,
        showIncidentBadge: true,
        pinnedWidgets: ["activeOperations", "approvals", "incidents"],
        voice: {
          enabled: true,
          mode: "pushToTalk",
        },
      },
    },
  });

  expect(parsed.sageos?.overlay?.hotkey).toBe("Ctrl+Alt+Space");
  expect(parsed.sageos?.overlay?.openMode).toBe("full");
  expect(parsed.sageos?.overlay?.pinnedWidgets).toEqual([
    "activeOperations",
    "approvals",
    "incidents",
  ]);
  expect(parsed.sageos?.overlay?.voice?.mode).toBe("pushToTalk");
});

it("rejects invalid SageOS overlay config values", () => {
  expect(() =>
    SageSchema.parse({
      sageos: {
        overlay: {
          openMode: "browser",
          collapsedEdge: "center",
          pinnedWidgets: ["unknownWidget"],
        },
      },
    }),
  ).toThrow();
});
```

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/config/sageos-schema.test.ts
```

Expected: FAIL because `sageos.overlay` is not in the schema or `SageOsConfig`.

- [x] **Step 2: Add overlay types**

Add these exports near the existing SageOS config types in `src/sageos/types.ts`.

```ts
export const SAGEOS_OVERLAY_OPEN_MODES = ["full", "hud"] as const;
export type SageOsOverlayOpenMode = (typeof SAGEOS_OVERLAY_OPEN_MODES)[number];

export const SAGEOS_OVERLAY_EDGES = ["left", "right", "top", "bottom"] as const;
export type SageOsOverlayEdge = (typeof SAGEOS_OVERLAY_EDGES)[number];

export const SAGEOS_OVERLAY_WIDGET_IDS = [
  "activeOperations",
  "approvals",
  "incidents",
  "memoryQueue",
  "nightShift",
  "systemHealth",
  "appPreview",
] as const;
export type SageOsOverlayWidgetId = (typeof SAGEOS_OVERLAY_WIDGET_IDS)[number];

export type SageOsOverlayConfig = {
  enabled?: boolean;
  hotkey?: string;
  openMode?: SageOsOverlayOpenMode;
  hudExpandsToFull?: boolean;
  passThroughDefault?: boolean;
  collapsedEdge?: SageOsOverlayEdge;
  activeMonitor?: "auto" | "primary" | string;
  showApprovalBadge?: boolean;
  showIncidentBadge?: boolean;
  pinnedWidgets?: SageOsOverlayWidgetId[];
  voice?: {
    enabled?: boolean;
    mode?: "pushToTalk";
  };
};
```

Then extend `SageOsConfig`:

```ts
  commandCenter?: { enabled?: boolean };
  overlay?: SageOsOverlayConfig;
  sources?: Partial<Record<string, boolean>>;
```

- [x] **Step 3: Add schema validation**

In `src/config/zod-schema.ts`, add the overlay schema beside `commandCenter`.

```ts
const SageOsOverlayOpenModeSchema = z.enum(["full", "hud"]);
const SageOsOverlayEdgeSchema = z.enum(["left", "right", "top", "bottom"]);
const SageOsOverlayWidgetSchema = z.enum([
  "activeOperations",
  "approvals",
  "incidents",
  "memoryQueue",
  "nightShift",
  "systemHealth",
  "appPreview",
]);
```

Inside `SageOsSchema`, insert:

```ts
    overlay: z
      .object({
        enabled: z.boolean().optional(),
        hotkey: z.string().min(1).optional(),
        openMode: SageOsOverlayOpenModeSchema.optional(),
        hudExpandsToFull: z.boolean().optional(),
        passThroughDefault: z.boolean().optional(),
        collapsedEdge: SageOsOverlayEdgeSchema.optional(),
        activeMonitor: z.union([z.literal("auto"), z.literal("primary"), z.string().min(1)]).optional(),
        showApprovalBadge: z.boolean().optional(),
        showIncidentBadge: z.boolean().optional(),
        pinnedWidgets: z.array(SageOsOverlayWidgetSchema).optional(),
        voice: z
          .object({
            enabled: z.boolean().optional(),
            mode: z.literal("pushToTalk").optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
```

- [x] **Step 4: Verify config tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/config/sageos-schema.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit config contract**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay config contract" src/sageos/types.ts src/config/zod-schema.ts src/config/sageos-schema.test.ts
```

## Task 2: Pure Overlay State Machine

**Files:**

- Create: `src/sageos/overlay-state.ts`
- Create: `src/sageos/overlay-state.test.ts`

- [x] **Step 1: Write failing reducer tests**

Create `src/sageos/overlay-state.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { createSageOsOverlayState, reduceSageOsOverlayState } from "./overlay-state.js";

describe("SageOS overlay state", () => {
  it("opens full overlay by default", () => {
    const state = createSageOsOverlayState({ openMode: "full" });
    expect(state.visible).toBe(false);

    const opened = reduceSageOsOverlayState(state, { type: "toggle" });
    expect(opened.visible).toBe(true);
    expect(opened.surface).toBe("commandDeck");
    expect(opened.pointerMode).toBe("focused");
  });

  it("opens HUD first and expands to the full overlay", () => {
    const state = createSageOsOverlayState({ openMode: "hud", hudExpandsToFull: true });
    const hud = reduceSageOsOverlayState(state, { type: "toggle" });
    const full = reduceSageOsOverlayState(hud, { type: "expand" });

    expect(hud.surface).toBe("hud");
    expect(full.surface).toBe("commandDeck");
  });

  it("keeps pinned widgets pass-through capable", () => {
    const state = createSageOsOverlayState({
      pinnedWidgets: ["approvals"],
      passThroughDefault: true,
    });
    const opened = reduceSageOsOverlayState(state, { type: "toggle" });

    expect(opened.pointerMode).toBe("passThrough");
    expect(opened.pinnedWidgets).toEqual(["approvals"]);
  });
});
```

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/overlay-state.test.ts
```

Expected: FAIL because `src/sageos/overlay-state.ts` does not exist.

- [x] **Step 2: Add the reducer**

Create `src/sageos/overlay-state.ts`.

```ts
import type { SageOsOverlayConfig, SageOsOverlayEdge, SageOsOverlayWidgetId } from "./types.js";

export type SageOsOverlaySurface = "commandDeck" | "launcher" | "workspace" | "hud" | "edgeRail";

export type SageOsOverlayPointerMode = "focused" | "passThrough";

export type SageOsOverlayWorkspaceTarget = {
  kind:
    | "employee"
    | "task"
    | "run"
    | "approval"
    | "incident"
    | "repo"
    | "workflow"
    | "skill"
    | "app";
  id: string;
};

export type SageOsOverlayState = {
  visible: boolean;
  surface: SageOsOverlaySurface;
  pointerMode: SageOsOverlayPointerMode;
  collapsedEdge: SageOsOverlayEdge;
  pinnedWidgets: SageOsOverlayWidgetId[];
  workspaceTarget?: SageOsOverlayWorkspaceTarget;
};

export type SageOsOverlayAction =
  | { type: "toggle" }
  | { type: "close" }
  | { type: "expand" }
  | { type: "collapse" }
  | { type: "showLauncher" }
  | { type: "showCommandDeck" }
  | { type: "showWorkspace"; target: SageOsOverlayWorkspaceTarget }
  | { type: "setPointerMode"; pointerMode: SageOsOverlayPointerMode }
  | { type: "pinWidget"; widget: SageOsOverlayWidgetId }
  | { type: "unpinWidget"; widget: SageOsOverlayWidgetId };

export function createSageOsOverlayState(config: SageOsOverlayConfig = {}): SageOsOverlayState {
  return {
    visible: false,
    surface: config.openMode === "hud" ? "hud" : "commandDeck",
    pointerMode: config.passThroughDefault ? "passThrough" : "focused",
    collapsedEdge: config.collapsedEdge ?? "right",
    pinnedWidgets: [...(config.pinnedWidgets ?? ["activeOperations", "approvals", "incidents"])],
  };
}

export function reduceSageOsOverlayState(
  state: SageOsOverlayState,
  action: SageOsOverlayAction,
): SageOsOverlayState {
  switch (action.type) {
    case "toggle":
      return { ...state, visible: !state.visible };
    case "close":
      return { ...state, visible: false };
    case "expand":
    case "showCommandDeck":
      return { ...state, visible: true, surface: "commandDeck", pointerMode: "focused" };
    case "collapse":
      return { ...state, visible: true, surface: "edgeRail", pointerMode: "passThrough" };
    case "showLauncher":
      return { ...state, visible: true, surface: "launcher", pointerMode: "focused" };
    case "showWorkspace":
      return {
        ...state,
        visible: true,
        surface: "workspace",
        pointerMode: "focused",
        workspaceTarget: action.target,
      };
    case "setPointerMode":
      return { ...state, pointerMode: action.pointerMode };
    case "pinWidget":
      return state.pinnedWidgets.includes(action.widget)
        ? state
        : { ...state, pinnedWidgets: [...state.pinnedWidgets, action.widget] };
    case "unpinWidget":
      return {
        ...state,
        pinnedWidgets: state.pinnedWidgets.filter((widget) => widget !== action.widget),
      };
  }
}
```

- [x] **Step 3: Verify reducer tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/overlay-state.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit state machine**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay state machine" src/sageos/overlay-state.ts src/sageos/overlay-state.test.ts
```

## Task 3: Windows Overlay Workspace Package

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `apps/windows-overlay/package.json`
- Create: `apps/windows-overlay/tsconfig.json`
- Create: `apps/windows-overlay/vitest.config.ts`
- Create: `apps/windows-overlay/scripts/copy-renderer-assets.mjs`
- Create: `apps/windows-overlay/src/renderer/index.html`
- Create: `apps/windows-overlay/src/renderer/styles.css`

- [x] **Step 1: Add the workspace package**

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - .
  - ui
  - packages/*
  - extensions/*
  - apps/windows-overlay
```

Create `apps/windows-overlay/package.json`.

```json
{
  "name": "@sage/windows-overlay",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "build": "tsdown src/main/main.ts src/preload/preload.ts src/renderer/overlay-app.ts --format esm --dts false --out-dir dist && node scripts/copy-renderer-assets.mjs",
    "dev": "pnpm build && electron .",
    "test": "vitest run --config vitest.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "lit": "^3.3.2"
  },
  "devDependencies": {
    "electron": "^38.0.0",
    "tsdown": "^0.20.1",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

- [x] **Step 2: Add TypeScript and Vitest config**

Create `apps/windows-overlay/tsconfig.json`.

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "../..",
    "types": ["node", "vitest"]
  },
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts",
    "../../src/sageos/**/*.ts",
    "../../ui/src/ui/gateway.ts"
  ]
}
```

Create `apps/windows-overlay/vitest.config.ts`.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [x] **Step 3: Add renderer asset copy script**

Create `apps/windows-overlay/scripts/copy-renderer-assets.mjs`.

```js
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rendererOut = path.join(root, "dist", "renderer");

await mkdir(rendererOut, { recursive: true });
await copyFile(
  path.join(root, "src", "renderer", "index.html"),
  path.join(rendererOut, "index.html"),
);
await copyFile(
  path.join(root, "src", "renderer", "styles.css"),
  path.join(rendererOut, "styles.css"),
);
```

- [x] **Step 4: Add renderer host files**

Create `apps/windows-overlay/src/renderer/index.html`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SageOS Overlay</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <sageos-overlay-app></sageos-overlay-app>
    <script type="module" src="./overlay-app.js"></script>
  </body>
</html>
```

Create `apps/windows-overlay/src/renderer/styles.css`.

```css
:root {
  color-scheme: dark;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  background: transparent;
  color: #f7f7f2;
}

html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

button,
input {
  font: inherit;
}
```

- [x] **Step 5: Install workspace dependencies**

Run:

```powershell
pnpm install
```

Expected: `pnpm-lock.yaml` updates with the overlay package dependencies.

- [x] **Step 6: Verify package typecheck starts cleanly**

Run:

```powershell
pnpm --dir apps/windows-overlay typecheck
```

Expected: PASS because no TypeScript source exists yet beyond config.

- [x] **Step 7: Commit package scaffold**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: scaffold Windows overlay package" pnpm-workspace.yaml pnpm-lock.yaml apps/windows-overlay/package.json apps/windows-overlay/tsconfig.json apps/windows-overlay/vitest.config.ts apps/windows-overlay/scripts/copy-renderer-assets.mjs apps/windows-overlay/src/renderer/index.html apps/windows-overlay/src/renderer/styles.css
```

## Task 4: Electron Window And Hotkey Controller

**Files:**

- Create: `apps/windows-overlay/src/main/window-controller.ts`
- Create: `apps/windows-overlay/src/main/electron-adapter.ts`
- Create: `apps/windows-overlay/src/main/main.ts`
- Create: `apps/windows-overlay/tests/window-controller.test.ts`

- [x] **Step 1: Write failing window controller tests**

Create `apps/windows-overlay/tests/window-controller.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createOverlayWindowController,
  type OverlayShellAdapter,
} from "../src/main/window-controller.js";

function fakeAdapter(): OverlayShellAdapter {
  return {
    showFullOverlay: vi.fn(),
    showHud: vi.fn(),
    showEdgeRail: vi.fn(),
    hideOverlay: vi.fn(),
    setPassThrough: vi.fn(),
    registerHotkey: vi.fn(),
    setTrayState: vi.fn(),
  };
}

describe("overlay window controller", () => {
  it("registers the configured hotkey and toggles full overlay", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
      passThroughDefault: false,
    });

    controller.start();
    controller.toggle();

    expect(adapter.registerHotkey).toHaveBeenCalledWith("Ctrl+Alt+Space", expect.any(Function));
    expect(adapter.showFullOverlay).toHaveBeenCalledTimes(1);
    expect(adapter.setPassThrough).toHaveBeenCalledWith(false);
  });

  it("opens HUD first when configured", () => {
    const adapter = fakeAdapter();
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "hud",
      hudExpandsToFull: true,
      passThroughDefault: true,
    });

    controller.toggle();

    expect(adapter.showHud).toHaveBeenCalledTimes(1);
    expect(adapter.setPassThrough).toHaveBeenCalledWith(true);
  });
});
```

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/window-controller.test.ts
```

Expected: FAIL because the controller does not exist.

- [x] **Step 2: Add platform-neutral controller**

Create `apps/windows-overlay/src/main/window-controller.ts`.

```ts
import {
  createSageOsOverlayState,
  reduceSageOsOverlayState,
  type SageOsOverlayState,
} from "../../../../src/sageos/overlay-state.js";
import type { SageOsOverlayConfig } from "../../../../src/sageos/types.js";

export type OverlayShellAdapter = {
  showFullOverlay(): void;
  showHud(): void;
  showEdgeRail(): void;
  hideOverlay(): void;
  setPassThrough(enabled: boolean): void;
  registerHotkey(hotkey: string, callback: () => void): void;
  setTrayState(state: SageOsOverlayState): void;
};

export function createOverlayWindowController(
  adapter: OverlayShellAdapter,
  config: SageOsOverlayConfig,
) {
  let state = createSageOsOverlayState(config);

  function render() {
    if (!state.visible) {
      adapter.hideOverlay();
      adapter.setTrayState(state);
      return;
    }
    adapter.setPassThrough(state.pointerMode === "passThrough");
    if (state.surface === "hud") {
      adapter.showHud();
    } else if (state.surface === "edgeRail") {
      adapter.showEdgeRail();
    } else {
      adapter.showFullOverlay();
    }
    adapter.setTrayState(state);
  }

  return {
    start() {
      adapter.registerHotkey(config.hotkey ?? "Ctrl+Alt+Space", () => this.toggle());
      adapter.setTrayState(state);
    },
    state() {
      return state;
    },
    toggle() {
      state = reduceSageOsOverlayState(state, { type: "toggle" });
      render();
    },
    expand() {
      state = reduceSageOsOverlayState(state, { type: "expand" });
      render();
    },
    collapse() {
      state = reduceSageOsOverlayState(state, { type: "collapse" });
      render();
    },
    close() {
      state = reduceSageOsOverlayState(state, { type: "close" });
      render();
    },
  };
}
```

- [x] **Step 3: Add Electron adapter**

Create `apps/windows-overlay/src/main/electron-adapter.ts`.

```ts
import { BrowserWindow, Tray, globalShortcut, nativeImage, screen } from "electron";
import path from "node:path";
import type { SageOsOverlayState } from "../../../../src/sageos/overlay-state.js";
import type { OverlayShellAdapter } from "./window-controller.js";

export function createElectronOverlayAdapter(params: {
  rendererHtmlPath: string;
  preloadPath: string;
}): OverlayShellAdapter {
  let window: BrowserWindow | null = null;
  let tray: Tray | null = null;

  function ensureWindow() {
    if (window) {
      return window;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
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
    void window.loadFile(params.rendererHtmlPath);
    return window;
  }

  function ensureTray() {
    if (tray) {
      return tray;
    }
    const icon = nativeImage.createFromPath(path.join(process.cwd(), "assets", "sage.png"));
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    return tray;
  }

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
      globalShortcut.register(hotkey, callback);
    },
    setTrayState(state: SageOsOverlayState) {
      ensureTray().setToolTip(
        state.visible ? `SageOS overlay: ${state.surface}` : "SageOS overlay hidden",
      );
    },
  };
}
```

- [x] **Step 4: Add main entrypoint**

Create `apps/windows-overlay/src/main/main.ts`.

```ts
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
```

- [x] **Step 5: Verify controller tests pass**

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/window-controller.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit shell controller**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay shell controller" apps/windows-overlay/src/main/window-controller.ts apps/windows-overlay/src/main/electron-adapter.ts apps/windows-overlay/src/main/main.ts apps/windows-overlay/tests/window-controller.test.ts
```

## Task 5: Preload Bridge And Gateway Actions

**Files:**

- Create: `apps/windows-overlay/src/preload/preload.ts`
- Create: `apps/windows-overlay/src/renderer/gateway-client.ts`
- Create: `apps/windows-overlay/src/renderer/sageos-actions.ts`
- Create: `apps/windows-overlay/tests/sageos-actions.test.ts`

- [x] **Step 1: Write failing action tests**

Create `apps/windows-overlay/tests/sageos-actions.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  approveSageOsApproval,
  emergencyStopSageOs,
  loadSageOsOverlayStatus,
  pauseSageOs,
  queueSageOsTask,
  resumeSageOs,
  stopSageOs,
} from "../src/renderer/sageos-actions.js";

describe("SageOS overlay actions", () => {
  it("loads status through sageos.status", async () => {
    const request = vi.fn().mockResolvedValue({ status: { mode: "execute_scoped" } });
    const result = await loadSageOsOverlayStatus({ request });
    expect(request).toHaveBeenCalledWith("sageos.status", {});
    expect(result.status.mode).toBe("execute_scoped");
  });

  it("uses existing control, approval, and task RPC methods", async () => {
    const request = vi.fn().mockResolvedValue({ state: {} });
    await pauseSageOs({ request });
    await resumeSageOs({ request });
    await stopSageOs({ request });
    await emergencyStopSageOs({ request });
    await approveSageOsApproval({ request }, "approval_1");
    await queueSageOsTask({ request }, "task_1");

    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "paused",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "running",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "stopped",
      emergency: false,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.control", {
      state: "stopped",
      emergency: true,
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.approvals.resolve", {
      id: "approval_1",
      decision: "approved",
      reason: "windows-overlay",
    });
    expect(request).toHaveBeenCalledWith("sageos.tasks.queue", {
      id: "task_1",
      reason: "windows-overlay",
    });
  });
});
```

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/sageos-actions.test.ts
```

Expected: FAIL because action wrappers do not exist.

- [x] **Step 2: Add preload bridge**

Create `apps/windows-overlay/src/preload/preload.ts`.

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sageOsOverlay", {
  onSurface(callback: (surface: string) => void) {
    ipcRenderer.on("sageos-overlay:surface", (_event, surface) => callback(String(surface)));
  },
});
```

- [x] **Step 3: Add gateway client interface and action wrappers**

Create `apps/windows-overlay/src/renderer/gateway-client.ts`.

```ts
export type OverlayGatewayClient = {
  request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
};
```

Create `apps/windows-overlay/src/renderer/sageos-actions.ts`.

```ts
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";
import type { OverlayGatewayClient } from "./gateway-client.js";

export function loadSageOsOverlayStatus(client: OverlayGatewayClient) {
  return client.request<SageOsPersistedState>("sageos.status", {});
}

export function pauseSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsPersistedState>("sageos.control", {
    state: "paused",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function resumeSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsPersistedState>("sageos.control", {
    state: "running",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function stopSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsPersistedState>("sageos.control", {
    state: "stopped",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function emergencyStopSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsPersistedState>("sageos.control", {
    state: "stopped",
    emergency: true,
    reason: "windows-overlay",
  });
}

export function approveSageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "approved",
    reason: "windows-overlay",
  });
}

export function denySageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "denied",
    reason: "windows-overlay",
  });
}

export function queueSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.queue", { id, reason: "windows-overlay" });
}

export function runNextSageOsTask(client: OverlayGatewayClient) {
  return client.request("sageos.tasks.runNext", {});
}

export function cancelSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.cancel", { id, reason: "windows-overlay" });
}
```

- [x] **Step 4: Verify action tests pass**

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/sageos-actions.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit gateway bridge**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay gateway actions" apps/windows-overlay/src/preload/preload.ts apps/windows-overlay/src/renderer/gateway-client.ts apps/windows-overlay/src/renderer/sageos-actions.ts apps/windows-overlay/tests/sageos-actions.test.ts
```

## Task 6: Overlay Renderer Surfaces

**Files:**

- Create: `apps/windows-overlay/src/renderer/overlay-app.ts`
- Create: `apps/windows-overlay/src/renderer/components/command-deck.ts`
- Create: `apps/windows-overlay/src/renderer/components/universal-launcher.ts`
- Create: `apps/windows-overlay/src/renderer/components/agent-workspace.ts`
- Create: `apps/windows-overlay/src/renderer/components/compact-hud.ts`
- Create: `apps/windows-overlay/src/renderer/components/edge-rail.ts`
- Create: `apps/windows-overlay/src/renderer/components/pinned-widgets.ts`
- Modify: `apps/windows-overlay/src/renderer/styles.css`
- Create: `apps/windows-overlay/tests/overlay-renderer.test.ts`

- [x] **Step 1: Write failing renderer tests**

Create `apps/windows-overlay/tests/overlay-renderer.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { renderOverlayModel } from "../src/renderer/overlay-app.js";

const state = {
  status: {
    mode: "execute_scoped",
    supervisor: { state: "running", enabled: true, paused: false },
    approvals: { pending: 2 },
    tasks: { total: 3, active: 1, queued: 1, blocked: 1 },
    incidents: [{ id: "incident_1", severity: "warning", title: "Memory queue backlog" }],
  },
  tasks: [{ id: "task_1", title: "Night Shift report", state: "running" }],
  approvals: [{ id: "approval_1", title: "Approve repair", state: "pending" }],
};

describe("overlay renderer model", () => {
  it("maps SageOS state into Command Deck cards", () => {
    const model = renderOverlayModel(state as never);
    expect(model.commandDeck.cards.map((card) => card.title)).toEqual([
      "Supervisor",
      "Active Operations",
      "Approvals",
      "Incidents",
    ]);
  });

  it("maps the same state into HUD and Edge Rail badges", () => {
    const model = renderOverlayModel(state as never);
    expect(model.hud.badges).toEqual([
      { label: "Tasks", value: "1" },
      { label: "Approvals", value: "2" },
      { label: "Incidents", value: "1" },
    ]);
    expect(model.edgeRail.badges).toContainEqual({ kind: "approval", count: 2 });
  });
});
```

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/overlay-renderer.test.ts
```

Expected: FAIL because the renderer model does not exist.

- [x] **Step 2: Add renderer model and root component**

Create `apps/windows-overlay/src/renderer/overlay-app.ts`.

```ts
import { LitElement, css, html } from "lit";
import type { SageOsPersistedState } from "../../../../src/sageos/state-store.js";

export type OverlayCard = { title: string; value: string; detail: string };
export type OverlayBadge = { label: string; value: string };

export function renderOverlayModel(state: SageOsPersistedState) {
  const status = state.status;
  const activeTasks = String(status.tasks.active);
  const pendingApprovals = String(status.approvals.pending);
  const incidents = String(status.incidents.length);
  return {
    commandDeck: {
      cards: [
        {
          title: "Supervisor",
          value: status.supervisor.state,
          detail: status.supervisor.paused ? "Paused" : "Running",
        },
        { title: "Active Operations", value: activeTasks, detail: `${status.tasks.queued} queued` },
        { title: "Approvals", value: pendingApprovals, detail: "Pending decisions" },
        { title: "Incidents", value: incidents, detail: "Needs review" },
      ] satisfies OverlayCard[],
    },
    hud: {
      badges: [
        { label: "Tasks", value: activeTasks },
        { label: "Approvals", value: pendingApprovals },
        { label: "Incidents", value: incidents },
      ] satisfies OverlayBadge[],
    },
    edgeRail: {
      badges: [
        { kind: "health", count: status.supervisor.state === "running" ? 0 : 1 },
        { kind: "approval", count: status.approvals.pending },
        { kind: "incident", count: status.incidents.length },
      ],
    },
  };
}

export class SageOsOverlayApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: rgba(18, 20, 22, 0.72);
      backdrop-filter: blur(16px);
    }
  `;

  render() {
    return html`<main class="overlay-shell"><slot></slot></main>`;
  }
}

customElements.define("sageos-overlay-app", SageOsOverlayApp);
```

- [x] **Step 3: Add component modules**

Create each component with exported pure render helpers first, then attach them to the root component once tests pass.

`apps/windows-overlay/src/renderer/components/command-deck.ts`:

```ts
import { html } from "lit";
import type { OverlayCard } from "../overlay-app.js";

export function renderCommandDeck(cards: OverlayCard[]) {
  return html`
    <section class="command-deck">
      ${cards.map(
        (card) => html`
          <article class="overlay-card">
            <div class="overlay-card__title">${card.title}</div>
            <div class="overlay-card__value">${card.value}</div>
            <div class="overlay-card__detail">${card.detail}</div>
          </article>
        `,
      )}
    </section>
  `;
}
```

`apps/windows-overlay/src/renderer/components/universal-launcher.ts`:

```ts
import { html } from "lit";

export function renderUniversalLauncher() {
  return html`
    <section class="universal-launcher">
      <input aria-label="SageOS command" placeholder="Ask SageOS..." />
      <button type="button" aria-label="Start voice command">Voice</button>
      <button type="button">Run</button>
    </section>
  `;
}
```

`apps/windows-overlay/src/renderer/components/agent-workspace.ts`:

```ts
import { html } from "lit";

export function renderAgentWorkspace(title: string, detail: string) {
  return html`
    <section class="agent-workspace">
      <h2>${title}</h2>
      <p>${detail}</p>
    </section>
  `;
}
```

`apps/windows-overlay/src/renderer/components/compact-hud.ts`:

```ts
import { html } from "lit";
import type { OverlayBadge } from "../overlay-app.js";

export function renderCompactHud(badges: OverlayBadge[]) {
  return html`
    <section class="compact-hud">
      ${badges.map((badge) => html`<span class="hud-badge">${badge.label}: ${badge.value}</span>`)}
    </section>
  `;
}
```

`apps/windows-overlay/src/renderer/components/edge-rail.ts`:

```ts
import { html } from "lit";

export function renderEdgeRail(badges: { kind: string; count: number }[]) {
  return html`
    <nav class="edge-rail" aria-label="SageOS edge rail">
      ${badges.map((badge) => html`<button type="button">${badge.kind} ${badge.count}</button>`)}
    </nav>
  `;
}
```

`apps/windows-overlay/src/renderer/components/pinned-widgets.ts`:

```ts
import { html } from "lit";
import type { SageOsOverlayWidgetId } from "../../../../../src/sageos/types.js";

export function renderPinnedWidgets(widgets: SageOsOverlayWidgetId[]) {
  return html`
    <aside class="pinned-widgets">
      ${widgets.map((widget) => html`<section class="pinned-widget">${widget}</section>`)}
    </aside>
  `;
}
```

- [x] **Step 4: Add overlay styles**

Append to `apps/windows-overlay/src/renderer/styles.css`.

```css
.overlay-shell {
  width: min(1440px, calc(100vw - 48px));
  height: calc(100vh - 48px);
  margin: 24px auto;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
}

.command-deck {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overlay-card,
.agent-workspace,
.pinned-widget {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(20, 24, 28, 0.86);
  padding: 14px;
}

.overlay-card__title,
.overlay-card__detail {
  color: #b7c1bd;
  font-size: 12px;
}

.overlay-card__value {
  margin-top: 8px;
  font-size: 24px;
  line-height: 1.1;
}

.universal-launcher {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
}

.compact-hud {
  position: fixed;
  right: 18px;
  bottom: 18px;
  display: flex;
  gap: 8px;
}

.hud-badge {
  border-radius: 999px;
  padding: 8px 10px;
  background: rgba(20, 24, 28, 0.88);
}

.edge-rail {
  position: fixed;
  right: 0;
  top: 20vh;
  display: grid;
  gap: 8px;
  padding: 8px;
}

.pinned-widgets {
  position: fixed;
  right: 18px;
  top: 18px;
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
}
```

- [x] **Step 5: Verify renderer tests pass**

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/overlay-renderer.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit renderer surfaces**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay renderer surfaces" apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/src/renderer/components/command-deck.ts apps/windows-overlay/src/renderer/components/universal-launcher.ts apps/windows-overlay/src/renderer/components/agent-workspace.ts apps/windows-overlay/src/renderer/components/compact-hud.ts apps/windows-overlay/src/renderer/components/edge-rail.ts apps/windows-overlay/src/renderer/components/pinned-widgets.ts apps/windows-overlay/src/renderer/styles.css apps/windows-overlay/tests/overlay-renderer.test.ts
```

## Task 7: Pass-through, Pinned Widgets, And IPC Surface Switching

**Files:**

- Modify: `apps/windows-overlay/src/preload/preload.ts`
- Modify: `apps/windows-overlay/src/renderer/overlay-app.ts`
- Modify: `apps/windows-overlay/src/main/window-controller.ts`
- Create: `apps/windows-overlay/tests/pass-through.test.ts`

- [x] **Step 1: Write failing pass-through tests**

Create `apps/windows-overlay/tests/pass-through.test.ts`.

```ts
import { describe, expect, it, vi } from "vitest";
import { createOverlayWindowController } from "../src/main/window-controller.js";

describe("overlay pass-through behavior", () => {
  it("uses pass-through for edge rail and restores focus for full overlay", () => {
    const adapter = {
      showFullOverlay: vi.fn(),
      showHud: vi.fn(),
      showEdgeRail: vi.fn(),
      hideOverlay: vi.fn(),
      setPassThrough: vi.fn(),
      registerHotkey: vi.fn(),
      setTrayState: vi.fn(),
    };
    const controller = createOverlayWindowController(adapter, {
      hotkey: "Ctrl+Alt+Space",
      openMode: "full",
    });

    controller.toggle();
    controller.collapse();
    controller.expand();

    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(1, false);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(2, true);
    expect(adapter.setPassThrough).toHaveBeenNthCalledWith(3, false);
  });
});
```

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/pass-through.test.ts
```

Expected: PASS if Task 4 set pointer modes correctly. If it fails, update `window-controller.ts` so `collapse()` sends pass-through and `expand()` sends focused mode.

- [x] **Step 2: Extend preload bridge with user actions**

Update `apps/windows-overlay/src/preload/preload.ts`.

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sageOsOverlay", {
  onSurface(callback: (surface: string) => void) {
    ipcRenderer.on("sageos-overlay:surface", (_event, surface) => callback(String(surface)));
  },
  expand() {
    return ipcRenderer.invoke("sageos-overlay:expand");
  },
  collapse() {
    return ipcRenderer.invoke("sageos-overlay:collapse");
  },
  close() {
    return ipcRenderer.invoke("sageos-overlay:close");
  },
});
```

- [x] **Step 3: Wire IPC handlers**

Update `apps/windows-overlay/src/main/main.ts` so controller methods are reachable from renderer controls.

```ts
import { app, globalShortcut, ipcMain } from "electron";
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

  ipcMain.handle("sageos-overlay:expand", () => controller.expand());
  ipcMain.handle("sageos-overlay:collapse", () => controller.collapse());
  ipcMain.handle("sageos-overlay:close", () => controller.close());

  controller.start();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
```

- [x] **Step 4: Add renderer controls for surface switching**

Update `SageOsOverlayApp.render()` in `apps/windows-overlay/src/renderer/overlay-app.ts` to include controls with stable labels.

```ts
  render() {
    return html`
      <main class="overlay-shell">
        <nav class="overlay-toolbar" aria-label="SageOS overlay controls">
          <button type="button" @click=${() => window.sageOsOverlay?.expand()}>Full</button>
          <button type="button" @click=${() => window.sageOsOverlay?.collapse()}>Rail</button>
          <button type="button" @click=${() => window.sageOsOverlay?.close()}>Close</button>
        </nav>
        <slot></slot>
      </main>
    `;
  }
```

Add the global declaration above the class:

```ts
declare global {
  interface Window {
    sageOsOverlay?: {
      expand(): Promise<void>;
      collapse(): Promise<void>;
      close(): Promise<void>;
      onSurface(callback: (surface: string) => void): void;
    };
  }
}
```

- [x] **Step 5: Verify pass-through tests pass**

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/pass-through.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit pass-through behavior**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: wire overlay pass-through controls" apps/windows-overlay/src/preload/preload.ts apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/src/main/main.ts apps/windows-overlay/src/main/window-controller.ts apps/windows-overlay/tests/pass-through.test.ts
```

## Task 8: Startup, Packaging, And Operator Smoke Checklist

**Files:**

- Modify: `apps/windows-overlay/package.json`
- Create: `scripts/sageos-windows-overlay.ps1`
- Create: `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`

- [x] **Step 1: Add app launch script**

Create `scripts/sageos-windows-overlay.ps1`.

```powershell
param(
  [string]$Hotkey = "Ctrl+Alt+Space",
  [ValidateSet("full", "hud")]
  [string]$OpenMode = "full"
)

$ErrorActionPreference = "Stop"
$env:SAGEOS_OVERLAY_HOTKEY = $Hotkey
$env:SAGEOS_OVERLAY_OPEN_MODE = $OpenMode
pnpm --dir apps/windows-overlay dev
```

- [x] **Step 2: Add package scripts**

Update `apps/windows-overlay/package.json` scripts:

```json
{
  "scripts": {
    "build": "tsdown src/main/main.ts src/preload/preload.ts src/renderer/overlay-app.ts --format esm --dts false --out-dir dist && node scripts/copy-renderer-assets.mjs",
    "dev": "pnpm build && electron .",
    "smoke": "powershell -ExecutionPolicy Bypass -File ../../scripts/sageos-windows-overlay.ps1",
    "test": "vitest run --config vitest.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [x] **Step 3: Add manual smoke checklist**

Create `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`.

```markdown
# SageOS Windows Overlay Smoke Checklist

Date:
Operator:
Build:

## Preconditions

- Windows desktop session is active.
- Sage gateway is running locally.
- `pnpm install` has completed.

## Checks

- [ ] `pnpm --dir apps/windows-overlay typecheck` passes.
- [ ] `pnpm --dir apps/windows-overlay test` passes.
- [ ] `pnpm --dir apps/windows-overlay build` passes.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -Hotkey "Ctrl+Alt+Space" -OpenMode full` starts the overlay.
- [ ] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [ ] `Ctrl+Alt+Space` closes the overlay.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [ ] HUD expands to full overlay.
- [ ] Edge Rail collapse keeps health, approval, incident, and active-operation indicators visible.
- [ ] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [ ] Pause, resume, stop, approve, deny, queue, cancel, and emergency stop controls call the expected `sageos.*` RPC methods.
- [ ] No renderer console errors appear during the smoke flow.

## Evidence

- Screenshot path:
- Notes:
```

- [x] **Step 4: Verify packaging scripts**

Run:

```powershell
pnpm --dir apps/windows-overlay typecheck
pnpm --dir apps/windows-overlay test
pnpm --dir apps/windows-overlay build
```

Expected: all three commands PASS.

- [x] **Step 5: Commit startup and smoke docs**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: add overlay startup smoke path" apps/windows-overlay/package.json scripts/sageos-windows-overlay.ps1 docs/superpowers/artifacts/sageos-windows-overlay-smoke.md
```

## Task 9: Vitreous Liquor Visual Polish And Experience Gate

**Files:**

- Modify: `apps/windows-overlay/src/renderer/styles.css`
- Modify: `apps/windows-overlay/src/renderer/overlay-app.ts`
- Modify: `apps/windows-overlay/src/renderer/components/*.ts`
- Modify/Create: `apps/windows-overlay/tests/overlay-visual-contract.test.ts`
- Modify: `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`

This is an MVP release gate, not a post-MVP cleanup task. The Windows overlay is the primary SageOS interface and must feel production-grade before MVP handoff.

Reference PeakHQ's design language before implementation:

```powershell
Get-Content C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\PEAKHQ_DESIGN_LANGUAGE.md
Get-Content C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\components\ui\glass-card.tsx
Get-Content C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\components\ui\glass-button.tsx
Get-Content C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\styles\tokens.css
```

SageOS should adopt Liquid Linear command glass for the MVP overlay: Apple-like liquid glass material physics plus Linear-like command hierarchy, density, restraint, and operational precision. This was selected as visual companion Option B and is specified in `docs/superpowers/specs/2026-06-01-sageos-liquid-linear-overlay-design.md`.

The implementation should keep the Sage-specific Vitreus/Vitreous Liquor foundation: neutral charcoal and cool platinum surfaces, layered glass elevation, crisp borders, rim highlights, restrained blur, scan-friendly operational density, and spring-calibrated motion. Do not copy PeakHQ, Apple, or Linear branding directly.

- [x] **Step 1: Write visual contract tests**

Add tests that assert the overlay stylesheet exposes SageOS material tokens and state classes:

- `--sageos-bg`, `--sageos-surface-*`, `--sageos-glass-*`, `--sageos-liquid-*`, `--sageos-border-*`, `--sageos-shadow-*`, `--sageos-accent-*`, `--sageos-motion-*`.
- Surface classes for command deck, HUD, edge rail, pinned widgets, toolbar, launcher, panels, rows, buttons, focus states, loading, empty, error, degraded, success, warning, critical, and disabled states.
- Reduced-motion media query.
- Text overflow guards for rows, cards, badges, buttons, and pinned widgets.

Run:

```powershell
pnpm --dir apps/windows-overlay test -- tests/overlay-visual-contract.test.ts
```

Expected: FAIL until the visual token layer and state classes exist.

- [x] **Step 2: Add SageOS Vitreous Liquor token layer**

Refactor `styles.css` so visual constants live in a small token section:

- Background: transparent overlay root, neutral charcoal command surfaces, cool platinum-compatible light fallback.
- Glass: background alpha levels, opacity floors, blur scale, saturation, border colors, rim highlight colors.
- Liquid Linear elevation: ambient, command, focus, summit.
- Status: primary, success, warning, danger, info.
- Motion: fast, normal, slow, snappy, responsive, smooth, reduced-motion fallbacks.
- Radius and spacing: compact system controls, 8px default cards, stable dimensions for buttons/badges/widgets.

- [x] **Step 3: Polish every overlay surface**

Apply the token layer to:

- Command Deck cards and overview groups.
- Universal Launcher input, voice/run controls, command execution states.
- Agent Workspace facts and action rows.
- Active operation, approval, coding report, incident, resource, and system rows.
- Compact HUD.
- Edge Rail.
- Pinned Widgets.
- Loading, waiting, empty, error, disabled, disconnected, degraded, and success states.

Every visible control must have hover, focus-visible, pressed, disabled, loading or pending, and success/error affordances where applicable.

- [x] **Step 4: Verify GUI/UX/CX/DX quality with screenshots**

Run automated and manual visual checks:

```powershell
pnpm --dir apps/windows-overlay test
pnpm --dir apps/windows-overlay typecheck
pnpm --dir apps/windows-overlay build
```

Then run the overlay smoke script and capture screenshots for:

- Full Command Deck over a dark desktop/app.
- Full Command Deck over a bright desktop/app.
- HUD mode.
- Edge Rail.
- Pinned Widgets.
- Empty/loading/error/disconnected state where practical.

Manual acceptance:

- Text never overlaps or clips inside cards, rows, badges, or buttons.
- Pinned widgets are legible over dark, light, text-heavy, browser, and IDE backgrounds.
- Edge Rail is precise enough for mouse targeting and does not block underlying work outside controls.
- Keyboard focus is visible and ordered.
- Reduced motion is respected.
- UI density is enterprise/operations-grade, not marketing-style.
- Apple-like liquid glass depth is visible, but Linear-like row density, command hierarchy, and contrast remain dominant.
- No in-app explanatory filler text replaces actual controls.

- [x] **Step 5: Record visual evidence and commit**

Update `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md` with visual polish evidence:

- Screenshot paths.
- Build SHA.
- Surfaces checked.
- Accessibility and reduced-motion notes.
- Known visual issues, if any.

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: polish overlay visual system" apps/windows-overlay/src/renderer/styles.css apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/src/renderer/components docs/superpowers/artifacts/sageos-windows-overlay-smoke.md apps/windows-overlay/tests/overlay-visual-contract.test.ts
```

## Task 10: Final Verification And MVP Handoff

**Files:**

- All files changed by Tasks 1 through 9

- [x] **Step 1: Run focused tests**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/config/sageos-schema.test.ts src/sageos/overlay-state.test.ts
pnpm --dir apps/windows-overlay test
```

Expected: PASS.

- [x] **Step 2: Run type and build checks**

Run:

```powershell
pnpm --dir apps/windows-overlay typecheck
pnpm --dir apps/windows-overlay build
pnpm tsgo
pnpm build
```

Expected: PASS.

- [x] **Step 3: Run formatting and diff checks**

Run:

```powershell
pnpm oxfmt --check src/sageos/types.ts src/sageos/overlay-state.ts src/sageos/overlay-state.test.ts src/config/zod-schema.ts src/config/sageos-schema.test.ts apps/windows-overlay/src/main/window-controller.ts apps/windows-overlay/src/main/electron-adapter.ts apps/windows-overlay/src/main/main.ts apps/windows-overlay/src/preload/preload.ts apps/windows-overlay/src/renderer/gateway-client.ts apps/windows-overlay/src/renderer/sageos-actions.ts apps/windows-overlay/src/renderer/overlay-app.ts
git diff --check
```

Expected: PASS.

- [x] **Step 4: Run Windows smoke**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -Hotkey "Ctrl+Alt+Space" -OpenMode full
```

Manual expected result:

- Hotkey opens the full overlay.
- Hotkey closes the overlay.
- HUD mode opens when launched with `-OpenMode hud`.
- Edge Rail collapse works.
- Pinned widgets do not block underlying app clicks outside widget controls.
- Core controls invoke `sageos.*` RPC methods.
- Vitreous Liquor visual pass meets the GUI/UX/CX/DX release gate from Task 9.

Record the date, build, screenshot path, and notes in `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`.

- [x] **Step 5: Commit final verification notes**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/committer "SageOS: verify Windows overlay MVP shell" docs/superpowers/artifacts/sageos-windows-overlay-smoke.md
```

## Acceptance Mapping

- Programmable global hotkey: Tasks 4 and 8.
- Full-screen translucent default overlay: Tasks 4 and 6.
- Configurable HUD-first mode: Tasks 1, 2, 4, and 8.
- Edge Rail collapsed state: Tasks 2, 6, and 7.
- Pinned pass-through widgets: Tasks 2, 6, and 7.
- Command Deck: Task 6.
- Universal Launcher: Task 6.
- Agent Workspace: Task 6.
- Mouse-first controls: Tasks 5, 6, and 7.
- Keyboard hotkey and dismissal: Tasks 4 and 7.
- Voice command entry: Tasks 1 and 6 add push-to-talk launcher support behind overlay config.
- Shared Command Center contract: Tasks 1, 5, and 6.
- Enterprise-grade Vitreous Liquor visual/UX/frontend polish: Task 9.
- Web Command Center remains supplemental: no task replaces the existing web UI as the source of product truth.
