import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsControl,
  upsertSageOsAgent,
  upsertSageOsRun,
  upsertSageOsTask,
} from "../../sageos/state-store.js";
import { listGatewayMethods, GATEWAY_EVENTS } from "../server-methods-list.js";
import { sageOsHandlers } from "./sageos.js";

const oldStateDir = process.env.SAGE_STATE_DIR;

async function invoke(method: keyof typeof sageOsHandlers, params: Record<string, unknown> = {}) {
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
    expect(listGatewayMethods()).toContain("sageos.tasks.list");
    expect(listGatewayMethods()).toContain("sageos.runs.list");
    expect(listGatewayMethods()).toContain("sageos.control");
    expect(GATEWAY_EVENTS).toContain("sageos");
  });

  it("returns durable SageOS status", async () => {
    const { response } = await invoke("sageos.status");
    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      version: 1,
      status: { supervisor: { state: "stopped" } },
      agents: [],
      tasks: [],
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
