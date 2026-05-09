import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "sage",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "sage", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "sage", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "sage", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "sage", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "sage", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "sage", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "sage", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "sage", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".sage-dev");
    expect(env.SAGE_PROFILE).toBe("dev");
    expect(env.SAGE_STATE_DIR).toBe(expectedStateDir);
    expect(env.SAGE_CONFIG_PATH).toBe(path.join(expectedStateDir, "sage.json"));
    expect(env.SAGE_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      SAGE_STATE_DIR: "/custom",
      SAGE_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.SAGE_STATE_DIR).toBe("/custom");
    expect(env.SAGE_GATEWAY_PORT).toBe("19099");
    expect(env.SAGE_CONFIG_PATH).toBe(path.join("/custom", "sage.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("sage doctor --fix", {})).toBe("sage doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("sage doctor --fix", { SAGE_PROFILE: "default" })).toBe(
      "sage doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("sage doctor --fix", { SAGE_PROFILE: "Default" })).toBe(
      "sage doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("sage doctor --fix", { SAGE_PROFILE: "bad profile" })).toBe(
      "sage doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("sage --profile work doctor --fix", { SAGE_PROFILE: "work" }),
    ).toBe("sage --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("sage --dev doctor", { SAGE_PROFILE: "dev" })).toBe(
      "sage --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("sage doctor --fix", { SAGE_PROFILE: "work" })).toBe(
      "sage --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("sage doctor --fix", { SAGE_PROFILE: "  jbsage  " })).toBe(
      "sage --profile jbsage doctor --fix",
    );
  });

  it("handles command with no args after sage", () => {
    expect(formatCliCommand("sage", { SAGE_PROFILE: "test" })).toBe(
      "sage --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm sage doctor", { SAGE_PROFILE: "work" })).toBe(
      "pnpm sage --profile work doctor",
    );
  });
});
