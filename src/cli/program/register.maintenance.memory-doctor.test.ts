import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../commands/doctor.js", () => ({
  doctorCommand: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({ memory: { backend: "sage-memory" } })),
}));

vi.mock("../../memory/sage-memory-doctor.js", () => ({
  runSageMemoryDoctor: vi.fn(async () => ({
    ok: true,
    agentId: "main",
    baseUrl: "http://127.0.0.1:18790",
    namespace: "jason.sage.sessions",
    diagnosticNamespace: "jason.sage.sessions.diagnostics",
    sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
    exportedFiles: [],
    checks: [{ name: "config", status: "pass", message: "ok" }],
    warnings: [],
    failures: [],
    suggestions: [],
  })),
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    exit: vi.fn(),
  },
}));

vi.mock("../cli-utils.js", () => ({
  runCommandWithRuntime: async (_runtime: unknown, run: () => Promise<void>) => run(),
}));

describe("registerMaintenanceCommands memory doctor", () => {
  afterEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("routes sage doctor memory to the Sage Memory diagnostic helper", async () => {
    const { registerMaintenanceCommands } = await import("./register.maintenance.js");
    const { defaultRuntime } = await import("../../runtime.js");
    const { runSageMemoryDoctor } = await import("../../memory/sage-memory-doctor.js");
    const program = new Command();
    program.exitOverride();
    registerMaintenanceCommands(program);

    await program.parseAsync(["doctor", "memory", "--agent", "main", "--json"], {
      from: "user",
    });

    expect(runSageMemoryDoctor).toHaveBeenCalledWith({
      cfg: { memory: { backend: "sage-memory" } },
      agentId: "main",
      namespace: undefined,
    });
    expect(JSON.parse(String(vi.mocked(defaultRuntime.log).mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
    });
  });
});
