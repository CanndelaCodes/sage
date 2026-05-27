import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.js";
import type { RuntimeEnv } from "../runtime.js";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";

let tempDirs: string[] = [];
let previousSageStateDir: string | undefined;

const { listSkillCommandsForAgents } = vi.hoisted(() => ({
  listSkillCommandsForAgents: vi.fn(() => []),
}));

vi.mock("../auto-reply/skill-commands.js", () => ({
  listSkillCommandsForAgents,
  listSkillCommandsForWorkspace: vi.fn(() => []),
}));

describe("registerTelegramNativeCommands", () => {
  beforeEach(() => {
    listSkillCommandsForAgents.mockReset();
    previousSageStateDir = process.env.SAGE_STATE_DIR;
  });

  afterEach(async () => {
    if (previousSageStateDir === undefined) {
      delete process.env.SAGE_STATE_DIR;
    } else {
      process.env.SAGE_STATE_DIR = previousSageStateDir;
    }
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  const buildParams = (cfg: SageConfig, accountId = "default") => {
    const setMyCommands = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const command = vi.fn();
    return {
      bot: {
        api: {
          setMyCommands,
          sendMessage,
        },
        command,
      } as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
      setMyCommands,
      sendMessage,
      command,
      cfg,
      runtime: {} as RuntimeEnv,
      accountId,
      telegramCfg: {} as TelegramAccountConfig,
      allowFrom: [],
      groupAllowFrom: [],
      replyToMode: "off" as const,
      textLimit: 4096,
      useAccessGroups: false,
      nativeEnabled: true,
      nativeSkillsEnabled: true,
      nativeDisabledExplicit: false,
      resolveGroupPolicy: () => ({ allowlistEnabled: false, allowed: true }),
      resolveTelegramGroupConfig: () => ({
        groupConfig: undefined,
        topicConfig: undefined,
      }),
      shouldSkipUpdate: () => false,
      opts: { token: "token" },
    };
  };

  it("scopes skill commands when account binding exists", () => {
    const cfg: SageConfig = {
      agents: {
        list: [{ id: "main", default: true }, { id: "butler" }],
      },
      bindings: [
        {
          agentId: "butler",
          match: { channel: "telegram", accountId: "bot-a" },
        },
      ],
    };

    registerTelegramNativeCommands(buildParams(cfg, "bot-a"));

    expect(listSkillCommandsForAgents).toHaveBeenCalledWith({
      cfg,
      agentIds: ["butler"],
    });
  });

  it("keeps skill commands unscoped without a matching binding", () => {
    const cfg: SageConfig = {
      agents: {
        list: [{ id: "main", default: true }, { id: "butler" }],
      },
    };

    registerTelegramNativeCommands(buildParams(cfg, "bot-a"));

    expect(listSkillCommandsForAgents).toHaveBeenCalledWith({ cfg });
  });

  it("registers and dispatches SageOS native controls without an agent turn", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "sageos-telegram-native-"));
    tempDirs.push(stateDir);
    process.env.SAGE_STATE_DIR = stateDir;
    const sessionStore = path.join(stateDir, "sessions.json");
    const cfg: SageConfig = {
      commands: { native: true, text: true },
      session: { store: sessionStore },
      channels: {
        telegram: {
          dmPolicy: "open",
          allowFrom: ["*"],
        },
      },
    };
    const params = buildParams(cfg);

    registerTelegramNativeCommands({ ...params, allowFrom: ["*"] });

    const commands = params.setMyCommands.mock.calls[0]?.[0] as Array<{
      command: string;
      description: string;
    }>;
    expect(commands.some((command) => command.command === "sageos")).toBe(true);
    const sageOsHandler = params.command.mock.calls.find((call) => call[0] === "sageos")?.[1] as
      | ((ctx: Record<string, unknown>) => Promise<void>)
      | undefined;
    expect(sageOsHandler).toBeTruthy();
    if (!sageOsHandler) {
      return;
    }

    await sageOsHandler({
      message: {
        chat: { id: 12345, type: "private" },
        from: { id: 12345, username: "jason" },
        text: "/sageos pause telegram",
        date: 1736380800,
        message_id: 42,
      },
      match: "pause telegram",
    });

    expect(params.sendMessage).toHaveBeenCalledWith(
      "12345",
      expect.stringContaining("SageOS paused"),
      expect.any(Object),
    );
  });
});
