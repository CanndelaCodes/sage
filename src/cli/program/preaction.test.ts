import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitCliBanner } from "../banner.js";
import { ensureConfigReady } from "./config-guard.js";
import { registerPreActionHooks } from "./preaction.js";

vi.mock("./config-guard.js", () => ({
  ensureConfigReady: vi.fn(async () => undefined),
}));

vi.mock("../banner.js", () => ({
  emitCliBanner: vi.fn(),
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    error: vi.fn(),
    exit: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock("../plugin-registry.js", () => ({
  ensurePluginRegistryLoaded: vi.fn(),
}));

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program
    .command("os")
    .allowExcessArguments(true)
    .option("--json")
    .action(() => undefined);
  registerPreActionHooks(program, "2026.test");
  return program;
}

describe("CLI pre-action hooks", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.mocked(ensureConfigReady).mockClear();
    vi.mocked(emitCliBanner).mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("keeps JSON command stdout clean by suppressing banner and config notes", async () => {
    const program = makeProgram();
    process.argv = ["node", "sage", "os", "status", "--json"];

    await program.parseAsync(process.argv);

    expect(emitCliBanner).not.toHaveBeenCalled();
    expect(ensureConfigReady).toHaveBeenCalledWith({
      runtime: expect.any(Object),
      commandPath: ["os", "status"],
      quiet: true,
    });
  });
});
