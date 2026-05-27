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
    agents: [],
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
    runs: [],
    workflows: [],
    skills: [],
    apps: [],
    codingReports: [],
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
    observations: [],
    updatedAt: now,
  };
}
