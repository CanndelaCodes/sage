import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listLearningEventQueue } from "./activity-queue.js";
import { recordSageSessionLearningEvent } from "./session-source.js";

describe("Sage session learning source", () => {
  it("queues session capture evidence as learning activity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sage-session-learning-"));
    const queuePath = path.join(root, "activity-queue.json");

    const result = await recordSageSessionLearningEvent({
      cfg: {
        learning: {
          enabled: true,
          sources: { sageSessions: true },
        },
      },
      agentId: "main",
      sessionFile: path.join(root, "session.jsonl"),
      sessionId: "sess-1",
      sessionKey: "agent:main:main",
      workspace: "C:/repo",
      captureMethod: "sage-memory-heartbeat",
      metadata: { trigger: "heartbeat" },
      captureResult: {
        namespace: "sage.sessions",
        sourceUri: "sage://session/sess-1",
        sessionNodeId: "node-1",
        sessionNodePath: "sage-memory/node-1",
        evidenceId: "evidence-1",
        derivedNodeIds: ["derived-1"],
        deduplicated: false,
        eventId: "memory-event-1",
        messageCount: 3,
      },
      queuePath,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "queued", created: 1, skipped: 0 });
    const queue = await listLearningEventQueue({ queuePath });
    expect(queue.entries[0]?.event).toMatchObject({
      source: "sage_session",
      actor: "agent:main",
      sessionKey: "agent:main:main",
      workspace: "C:/repo",
      title: "Sage session agent:main:main",
      text: "Sage session transcript captured by sage-memory-heartbeat with 3 messages.",
      payload: {
        sessionId: "sess-1",
        captureMethod: "sage-memory-heartbeat",
        messageCount: 3,
        sessionNodeId: "node-1",
      },
      provenance: {
        evidenceIds: ["evidence-1"],
        activityNodeIds: ["node-1", "derived-1"],
      },
    });
  });
});
