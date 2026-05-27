import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  readSageOsControl,
  upsertSageOsApproval,
  upsertSageOsRun,
  upsertSageOsAgent,
  upsertSageOsTask,
} from "../../sageos/state-store.js";
import { listGatewayMethods, GATEWAY_EVENTS } from "../server-methods-list.js";
import { sageOsHandlers } from "./sageos.js";

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
    expect(listGatewayMethods()).toContain("sageos.runs.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.resolve");
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
