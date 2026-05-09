import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./navigation.ts";
import { applySettingsFromUrl, setTabFromRoute } from "./app-settings.ts";

type SettingsHost = Parameters<typeof setTabFromRoute>[0] & {
  logsPollInterval: number | null;
  debugPollInterval: number | null;
};

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
  logsPollInterval: null,
  debugPollInterval: null,
});

// ---------------------------------------------------------------------------
// applySettingsFromUrl — CVE-2026-25253 hardening
// ---------------------------------------------------------------------------

describe("applySettingsFromUrl", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
  });

  afterEach(() => {
    // Restore location by navigating back to clean URL
    window.history.replaceState({}, "", originalLocation.pathname);
  });

  it("does NOT apply token from URL param to settings", () => {
    const host = createHost("chat") as Parameters<typeof applySettingsFromUrl>[0];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/?token=stolen-token");
    applySettingsFromUrl(host);
    expect(host.settings.token).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring token from URL parameter"),
    );
    warnSpy.mockRestore();
  });

  it("does NOT apply password from URL param to host", () => {
    const host = createHost("chat") as Parameters<typeof applySettingsFromUrl>[0] & {
      password?: string;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/?password=stolen-pass");
    applySettingsFromUrl(host);
    expect(host.password).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring password from URL parameter"),
    );
    warnSpy.mockRestore();
  });

  it("strips token and password from URL while preserving other params", () => {
    const host = createHost("chat") as Parameters<typeof applySettingsFromUrl>[0];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/?token=bad&password=bad&session=test");
    applySettingsFromUrl(host);
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("password=");
    vi.restoreAllMocks();
  });

  it("rejects gatewayUrl from URL param (CVE-2026-25253)", () => {
    const host = createHost("chat") as Parameters<typeof applySettingsFromUrl>[0];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/?gatewayUrl=ws://evil.com");
    applySettingsFromUrl(host);
    // gatewayUrl must NOT be applied at all
    expect(host.settings.gatewayUrl).toBe("");
    expect((host as Record<string, unknown>).pendingGatewayUrl).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring gatewayUrl from URL parameter"),
    );
    warnSpy.mockRestore();
  });
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "logs");
    expect(host.logsPollInterval).not.toBeNull();
    expect(host.debugPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.logsPollInterval).toBeNull();
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "debug");
    expect(host.debugPollInterval).not.toBeNull();
    expect(host.logsPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.debugPollInterval).toBeNull();
  });
});
