import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".sage"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", SAGE_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".sage-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", SAGE_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".sage"));
  });

  it("uses SAGE_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", SAGE_STATE_DIR: "/var/lib/sage" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/sage"));
  });

  it("expands ~ in SAGE_STATE_DIR", () => {
    const env = { HOME: "/Users/test", SAGE_STATE_DIR: "~/sage-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/sage-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { SAGE_STATE_DIR: "C:\\State\\sage" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\sage");
  });
});
