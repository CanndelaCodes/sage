import { describe, expect, it } from "vitest";
import { getSlashCommands, helpText, parseCommand } from "./commands.js";

describe("tui slash commands", () => {
  it("treats /elev as an alias for /elevated", () => {
    expect(parseCommand("/elev on")).toEqual({ name: "elevated", args: "on" });
  });

  it("normalizes alias case", () => {
    expect(parseCommand("/ELEV off")).toEqual({
      name: "elevated",
      args: "off",
    });
  });

  it("includes gateway text commands", () => {
    const commands = getSlashCommands({});
    expect(commands.some((command) => command.name === "context")).toBe(true);
    expect(commands.some((command) => command.name === "commands")).toBe(true);
  });

  it("advertises local SageOS Command Center controls", () => {
    const command = getSlashCommands({}).find((entry) => entry.name === "sageos");
    expect(command?.description).toBe("Open SageOS Command Center");
    expect(command?.getArgumentCompletions?.("pa").map((entry) => entry.value)).toContain("pause");
    expect(helpText()).toContain("/sageos <status|pause|resume|stop|tasks|incidents|approvals>");
  });
});
