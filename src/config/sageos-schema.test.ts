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
        },
      },
    });

    expect(parsed.sageos?.mode).toBe("execute_scoped");
    expect(parsed.sageos?.sources?.defender).toBe(true);
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
