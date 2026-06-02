import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import {
  addSubagentRunForTests,
  resetSubagentRegistryForTests,
} from "../../agents/subagent-registry.js";
import * as internalHooks from "../../hooks/internal-hooks.js";
import { clearPluginCommands, registerPluginCommand } from "../../plugins/commands.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsControl,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsRun,
  upsertSageOsTask,
} from "../../sageos/state-store.js";
import { resetBashChatCommandForTests } from "./bash-command.js";
import { buildCommandContext, handleCommands } from "./commands.js";
import { parseInlineDirectives } from "./directive-handling.js";

// Avoid expensive workspace scans during /context tests.
vi.mock("./commands-context-report.js", () => ({
  buildContextReply: async (params: { command: { commandBodyNormalized: string } }) => {
    const normalized = params.command.commandBodyNormalized;
    if (normalized === "/context list") {
      return { text: "Injected workspace files:\n- AGENTS.md" };
    }
    if (normalized === "/context detail") {
      return { text: "Context breakdown (detailed)\nTop tools (schema size):" };
    }
    return { text: "/context\n- /context list\nInline shortcut" };
  },
}));

let testWorkspaceDir = os.tmpdir();

beforeAll(async () => {
  testWorkspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-commands-"));
  await fs.writeFile(path.join(testWorkspaceDir, "AGENTS.md"), "# Agents\n", "utf-8");
});

afterAll(async () => {
  await fs.rm(testWorkspaceDir, { recursive: true, force: true });
});

function buildParams(commandBody: string, cfg: SageConfig, ctxOverrides?: Partial<MsgContext>) {
  const ctx = {
    Body: commandBody,
    CommandBody: commandBody,
    CommandSource: "text",
    CommandAuthorized: true,
    Provider: "whatsapp",
    Surface: "whatsapp",
    ...ctxOverrides,
  } as MsgContext;

  const command = buildCommandContext({
    ctx,
    cfg,
    isGroup: false,
    triggerBodyNormalized: commandBody.trim().toLowerCase(),
    commandAuthorized: true,
  });

  return {
    ctx,
    cfg,
    command,
    directives: parseInlineDirectives(commandBody),
    elevated: { enabled: true, allowed: true, failures: [] },
    sessionKey: "agent:main:main",
    workspaceDir: testWorkspaceDir,
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off" as const,
    resolvedReasoningLevel: "off" as const,
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "whatsapp",
    model: "test-model",
    contextTokens: 0,
    isGroup: false,
  };
}

async function withSageOsStateDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const previous = process.env.SAGE_STATE_DIR;
  const dir = await fs.mkdtemp(path.join(testWorkspaceDir, "sageos-state-"));
  process.env.SAGE_STATE_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (typeof previous === "string") {
      process.env.SAGE_STATE_DIR = previous;
    } else {
      delete process.env.SAGE_STATE_DIR;
    }
  }
}

