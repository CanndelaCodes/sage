import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeLearningEvent } from "../../learning/events.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  readSageOsControl,
  upsertSageOsApproval,
  upsertSageOsObservation,
  upsertSageOsRun,
  upsertSageOsAgent,
  upsertSageOsTask,
} from "../../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../../sageos/types.js";
import { listGatewayMethods, GATEWAY_EVENTS } from "../server-methods-list.js";
import { sageOsHandlers } from "./sageos.js";

const { mockReadActiveAppFocus } = vi.hoisted(() => ({
  mockReadActiveAppFocus: vi.fn(),
}));
const { mockLoadConfig, mockRunMemoryStewardOnce, mockRunAmbientCopilotOnce } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockRunMemoryStewardOnce: vi.fn(),
  mockRunAmbientCopilotOnce: vi.fn(),
}));

vi.mock("../../learning/app-focus.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../learning/app-focus.js")>();
  return { ...mod, readActiveAppFocus: mockReadActiveAppFocus };
});
vi.mock("../../config/config.js", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../../sageos/memory-steward.js", () => ({
  runSageOsMemoryStewardOnce: mockRunMemoryStewardOnce,
}));
vi.mock("../../sageos/ambient-copilot.js", () => ({
  runSageOsAmbientCopilotOnce: mockRunAmbientCopilotOnce,
}));

const oldStateDir = process.env.SAGE_STATE_DIR;

