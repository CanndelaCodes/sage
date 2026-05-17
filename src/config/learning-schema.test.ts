import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("learning config schema", () => {
  it("accepts the autonomous learning defaults from the spec", () => {
    const snapshot = validateConfigObject({
      learning: {
        enabled: true,
        sources: {
          sageSessions: true,
          browser: { enabled: true },
          appFocus: { enabled: true },
        },
        review: {
          timing: "after-task",
          modelPolicy: "hybrid-local-first",
        },
        skills: {
          autoApply: true,
        },
        curator: {
          enabled: true,
        },
      },
    });

    expect(snapshot.ok).toBe(true);
  });

  it("rejects unknown learning review modes", () => {
    const snapshot = validateConfigObject({
      learning: {
        review: {
          timing: "always",
        },
      },
    });

    expect(snapshot.ok).toBe(false);
    if (!snapshot.ok) {
      expect(snapshot.issues.some((issue) => issue.path.includes("learning.review.timing"))).toBe(
        true,
      );
    }
  });
});