describe("handleCommands gating", () => {
  it("blocks /bash when disabled", async () => {
    resetBashChatCommandForTests();
    const cfg = {
      commands: { bash: false, text: true },
      whatsapp: { allowFrom: ["*"] },
    } as SageConfig;
    const params = buildParams("/bash echo hi", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("bash is disabled");
  });

  it("blocks /bash when elevated is not allowlisted", async () => {
    resetBashChatCommandForTests();
    const cfg = {
      commands: { bash: true, text: true },
      whatsapp: { allowFrom: ["*"] },
    } as SageConfig;
    const params = buildParams("/bash echo hi", cfg);
    params.elevated = {
      enabled: true,
      allowed: false,
      failures: [{ gate: "allowFrom", key: "tools.elevated.allowFrom.whatsapp" }],
    };
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("elevated is not available");
  });

  it("blocks /config when disabled", async () => {
    const cfg = {
      commands: { config: false, debug: false, text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/config show", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("/config is disabled");
  });

  it("blocks /debug when disabled", async () => {
    const cfg = {
      commands: { config: false, debug: false, text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/debug show", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("/debug is disabled");
  });
});

describe("handleCommands bash alias", () => {
  it("routes !poll through the /bash handler", async () => {
    resetBashChatCommandForTests();
    const cfg = {
      commands: { bash: true, text: true },
      whatsapp: { allowFrom: ["*"] },
    } as SageConfig;
    const params = buildParams("!poll", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("No active bash job");
  });

  it("routes !stop through the /bash handler", async () => {
    resetBashChatCommandForTests();
    const cfg = {
      commands: { bash: true, text: true },
      whatsapp: { allowFrom: ["*"] },
    } as SageConfig;
    const params = buildParams("!stop", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("No active bash job");
  });
});

describe("handleCommands plugin commands", () => {
  it("dispatches registered plugin commands", async () => {
    clearPluginCommands();
    const result = registerPluginCommand("test-plugin", {
      name: "card",
      description: "Test card",
      handler: async () => ({ text: "from plugin" }),
    });
    expect(result.ok).toBe(true);

    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/card", cfg);
    const commandResult = await handleCommands(params);

    expect(commandResult.shouldContinue).toBe(false);
    expect(commandResult.reply?.text).toBe("from plugin");
    clearPluginCommands();
  });
});

describe("handleCommands identity", () => {
  it("returns sender details for /whoami", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/whoami", cfg, {
      SenderId: "12345",
      SenderUsername: "TestUser",
      ChatType: "direct",
    });
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Channel: whatsapp");
    expect(result.reply?.text).toContain("User id: 12345");
    expect(result.reply?.text).toContain("Username: @TestUser");
    expect(result.reply?.text).toContain("AllowFrom: 12345");
  });
});

describe("handleCommands hooks", () => {
  it("triggers hooks for /new with arguments", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/new take notes", cfg);
    const spy = vi.spyOn(internalHooks, "triggerInternalHook").mockResolvedValue();

    await handleCommands(params);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "command", action: "new" }));
    spy.mockRestore();
  });
});

describe("handleCommands context", () => {
  it("returns context help for /context", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/context", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("/context list");
    expect(result.reply?.text).toContain("Inline shortcut");
  });

  it("returns a per-file breakdown for /context list", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/context list", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Injected workspace files:");
    expect(result.reply?.text).toContain("AGENTS.md");
  });

  it("returns a detailed breakdown for /context detail", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/context detail", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Context breakdown (detailed)");
    expect(result.reply?.text).toContain("Top tools (schema size):");
  });
});

describe("handleCommands subagents", () => {
  it("lists subagents when none exist", async () => {
    resetSubagentRegistryForTests();
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/subagents list", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Subagents: none");
  });

  it("lists subagents for the current command session over the target session", async () => {
    resetSubagentRegistryForTests();
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:subagent:abc",
      requesterSessionKey: "agent:main:slack:slash:u1",
      requesterDisplayKey: "agent:main:slack:slash:u1",
      task: "do thing",
      cleanup: "keep",
      createdAt: 1000,
      startedAt: 1000,
    });
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/subagents list", cfg, {
      CommandSource: "native",
      CommandTargetSessionKey: "agent:main:main",
    });
    params.sessionKey = "agent:main:slack:slash:u1";
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Subagents (current session)");
    expect(result.reply?.text).toContain("agent:main:subagent:abc");
  });

  it("omits subagent status line when none exist", async () => {
    resetSubagentRegistryForTests();
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
      session: { mainKey: "main", scope: "per-sender" },
    } as SageConfig;
    const params = buildParams("/status", cfg);
    params.resolvedVerboseLevel = "on";
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).not.toContain("Subagents:");
  });

  it("returns help for unknown subagents action", async () => {
    resetSubagentRegistryForTests();
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/subagents foo", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("/subagents");
  });

  it("returns usage for subagents info without target", async () => {
    resetSubagentRegistryForTests();
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as SageConfig;
    const params = buildParams("/subagents info", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("/subagents info");
  });

  it("includes subagent count in /status when active", async () => {
    resetSubagentRegistryForTests();
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:subagent:abc",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      cleanup: "keep",
      createdAt: 1000,
      startedAt: 1000,
    });
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
      session: { mainKey: "main", scope: "per-sender" },
    } as SageConfig;
    const params = buildParams("/status", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("🤖 Subagents: 1 active");
  });

  it("includes subagent details in /status when verbose", async () => {
    resetSubagentRegistryForTests();
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:subagent:abc",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      cleanup: "keep",
      createdAt: 1000,
      startedAt: 1000,
    });
    addSubagentRunForTests({
      runId: "run-2",
      childSessionKey: "agent:main:subagent:def",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "finished task",
      cleanup: "keep",
      createdAt: 900,
      startedAt: 900,
      endedAt: 1200,
      outcome: { status: "ok" },
    });
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
      session: { mainKey: "main", scope: "per-sender" },
    } as SageConfig;
    const params = buildParams("/status", cfg);
    params.resolvedVerboseLevel = "on";
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("🤖 Subagents: 1 active");
    expect(result.reply?.text).toContain("· 1 done");
  });

  it("returns info for a subagent", async () => {
    resetSubagentRegistryForTests();
    addSubagentRunForTests({
      runId: "run-1",
      childSessionKey: "agent:main:subagent:abc",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      cleanup: "keep",
      createdAt: 1000,
      startedAt: 1000,
      endedAt: 2000,
      outcome: { status: "ok" },
    });
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
      session: { mainKey: "main", scope: "per-sender" },
    } as SageConfig;
    const params = buildParams("/subagents info 1", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Subagent info");
    expect(result.reply?.text).toContain("Run: run-1");
    expect(result.reply?.text).toContain("Status: done");
  });
});

