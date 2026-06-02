import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  upsertSageOsAppCandidate,
  upsertSageOsCodingReport,
  upsertSageOsObservation,
  upsertSageOsRun,
  upsertSageOsAgent,
  upsertSageOsSkill,
  upsertSageOsTask,
  upsertSageOsWorkflow,
} from "../../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../../sageos/types.js";
import { listGatewayMethods, GATEWAY_EVENTS } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";
import { sageOsHandlers } from "./sageos.js";

const { mockReadActiveAppFocus } = vi.hoisted(() => ({
  mockReadActiveAppFocus: vi.fn(),
}));
const {
  mockLoadConfig,
  mockRunMemoryStewardOnce,
  mockRunMemoryDoctorOnce,
  mockRunAmbientCopilotOnce,
  mockSendTelegramDigestOnce,
  mockSendTaskNotificationOnce,
  mockSendLifecycleNotificationOnce,
  mockSendApprovalNotificationOnce,
  mockSendIncidentNotificationOnce,
  mockSendCompletionNotificationOnce,
  mockFlushNotificationBatchOnce,
  mockDiscoverWorkflowCandidates,
  mockDraftSkillFromWorkflow,
  mockDiscoverAppCandidates,
  mockDryRunWorkflow,
  mockRunNightShiftTask,
  mockObserveSystemStatusOnce,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockRunMemoryStewardOnce: vi.fn(),
  mockRunMemoryDoctorOnce: vi.fn(),
  mockRunAmbientCopilotOnce: vi.fn(),
  mockSendTelegramDigestOnce: vi.fn(),
  mockSendTaskNotificationOnce: vi.fn(),
  mockSendLifecycleNotificationOnce: vi.fn(),
  mockSendApprovalNotificationOnce: vi.fn(),
  mockSendIncidentNotificationOnce: vi.fn(),
  mockSendCompletionNotificationOnce: vi.fn(),
  mockFlushNotificationBatchOnce: vi.fn(),
  mockDiscoverWorkflowCandidates: vi.fn(),
  mockDraftSkillFromWorkflow: vi.fn(),
  mockDiscoverAppCandidates: vi.fn(),
  mockDryRunWorkflow: vi.fn(),
  mockRunNightShiftTask: vi.fn(),
  mockObserveSystemStatusOnce: vi.fn(),
}));

