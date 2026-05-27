import { Command } from "commander";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendSageOsEvent, createSageOsEventLog } from "../sageos/event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsAgent,
  upsertSageOsAppCandidate,
  upsertSageOsCodingReport,
  upsertSageOsObservation,
  upsertSageOsSkill,
  upsertSageOsTask,
  upsertSageOsWorkflow,
  writeSageOsState,
} from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";
import { registerSageOsCli, type SageOsCliDeps } from "./sageos-cli.js";

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

const makeProgram = (deps: SageOsCliDeps = {}) => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => runtimeLogs.push(str),
    writeErr: (str) => runtimeLogs.push(str),
  });
  registerSageOsCli(program, deps);
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

    await program.parseAsync(["os", "employees", "templates", "--json"], { from: "user" });
    expect(lastJson().templates.map((template: { id: string }) => template.id)).toContain(
      "memory_steward",
    );

    await program.parseAsync(
      ["os", "employees", "templates", "inspect", "memory_steward", "--json"],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({
      template: { id: "memory_steward", name: "Memory Steward", role: "memory" },
    });

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

  it("queues tasks through policy-aware CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T17:40:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_low",
      title: "Review observed work",
      objective: "Review a local app-focus observation.",
      state: "proposed",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "suggest",
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_external",
      title: "Send Telegram digest",
      objective: "Send a redacted digest to Telegram.",
      state: "proposed",
      requestedBy: "sageos.ambient_copilot",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "channel", allow: ["telegram"], risk: "high" }],
      createdAt: now,
      updatedAt: now,
    });

    const program = makeProgram();
    await program.parseAsync(["os", "tasks", "queue", "task_low", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({
      result: { outcome: "queued", task: { id: "task_low", state: "queued" } },
    });

    await program.parseAsync(["os", "tasks", "queue", "task_external", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      result: {
        outcome: "approval_required",
        task: { id: "task_external", state: "waiting_for_policy" },
        approval: { id: "approval_task_task_external", state: "pending" },
      },
    });
  });

  it("runs the next queued task through CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T18:10:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_run",
      title: "Run queued task",
      objective: "Exercise the dry-run worker.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const program = makeProgram();
    await program.parseAsync(["os", "tasks", "run-next", "--json"], { from: "user" });

    expect(lastJson()).toMatchObject({
      result: {
        outcome: "completed",
        task: { id: "task_run", state: "completed" },
        run: { id: "run_task_run_1", state: "succeeded" },
      },
    });
  });

  it("passes notification config when running the next task with --notify", async () => {
    const runCalls: unknown[] = [];
    const program = makeProgram({
      loadConfig: () => ({
        sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      }),
      runNextTaskOnce: async (params: unknown) => {
        runCalls.push(params);
        return {
          outcome: "completed" as const,
          task: {
            id: "task_notify",
            title: "Notify completion",
            objective: "Notify.",
            state: "completed" as const,
            requestedBy: "sageos.cli",
            autonomyTier: "execute_scoped" as const,
            policyScopes: [],
            createdAt: "2026-05-27T21:25:00.000Z",
            updatedAt: "2026-05-27T21:25:00.000Z",
          },
          run: {
            id: "run_task_notify_1",
            taskId: "task_notify",
            attempt: 1,
            state: "succeeded" as const,
            traceId: "trace_task_notify",
          },
          status: createSageOsStatusSnapshot(),
        };
      },
    } as SageOsCliDeps);

    await program.parseAsync(["os", "tasks", "run-next", "--notify", "--json"], {
      from: "user",
    });

    expect(lastJson()).toMatchObject({ result: { outcome: "completed" } });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      notify: true,
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
  });

  it("lists and resolves approvals with audit evidence", async () => {
    const stateDir = process.env.SAGE_STATE_DIR!;
    const store = createSageOsStateStore();
    const now = "2026-05-27T14:20:00.000Z";
    await upsertSageOsApproval(store, {
      id: "approval_external",
      state: "pending",
      riskClass: "external_write",
      title: "Send Telegram update",
      proposedAction: "Send a redacted task completion summary.",
      evidence: ["task_1"],
      preview: "Task done.",
      rollbackPlan: "Delete message.",
      scope: "task",
      taskId: "task_1",
      requestedBy: "coding_worker",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsApproval(store, {
      id: "approval_policy",
      state: "pending",
      riskClass: "policy_change",
      title: "Change autonomy policy",
      proposedAction: "Raise coding worker policy.",
      evidence: ["policy_diff"],
      scope: "domain",
      domain: "sageos.policy",
      requestedBy: "operator",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const program = makeProgram();
    await program.parseAsync(["os", "approvals", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({
      approvals: [
        { id: "approval_external", state: "pending" },
        { id: "approval_policy", state: "pending" },
      ],
    });

    await program.parseAsync(
      ["os", "approvals", "approve", "approval_external", "--reason", "reviewed", "--json"],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({
      approval: {
        id: "approval_external",
        state: "approved",
        resolvedBy: "sageos.cli",
        resolutionReason: "reviewed",
      },
    });

    await program.parseAsync(
      ["os", "approvals", "deny", "approval_policy", "--reason", "unsafe", "--json"],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({
      approval: {
        id: "approval_policy",
        state: "denied",
        resolvedBy: "sageos.cli",
        resolutionReason: "unsafe",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      approvals: [
        { id: "approval_external", state: "approved" },
        { id: "approval_policy", state: "denied" },
      ],
    });
    const rawEvents = await readFile(path.join(stateDir, "sageos", "events.jsonl"), "utf8");
    expect(rawEvents.match(/approval_resolved/g)).toHaveLength(2);
  });

  it("lists and triggers app-focus observations", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T16:30:00.000Z";
    await upsertSageOsObservation(store, {
      id: "obs_existing",
      source: "app_focus",
      state: "captured",
      title: "Code: SageOS",
      text: "Active app focus: Code - SageOS",
      sensitivity: "private",
      observedAt: now,
      payload: { processName: "Code", windowTitle: "SageOS" },
      provenance: { adapter: "app_focus" },
      createdAt: now,
      updatedAt: now,
    });

    const observeCalls: unknown[] = [];
    const program = makeProgram({
      observeAppFocusOnce: async (params) => {
        observeCalls.push(params);
        return {
          status: "recorded",
          observation: {
            id: "obs_new",
            source: "app_focus",
            state: "captured",
            title: "Terminal: Sage",
            text: "Active app focus: Terminal - Sage",
            sensitivity: "private",
            observedAt: now,
            payload: { processName: "Terminal", windowTitle: "Sage" },
            provenance: { adapter: "app_focus" },
            learningEventId: "learning_terminal",
            createdAt: now,
            updatedAt: now,
          },
          learning: { created: 1, skipped: 0 },
        };
      },
    });

    await program.parseAsync(["os", "observations", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({
      observations: [{ id: "obs_existing", source: "app_focus", state: "captured" }],
    });

    await program.parseAsync(["os", "observe", "app-focus", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({
      result: {
        status: "recorded",
        observation: { id: "obs_new", source: "app_focus", state: "captured" },
      },
    });
    expect(observeCalls).toHaveLength(1);
    expect(observeCalls[0]).toMatchObject({ cfg: { sources: { appFocus: true } } });
  });

  it("runs the memory steward replay command", async () => {
    const runCalls: unknown[] = [];
    const program = makeProgram({
      loadConfig: () => ({ sageos: { memory: { replayQueues: true } } }),
      runMemoryStewardOnce: async (params) => {
        runCalls.push(params);
        return {
          memory: { attempted: 1, captured: 1, failed: 0, remaining: 0, results: [] },
          learning: { attempted: 2, accepted: 2, failed: 0, remaining: 0 },
          status: createSageOsStatusSnapshot({
            memory: {
              status: "ok",
              backend: "sage-memory",
              canonical: "sage-memory",
              captureQueue: { total: 0, pending: 0, failed: 0 },
            },
            learning: {
              status: "ok",
              activityQueue: { total: 0, pending: 0, failed: 0 },
            },
          }),
        };
      },
    });

    await program.parseAsync(["os", "memory", "replay", "--json"], { from: "user" });

    expect(lastJson()).toMatchObject({
      result: {
        memory: { attempted: 1, captured: 1, failed: 0 },
        learning: { attempted: 2, accepted: 2, failed: 0 },
      },
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      cfg: { sageos: { memory: { replayQueues: true } } },
      agentId: "main",
    });
  });

  it("runs the ambient copilot suggestion command", async () => {
    const runCalls: unknown[] = [];
    const deps = {
      loadConfig: () => ({ sageos: { enabled: true, mode: "suggest" as const } }),
      runAmbientCopilotOnce: async (params: unknown) => {
        runCalls.push(params);
        return {
          observed: 1,
          proposed: 1,
          skipped: 0,
          tasks: [
            {
              id: "task_observation_obs_focus",
              title: "Review observed work: Code",
              objective: "Review observed focus.",
              state: "proposed" as const,
              requestedBy: "sageos.ambient_copilot",
              autonomyTier: "suggest" as const,
              policyScopes: [],
              createdAt: "2026-05-27T17:10:00.000Z",
              updatedAt: "2026-05-27T17:10:00.000Z",
            },
          ],
          status: createSageOsStatusSnapshot({
            tasks: { total: 1, active: 0, queued: 1, blocked: 0 },
          }),
        };
      },
    } as SageOsCliDeps;
    const program = makeProgram(deps);

    await program.parseAsync(["os", "copilot", "suggest", "--max", "2", "--json"], {
      from: "user",
    });

    expect(lastJson()).toMatchObject({
      result: {
        observed: 1,
        proposed: 1,
        skipped: 0,
        tasks: [{ id: "task_observation_obs_focus" }],
      },
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      cfg: { enabled: true, mode: "suggest" },
      maxSuggestions: 2,
    });
  });

  it("sends Telegram digest notifications through CLI controls", async () => {
    const runCalls: unknown[] = [];
    const deps = {
      loadConfig: () => ({
        sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      }),
      sendTelegramDigestOnce: async (params: unknown) => {
        runCalls.push(params);
        return {
          outcome: "sent" as const,
          target: "telegram:123",
          notification: {
            kind: "digest" as const,
            title: "SageOS: Daily digest",
            text: "SageOS: Daily digest\nActions: Open Command Center | Pause SageOS",
            target: "telegram:123",
            redactedObservationCount: 0,
          },
          messageId: "42",
          chatId: "123",
          status: createSageOsStatusSnapshot({
            notifications: {
              telegram: { enabled: true, target: "telegram:123" },
              urgentPending: 0,
            },
          }),
        };
      },
    } as unknown as SageOsCliDeps;
    const program = makeProgram(deps);

    await program.parseAsync(["os", "notifications", "digest", "--send", "--json"], {
      from: "user",
    });

    expect(lastJson()).toMatchObject({
      result: {
        outcome: "sent",
        target: "telegram:123",
        notification: { title: "SageOS: Daily digest" },
      },
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
  });

  it("lists and discovers workflow candidates through CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T20:45:00.000Z";
    await upsertSageOsWorkflow(store, {
      id: "workflow_existing",
      name: "Existing workflow",
      state: "candidate",
      observedPattern: "app_focus:code",
      sourceObservationIds: ["obs_1", "obs_2"],
      trigger: "Repeated Code focus",
      inputs: ["app focus"],
      outputs: ["candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      implementationRefs: [],
      evalRefs: [],
      createdAt: now,
      updatedAt: now,
    });

    const discoverCalls: unknown[] = [];
    const dryRunCalls: unknown[] = [];
    const program = makeProgram({
      discoverWorkflowCandidates: async (params: unknown) => {
        discoverCalls.push(params);
        return {
          observed: 2,
          created: 1,
          skipped: 0,
          candidates: [
            {
              id: "workflow_new",
              name: "New workflow",
              state: "candidate" as const,
              observedPattern: "app_focus:terminal",
              sourceObservationIds: ["obs_3", "obs_4"],
              trigger: "Repeated Terminal focus",
              inputs: ["app focus"],
              outputs: ["candidate"],
              policyScopes: [{ kind: "app", allow: ["Terminal"], risk: "low" as const }],
              implementationRefs: [],
              evalRefs: [],
              createdAt: now,
              updatedAt: now,
            },
          ],
          status: createSageOsStatusSnapshot({
            workflows: { total: 2, active: 0, queued: 2, blocked: 0 },
          }),
        };
      },
      dryRunWorkflow: async (params: unknown) => {
        dryRunCalls.push(params);
        return {
          outcome: "passed" as const,
          workflow: {
            id: "workflow_existing",
            name: "Existing workflow",
            state: "dry_run_passed" as const,
            observedPattern: "app_focus:code",
            sourceObservationIds: ["obs_1", "obs_2"],
            trigger: "Repeated Code focus",
            inputs: ["app focus"],
            outputs: ["candidate"],
            policyScopes: [{ kind: "app" as const, allow: ["Code"], risk: "low" as const }],
            implementationRefs: [],
            evalRefs: ["eval_workflow_existing_20260527T204500000Z"],
            createdAt: now,
            updatedAt: now,
          },
          report: {
            id: "eval_workflow_existing_20260527T204500000Z",
            workflowId: "workflow_existing",
            passed: true,
            checkedObservationIds: ["obs_1", "obs_2"],
            missingObservationIds: [],
            secretObservationIds: [],
            summary: "Workflow workflow_existing dry-run passed.",
            createdAt: now,
          },
          status: createSageOsStatusSnapshot({
            workflows: { total: 1, active: 1, queued: 0, blocked: 0 },
          }),
        };
      },
    } as unknown as SageOsCliDeps);

    await program.parseAsync(["os", "workflows", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ workflows: [{ id: "workflow_existing" }] });

    await program.parseAsync(["os", "workflows", "discover", "--min", "2", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      result: { observed: 2, created: 1, candidates: [{ id: "workflow_new" }] },
    });
    expect(discoverCalls).toHaveLength(1);
    expect(discoverCalls[0]).toMatchObject({ minOccurrences: 2 });

    await program.parseAsync(["os", "workflows", "dry-run", "workflow_existing", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      result: {
        outcome: "passed",
        workflow: { id: "workflow_existing", state: "dry_run_passed" },
        report: { id: "eval_workflow_existing_20260527T204500000Z", passed: true },
      },
    });
    expect(dryRunCalls).toHaveLength(1);
    expect(dryRunCalls[0]).toMatchObject({ workflowId: "workflow_existing" });
  });

  it("lists and drafts skills through CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T21:45:00.000Z";
    await upsertSageOsSkill(store, {
      id: "skill_existing",
      name: "Existing skill",
      state: "draft",
      workflowId: "workflow_existing",
      provenance: ["workflow_existing"],
      triggerConditions: ["Existing trigger"],
      tests: ["eval_existing"],
      allowedScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const draftCalls: unknown[] = [];
    const program = makeProgram({
      draftSkillFromWorkflow: async (params: unknown) => {
        draftCalls.push(params);
        return {
          outcome: "drafted" as const,
          skill: {
            id: "skill_new",
            name: "Skill: New workflow",
            state: "draft" as const,
            workflowId: "workflow_new",
            provenance: ["workflow_new", "obs_1", "obs_2"],
            triggerConditions: ["Repeated app focus"],
            tests: ["obs_1", "obs_2"],
            allowedScopes: [{ kind: "app" as const, allow: ["Terminal"], risk: "low" as const }],
            createdAt: now,
            updatedAt: now,
          },
          status: createSageOsStatusSnapshot({
            skills: { total: 2, active: 0, queued: 2, blocked: 0 },
          }),
        };
      },
    } as SageOsCliDeps);

    await program.parseAsync(["os", "skills", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ skills: [{ id: "skill_existing" }] });

    await program.parseAsync(["os", "skills", "draft", "workflow_new", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      result: { outcome: "drafted", skill: { id: "skill_new", workflowId: "workflow_new" } },
    });
    expect(draftCalls).toHaveLength(1);
    expect(draftCalls[0]).toMatchObject({ workflowId: "workflow_new" });
  });

  it("lists and discovers app candidates through CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T22:45:00.000Z";
    await upsertSageOsAppCandidate(store, {
      id: "app_existing",
      name: "Existing Widget",
      state: "draft",
      targetSurface: "widget",
      purpose: "Existing app candidate.",
      sourceObservationIds: ["obs_1", "obs_2"],
      provenance: ["obs_1", "obs_2"],
      sensitivity: "private",
      inputs: ["captured observation pattern"],
      outputs: ["local widget candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      previewCommand: "sage os apps preview app_existing",
      artifactRefs: [],
      rollbackRef: "delete apps.json entry app_existing",
      createdAt: now,
      updatedAt: now,
    });

    const discoverCalls: unknown[] = [];
    const program = makeProgram({
      discoverAppCandidates: async (params: unknown) => {
        discoverCalls.push(params);
        return {
          observed: 2,
          created: 1,
          skipped: 0,
          candidates: [
            {
              id: "app_widget_new",
              name: "New Widget",
              state: "draft" as const,
              targetSurface: "widget" as const,
              purpose: "Summarize repeated app focus.",
              sourceObservationIds: ["obs_3", "obs_4"],
              provenance: ["obs_3", "obs_4"],
              sensitivity: "private" as const,
              inputs: ["captured observation pattern"],
              outputs: ["local widget candidate"],
              policyScopes: [{ kind: "app" as const, allow: ["Terminal"], risk: "low" as const }],
              previewCommand: "sage os apps preview app_widget_new",
              artifactRefs: [],
              rollbackRef: "delete apps.json entry app_widget_new",
              createdAt: now,
              updatedAt: now,
            },
          ],
          status: createSageOsStatusSnapshot({
            apps: { total: 2, active: 0, queued: 2, blocked: 0 },
          }),
        };
      },
    } as SageOsCliDeps);

    await program.parseAsync(["os", "apps", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ apps: [{ id: "app_existing" }] });

    await program.parseAsync(["os", "apps", "discover", "--min", "2", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      result: { observed: 2, created: 1, candidates: [{ id: "app_widget_new" }] },
    });
    expect(discoverCalls).toHaveLength(1);
    expect(discoverCalls[0]).toMatchObject({ minOccurrences: 2 });
  });

  it("lists, inspects, and runs coding reports through CLI controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T23:55:00.000Z";
    await upsertSageOsCodingReport(store, {
      id: "coding_report_existing",
      taskId: "task_existing",
      runId: "run_existing_1",
      repoPath: "C:\\repo",
      objective: "Run tests.",
      outcome: "succeeded",
      startedAt: now,
      finishedAt: now,
      preState: { branch: "main", dirty: false, changedFiles: [] },
      postState: { branch: "main", dirty: true, changedFiles: ["README.md"] },
      diff: { stat: "README.md | 1 +", preview: "+done", changedFiles: ["README.md"] },
      tests: [{ command: "node test.js", exitCode: 0, stdoutPreview: "ok", stderrPreview: "" }],
      blockers: [],
      verificationRefs: ["test:node test.js"],
      rollback: "Review git diff and revert changed files if needed.",
      createdAt: now,
      updatedAt: now,
    });

    const runCalls: unknown[] = [];
    const program = makeProgram({
      loadConfig: () => ({
        sageos: { coding: { enabled: true, allowedRepos: ["C:\\repo"] } },
      }),
      runNightShiftTask: async (params: unknown) => {
        runCalls.push(params);
        return {
          outcome: "succeeded" as const,
          task: {
            id: "task_new",
            title: "Run fixture",
            objective: "Append marker and test.",
            state: "completed" as const,
            requestedBy: "jason",
            autonomyTier: "execute_scoped" as const,
            policyScopes: [{ kind: "repo" as const, allow: ["C:\\repo"], risk: "low" as const }],
            createdAt: now,
            updatedAt: now,
          },
          run: {
            id: "run_task_new_1",
            taskId: "task_new",
            attempt: 1,
            state: "succeeded" as const,
            traceId: "trace_task_new",
            startedAt: now,
            finishedAt: now,
          },
          report: {
            id: "coding_report_task_new_1",
            taskId: "task_new",
            runId: "run_task_new_1",
            repoPath: "C:\\repo",
            objective: "Append marker and test.",
            outcome: "succeeded" as const,
            startedAt: now,
            finishedAt: now,
            preState: { branch: "main", dirty: false, changedFiles: [] },
            postState: { branch: "main", dirty: true, changedFiles: ["README.md"] },
            diff: { stat: "README.md | 1 +", preview: "+done", changedFiles: ["README.md"] },
            tests: [
              { command: "node test.js", exitCode: 0, stdoutPreview: "ok", stderrPreview: "" },
            ],
            blockers: [],
            verificationRefs: ["test:node test.js"],
            rollback: "Review git diff and revert changed files if needed.",
            createdAt: now,
            updatedAt: now,
          },
          status: createSageOsStatusSnapshot(),
        };
      },
    } as SageOsCliDeps);

    await program.parseAsync(["os", "coding", "--json"], { from: "user" });
    expect(lastJson()).toMatchObject({ reports: [{ id: "coding_report_existing" }] });

    await program.parseAsync(["os", "coding", "inspect", "coding_report_existing", "--json"], {
      from: "user",
    });
    expect(lastJson()).toMatchObject({
      report: { id: "coding_report_existing", diff: { changedFiles: ["README.md"] } },
    });

    await program.parseAsync(
      [
        "os",
        "coding",
        "run",
        "task_new",
        "--append-file",
        "README.md",
        "--append-text",
        "done",
        "--test-command",
        "node test.js",
        "--json",
      ],
      { from: "user" },
    );
    expect(lastJson()).toMatchObject({
      result: { outcome: "succeeded", report: { id: "coding_report_task_new_1" } },
    });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      taskId: "task_new",
      cfg: { coding: { enabled: true, allowedRepos: ["C:\\repo"] } },
      append: { relativePath: "README.md", text: "done" },
      testCommand: "node test.js",
      requestedBy: "sageos.cli",
    });
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
