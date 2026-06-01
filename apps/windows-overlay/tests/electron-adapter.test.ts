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
  const displays = [
    { id: 1, label: "Primary", bounds: { x: 0, y: 0, width: 1280, height: 720 } },
    { id: 2, label: "Side", bounds: { x: 1280, y: 0, width: 1920, height: 1080 } },
  ];

  return {
    windows,
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
    Tray: vi.fn().mockImplementation(() => ({ setToolTip: vi.fn() })),
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
});
