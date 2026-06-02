import { describe, expect, it } from "vitest";
import { SageSchema } from "./zod-schema.js";

describe("SageOS config schema", () => {
  it("accepts the local-first command center config namespace", () => {
    const parsed = SageSchema.parse({
      sageos: {
        enabled: true,
        mode: "execute_scoped",
        supervisor: {
          intervalSeconds: 30,
          maxConcurrentTasks: 3,
          idleAfterSeconds: 300,
          nightShiftEnabled: true,
          nightShiftWindow: "23:00-06:00",
        },
        sources: {
          sageSessions: true,
          appFocus: true,
          defender: true,
          screen: false,
        },
        policy: {
          defaultTier: "execute_scoped",
          requireApprovalForDestructive: true,
          requireApprovalForPolicyChanges: true,
        },
        privacy: {
          localOnlyDefault: true,
          storeRawScreenshots: false,
          denyApps: ["1Password"],
          observationRetentionDays: 14,
        },
      },
    });

    expect(parsed.sageos?.mode).toBe("execute_scoped");
    expect(parsed.sageos?.sources?.defender).toBe(true);
    expect(parsed.sageos?.privacy?.observationRetentionDays).toBe(14);
  });

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

  it("accepts SageOS Telegram quiet hours config", () => {
    const parsed = SageSchema.parse({
      sageos: {
        notifications: {
          telegram: {
            enabled: true,
            target: "telegram:123",
            digestSchedule: "0 8 * * *",
            batchWindowMinutes: 15,
            quietHours: {
              start: "22:00",
              end: "07:00",
              timezone: "America/New_York",
            },
          },
        },
      },
    });

    expect(parsed.sageos?.notifications?.telegram?.quietHours).toEqual({
      start: "22:00",
      end: "07:00",
      timezone: "America/New_York",
    });
    expect(parsed.sageos?.notifications?.telegram?.batchWindowMinutes).toBe(15);
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

  it("rejects invalid SageOS observation retention values", () => {
    expect(() =>
      SageSchema.parse({
        sageos: {
          privacy: {
            observationRetentionDays: -1,
          },
        },
      }),
    ).toThrow();
  });

  it("rejects unknown SageOS config keys", () => {
    expect(() =>
      SageSchema.parse({
        sageos: {
          enabled: true,
          silentlyBypassPolicy: true,
        },
      }),
    ).toThrow();
  });
});
