import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import { listLearningEventQueue } from "../learning/activity-queue.js";
import {
  captureSageSessionTranscriptBestEffort,
  resetSageMemoryAutoCaptureStateForTests,
  scheduleSageSessionTranscriptCapture,
} from "./sage-memory-auto-capture.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("sage-memory automatic session capture", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetSageMemoryAutoCaptureStateForTests();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-memory-auto-capture-"));
  });

  afterEach(async () => {
    resetSageMemoryAutoCaptureStateForTests();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("skips cleanly when the configured backend is not sage-memory", async () => {
    const result = await captureSageSessionTranscriptBestEffort({
      cfg: { memory: { backend: "builtin" } } as SageConfig,
      agentId: "main",
      sessionFile: path.join(tempDir, "session.jsonl"),
      sessionId: "session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "backend-disabled",
    });
  });

  it("captures transcripts with lifecycle metadata", async () => {
    const sessionFile = await writeTranscript("session.jsonl");
    const learningQueuePath = path.join(tempDir, "learning-activity.json");
    const ingestLlmSession = vi.fn(async () => ({
      evidenceId: "22222222-2222-4222-8222-222222222222",
      sourceUri: "sage://session/lifecycle-session",
      sessionNodeId: nodeId,
      derivedNodeIds: [],
      deduplicated: false,
      eventId: "33333333-3333-4333-8333-333333333333",
    }));

    const result = await captureSageSessionTranscriptBestEffort({
      cfg: sageMemoryConfig({ learning: true }),
      agentId: "main",
      sessionFile,
      sessionId: "lifecycle-session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-session-reset",
      metadata: { trigger: "sessions.reset" },
      learningQueuePath,
      managerFactory: () => ({ ingestLlmSession }),
    });

    expect(result).toMatchObject({
      status: "captured",
      result: {
        sessionNodePath: `sage-memory/${nodeId}`,
        messageCount: 1,
      },
    });
    expect(ingestLlmSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          capture_method: "sage-memory-session-reset",
          trigger: "sessions.reset",
          sessionId: "lifecycle-session",
          sessionFile,
        }),
      }),
    );
    const activityQueue = await listLearningEventQueue({ queuePath: learningQueuePath });
    expect(activityQueue.entries[0]?.event).toMatchObject({
      source: "sage_session",
      sessionKey: "agent:main:main",
      payload: expect.objectContaining({
        captureMethod: "sage-memory-session-reset",
        messageCount: 1,
        sessionNodeId: nodeId,
      }),
    });
  });

  it("deduplicates scheduled background captures by transcript and method", () => {
    const scheduled: Array<() => void> = [];
    const schedule = vi.fn((run: () => void) => {
      scheduled.push(run);
      return undefined;
    });

    const first = scheduleSageSessionTranscriptCapture({
      cfg: sageMemoryConfig(),
      agentId: "main",
      sessionFile: path.join(tempDir, "session.jsonl"),
      sessionId: "session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
      schedule,
      nowMs: () => 1000,
    });
    const second = scheduleSageSessionTranscriptCapture({
      cfg: sageMemoryConfig(),
      agentId: "main",
      sessionFile: path.join(tempDir, "session.jsonl"),
      sessionId: "session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
      schedule,
      nowMs: () => 1001,
    });

    expect(first.status).toBe("scheduled");
    expect(second).toMatchObject({
      status: "skipped",
      reason: "deduped",
    });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
  });

  it("does not deduplicate failed captures", async () => {
    const sessionFile = await writeTranscript("failed-session.jsonl");
    const queuePath = path.join(tempDir, "capture-queue.json");
    const ingestLlmSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("remote offline"))
      .mockResolvedValueOnce({
        evidenceId: "22222222-2222-4222-8222-222222222222",
        sourceUri: "sage://session/lifecycle-session",
        sessionNodeId: nodeId,
        derivedNodeIds: [],
        deduplicated: false,
        eventId: "33333333-3333-4333-8333-333333333333",
      });
    const common = {
      cfg: sageMemoryConfig(),
      agentId: "main",
      sessionFile,
      sessionId: "lifecycle-session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
      queuePath,
      managerFactory: () => ({ ingestLlmSession }),
      nowMs: () => 1000,
    };

    const failed = await captureSageSessionTranscriptBestEffort(common);
    const retried = await captureSageSessionTranscriptBestEffort(common);

    expect(failed).toMatchObject({ status: "failed", reason: "remote offline" });
    expect(retried).toMatchObject({ status: "captured" });
    expect(ingestLlmSession).toHaveBeenCalledTimes(2);
    const { listSageMemoryCaptureQueue } = await import("./sage-memory-capture-queue.js");
    const summary = await listSageMemoryCaptureQueue({ queuePath });
    expect(summary.entries).toEqual([]);
  });

  it("reports scheduler failures without reserving the capture key", () => {
    const schedule = vi.fn(() => {
      throw new Error("timer unavailable");
    });
    const common = {
      cfg: sageMemoryConfig(),
      agentId: "main",
      sessionFile: path.join(tempDir, "session.jsonl"),
      sessionId: "session",
      sessionKey: "agent:main:main",
      captureMethod: "sage-memory-heartbeat",
      schedule,
      nowMs: () => 1000,
    };

    const failed = scheduleSageSessionTranscriptCapture(common);
    const retried = scheduleSageSessionTranscriptCapture({
      ...common,
      schedule: () => undefined,
    });

    expect(failed).toMatchObject({
      status: "skipped",
      reason: "schedule-failed",
    });
    expect(retried.status).toBe("scheduled");
  });

  async function writeTranscript(name: string) {
    const sessionFile = path.join(tempDir, name);
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          id: "lifecycle-session",
          timestamp: "2026-05-12T12:00:00.000Z",
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "user",
            content: "Capture this lifecycle transcript.",
            timestamp: "2026-05-12T12:01:00.000Z",
          },
        }),
      ].join("\n"),
      "utf-8",
    );
    return sessionFile;
  }
});

function sageMemoryConfig(opts?: { learning?: boolean }): SageConfig {
  return {
    ...(opts?.learning
      ? {
          learning: {
            enabled: true,
            sources: { sageSessions: true },
          },
        }
      : {}),
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
