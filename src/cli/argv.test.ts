import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "sage", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "sage", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "sage", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "sage", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "sage", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "sage", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "sage", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "sage"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "sage", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "sage", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "sage", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "sage", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "sage", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "sage", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "sage", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "sage", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "sage", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "sage", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "sage", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "sage", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "sage", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "sage", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node", "sage", "status"],
    });
    expect(nodeArgv).toEqual(["node", "sage", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node-22", "sage", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "sage", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node-22.2.0.exe", "sage", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "sage", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node-22.2", "sage", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "sage", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node-22.2.exe", "sage", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "sage", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["/usr/bin/node-22.2.0", "sage", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "sage", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["nodejs", "sage", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "sage", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["node-dev", "sage", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "sage", "node-dev", "sage", "status"]);

    const directArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["sage", "status"],
    });
    expect(directArgv).toEqual(["node", "sage", "status"]);

    const bunArgv = buildParseArgv({
      programName: "sage",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "sage",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "sage", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "sage", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "sage", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "sage", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "sage", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "sage", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "sage", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "sage", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