describe("handleCommands SageOS", () => {
  it("returns status and controls SageOS supervisor state", async () => {
    await withSageOsStateDir(async () => {
      const cfg = {
        commands: { text: true },
        channels: { whatsapp: { allowFrom: ["*"] } },
        sageos: {
          notifications: { telegram: { enabled: true, target: "telegram:commands" } },
        },
      } as SageConfig;

      const status = await handleCommands(buildParams("/sageos status", cfg));
      expect(status.shouldContinue).toBe(false);
      expect(status.reply?.text).toContain("Supervisor:");
      expect(status.reply?.text).toContain("Notifications: Telegram enabled");

      const pause = await handleCommands(buildParams("/sageos pause telegram", cfg));
      expect(pause.shouldContinue).toBe(false);
      expect(pause.reply?.text).toContain("SageOS paused");
      expect((await readSageOsControl(createSageOsControlStore()))?.state).toBe("paused");
      await expect(readSageOsState(createSageOsStateStore())).resolves.toMatchObject({
        status: {
          notifications: {
            telegram: { enabled: true, target: "telegram:commands" },
          },
        },
      });

      const resume = await handleCommands(buildParams("/sageos resume telegram", cfg));
      expect(resume.shouldContinue).toBe(false);
      expect(resume.reply?.text).toContain("SageOS resumed");
      expect((await readSageOsControl(createSageOsControlStore()))?.state).toBe("running");

      const stop = await handleCommands(buildParams("/sageos stop telegram", cfg));
      expect(stop.shouldContinue).toBe(false);
      expect(stop.reply?.text).toContain("SageOS stopped");
      expect((await readSageOsControl(createSageOsControlStore()))?.state).toBe("stopped");

      const emergency = await handleCommands(buildParams("/sageos emergency-stop telegram", cfg));
      expect(emergency.shouldContinue).toBe(false);
      expect(emergency.reply?.text).toContain("SageOS emergency stop engaged");
      const control = await readSageOsControl(createSageOsControlStore());
      expect(control).toMatchObject({ state: "stopped", emergency: true });
    });
  });

  it("lists and inspects SageOS tasks", async () => {
    await withSageOsStateDir(async () => {
      const store = createSageOsStateStore();
      const now = new Date("2026-05-27T12:00:00Z").toISOString();
      await upsertSageOsTask(store, {
        id: "task_1",
        title: "Review nightly report",
        objective: "Summarize the latest Night Shift coding report.",
        state: "queued",
        requestedBy: "telegram",
        autonomyTier: "execute_scoped",
        policyScopes: [{ kind: "repo", allow: ["C:/repo"], risk: "low" }],
        createdAt: now,
        updatedAt: now,
      });
      await upsertSageOsRun(store, {
        id: "run_task_1_1",
        taskId: "task_1",
        attempt: 1,
        state: "succeeded",
        traceId: "trace-task-1",
        startedAt: now,
        finishedAt: now,
      });
      const cfg = {
        commands: { text: true },
        channels: { whatsapp: { allowFrom: ["*"] } },
      } as SageConfig;

      const list = await handleCommands(buildParams("/sageos tasks", cfg));
      expect(list.shouldContinue).toBe(false);
      expect(list.reply?.text).toContain("SageOS tasks");
      expect(list.reply?.text).toContain("task_1");
      expect(list.reply?.text).toContain("Review nightly report");

      const detail = await handleCommands(buildParams("/sageos task task_1", cfg));
      expect(detail.shouldContinue).toBe(false);
      expect(detail.reply?.text).toContain("SageOS task task_1");
      expect(detail.reply?.text).toContain("Summarize the latest Night Shift coding report.");
      expect(detail.reply?.text).toContain("run_task_1_1");
    });
  });

  it("approves and denies SageOS approvals from Telegram controls", async () => {
    await withSageOsStateDir(async () => {
      const store = createSageOsStateStore();
      const now = new Date("2026-05-27T13:00:00Z").toISOString();
      await upsertSageOsTask(store, {
        id: "task_external",
        title: "Send Telegram update",
        objective: "Send an approved external update.",
        state: "waiting_for_policy",
        requestedBy: "telegram",
        autonomyTier: "execute_scoped",
        policyScopes: [{ kind: "channel", allow: ["telegram:123"], risk: "high" }],
        createdAt: now,
        updatedAt: now,
      });
      await upsertSageOsApproval(store, {
        id: "approval_external",
        state: "pending",
        riskClass: "external_write",
        title: "Send Telegram update",
        proposedAction: "Send a redacted update.",
        evidence: ["task_external"],
        scope: "task",
        taskId: "task_external",
        requestedBy: "sageos.test",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await upsertSageOsApproval(store, {
        id: "approval_policy",
        state: "pending",
        riskClass: "policy_change",
        title: "Change SageOS policy",
        proposedAction: "Relax policy for a workflow.",
        evidence: ["policy-diff"],
        scope: "domain",
        requestedBy: "sageos.test",
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const cfg = {
        commands: { text: true },
        channels: { telegram: { allowFrom: ["*"] } },
      } as SageConfig;

      const approved = await handleCommands(
        buildParams("/sageos approve approval_external reviewed in Telegram", cfg, {
          Provider: "telegram",
          Surface: "telegram",
        }),
      );
      expect(approved.shouldContinue).toBe(false);
      expect(approved.reply?.text).toContain("SageOS approval approved");
      expect(approved.reply?.text).toContain("approval_external");
      expect(approved.reply?.text).toContain("Task: task_external queued");

      const denied = await handleCommands(
        buildParams("/sageos deny approval_policy too broad", cfg, {
          Provider: "telegram",
          Surface: "telegram",
        }),
      );
      expect(denied.shouldContinue).toBe(false);
      expect(denied.reply?.text).toContain("SageOS approval denied");
      expect(denied.reply?.text).toContain("approval_policy");

      const state = await readSageOsState(store);
      expect(state.approvals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "approval_external",
            state: "approved",
            resolvedBy: "sageos.command",
            resolutionReason: "reviewed in telegram",
          }),
          expect.objectContaining({
            id: "approval_policy",
            state: "denied",
            resolvedBy: "sageos.command",
            resolutionReason: "too broad",
          }),
        ]),
      );
      expect(state.tasks.find((task) => task.id === "task_external")?.state).toBe("queued");
    });
  });
});

describe("handleCommands /tts", () => {
  it("returns status for bare /tts on text command surfaces", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
      messages: { tts: { prefsPath: path.join(testWorkspaceDir, "tts.json") } },
    } as SageConfig;
    const params = buildParams("/tts", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("TTS status");
  });
});
