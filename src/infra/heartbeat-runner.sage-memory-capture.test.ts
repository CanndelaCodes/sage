import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import * as replyModule from "../auto-reply/reply.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";

const scheduleSageSessionTranscriptCaptureMock = vi.hoisted(() => vi.fn());

vi.mock("../memory/sage-memory-auto-capture.js", () => ({
  scheduleSageSessionTranscriptCapture: (params: unknown) =>
    scheduleSageSessionTranscriptCaptureMock(params),
}));

describe("runHeartbeatOnce Sage Memory capture", () => {
  afterEach(() => {
    scheduleSageSessionTranscriptCaptureMock.mockReset();
    vi.restoreAllMocks();
  });

  it("schedules a nonblocking transcript capture after a heartbeat run", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-hb-memory-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const sessionFile = path.join(tmpDir, "heartbeat-session.jsonl");
    try {
      const cfg: SageConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: { every: "5m", target: "none" },
          },
        },
        memory: {
          backend: "sage-memory",
          remote: {
            baseUrl: "http://127.0.0.1:18790",
            tokenEnv: "SAGE_MEMORY_TOKEN",
            defaultNamespace: "jason.sage.sessions",
          },
        },
        session: { store: storePath },
      } as SageConfig;
      const sessionKey = resolveMainSessionKey(cfg);
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [sessionKey]: {
              sessionId: "heartbeat-session",
              sessionFile,
              updatedAt: Date.now(),
            },
          },
          null,
          2,
        ),
      );

      vi.spyOn(replyModule, "getReplyFromConfig").mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        deps: {
          getQueueSize: () => 0,
          nowMs: () => 1000,
        },
      });

      expect(result.status).toBe("ran");
      expect(scheduleSageSessionTranscriptCaptureMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cfg,
          agentId: "main",
          sessionFile,
          sessionId: "heartbeat-session",
          sessionKey,
          captureMethod: "sage-memory-heartbeat",
          metadata: expect.objectContaining({
            trigger: "heartbeat",
          }),
        }),
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
