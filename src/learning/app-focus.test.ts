import { describe, expect, it } from "vitest";
import { readActiveAppFocus } from "./app-focus.js";

describe("active app focus adapter", () => {
  it("returns unsupported on non-Windows platforms", async () => {
    const result = await readActiveAppFocus({
      platform: "linux",
      execPowerShell: async () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ supported: false, reason: "unsupported-platform" });
  });

  it("normalizes Windows foreground app snapshots", async () => {
    const result = await readActiveAppFocus({
      platform: "win32",
      now: () => new Date("2026-05-16T10:00:00.000Z"),
      execPowerShell: async () =>
        JSON.stringify({
          processName: "chrome",
          pid: 1234,
          windowTitle: "Example - Google Chrome",
        }),
    });

    expect(result).toEqual({
      supported: true,
      event: expect.objectContaining({
        source: "app_focus",
        actor: "local-user",
        title: "chrome: Example - Google Chrome",
        text: "Active app focus: chrome - Example - Google Chrome",
        startedAt: "2026-05-16T10:00:00.000Z",
        payload: {
          processName: "chrome",
          pid: 1234,
          windowTitle: "Example - Google Chrome",
        },
      }),
    });
  });
});