vi.mock("../../learning/app-focus.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../learning/app-focus.js")>();
  return { ...mod, readActiveAppFocus: mockReadActiveAppFocus };
});
vi.mock("../../config/config.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../config/config.js")>();
  return { ...mod, loadConfig: mockLoadConfig };
});
vi.mock("../../sageos/memory-steward.js", () => ({
  runSageOsMemoryStewardOnce: mockRunMemoryStewardOnce,
  runSageOsMemoryDoctorOnce: mockRunMemoryDoctorOnce,
}));
vi.mock("../../sageos/ambient-copilot.js", () => ({
  runSageOsAmbientCopilotOnce: mockRunAmbientCopilotOnce,
}));
vi.mock("../../sageos/notifications.js", () => ({
  sendSageOsTelegramDigestOnce: mockSendTelegramDigestOnce,
  sendSageOsTaskNotificationOnce: mockSendTaskNotificationOnce,
  sendSageOsLifecycleNotificationOnce: mockSendLifecycleNotificationOnce,
  sendSageOsApprovalNotificationOnce: mockSendApprovalNotificationOnce,
  sendSageOsIncidentNotificationOnce: mockSendIncidentNotificationOnce,
  sendSageOsCompletionNotificationOnce: mockSendCompletionNotificationOnce,
  flushSageOsTelegramNotificationBatchOnce: mockFlushNotificationBatchOnce,
}));
vi.mock("../../sageos/workflow-compiler.js", () => ({
  discoverSageOsWorkflowCandidates: mockDiscoverWorkflowCandidates,
}));
vi.mock("../../sageos/skill-steward.js", () => ({
  draftSageOsSkillFromWorkflow: mockDraftSkillFromWorkflow,
}));
vi.mock("../../sageos/app-candidates.js", () => ({
  discoverSageOsAppCandidates: mockDiscoverAppCandidates,
}));
vi.mock("../../sageos/workflow-runner.js", () => ({
  dryRunSageOsWorkflow: mockDryRunWorkflow,
}));
vi.mock("../../sageos/coding/night-shift.js", () => ({
  runSageOsNightShiftTask: mockRunNightShiftTask,
}));
vi.mock("../../sageos/system-observer.js", () => ({
  observeSystemStatusOnce: mockObserveSystemStatusOnce,
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
    mockRunMemoryDoctorOnce.mockReset();
    mockRunAmbientCopilotOnce.mockReset();
    mockSendTelegramDigestOnce.mockReset();
    mockSendTaskNotificationOnce.mockReset();
    mockSendLifecycleNotificationOnce.mockReset();
    mockSendApprovalNotificationOnce.mockReset();
    mockSendIncidentNotificationOnce.mockReset();
    mockSendCompletionNotificationOnce.mockReset();
    mockDiscoverWorkflowCandidates.mockReset();
    mockDraftSkillFromWorkflow.mockReset();
    mockDiscoverAppCandidates.mockReset();
    mockDryRunWorkflow.mockReset();
    mockRunNightShiftTask.mockReset();
    mockObserveSystemStatusOnce.mockReset();
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
    expect(listGatewayMethods()).toContain("sageos.agents.create");
    expect(listGatewayMethods()).toContain("sageos.agents.activationPreview");
    expect(listGatewayMethods()).toContain("sageos.agents.activate");
    expect(listGatewayMethods()).toContain("sageos.agents.pause");
    expect(listGatewayMethods()).toContain("sageos.agents.resume");
    expect(listGatewayMethods()).toContain("sageos.agents.retire");
    expect(listGatewayMethods()).toContain("sageos.agentTemplates.list");
    expect(listGatewayMethods()).toContain("sageos.agentTemplates.inspect");
    expect(listGatewayMethods()).toContain("sageos.collaboration.list");
    expect(listGatewayMethods()).toContain("sageos.collaboration.handoff");
    expect(listGatewayMethods()).toContain("sageos.collaboration.requestReview");
    expect(listGatewayMethods()).toContain("sageos.tasks.list");
    expect(listGatewayMethods()).toContain("sageos.tasks.create");
    expect(listGatewayMethods()).toContain("sageos.tasks.queue");
    expect(listGatewayMethods()).toContain("sageos.tasks.runNext");
    expect(listGatewayMethods()).toContain("sageos.tasks.cancel");
    expect(listGatewayMethods()).toContain("sageos.workflows.list");
    expect(listGatewayMethods()).toContain("sageos.workflows.discover");
    expect(listGatewayMethods()).toContain("sageos.workflows.dryRun");
    expect(listGatewayMethods()).toContain("sageos.skills.list");
    expect(listGatewayMethods()).toContain("sageos.skills.draft");
    expect(listGatewayMethods()).toContain("sageos.apps.list");
    expect(listGatewayMethods()).toContain("sageos.apps.discover");
    expect(listGatewayMethods()).toContain("sageos.coding.list");
    expect(listGatewayMethods()).toContain("sageos.coding.run");
    expect(listGatewayMethods()).toContain("sageos.runs.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.list");
    expect(listGatewayMethods()).toContain("sageos.approvals.resolve");
    expect(listGatewayMethods()).toContain("sageos.observations.list");
    expect(listGatewayMethods()).toContain("sageos.observe");
    expect(listGatewayMethods()).toContain("sageos.copilot.suggest");
    expect(listGatewayMethods()).toContain("sageos.memory.replay");
    expect(listGatewayMethods()).toContain("sageos.memory.doctor");
    expect(listGatewayMethods()).toContain("sageos.notifications.digest");
    expect(listGatewayMethods()).toContain("sageos.notifications.startup");
    expect(listGatewayMethods()).toContain("sageos.notifications.shutdown");
    expect(listGatewayMethods()).toContain("sageos.notifications.approval");
    expect(listGatewayMethods()).toContain("sageos.notifications.incident");
    expect(listGatewayMethods()).toContain("sageos.notifications.completion");
    expect(listGatewayMethods()).toContain("sageos.notifications.flush");
    expect(listGatewayMethods()).toContain("sageos.control");
    expect(GATEWAY_EVENTS).toContain("sageos");
  });

  it("authorizes SageOS command-center methods at read and write scopes", async () => {
    const readMethods = [
      "sageos.status",
      "sageos.agents.list",
      "sageos.agents.activationPreview",
      "sageos.agentTemplates.list",
      "sageos.agentTemplates.inspect",
      "sageos.collaboration.list",
      "sageos.tasks.list",
      "sageos.runs.list",
      "sageos.workflows.list",
      "sageos.skills.list",
      "sageos.apps.list",
      "sageos.coding.list",
      "sageos.approvals.list",
      "sageos.observations.list",
    ];
    const writeMethods = [
      "sageos.agents.create",
      "sageos.agents.activate",
      "sageos.agents.pause",
      "sageos.agents.resume",
      "sageos.agents.retire",
      "sageos.collaboration.handoff",
      "sageos.collaboration.requestReview",
      "sageos.tasks.create",
      "sageos.tasks.queue",
      "sageos.tasks.runNext",
      "sageos.tasks.cancel",
      "sageos.workflows.discover",
      "sageos.workflows.dryRun",
      "sageos.skills.draft",
      "sageos.apps.discover",
      "sageos.coding.run",
      "sageos.approvals.resolve",
      "sageos.observe",
      "sageos.copilot.suggest",
      "sageos.memory.replay",
      "sageos.memory.doctor",
      "sageos.notifications.digest",
      "sageos.notifications.startup",
      "sageos.notifications.shutdown",
      "sageos.notifications.approval",
      "sageos.notifications.incident",
      "sageos.notifications.completion",
      "sageos.notifications.flush",
      "sageos.control",
    ];

    for (const [scope, methods] of [
      ["operator.read", readMethods],
      ["operator.write", writeMethods],
    ] as const) {
      for (const method of methods) {
        const responses: Array<{ ok: boolean; payload?: unknown; error?: { message?: string } }> =
          [];
        const handler = vi.fn(({ respond }) => respond(true, { accepted: method }, undefined));

        await handleGatewayRequest({
          req: { id: 1, method, params: {} },
          client: {
            connect: {
              role: "operator",
              scopes: [scope],
              client: { id: "command-center", displayName: "Command Center" },
            },
          },
          isWebchatConnect: () => false,
          respond: (ok, payload, error) => responses.push({ ok, payload, error }),
          context: { broadcast: vi.fn() } as never,
          extraHandlers: { [method]: handler },
        });

        expect(responses, method).toEqual([
          { ok: true, payload: { accepted: method }, error: undefined },
        ]);
        expect(handler, method).toHaveBeenCalledTimes(1);
      }
    }
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

  it("creates employee drafts through gateway controls", async () => {
    const store = createSageOsStateStore();
    const description =
      "Create a Security Sentinel that watches Defender, startup apps, and network posture, reports urgent issues immediately, summarizes daily, and asks before changing firewall settings.";

    const created = await invoke("sageos.agents.create", { description });

    expect(created.response?.ok).toBe(true);
    expect(created.response?.payload).toMatchObject({
      employee: {
        id: "employee_security_sentinel",
        name: "Security Sentinel",
        role: "security",
        status: "draft",
        autonomyTier: "observe",
        tools: expect.arrayContaining(["sageos.system-observer", "windows-security-readonly"]),
        memoryScopes: expect.arrayContaining(["security_observations", "incidents"]),
        schedules: expect.arrayContaining([
          "gateway tick",
          "daily digest",
          "urgent incident trigger",
        ]),
      },
      preview: {
        employeeId: "employee_security_sentinel",
        tools: expect.arrayContaining(["sageos.system-observer", "windows-security-readonly"]),
        memoryAccess: expect.arrayContaining(["security_observations", "incidents"]),
        schedules: expect.arrayContaining(["daily digest", "urgent incident trigger"]),
        approvalRequired: false,
      },
      state: {
        agents: [expect.objectContaining({ id: "employee_security_sentinel" })],
      },
    });
    expect(created.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ id: "employee_security_sentinel", status: "draft" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_security_sentinel", status: "draft" }],
    });
    const rawEvents = await readFile(
      path.join(process.env.SAGE_STATE_DIR!, "sageos", "events.jsonl"),
      "utf8",
    );
    expect(rawEvents).toContain("employee_drafted");
  });

  it("previews and activates employees through gateway controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T18:55:00.000Z";
    await upsertSageOsAgent(store, {
      id: "employee_memory",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep Sage Memory capture healthy.",
      status: "draft",
      autonomyTier: "execute_scoped",
      responsibilities: ["replay queues"],
      allowedScopes: [
        { kind: "tool", allow: ["sage-memory"], risk: "medium" },
        { kind: "memory", allow: ["capture_queue"], risk: "medium" },
      ],
      deniedScopes: [{ kind: "memory", deny: ["private_data_export"], risk: "critical" }],
      tools: ["sage-memory"],
      memoryScopes: ["capture_queue"],
      schedules: ["gateway tick"],
      risks: ["incorrect replay"],
      createdAt: now,
      updatedAt: now,
    });

    const preview = await invoke("sageos.agents.activationPreview", { id: "employee_memory" });
    expect(preview.response?.ok).toBe(true);
    expect(preview.response?.payload).toMatchObject({
      preview: {
        employeeId: "employee_memory",
        tools: ["sage-memory"],
        memoryAccess: ["capture_queue"],
        schedules: ["gateway tick"],
        risks: ["incorrect replay"],
        approvalRequired: false,
      },
    });

    const activated = await invoke("sageos.agents.activate", {
      id: "employee_memory",
      reason: "reviewed",
    });
    expect(activated.response?.ok).toBe(true);
    expect(activated.response?.payload).toMatchObject({
      result: {
        outcome: "activated",
        employee: { id: "employee_memory", status: "active" },
      },
      state: {
        agents: [{ id: "employee_memory", status: "active" }],
      },
    });
    expect(activated.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ id: "employee_memory", status: "active" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_memory", status: "active" }],
    });

    const paused = await invoke("sageos.agents.pause", {
      id: "employee_memory",
      reason: "maintenance",
    });
    expect(paused.response?.ok).toBe(true);
    expect(paused.response?.payload).toMatchObject({
      result: {
        outcome: "updated",
        employee: { id: "employee_memory", status: "paused" },
        previousStatus: "active",
      },
      state: {
        agents: [{ id: "employee_memory", status: "paused" }],
      },
    });

    const resumed = await invoke("sageos.agents.resume", {
      id: "employee_memory",
      reason: "ready",
    });
    expect(resumed.response?.ok).toBe(true);
    expect(resumed.response?.payload).toMatchObject({
      result: {
        outcome: "updated",
        employee: { id: "employee_memory", status: "active" },
        previousStatus: "paused",
      },
    });

    const retired = await invoke("sageos.agents.retire", {
      id: "employee_memory",
      reason: "replaced",
    });
    expect(retired.response?.ok).toBe(true);
    expect(retired.response?.payload).toMatchObject({
      result: {
        outcome: "updated",
        employee: { id: "employee_memory", status: "retired" },
        previousStatus: "active",
      },
    });
    expect(retired.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ id: "employee_memory", status: "retired" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    const rawEvents = await readFile(
      path.join(process.env.SAGE_STATE_DIR!, "sageos", "events.jsonl"),
      "utf8",
    );
    expect(rawEvents).toContain("employee_paused");
    expect(rawEvents).toContain("employee_resumed");
    expect(rawEvents).toContain("employee_retired");
  });

  it("lists and creates collaboration events through gateway controls", async () => {
    const store = createSageOsStateStore();

    const handoff = await invoke("sageos.collaboration.handoff", {
      fromAgentId: "employee_pc_steward",
      toAgentId: "employee_reviewer",
      title: "Review disk warning",
      objective: "Review evidence",
    });
    expect(handoff.response?.ok).toBe(true);
    expect(handoff.response?.payload).toMatchObject({
      result: {
        outcome: "created",
        collaboration: {
          kind: "handoff",
          fromAgentId: "employee_pc_steward",
          toAgentId: "employee_reviewer",
        },
        task: {
          ownerAgentId: "employee_reviewer",
          state: "proposed",
        },
      },
    });
    expect(handoff.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        collaborations: expect.arrayContaining([expect.objectContaining({ kind: "handoff" })]),
      }),
      { dropIfSlow: true },
    );

    const review = await invoke("sageos.collaboration.requestReview", {
      fromAgentId: "employee_coding",
      reviewerAgentId: "employee_reviewer",
      taskId: "task_coding",
      title: "Review coding report",
      summary: "Check diff and tests",
      artifactRefs: ["coding_report_task_coding_1"],
    });
    expect(review.response?.ok).toBe(true);
    expect(review.response?.payload).toMatchObject({
      result: {
        outcome: "created",
        collaboration: {
          kind: "review_request",
          taskId: "task_coding",
          artifactRefs: ["coding_report_task_coding_1"],
        },
      },
    });

    const list = await invoke("sageos.collaboration.list");
    expect(list.response?.ok).toBe(true);
    expect(list.response?.payload).toMatchObject({
      collaborations: [
        { kind: "handoff", fromAgentId: "employee_pc_steward" },
        { kind: "review_request", fromAgentId: "employee_coding" },
      ],
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [{ ownerAgentId: "employee_reviewer" }],
      collaborations: [
        { kind: "handoff", fromAgentId: "employee_pc_steward" },
        { kind: "review_request", fromAgentId: "employee_coding" },
      ],
    });
  });

  it("returns durable SageOS status", async () => {
    const store = createSageOsStateStore();
    const now = new Date().toISOString();
    const sageOsStateDir = path.join(process.env.SAGE_STATE_DIR ?? "", "sageos");
    const notificationBatchPath = path.join(sageOsStateDir, "notification-batch.json");
    const notificationDigestPath = path.join(sageOsStateDir, "notification-digest.json");
    mockLoadConfig.mockReturnValue({
      sageos: {
        memory: { replayQueues: true },
        notifications: {
          telegram: {
            enabled: true,
            target: "telegram:123",
            digestSchedule: "* * * * *",
            batchWindowMinutes: 15,
          },
        },
      },
    });
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
    await mkdir(sageOsStateDir, { recursive: true });
    await writeFile(
      notificationBatchPath,
      `${JSON.stringify(
        {
          version: 1,
          entries: [
            {
              id: "batch_task_status",
              kind: "task",
              title: "SageOS: Task completed",
              text: "SageOS: Task completed\nTask: task_status - Expose status",
              target: "telegram:123",
              redactedObservationCount: 0,
              status: "pending",
              createdAt: "2026-06-02T10:00:00.000Z",
              updatedAt: "2026-06-02T10:00:00.000Z",
              taskId: "task_status",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      notificationDigestPath,
      `${JSON.stringify(
        {
          version: 1,
          lastScheduledFor: "2026-06-02T09:59:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

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
        notifications: {
          telegram: {
            enabled: true,
            target: "telegram:123",
            digestSchedule: "* * * * *",
            batchWindowMinutes: 15,
          },
          batch: {
            path: notificationBatchPath,
            pending: 1,
            total: 1,
            firstQueuedAt: "2026-06-02T10:00:00.000Z",
            dueAt: "2026-06-02T10:15:00.000Z",
          },
          digest: {
            path: notificationDigestPath,
            schedule: "* * * * *",
            lastScheduledFor: "2026-06-02T09:59:00.000Z",
            nextDueAt: expect.any(String),
          },
        },
        audit: { eventLogPath: expect.stringContaining("events.jsonl") },
      },
      agents: [],
      tasks: [{ id: "task_status" }],
      runs: [],
    });
  });

  it("lists command-center agent, task, run, workflow, skill, and app resources", async () => {
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
    await upsertSageOsWorkflow(store, {
      id: "workflow_build",
      name: "Build workflow",
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
    await upsertSageOsSkill(store, {
      id: "skill_build",
      name: "Skill: Build workflow",
      state: "draft",
      workflowId: "workflow_build",
      provenance: ["workflow_build", "obs_1", "obs_2"],
      triggerConditions: ["Repeated Code focus"],
      tests: ["obs_1", "obs_2"],
      allowedScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsAppCandidate(store, {
      id: "app_build",
      name: "Build Widget",
      state: "draft",
      targetSurface: "widget",
      purpose: "Summarize repeated build work.",
      sourceObservationIds: ["obs_1", "obs_2"],
      provenance: ["obs_1", "obs_2"],
      sensitivity: "private",
      inputs: ["captured observation pattern"],
      outputs: ["local widget candidate"],
      policyScopes: [{ kind: "app", allow: ["Code"], risk: "low" }],
      previewCommand: "sage os apps preview app_build",
      artifactRefs: [],
      rollbackRef: "delete apps.json entry app_build",
      createdAt: now,
      updatedAt: now,
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
    await expect(invoke("sageos.workflows.list")).resolves.toMatchObject({
      response: { ok: true, payload: { workflows: [{ id: "workflow_build" }] } },
    });
    await expect(invoke("sageos.skills.list")).resolves.toMatchObject({
      response: { ok: true, payload: { skills: [{ id: "skill_build" }] } },
    });
    await expect(invoke("sageos.apps.list")).resolves.toMatchObject({
      response: { ok: true, payload: { apps: [{ id: "app_build" }] } },
    });
  });

  it("lists and runs coding reports through gateway controls", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T23:58:00.000Z";
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
    mockLoadConfig.mockReturnValue({
      sageos: { coding: { enabled: true, allowedRepos: ["C:\\repo"] } },
    });
    mockRunNightShiftTask.mockResolvedValue({
      outcome: "succeeded",
      task: {
        id: "task_new",
        title: "Run fixture",
        objective: "Append marker and test.",
        state: "completed",
        requestedBy: "jason",
        autonomyTier: "execute_scoped",
        policyScopes: [{ kind: "repo", allow: ["C:\\repo"], risk: "low" }],
        createdAt: now,
        updatedAt: now,
      },
      run: {
        id: "run_task_new_1",
        taskId: "task_new",
        attempt: 1,
        state: "succeeded",
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
      },
      status: createSageOsStatusSnapshot(),
    });

    const list = await invoke("sageos.coding.list");
    expect(list.response?.ok).toBe(true);
    expect(list.response?.payload).toMatchObject({
      reports: [{ id: "coding_report_existing", outcome: "succeeded" }],
    });

    const run = await invoke("sageos.coding.run", {
      taskId: "task_new",
      appendFile: "README.md",
      appendText: "done",
      testCommand: "node test.js",
    });
    expect(run.response?.ok).toBe(true);
    expect(run.response?.payload).toMatchObject({
      result: { outcome: "succeeded", report: { id: "coding_report_task_new_1" } },
    });
    expect(mockRunNightShiftTask).toHaveBeenCalledWith({
      taskId: "task_new",
      cfg: { coding: { enabled: true, allowedRepos: ["C:\\repo"] } },
      append: { relativePath: "README.md", text: "done" },
      testCommand: "node test.js",
      requestedBy: "sageos.gateway",
    });
    expect(run.broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        codingReports: expect.arrayContaining([
          expect.objectContaining({ id: "coding_report_existing" }),
        ]),
      }),
      { dropIfSlow: true },
    );
  });

  it("rejects coding runs without a task id", async () => {
    const { response } = await invoke("sageos.coding.run", {});
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("creates proposed tasks through gateway controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:gateway" } } },
    });
    const store = createSageOsStateStore();
    await upsertSageOsAgent(store, {
      id: "employee_memory_steward",
      name: "Memory Steward",
      role: "memory",
      mission: "Keep memory queues healthy.",
      status: "active",
      autonomyTier: "execute_scoped",
      responsibilities: ["memory"],
      allowedScopes: [],
      deniedScopes: [],
      createdAt: "2026-06-01T14:30:00.000Z",
      updatedAt: "2026-06-01T14:30:00.000Z",
    });

    const { response, broadcast } = await invoke("sageos.tasks.create", {
      title: "Review memory queue",
      objective: "Replay failed memory captures and summarize blockers.",
      ownerAgentId: "employee_memory_steward",
      expectedOutput: "Replay report",
      evidenceRefs: ["memory:queue"],
      verificationPlan: ["Confirm replay result is logged"],
      budget: { maxMinutes: 20, maxToolCalls: 12 },
      toolProfile: "sageos.memory-steward",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        outcome: "created",
        task: {
          id: "task_review_memory_queue",
          state: "proposed",
          ownerAgentId: "employee_memory_steward",
          expectedOutput: "Replay report",
          evidenceRefs: ["memory:queue"],
          verificationPlan: ["Confirm replay result is logged"],
          budget: { maxMinutes: 20, maxToolCalls: 12 },
          toolProfile: "sageos.memory-steward",
        },
        status: {
          notifications: {
            telegram: { enabled: true, target: "telegram:gateway" },
          },
        },
      },
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: "task_review_memory_queue", state: "proposed" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    const eventLog = await readFile(
      path.join(process.env.SAGE_STATE_DIR ?? "", "sageos", "events.jsonl"),
      "utf8",
    );
    expect(eventLog).toContain("task_created");
  });

  it("rejects gateway task creation for unavailable employees", async () => {
    const { response } = await invoke("sageos.tasks.create", {
      title: "Review memory queue",
      objective: "Replay failed memory captures.",
      ownerAgentId: "employee_missing",
    });

    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("queues proposed tasks through gateway policy controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:gateway" } } },
    });
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
      result: {
        outcome: "queued",
        task: { id: "task_low", state: "queued" },
        status: {
          notifications: {
            telegram: { enabled: true, target: "telegram:gateway" },
          },
        },
      },
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

  it("cancels tasks through gateway controls with audit evidence", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T22:10:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_cancel",
      title: "Cancel queued task",
      objective: "Exercise browser task cancellation.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const { response, broadcast } = await invoke("sageos.tasks.cancel", {
      id: "task_cancel",
      reason: "browser cancelled",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      task: { id: "task_cancel", state: "cancelled" },
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: "task_cancel", state: "cancelled" }),
        ]),
      }),
      { dropIfSlow: true },
    );
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: "task_cancel", state: "cancelled" })],
    });
    const eventLog = await readFile(
      path.join(process.env.SAGE_STATE_DIR ?? "", "sageos", "events.jsonl"),
      "utf8",
    );
    expect(eventLog).toContain("task_cancelled");
    expect(eventLog).toContain("browser cancelled");
  });

  it("runs the next queued task with task notification through gateway controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
    mockSendTaskNotificationOnce.mockResolvedValue({ outcome: "sent", target: "telegram:123" });
    const store = createSageOsStateStore();
    const now = "2026-05-27T21:30:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_notify",
      title: "Notify completion",
      objective: "Exercise notification path.",
      state: "queued",
      requestedBy: "sageos.cli",
      autonomyTier: "execute_scoped",
      policyScopes: [],
      createdAt: now,
      updatedAt: now,
    });

    const { response } = await invoke("sageos.tasks.runNext", { notify: true });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { outcome: "completed", task: { id: "task_notify", state: "completed" } },
    });
    expect(mockSendTaskNotificationOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
        task: expect.objectContaining({ id: "task_notify", state: "completed" }),
        run: expect.objectContaining({ id: "run_task_notify_1", state: "succeeded" }),
      }),
    );
  });

  it("lists and resolves durable approvals with audit evidence", async () => {
    const store = createSageOsStateStore();
    const now = "2026-05-27T15:00:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_1",
      title: "Send Telegram update",
      objective: "Send a redacted task completion summary.",
      state: "waiting_for_policy",
      requestedBy: "coding_worker",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "channel", allow: ["telegram:123"], risk: "medium" }],
      createdAt: now,
      updatedAt: now,
    });
    await upsertSageOsTask(store, {
      id: "task_2",
      title: "Change autonomy policy",
      objective: "Raise coding worker policy.",
      state: "waiting_for_policy",
      requestedBy: "operator",
      autonomyTier: "prepare",
      policyScopes: [{ kind: "system", allow: ["sageos.policy"], risk: "medium" }],
      createdAt: now,
      updatedAt: now,
    });
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
      evidence: ["task_2"],
      scope: "task",
      taskId: "task_2",
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
      tasks: [
        { id: "task_1", state: "queued" },
        { id: "task_2", state: "blocked" },
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

    mockObserveSystemStatusOnce.mockResolvedValue({
      status: "recorded",
      observation: {
        id: "obs_system",
        source: "system",
        state: "captured",
        title: "System status",
        text: "System status: 2 check(s), 0 warning(s), 0 failure(s).",
        sensitivity: "private",
        observedAt: now,
        payload: { platform: "win32", checks: [{ id: "defender", status: "ok" }] },
        provenance: { adapter: "system" },
        createdAt: now,
        updatedAt: now,
      },
    });

    const systemObserved = await invoke("sageos.observe", { source: "system" });
    expect(systemObserved.response?.ok).toBe(true);
    expect(systemObserved.response?.payload).toMatchObject({
      result: {
        status: "recorded",
        observation: { id: "obs_system", source: "system", state: "captured" },
      },
    });
    expect(mockObserveSystemStatusOnce).toHaveBeenCalledWith({
      cfg: { sources: { system: true } },
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

  it("runs memory doctor through gateway", async () => {
    mockRunMemoryDoctorOnce.mockResolvedValue({
      doctor: {
        ok: true,
        agentId: "main",
        baseUrl: "http://127.0.0.1:18790",
        namespace: "sage.sessions",
        diagnosticNamespace: "sage.sessions.diagnostics",
        marker: "sage-memory-doctor-fixed",
        nodeId: "node_doctor",
        sessionNodePath: "sage-memory/node_doctor",
        exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
        checks: [{ name: "export", status: "pass", message: "Diagnostic namespace exported" }],
        warnings: [],
        failures: [],
        suggestions: [],
      },
      status: createSageOsStatusSnapshot({
        memory: {
          status: "ok",
          backend: "sage-memory",
          canonical: "sage-memory",
          captureQueue: { total: 0, pending: 0, failed: 0 },
          doctor: {
            ok: true,
            checkedAt: "2026-05-27T17:30:00.000Z",
            checks: 1,
            warnings: 0,
            failures: 0,
            exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
            diagnosticNamespace: "sage.sessions.diagnostics",
            sessionNodePath: "sage-memory/node_doctor",
          },
        },
      }),
    });

    const { response, broadcast } = await invoke("sageos.memory.doctor", {
      agentId: "main",
      namespace: "sage.sessions.diagnostics",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        doctor: {
          ok: true,
          exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
        },
      },
    });
    expect(mockRunMemoryDoctorOnce).toHaveBeenCalledWith({
      cfg: { sageos: { memory: { replayQueues: true } } },
      agentId: "main",
      namespace: "sage.sessions.diagnostics",
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({
          memory: expect.objectContaining({
            doctor: expect.objectContaining({ ok: true }),
          }),
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

  it("sends Telegram digest notifications through gateway controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
    mockSendTelegramDigestOnce.mockResolvedValue({
      outcome: "sent",
      target: "telegram:123",
      notification: {
        kind: "digest",
        title: "SageOS: Daily digest",
        text: "SageOS: Daily digest\nActions: Open Command Center | Pause SageOS",
        target: "telegram:123",
        redactedObservationCount: 0,
      },
      messageId: "42",
      chatId: "123",
      status: createSageOsStatusSnapshot({
        notifications: { telegram: { enabled: true, target: "telegram:123" }, urgentPending: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.notifications.digest", { send: true });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123" },
      state: {
        status: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      },
    });
    expect(mockSendTelegramDigestOnce).toHaveBeenCalledWith({
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({
          notifications: expect.objectContaining({
            telegram: expect.objectContaining({ enabled: true, target: "telegram:123" }),
          }),
        }),
      }),
      { dropIfSlow: true },
    );
  });

  it("flushes batched Telegram notifications through gateway controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
    mockFlushNotificationBatchOnce.mockResolvedValue({
      outcome: "sent",
      target: "telegram:123",
      count: 2,
      notification: {
        kind: "digest",
        title: "SageOS: Batched updates",
        text: "SageOS: Batched updates",
        target: "telegram:123",
        redactedObservationCount: 0,
      },
    });

    const { response } = await invoke("sageos.notifications.flush", {});

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123", count: 2 },
    });
    expect(mockFlushNotificationBatchOnce).toHaveBeenCalledWith({
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });
  });

  it("sends Telegram lifecycle, incident, and completion notifications through gateway controls", async () => {
    mockLoadConfig.mockReturnValue({
      sageos: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
    });
    mockSendLifecycleNotificationOnce.mockImplementation((params: { kind?: string }) => {
      const kind = params.kind === "shutdown" ? "shutdown" : "startup";
      const title = kind === "shutdown" ? "SageOS: Shutdown" : "SageOS: Startup";
      return Promise.resolve({
        outcome: "sent",
        target: "telegram:123",
        notification: {
          kind,
          title,
          text: title,
          target: "telegram:123",
          redactedObservationCount: 0,
        },
        status: createSageOsStatusSnapshot(),
      });
    });
    mockSendApprovalNotificationOnce.mockResolvedValue({
      outcome: "sent",
      target: "telegram:123",
      notification: {
        kind: "approval",
        title: "SageOS: Approval required",
        text: "SageOS: Approval required",
        target: "telegram:123",
        redactedObservationCount: 0,
      },
      status: createSageOsStatusSnapshot(),
    });
    mockSendIncidentNotificationOnce.mockResolvedValue({
      outcome: "sent",
      target: "telegram:123",
      notification: {
        kind: "incident",
        title: "SageOS: Incident",
        text: "SageOS: Incident",
        target: "telegram:123",
        redactedObservationCount: 0,
      },
      status: createSageOsStatusSnapshot(),
    });
    mockSendCompletionNotificationOnce.mockResolvedValue({
      outcome: "sent",
      target: "telegram:123",
      notification: {
        kind: "completion",
        title: "SageOS: Night Shift completed",
        text: "SageOS: Night Shift completed",
        target: "telegram:123",
        redactedObservationCount: 0,
      },
      status: createSageOsStatusSnapshot(),
    });

    const startup = await invoke("sageos.notifications.startup", { send: true });
    expect(startup.response?.ok).toBe(true);
    expect(startup.response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123" },
    });
    expect(mockSendLifecycleNotificationOnce).toHaveBeenCalledWith({
      kind: "startup",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });

    const shutdown = await invoke("sageos.notifications.shutdown", { send: true });
    expect(shutdown.response?.ok).toBe(true);
    expect(shutdown.response?.payload).toMatchObject({
      result: {
        outcome: "sent",
        target: "telegram:123",
        notification: { title: "SageOS: Shutdown" },
      },
    });
    expect(mockSendLifecycleNotificationOnce).toHaveBeenCalledWith({
      kind: "shutdown",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });

    const approval = await invoke("sageos.notifications.approval", {
      approvalId: "approval_task_external",
      send: true,
    });
    expect(approval.response?.ok).toBe(true);
    expect(approval.response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123" },
    });
    expect(mockSendApprovalNotificationOnce).toHaveBeenCalledWith({
      approvalId: "approval_task_external",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });

    const incident = await invoke("sageos.notifications.incident", {
      incidentId: "incident_memory_queue_failed",
      send: true,
    });
    expect(incident.response?.ok).toBe(true);
    expect(incident.response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123" },
    });
    expect(mockSendIncidentNotificationOnce).toHaveBeenCalledWith({
      incidentId: "incident_memory_queue_failed",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });

    const completion = await invoke("sageos.notifications.completion", {
      reportId: "coding_report_task_fix_1",
      send: true,
    });
    expect(completion.response?.ok).toBe(true);
    expect(completion.response?.payload).toMatchObject({
      result: { outcome: "sent", target: "telegram:123" },
    });
    expect(mockSendCompletionNotificationOnce).toHaveBeenCalledWith({
      reportId: "coding_report_task_fix_1",
      cfg: { notifications: { telegram: { enabled: true, target: "telegram:123" } } },
      target: undefined,
    });
  });

  it("discovers workflow candidates through gateway controls", async () => {
    mockDiscoverWorkflowCandidates.mockResolvedValue({
      observed: 2,
      created: 1,
      skipped: 0,
      candidates: [
        {
          id: "workflow_new",
          name: "New workflow",
          state: "candidate",
          observedPattern: "app_focus:terminal",
          sourceObservationIds: ["obs_1", "obs_2"],
          trigger: "Repeated Terminal focus",
          inputs: ["app focus"],
          outputs: ["candidate"],
          policyScopes: [{ kind: "app", allow: ["Terminal"], risk: "low" }],
          implementationRefs: [],
          evalRefs: [],
          createdAt: "2026-05-27T21:00:00.000Z",
          updatedAt: "2026-05-27T21:00:00.000Z",
        },
      ],
      status: createSageOsStatusSnapshot({
        workflows: { total: 1, active: 0, queued: 1, blocked: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.workflows.discover", { min: 3 });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { created: 1, candidates: [{ id: "workflow_new" }] },
      state: { status: { workflows: { total: 1, queued: 1 } } },
    });
    expect(mockDiscoverWorkflowCandidates).toHaveBeenCalledWith({ minOccurrences: 3 });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({ workflows: expect.objectContaining({ total: 1 }) }),
      }),
      { dropIfSlow: true },
    );
  });

  it("dry-runs workflow candidates through gateway controls", async () => {
    mockDryRunWorkflow.mockResolvedValue({
      outcome: "passed",
      workflow: {
        id: "workflow_new",
        name: "New workflow",
        state: "dry_run_passed",
        observedPattern: "app_focus:terminal",
        sourceObservationIds: ["obs_1", "obs_2"],
        trigger: "Repeated Terminal focus",
        inputs: ["app focus"],
        outputs: ["candidate"],
        policyScopes: [{ kind: "app", allow: ["Terminal"], risk: "low" }],
        implementationRefs: [],
        evalRefs: ["eval_workflow_new_20260527T210000000Z"],
        createdAt: "2026-05-27T21:00:00.000Z",
        updatedAt: "2026-05-27T21:00:00.000Z",
      },
      report: {
        id: "eval_workflow_new_20260527T210000000Z",
        workflowId: "workflow_new",
        passed: true,
        checkedObservationIds: ["obs_1", "obs_2"],
        missingObservationIds: [],
        secretObservationIds: [],
        summary: "Workflow workflow_new dry-run passed.",
        createdAt: "2026-05-27T21:00:00.000Z",
      },
      status: createSageOsStatusSnapshot({
        workflows: { total: 1, active: 1, queued: 0, blocked: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.workflows.dryRun", {
      workflowId: "workflow_new",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: {
        outcome: "passed",
        workflow: { id: "workflow_new", state: "dry_run_passed" },
      },
      state: { status: { workflows: { total: 1, active: 1 } } },
    });
    expect(mockDryRunWorkflow).toHaveBeenCalledWith({ workflowId: "workflow_new" });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({ workflows: expect.objectContaining({ active: 1 }) }),
      }),
      { dropIfSlow: true },
    );
  });

  it("rejects workflow dry-run without a workflow id", async () => {
    const { response } = await invoke("sageos.workflows.dryRun", {});
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("drafts skills from workflow candidates through gateway controls", async () => {
    mockDraftSkillFromWorkflow.mockResolvedValue({
      outcome: "drafted",
      skill: {
        id: "skill_new",
        name: "Skill: New workflow",
        state: "draft",
        workflowId: "workflow_new",
        provenance: ["workflow_new", "obs_1", "obs_2"],
        triggerConditions: ["Repeated Terminal focus"],
        tests: ["obs_1", "obs_2"],
        allowedScopes: [{ kind: "app", allow: ["Terminal"], risk: "low" }],
        createdAt: "2026-05-27T21:50:00.000Z",
        updatedAt: "2026-05-27T21:50:00.000Z",
      },
      status: createSageOsStatusSnapshot({
        skills: { total: 1, active: 0, queued: 1, blocked: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.skills.draft", {
      workflowId: "workflow_new",
    });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { outcome: "drafted", skill: { id: "skill_new", workflowId: "workflow_new" } },
      state: { status: { skills: { total: 1, queued: 1 } } },
    });
    expect(mockDraftSkillFromWorkflow).toHaveBeenCalledWith({ workflowId: "workflow_new" });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({ skills: expect.objectContaining({ total: 1 }) }),
      }),
      { dropIfSlow: true },
    );
  });

  it("rejects skill drafting without a workflow id", async () => {
    const { response } = await invoke("sageos.skills.draft", {});
    expect(response?.ok).toBe(false);
    expect(response?.error).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("discovers app candidates through gateway controls", async () => {
    mockDiscoverAppCandidates.mockResolvedValue({
      observed: 2,
      created: 1,
      skipped: 0,
      candidates: [
        {
          id: "app_widget_new",
          name: "New Widget",
          state: "draft",
          targetSurface: "widget",
          purpose: "Summarize repeated app focus.",
          sourceObservationIds: ["obs_1", "obs_2"],
          provenance: ["obs_1", "obs_2"],
          sensitivity: "private",
          inputs: ["captured observation pattern"],
          outputs: ["local widget candidate"],
          policyScopes: [{ kind: "app", allow: ["Terminal"], risk: "low" }],
          previewCommand: "sage os apps preview app_widget_new",
          artifactRefs: [],
          rollbackRef: "delete apps.json entry app_widget_new",
          createdAt: "2026-05-27T22:50:00.000Z",
          updatedAt: "2026-05-27T22:50:00.000Z",
        },
      ],
      status: createSageOsStatusSnapshot({
        apps: { total: 1, active: 0, queued: 1, blocked: 0 },
      }),
    });

    const { response, broadcast } = await invoke("sageos.apps.discover", { min: 3 });

    expect(response?.ok).toBe(true);
    expect(response?.payload).toMatchObject({
      result: { created: 1, candidates: [{ id: "app_widget_new" }] },
      state: { status: { apps: { total: 1, queued: 1 } } },
    });
    expect(mockDiscoverAppCandidates).toHaveBeenCalledWith({ minOccurrences: 3 });
    expect(broadcast).toHaveBeenCalledWith(
      "sageos",
      expect.objectContaining({
        status: expect.objectContaining({ apps: expect.objectContaining({ total: 1 }) }),
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
