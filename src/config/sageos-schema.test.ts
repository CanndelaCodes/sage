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
