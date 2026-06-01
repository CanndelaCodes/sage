import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
  const windows: Array<{
    options: Record<string, unknown>;
    loadFile: ReturnType<typeof vi.fn>;
    setFullScreenable: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    webContents: { send: ReturnType<typeof vi.fn> };
  }> = [];
  const trays: Array<{
    setContextMenu: ReturnType<typeof vi.fn>;
    setToolTip: ReturnType<typeof vi.fn>;
  }> = [];
  const displays = [
    { id: 1, label: "Primary", bounds: { x: 0, y: 0, width: 1280, height: 720 } },
    { id: 2, label: "Side", bounds: { x: 1280, y: 0, width: 1920, height: 1080 } },
  ];

  return {
    windows,
    trays,
    displays,
    BrowserWindow: vi.fn().mockImplementation(function BrowserWindow(
      this: unknown,
      options: Record<string, unknown>,
    ) {
      const window = {
        options,
        loadFile: vi.fn(),
        setFullScreenable: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        showInactive: vi.fn(),
        hide: vi.fn(),
        setIgnoreMouseEvents: vi.fn(),
        webContents: { send: vi.fn() },
      };
      windows.push(window);
      return window;
    }),
    Tray: vi.fn().mockImplementation(function Tray() {
      const tray = { setContextMenu: vi.fn(), setToolTip: vi.fn() };
      trays.push(tray);
      return tray;
    }),
    Menu: {
      buildFromTemplate: vi.fn((template: unknown) => template),
    },
    globalShortcut: {
      unregister: vi.fn(),
      register: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    },
    nativeImage: {
      createFromPath: vi.fn().mockReturnValue({ isEmpty: () => true }),
      createEmpty: vi.fn().mockReturnValue({}),
    },
    screen: {
      getCursorScreenPoint: vi.fn().mockReturnValue({ x: 1400, y: 100 }),
      getDisplayNearestPoint: vi.fn().mockReturnValue(displays[1]),
      getPrimaryDisplay: vi.fn().mockReturnValue(displays[0]),
      getAllDisplays: vi.fn().mockReturnValue(displays),
    },
  };
});

vi.mock("electron", () => electronMocks);

describe("Electron overlay adapter", () => {
  beforeEach(() => {
    electronMocks.windows.length = 0;
    electronMocks.trays.length = 0;
    vi.clearAllMocks();
    electronMocks.globalShortcut.register.mockReturnValue(true);
  });

  it("opens on the primary display when activeMonitor is primary", async () => {
    const { createElectronOverlayAdapter } = await import("../src/main/electron-adapter.js");
    const adapter = createElectronOverlayAdapter({
      rendererHtmlPath: "renderer.html",
      preloadPath: "preload.cjs",
      activeMonitor: "primary",
    });

    adapter.showFullOverlay();

    expect(electronMocks.windows[0]?.options).toMatchObject({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it("pins to a configured display id when activeMonitor names one", async () => {
    const { createElectronOverlayAdapter } = await import("../src/main/electron-adapter.js");
    const adapter = createElectronOverlayAdapter({
      rendererHtmlPath: "renderer.html",
      preloadPath: "preload.cjs",
      activeMonitor: "2",
    });

    adapter.showFullOverlay();

    expect(electronMocks.windows[0]?.options).toMatchObject({
      x: 1280,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("adds mouse-first tray commands for overlay control", async () => {
    const { createElectronOverlayAdapter } = await import("../src/main/electron-adapter.js");
    const adapter = createElectronOverlayAdapter({
      rendererHtmlPath: "renderer.html",
      preloadPath: "preload.cjs",
    });
    const actions = {
      open: vi.fn(),
      showHud: vi.fn(),
      collapse: vi.fn(),
      hide: vi.fn(),
      quit: vi.fn(),
    };

    adapter.setTrayActions(actions);
    adapter.setTrayState({
      visible: true,
      surface: "edgeRail",
      pointerMode: "passThrough",
      collapsedEdge: "right",
      pinnedWidgets: ["activeOperations"],
    });

    const template = electronMocks.Menu.buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{
      click?: () => void;
      enabled?: boolean;
      label?: string;
      type?: string;
    }>;
    expect(template.map((item) => item.label ?? item.type)).toEqual([
      "Open SageOS",
      "Show HUD",
      "Collapse to Edge Rail",
      "separator",
      "Hide Overlay",
      "separator",
      "Quit SageOS Overlay",
    ]);

    template[0]?.click?.();
    template[1]?.click?.();
    template[2]?.click?.();
    template[4]?.click?.();
    template[6]?.click?.();

    expect(actions.open).toHaveBeenCalledTimes(1);
    expect(actions.showHud).toHaveBeenCalledTimes(1);
    expect(actions.collapse).toHaveBeenCalledTimes(1);
    expect(actions.hide).toHaveBeenCalledTimes(1);
    expect(actions.quit).toHaveBeenCalledTimes(1);
    expect(electronMocks.trays[0]?.setContextMenu).toHaveBeenCalledWith(template);
  });
});
