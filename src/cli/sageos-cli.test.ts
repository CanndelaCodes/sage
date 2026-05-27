import { Command } from "commander";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendSageOsEvent, createSageOsEventLog } from "../sageos/event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAgent,
  upsertSageOsTask,
  writeSageOsState,
} from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";
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

const lastJson = () => JSON.parse(runtimeLogs.at(-1) ?? "{}");

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
    expect(parsed.runs).toMatchObject({ total: 0, active: 0 });
    expect(parsed.memory).toMatchObject({
      canonical: "sage-memory",
      captureQueue: { total: 0 },
    });
    expect(parsed.learning).toMatchObject({ activityQueue: { total: 0 } });
    expect(parsed.audit.eventLogPath).toContain("events.jsonl");
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

  it("lists, inspects, and drafts employees", async () => {
    const stateDir = process.env.SAGE_STATE_DIR!;
    const store = createSageOsStateStore();
    const now = "2026-05-27T13:00:00.000Z";
    await upsertSageOsAgent(store, {
      id: "employee_reviewer",
      name: "Reviewer",
      role: "review",
      mission: "Review completed tasks.",
      status: "active",
      autonomyTier: "suggest",
      responsibilities: ["review"],
      allowedScopes: [],
      deniedScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const program = makeProgram();
    await program.parseAsync(["os", "employees", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ employees: [{ id: "employee_reviewer" }] });

    await program.parseAsync(["os", "employees", "inspect", "employee_reviewer", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({ employee: { id: "employee_reviewer", name: "Reviewer" } });

    await program.parseAsync(
      [
        "os",
        "employees",
        "create",
        "Watch Sage Memory capture health",
        "--name",
        "Memory Steward",
        "--role",
        "memory",
        "--json",
      ],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({
      employee: {
        id: "employee_memory_steward",
        status: "draft",
        mission: "Watch Sage Memory capture health",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_reviewer" }, { id: "employee_memory_steward" }],
    });
    const rawEvents = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    expect(rawEvents).toContain("employee_drafted");
  });

  it("lists, inspects, and cancels tasks", async () => {
    const stateDir = process.env.SAGE_STATE_DIR!;
    const store = createSageOsStateStore();
    const now = "2026-05-27T13:05:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_review",
      title: "Review task",
      objective: "Review a completed artifact.",
      state: "queued",
      requestedBy: "jason",
      autonomyTier: "suggest",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const program = makeProgram();
    await program.parseAsync(["os", "tasks", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ tasks: [{ id: "task_review", state: "queued" }] });

    await program.parseAsync(["os", "tasks", "inspect", "task_review", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({ task: { id: "task_review", title: "Review task" } });

    await program.parseAsync(
      ["os", "tasks", "cancel", "task_review", "--reason", "not needed", "--json"],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({ task: { id: "task_review", state: "cancelled" } });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ id: "task_review", state: "cancelled" }],
    });
    const rawEvents = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    expect(rawEvents).toContain("task_cancelled");
  });

  it("shows incidents, audit events, and doctor status", async () => {
    const store = createSageOsStateStore();
    const log = createSageOsEventLog();
    const now = "2026-05-27T13:10:00.000Z";
    await writeSageOsState(
      store,
      createSageOsStatusSnapshot({
        incidents: [
          {
            id: "incident_memory",
            severity: "warning",
            category: "memory",
            title: "Memory queue failed",
            summary: "Replay needed.",
            firstSeenAt: now,
            lastSeenAt: now,
            autoRepairSafe: true,
          },
        ],
      }),
    );
    await appendSageOsEvent(log, { type: "older", actor: "test", summary: "older" });
    await appendSageOsEvent(log, { type: "newer", actor: "test", summary: "newer" });

    const program = makeProgram();
    await program.parseAsync(["os", "incidents", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ incidents: [{ id: "incident_memory" }] });

    await program.parseAsync(["os", "audit", "--json", "--limit", "1"], { from: "user" });
    expect(lastJson()).toMatchObject({ events: [{ type: "newer" }] });

    await program.parseAsync(["os", "doctor", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({
      ok: false,
      status: { incidents: [{ id: "incident_memory" }] },
    });
  });
});
