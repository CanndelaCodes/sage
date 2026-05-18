import { Command } from "commander";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSageOsCli } from "./sageos-cli.js";

const { runtimeLogs, defaultRuntime } = vi.hoisted(() => {
  const logs: string[] = [];
  return {
    runtimeLogs: logs,
    defaultRuntime: {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(msg),
      exit: (code: number) => {
        throw new Error(`__exit__:${code}`);
      },
    },
  };
});

vi.mock("../runtime.js", () => ({ defaultRuntime }));

const makeProgram = () => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => runtimeLogs.push(str),
    writeErr: (str) => runtimeLogs.push(str),
  });
  registerSageOsCli(program);
  return program;
};

describe("sage os CLI", () => {
  const previousStateDir = process.env.SAGE_STATE_DIR;

  beforeEach(async () => {
    runtimeLogs.length = 0;
    process.env.SAGE_STATE_DIR = await mkdtemp(path.join(tmpdir(), "sageos-cli-"));
  });

  afterEach(() => {
    if (previousStateDir) {
      process.env.SAGE_STATE_DIR = previousStateDir;
    } else {
      delete process.env.SAGE_STATE_DIR;
    }
  });

  it("prints parseable status JSON", async () => {
    const program = makeProgram();
    await program.parseAsync(["os", "status", "--json"], { from: "user" });

    const parsed = JSON.parse(runtimeLogs.at(-1) ?? "{}");
    expect(parsed).toMatchObject({ mode: "execute_scoped" });
    expect(parsed.supervisor.state).toBe("stopped");
  });

  it("pauses, resumes, and emergency-stops through durable state", async () => {
    const stateDir = process.env.SAGE_STATE_DIR!;
    const program = makeProgram();
    await program.parseAsync(["os", "pause", "--json"], { from: "user" });
    const paused = JSON.parse(runtimeLogs.at(-1) ?? "{}");
    expect(paused.supervisor.state).toBe("paused");
    expect(paused.supervisor.enabled).toBe(true);

    await program.parseAsync(["os", "resume", "--json"], { from: "user" });
    const running = JSON.parse(runtimeLogs.at(-1) ?? "{}");
    expect(running.supervisor.state).toBe("running");
    expect(running.supervisor.enabled).toBe(true);

    await program.parseAsync(["os", "emergency-stop", "--json"], { from: "user" });
    const stopped = JSON.parse(runtimeLogs.at(-1) ?? "{}");
    expect(stopped.supervisor.state).toBe("stopped");
    expect(stopped.supervisor.enabled).toBe(false);

    const rawEvents = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    const eventTypes = rawEvents
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    expect(eventTypes).toEqual(["supervisor_paused", "supervisor_resumed", "emergency_stop"]);
  });
});
