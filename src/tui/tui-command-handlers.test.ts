import { describe, expect, it, vi } from "vitest";
import type { SageOsPersistedState } from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";
import { createCommandHandlers } from "./tui-command-handlers.js";

describe("tui command handlers", () => {
  it("forwards unknown slash commands to the gateway", async () => {
    const sendChat = vi.fn().mockResolvedValue({ runId: "r1" });
    const addUser = vi.fn();
    const addSystem = vi.fn();
    const requestRender = vi.fn();
    const setActivityStatus = vi.fn();

    const { handleCommand } = createCommandHandlers({
      client: { sendChat } as never,
      chatLog: { addUser, addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus,
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/context");

    expect(addSystem).not.toHaveBeenCalled();
    expect(addUser).toHaveBeenCalledWith("/context");
    expect(sendChat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:main",
        message: "/context",
      }),
    );
    expect(requestRender).toHaveBeenCalled();
  });

  it("handles SageOS Command Center status and controls locally", async () => {
    const state = makeSageOsState();
    const pausedState: SageOsPersistedState = {
      ...state,
      status: createSageOsStatusSnapshot({
        ...state.status,
        supervisor: { enabled: true, paused: true, state: "paused" },
      }),
    };
    const getSageOsState = vi.fn().mockResolvedValue(state);
    const controlSageOs = vi.fn().mockResolvedValue(pausedState);
    const sendChat = vi.fn();
    const addUser = vi.fn();
    const addSystem = vi.fn();
    const requestRender = vi.fn();

    const { handleCommand } = createCommandHandlers({
      client: { getSageOsState, controlSageOs, sendChat } as never,
      chatLog: { addUser, addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/sageos status");
    expect(sendChat).not.toHaveBeenCalled();
    expect(getSageOsState).toHaveBeenCalledTimes(1);
    expect(addSystem).toHaveBeenCalledWith("SageOS Command Center");
    expect(addSystem).toHaveBeenCalledWith(
      "Memory: degraded, backend sage-memory, capture queue 0 pending / 1 failed, doctor fail, wiki exports 1",
    );

    addSystem.mockClear();
    await handleCommand("/sageos pause maintenance");
    expect(controlSageOs).toHaveBeenCalledWith({ state: "paused", reason: "maintenance" });
    expect(addSystem).toHaveBeenCalledWith("SageOS paused");
    expect(addSystem).toHaveBeenCalledWith("SageOS Command Center");
  });

  it("handles SageOS task, incident, and approval drilldowns locally", async () => {
    const getSageOsState = vi.fn().mockResolvedValue(makeSageOsState());
    const sendChat = vi.fn();
    const addUser = vi.fn();
    const addSystem = vi.fn();
    const requestRender = vi.fn();

    const { handleCommand } = createCommandHandlers({
      client: { getSageOsState, sendChat } as never,
      chatLog: { addUser, addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/sageos task task_1");
    expect(sendChat).not.toHaveBeenCalled();
    expect(addSystem).toHaveBeenCalledWith("SageOS task task_1");
    expect(addSystem).toHaveBeenCalledWith("Rollback: Stop run and revert local edits.");

    addSystem.mockClear();
    await handleCommand("/sageos incidents");
    expect(addSystem).toHaveBeenCalledWith("SageOS incidents");
    expect(addSystem).toHaveBeenCalledWith("  Repair: Run memory doctor via sageos.memory.doctor");

    addSystem.mockClear();
    await handleCommand("/sageos approvals");
    expect(addSystem).toHaveBeenCalledWith("SageOS approvals");
    expect(addSystem).toHaveBeenCalledWith(
      "- approval_external | external_write | Send Telegram update",
    );
  });

  it("handles extended SageOS resource drilldowns locally", async () => {
    const getSageOsState = vi.fn().mockResolvedValue(makeSageOsState());
    const sendChat = vi.fn();
    const addUser = vi.fn();
    const addSystem = vi.fn();
    const requestRender = vi.fn();

    const { handleCommand } = createCommandHandlers({
      client: { getSageOsState, sendChat } as never,
      chatLog: { addUser, addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/sageos employees");
    expect(sendChat).not.toHaveBeenCalled();
    expect(addSystem).toHaveBeenCalledWith("SageOS employees");
    expect(addSystem).toHaveBeenCalledWith(
      "- agent_memory | active | Memory Steward | execute_scoped",
    );

    addSystem.mockClear();
    await handleCommand("/sageos employee agent_memory");
    expect(addSystem).toHaveBeenCalledWith("SageOS employee agent_memory");
    expect(addSystem).toHaveBeenCalledWith("Mission: Keep memory healthy.");

    addSystem.mockClear();
    await handleCommand("/sageos runs");
    expect(addSystem).toHaveBeenCalledWith("SageOS runs");
    expect(addSystem).toHaveBeenCalledWith(
      "- run_1 | running | task task_1 | trace trace_1 | tool pnpm test",
    );

    addSystem.mockClear();
    await handleCommand("/sageos run run_1");
    expect(addSystem).toHaveBeenCalledWith("SageOS run run_1");
    expect(addSystem).toHaveBeenCalledWith("Timeline: queued -> running");

    addSystem.mockClear();
    await handleCommand("/sageos observations");
    expect(addSystem).toHaveBeenCalledWith("SageOS observations");
    expect(addSystem).toHaveBeenCalledWith(
      "- obs_private | app_focus | captured | private | Private app focus",
    );

    addSystem.mockClear();
    await handleCommand("/sageos observation obs_private");
    expect(addSystem).toHaveBeenCalledWith("SageOS observation obs_private");
    expect(addSystem).toHaveBeenCalledWith("Text: redacted in TUI summary");

    for (const [command, heading] of [
      ["/sageos workflows", "SageOS workflows"],
      ["/sageos skills", "SageOS skills"],
      ["/sageos apps", "SageOS apps and widgets"],
      ["/sageos coding", "SageOS coding reports"],
      ["/sageos collaborations", "SageOS collaborations"],
      ["/sageos audit", "SageOS audit"],
    ] as const) {
      addSystem.mockClear();
      await handleCommand(command);
      expect(addSystem).toHaveBeenCalledWith(heading);
    }
  });
});

function makeSageOsState(): SageOsPersistedState {
  const now = "2026-05-27T18:30:00.000Z";
  return {
    version: 1,
    status: createSageOsStatusSnapshot({
      supervisor: { enabled: true, paused: false, state: "running" },
      employees: { total: 1, active: 1, queued: 0, blocked: 0 },
      tasks: { total: 1, active: 1, queued: 0, blocked: 0 },
      approvals: { pending: 1 },
      memory: {
        status: "degraded",
        backend: "sage-memory",
        canonical: "sage-memory",
        captureQueue: { total: 1, pending: 0, failed: 1 },
        doctor: {
          ok: false,
          checkedAt: now,
          checks: 8,
          warnings: 1,
          failures: 1,
          exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
        },
      },
      incidents: [
        {
          id: "incident_memory_doctor_failed",
          severity: "error",
          category: "memory",
          title: "Sage Memory doctor reported failures",
          summary: "Memory doctor failed.",
          firstSeenAt: now,
          lastSeenAt: now,
          autoRepairSafe: true,
          repairAction: {
            id: "repair_memory_doctor",
            label: "Run memory doctor",
            gatewayMethod: "sageos.memory.doctor",
            risk: "low",
            approvalRequired: false,
          },
        },
      ],
    }),
    agents: [
      {
        id: "agent_memory",
        name: "Memory Steward",
        role: "memory",
        mission: "Keep memory healthy.",
        status: "active",
        autonomyTier: "execute_scoped",
        responsibilities: ["memory"],
        allowedScopes: [],
        deniedScopes: [],
        tools: ["sage-memory"],
        memoryScopes: ["memory_health"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    tasks: [
      {
        id: "task_1",
        title: "Verify TUI Command Center",
        objective: "Render SageOS status in the TUI.",
        state: "running",
        requestedBy: "test",
        autonomyTier: "execute_scoped",
        policyScopes: [],
        rollback: "Stop run and revert local edits.",
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [
      {
        id: "run_1",
        taskId: "task_1",
        attempt: 1,
        state: "running",
        traceId: "trace_1",
        currentToolCall: "pnpm test",
        timeline: [
          { at: now, label: "queued", state: "queued" },
          { at: now, label: "running", state: "running" },
        ],
      },
    ],
    workflows: [
      {
        id: "workflow_focus",
        name: "Focus digest",
        state: "candidate",
        observedPattern: "Repeated app focus",
        sourceObservationIds: ["obs_private"],
        trigger: "Repeated app focus observations",
        inputs: ["app_focus"],
        outputs: ["summary"],
        policyScopes: [],
        implementationRefs: [],
        evalRefs: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    skills: [
      {
        id: "skill_focus",
        name: "Focus Summarizer",
        state: "draft",
        workflowId: "workflow_focus",
        provenance: ["workflow_focus"],
        triggerConditions: ["Repeated app focus"],
        tests: ["pnpm test"],
        allowedScopes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    apps: [
      {
        id: "app_focus",
        name: "Focus Widget",
        state: "preview_ready",
        targetSurface: "widget",
        purpose: "Show focus trends.",
        sourceObservationIds: ["obs_private"],
        provenance: ["workflow_focus"],
        sensitivity: "normal",
        inputs: ["app_focus"],
        outputs: ["widget"],
        policyScopes: [],
        artifactRefs: ["widgets/focus"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    collaborations: [
      {
        id: "collab_review",
        kind: "review_request",
        fromAgentId: "agent_memory",
        toAgentId: "agent_reviewer",
        taskId: "task_1",
        title: "Review memory repair",
        summary: "Check the memory doctor repair plan.",
        artifactRefs: [],
        state: "open",
        createdAt: now,
        updatedAt: now,
      },
    ],
    codingReports: [
      {
        id: "coding_report_1",
        taskId: "task_1",
        runId: "run_1",
        repoPath: "C:/repo",
        objective: "Improve SageOS UI.",
        outcome: "succeeded",
        startedAt: now,
        finishedAt: now,
        preState: { branch: "main", dirty: false, changedFiles: [] },
        postState: { branch: "main", dirty: true, changedFiles: ["src/ui.ts"] },
        diff: {
          stat: "1 file changed",
          preview: "+ render command center",
          changedFiles: ["src/ui.ts"],
        },
        tests: [],
        blockers: [],
        verificationRefs: [],
        rollback: "revert commit",
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [
      {
        id: "approval_external",
        state: "pending",
        riskClass: "external_write",
        title: "Send Telegram update",
        proposedAction: "Send a summary.",
        evidence: ["task_1"],
        scope: "task",
        taskId: "task_1",
        requestedBy: "test",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    observations: [
      {
        id: "obs_private",
        source: "app_focus",
        state: "captured",
        title: "Private app focus",
        text: "Sensitive window title",
        sensitivity: "private",
        observedAt: now,
        payload: { processName: "Code" },
        provenance: { source: "test" },
        createdAt: now,
        updatedAt: now,
      },
    ],
    updatedAt: now,
  };
}
