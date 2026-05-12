import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import {
  enqueueSageMemoryCaptureFailure,
  listSageMemoryCaptureQueue,
  removeSageMemoryCaptureQueueEntry,
  replaySageMemoryCaptureQueue,
} from "./sage-memory-capture-queue.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("sage-memory capture queue", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-memory-capture-queue-"));
    queuePath = path.join(tempDir, "capture-queue.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("persists failed automatic captures and deduplicates by transcript and method", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");

    const first = await enqueueSageMemoryCaptureFailure({
      queuePath,
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      captureMethod: "sage-memory-heartbeat",
      metadata: { trigger: "heartbeat" },
      error: "remote offline",
      now: () => new Date("2026-05-12T12:00:00.000Z"),
    });
    const second = await enqueueSageMemoryCaptureFailure({
      queuePath,
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      captureMethod: "sage-memory-heartbeat",
      metadata: { trigger: "heartbeat" },
      error: "still offline",
      now: () => new Date("2026-05-12T12:01:00.000Z"),
    });

    const summary = await listSageMemoryCaptureQueue({ queuePath });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(summary.counts).toEqual({ total: 1, pending: 1, failed: 0 });
    expect(summary.entries[0]).toMatchObject({
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      captureMethod: "sage-memory-heartbeat",
      status: "pending",
      attempts: 0,
      lastError: "still offline",
      metadata: { trigger: "heartbeat" },
    });
  });

  it("replays queued captures and removes successful entries", async () => {
    const sessionFile = await writeTranscript("session.jsonl");
    await enqueueSageMemoryCaptureFailure({
      queuePath,
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      captureMethod: "sage-memory-session-reset",
      error: "remote offline",
      now: () => new Date("2026-05-12T12:00:00.000Z"),
    });
    const ingestLlmSession = vi.fn(async () => ({
      evidenceId: "22222222-2222-4222-8222-222222222222",
      sourceUri: "sage://session/session-1",
      sessionNodeId: nodeId,
      derivedNodeIds: [],
      deduplicated: false,
      eventId: "33333333-3333-4333-8333-333333333333",
    }));

    const result = await replaySageMemoryCaptureQueue({
      cfg: sageMemoryConfig(),
      agentId: "main",
      queuePath,
      managerFactory: () => ({ ingestLlmSession }),
      now: () => new Date("2026-05-12T12:02:00.000Z"),
    });

    expect(result).toMatchObject({
      attempted: 1,
      captured: 1,
      failed: 0,
      remaining: 0,
    });
    expect(result.results[0]).toMatchObject({
      status: "captured",
      sessionNodePath: `sage-memory/${nodeId}`,
    });
    expect((await listSageMemoryCaptureQueue({ queuePath })).entries).toEqual([]);
  });

  it("removes matching queue entries after a later successful capture", async () => {
    const sessionFile = path.join(tempDir, "session.jsonl");
    await enqueueSageMemoryCaptureFailure({
      queuePath,
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      captureMethod: "sage-memory-heartbeat",
      error: "remote offline",
      now: () => new Date("2026-05-12T12:00:00.000Z"),
    });

    await expect(
      removeSageMemoryCaptureQueueEntry({
        queuePath,
        agentId: "main",
        sessionFile,
        sessionId: "session-1",
        sessionKey: "agent:main:main",
        captureMethod: "sage-memory-heartbeat",
      }),
    ).resolves.toBe(true);

    expect((await listSageMemoryCaptureQueue({ queuePath })).entries).toEqual([]);
  });

  it("keeps failed replay entries with attempt metadata", async () => {
    const sessionFile = await writeTranscript("failed.jsonl");
    await enqueueSageMemoryCaptureFailure({
      queuePath,
      agentId: "main",
      sessionFile,
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
      error: "remote offline",
      now: () => new Date("2026-05-12T12:00:00.000Z"),
    });

    const result = await replaySageMemoryCaptureQueue({
      cfg: sageMemoryConfig(),
      agentId: "main",
      queuePath,
      managerFactory: () => ({
        ingestLlmSession: vi.fn(async () => {
          throw new Error("still offline");
        }),
      }),
      now: () => new Date("2026-05-12T12:02:00.000Z"),
    });
    const summary = await listSageMemoryCaptureQueue({ queuePath });

    expect(result).toMatchObject({
      attempted: 1,
      captured: 0,
      failed: 1,
      remaining: 1,
    });
    expect(summary.counts).toEqual({ total: 1, pending: 0, failed: 1 });
    expect(summary.entries[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "still offline",
      lastAttemptAt: "2026-05-12T12:02:00.000Z",
    });
  });

  async function writeTranscript(name: string) {
    const sessionFile = path.join(tempDir, name);
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          id: "session-1",
          timestamp: "2026-05-12T12:00:00.000Z",
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "user",
            content: "Capture this queued transcript.",
            timestamp: "2026-05-12T12:01:00.000Z",
          },
        }),
      ].join("\n"),
      "utf-8",
    );
    return sessionFile;
  }
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
