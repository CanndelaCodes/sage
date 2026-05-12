import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import { captureSageSessionTranscript } from "./sage-memory-session-capture.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("captureSageSessionTranscript", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-memory-session-capture-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("ingests a Sage session transcript into the configured sage-memory backend", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          id: "transcript-session",
          timestamp: "2026-05-12T12:00:00.000Z",
          cwd: String.raw`C:\Users\jason\Desktop\sage`,
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "user",
            content: "Replay this into Sage Memory.",
            timestamp: "2026-05-12T12:01:00.000Z",
          },
        }),
      ].join("\n"),
      "utf-8",
    );
    const ingestLlmSession = vi.fn(async () => ({
      evidenceId: "22222222-2222-4222-8222-222222222222",
      sourceUri: "sage://session/manual-session",
      sessionNodeId: nodeId,
      derivedNodeIds: ["33333333-3333-4333-8333-333333333333"],
      deduplicated: false,
      eventId: "44444444-4444-4444-8444-444444444444",
    }));

    const result = await captureSageSessionTranscript({
      cfg: sageMemoryConfig(),
      agentId: "main",
      sessionFile,
      sessionKey: "agent:main:main",
      sessionId: "manual-session",
      namespace: "jason.sage.manual",
      managerFactory: () => ({ ingestLlmSession }),
    });

    expect(ingestLlmSession).toHaveBeenCalledWith({
      namespace: "jason.sage.manual",
      source: "other",
      session_id: "manual-session",
      title: "Sage Session manual-session",
      source_uri: "sage://session/manual-session",
      started_at: "2026-05-12T12:00:00.000Z",
      ended_at: "2026-05-12T12:01:00.000Z",
      workspace: {
        cwd: String.raw`C:\Users\jason\Desktop\sage`,
        session_key: "agent:main:main",
        session_file: sessionFile,
      },
      messages: [
        {
          role: "user",
          content: "Replay this into Sage Memory.",
          timestamp: "2026-05-12T12:01:00.000Z",
          metadata: { sage_entry_type: "message" },
        },
      ],
      metadata: {
        capture_method: "sage-session-memory-hook",
        source_system: "sage",
        sessionKey: "agent:main:main",
        sessionId: "manual-session",
        sessionFile,
      },
      sensitivity: "private",
    });
    expect(result).toEqual({
      namespace: "jason.sage.manual",
      sourceUri: "sage://session/manual-session",
      sessionNodeId: nodeId,
      sessionNodePath: `sage-memory/${nodeId}`,
      evidenceId: "22222222-2222-4222-8222-222222222222",
      derivedNodeIds: ["33333333-3333-4333-8333-333333333333"],
      deduplicated: false,
      eventId: "44444444-4444-4444-8444-444444444444",
      messageCount: 1,
    });
  });

  it("rejects non sage-memory backends", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    await fs.writeFile(sessionFile, "", "utf-8");

    await expect(
      captureSageSessionTranscript({
        cfg: { memory: { backend: "builtin" } } as SageConfig,
        agentId: "main",
        sessionFile,
      }),
    ).rejects.toThrow('sage memory capture-session requires memory.backend = "sage-memory"');
  });

  it("rejects transcripts with no usable messages", async () => {
    const sessionFile = path.join(tempDir, "empty.jsonl");
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        type: "session",
        id: "empty",
        timestamp: "2026-05-12T12:00:00.000Z",
      }),
      "utf-8",
    );

    await expect(
      captureSageSessionTranscript({
        cfg: sageMemoryConfig(),
        agentId: "main",
        sessionFile,
        managerFactory: () => ({
          ingestLlmSession: vi.fn(),
        }),
      }),
    ).rejects.toThrow("No usable transcript messages found");
  });
});

function sageMemoryConfig(): SageConfig {
  return {
    memory: {
      backend: "sage-memory",
      remote: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        defaultNamespace: "jason.sage.sessions",
      },
    },
  } as SageConfig;
}