async function invoke(method: string, params: Record<string, unknown> = {}) {
  const responses: Array<{ ok: boolean; payload?: unknown; error?: unknown }> = [];
  const broadcast = vi.fn();
  await sageOsHandlers[method]({
    req: { id: 1, method, params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: (ok, payload, error) => responses.push({ ok, payload, error }),
    context: { broadcast } as never,
  });
  return { response: responses.at(-1), broadcast };
}

describe("SageOS gateway methods", () => {
  beforeEach(async () => {
    process.env.SAGE_STATE_DIR = await mkdtemp(path.join(tmpdir(), "sageos-gateway-"));
    mockReadActiveAppFocus.mockReset();
    mockLoadConfig.mockReset();
    mockLoadConfig.mockReturnValue({ sageos: { memory: { replayQueues: true } } });
    mockRunMemoryStewardOnce.mockReset();
    mockRunAmbientCopilotOnce.mockReset();
  });

  afterEach(() => {
    if (oldStateDir === undefined) {
      delete process.env.SAGE_STATE_DIR;
    } else {
      process.env.SAGE_STATE_DIR = oldStateDir;
    }
  });

  it("registers methods and events for command-center clients", () => {
    expect(listGatewayMethods()).toContain("sageos.status");
    expect(listGatewayMethods()).toContain("sageos.agents.list");
    expect(listGatewayMethods()).toContain("sageos.agentTemplates.list");
    expect(listGatewayMethods()).toContain("sageos.agentTemplates.inspect");
    expect(listGatewayMethods()).toContain("sageos.tasks.list");
    expect(listGatewayMethods()).toContain("sageos.tasks.queue");
    expect(listGatewayMethods()).toContain("sageos.tasks.runNext");
    expect(listGatewayMethods()).toContain("sageos.runs.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.resolve");
    expect(listGatewayMethods()).toContain("sageos.observations.list");
    expect(listGatewayMethods()).toContain("sageos.observe");
    expect(listGatewayMethods()).toContain("sageos.copilot.suggest");
    expect(listGatewayMethods()).toContain("sageos.memory.replay");
    expect(listGatewayMethods()).toContain("sageos.control");
    expect(GATEWAY_EVENTS).toContain("sageos");
  });

  it("returns default SageOS employee templates", async () => {
    const list = await invoke("sageos.agentTemplates.list");
    expect(list.response?.ok).toBe(true);
    const payload = list.response?.payload as { templates: Array<{ id: string }> };
    expect(payload.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining(["security_sentinel", "pc_steward", "memory_steward", "reviewer"]),
    );

    const inspect = await invoke("sageos.agentTemplates.inspect", { id: "memory_steward" });
    expect(inspect.response?.ok).toBe(true);
    expect(inspect.response?.payload).toMatchObject({
      template: { id: "memory_steward", name: "Memory Steward", role: "memory" },
    });
  });

  it("returns durable SageOS status", async () => {
    const store = createSageOsStateStore();
    const now = new Date().toISOString();
    await upsertSageOsTask(store, {
      id: "task_status",
      title: "Expose status",
      objective: "Count durable tasks in gateway status.",
      state: "queued",
      requestedBy: "test",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    const { response } = await invoke("sageos.status");
    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      version: 1,
      status: {
        supervisor: { state: "stopped" },
        tasks: { total: 1, queued: 1 },
        runs: { total: 0 },
        memory: { canonical: "sage-memory", captureQueue: { total: 0 } },
        learning: { activityQueue: { total: 0 } },
        audit: { eventLogPath: expect.stringContaining("events.jsonl") },
      },
      agents: [],
      tasks: [{ id: "task_status" }],
      runs: [],
    });
  });

  it("lists command-center agent, task, and run resources", async () => {
    const store = createSageOsStateStore();
    const now = new Date().toISOString();
    await upsertSageOsAgent(store, {
      id: "agent_builder",
      name: "Builder",
      role: "implementation",
      mission: "Build validated changes",
      status: "active",
      autonomyTier: "execute_scoped",
      responsibilities: ["coding"],
      allowedScopes: [],
      deniedScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_build",
      title: "Build feature",
      objective: "Implement and validate a slice",
      state: "running",
      requestedBy: "test",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsRun(store, {
      id: "run_build",
      taskId: "task_build",
      attempt: 1,
      state: "running",
      traceId: "trace_build",
      startedAt: now,
    });

    await expect(invoke("sageos.agents.list")).resolves.toMatchObject({
      response: { ok: true, payload: { agents: [{ id: "agent_builder" }] } },
    });
    await expect(invoke("sageos.tasks.list")).resolves.toMatchObject({
      response: { ok: true, payload: { tasks: [{ id: "task_build" }] } },
    });
    await expect(invoke("sageos.runs.list")).resolves.toMatchObject({
      response: { ok: true, payload: { runs: [{ id: "run_build" }] } },
    });
  });

  it("queues proposed tasks through gateway policy controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T17:45:00.000Z";
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

    const { response, broadcast } = await invoke("sageos.tasks.queue", {
      id: "task_low",
      reason: "accepted",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { outcome: "queued", task: { id: "task_low", state: "queued" } },
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: "task_low", state: "queued" }),
        ]),
      }),
      { dropIfSlow: true },
    );
  });

  it("runs the next queued task through gateway controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T18:15:00.000Z";
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

    const { response, broadcast } = await invoke("sageos.tasks.runNext");

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        outcome: "completed",
        task: { id: "task_run", state: "completed" },
        run: { id: "run_task_run_1", state: "succeeded" },
      },
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: "task_run", state: "completed" }),
        ]),
        runs: expect.arrayContaining([
          expect.objectContaining({ id: "run_task_run_1", state: "succeeded" }),
        ]),
      }),
      { dropIfSlow: true },
    );
  });

  it("lists and resolves durable approvals with audit evidence", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T15:00:00.000Z";
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

    const list = await invoke("sageos.approvals.list");
    expect(list.response?.ok).toBe(true);
    expect(list.response?.payload).toMatchObject({
      approvals: [
        { id: "approval_external", state: "pending" },
        { id: "approval_policy", state: "pending" },
      ],
    });

    const approved = await invoke("sageos.approvals.resolve", {
      id: "approval_external",
      decision: "approved",
      reason: "reviewed",
    });
    expect(approved.response?.ok).toBe(true);
    expect(approved.response?.payload).toMatchObject({
      approval: {
        id: "approval_external",
        state: "approved",
        resolvedBy: "sageos.gateway",
        resolutionReason: "reviewed",
      },
    });
    expect(approved.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        approvals: expect.arrayContaining([
          expect.objectContaining({ id: "approval_external", state: "approved" }),
        ]),
      }),
      { dropIfSlow: true },
    );

    const denied = await invoke("sageos.approvals.resolve", {
      id: "approval_policy",
      decision: "denied",
      reason: "unsafe",
    });
    expect(denied.response?.ok).toBe(true);
    expect(denied.response?.payload).toMatchObject({
      approval: {
        id: "approval_policy",
        state: "denied",
        resolvedBy: "sageos.gateway",
        resolutionReason: "unsafe",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      approvals: [
        { id: "approval_external", state: "approved" },
        { id: "approval_policy", state: "denied" },
      ],
    });

    const log = await readFile(
      path.join(process.env.SAGE_STATE_DIR!, "sageos", "events.jsonl"),
      "utf8",
    );
    expect(log.match(/approval_resolved/g)).toHaveLength(2);
  });

  it("rejects invalid approval resolution params", async () => {
    const { response } = await invoke("sageos.approvals.resolve", {
      id: "approval_external",
      decision: "maybe",
    });
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("lists and records app-focus observations through gateway", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T16:40:00.000Z";
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
    mockReadActiveAppFocus.mockResolvedValue({
      supported: true,
      event: normalizeLearningEvent(
        {
          source: "app_focus",
          actor: "local-user",
          title: "Terminal: Sage",
          text: "Active app focus: Terminal - Sage",
          payload: { processName: "Terminal", pid: 789, windowTitle: "Sage" },
        },
        { now: () => new Date(now), idFactory: () => "learning_gateway_focus" },
      ),
    });

    const list = await invoke("sageos.observations.list");
    expect(list.response?.ok).toBe(true);
    expect(list.response?.payload).toMatchObject({
      observations: [{ id: "obs_existing", source: "app_focus", state: "captured" }],
    });

    const observed = await invoke("sageos.observe", { source: "app_focus" });
    expect(observed.response?.ok).toBe(true);
    expect(observed.response?.payload).toMatchObject({
      result: {
        status: "recorded",
        observation: {
          source: "app_focus",
          state: "captured",
          learningEventId: "learning_gateway_focus",
        },
      },
    });
    expect(observed.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        observations: expect.arrayContaining([
          expect.objectContaining({ source: "app_focus", state: "captured" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      observations: [
        { id: "obs_existing", source: "app_focus" },
        { source: "app_focus", state: "captured", learningEventId: "learning_gateway_focus" },
      ],
    });
  });

  it("rejects unsupported observation sources", async () => {
    const { response } = await invoke("sageos.observe", { source: "screen" });
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("runs memory steward replay through gateway", async () => {
    mockRunMemoryStewardOnce.mockResolvedValue({
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
    });

    const { response, broadcast } = await invoke("sageos.memory.replay", { agentId: "main" });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        memory: { attempted: 1, captured: 1, failed: 0 },
        learning: { attempted: 2, accepted: 2, failed: 0 },
      },
    });
    expect(mockRunMemoryStewardOnce).toHaveBeenCalledWith({
      cfg: { sageos: { memory: { replayQueues: true } } },
      agentId: "main",
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({
          memory: expect.objectContaining({ status: "ok" }),
          learning: expect.objectContaining({ status: "ok" }),
        }),
      }),
      { dropIfSlow: true },
    );
  });

  it("runs ambient copilot suggestions through gateway", async () => {
    mockLoadConfig.mockReturnValue({ sageos: { enabled: true, mode: "suggest" } });
    mockRunAmbientCopilotOnce.mockResolvedValue({
      observed: 1,
      proposed: 1,
      skipped: 0,
      tasks: [
        {
          id: "task_observation_obs_focus",
          title: "Review observed work: Code",
          objective: "Review observed focus.",
          state: "proposed",
          requestedBy: "sageos.ambient_copilot",
          autonomyTier: "suggest",
          policyScopes: [],
          createdAt: "2026-05-27T17:15:00.000Z",
          updatedAt: "2026-05-27T17:15:00.000Z",
        },
      ],
      status: createSageOsStatusSnapshot({
        tasks: { total: 1, active: 0, queued: 1, blocked: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.copilot.suggest", { max: 2 });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        observed: 1,
        proposed: 1,
        skipped: 0,
        tasks: [{ id: "task_observation_obs_focus" }],
      },
    });
    expect(mockRunAmbientCopilotOnce).toHaveBeenCalledWith({
      cfg: { enabled: true, mode: "suggest" },
      maxSuggestions: 2,
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({
          tasks: expect.objectContaining({ total: 1, queued: 1 }),
        }),
      }),
      { dropIfSlow: true },
    );
  });

  it("writes supervisor control, state, and audit event", async () => {
    const { response, broadcast } = await invoke("sageos.control", {
      state: "paused",
      reason: "review",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({ status: { supervisor: { state: "paused" } } });
    expect(broadcast).toHaveBeenCalledWith("sageos", response?.payload, { dropIfSlow: true });
    await expect(readSageOsControl(createSageOsControlStore())).resolves.toMatchObject({
      state: "paused",
      reason: "review",
    });
    const log = await readFile(
      path.join(process.env.SAGE_STATE_DIR!, "sageos", "events.jsonl"),
      "utf8",
    );
    expect(log).toContain("supervisor_paused");
  });

  it("rejects invalid control state", async () => {
    const { response } = await invoke("sageos.control", { state: "launch" });
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });
});
