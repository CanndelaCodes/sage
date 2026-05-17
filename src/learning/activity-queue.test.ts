import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  enqueueLearningEvents,
  listLearningEventQueue,
  replayLearningEventQueue,
} from "./activity-queue.js";
import { normalizeLearningEvent } from "./events.js";

describe("learning activity queue", () => {
  it("dedupes events by activity hash and replays accepted batches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sage-learning-queue-"));
    const queuePath = path.join(root, "queue.json");
    const event = normalizeLearningEvent(
      {
        source: "sage_session",
        actor: "agent:main",
        title: "Debug workflow",
        text: "A repeatable debugging workflow emerged.",
      },
      {
        now: () => new Date("2026-05-16T10:00:00.000Z"),
        idFactory: () => "event-1",
      },
    );

    await enqueueLearningEvents({ queuePath, events: [event] });
    await enqueueLearningEvents({ queuePath, events: [{ ...event, id: "event-2" }] });

    const before = await listLearningEventQueue({ queuePath });
    expect(before.counts).toEqual({ total: 1, pending: 1, failed: 0 });

    const result = await replayLearningEventQueue({
      queuePath,
      namespace: "sage.learning",
      ingest: async (events) => ({
        namespace: "sage.learning",
        accepted: events.length,
        evidenceIds: ["evidence-1"],
        activityNodeIds: ["node-1"],
        deduplicated: false,
        eventIds: events.map((entry) => entry.id),
      }),
    });

    expect(result).toMatchObject({ attempted: 1, accepted: 1, failed: 0, remaining: 0 });
    const after = await listLearningEventQueue({ queuePath });
    expect(after.counts.total).toBe(0);
  });

  it("keeps failed batches pending with attempt metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sage-learning-queue-"));
    const queuePath = path.join(root, "queue.json");
    const event = normalizeLearningEvent(
      {
        source: "tool_usage",
        actor: "agent:main",
        title: "Tool failure",
        text: "A tool failed and then recovered.",
      },
      {
        now: () => new Date("2026-05-16T10:00:00.000Z"),
        idFactory: () => "event-1",
      },
    );

    await enqueueLearningEvents({ queuePath, events: [event] });
    const result = await replayLearningEventQueue({
      queuePath,
      namespace: "sage.learning",
      ingest: async () => {
        throw new Error("offline");
      },
      now: () => new Date("2026-05-16T10:01:00.000Z"),
    });

    expect(result).toMatchObject({ attempted: 1, accepted: 0, failed: 1, remaining: 1 });
    const after = await listLearningEventQueue({ queuePath });
    expect(after.entries[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "offline",
      lastAttemptAt: "2026-05-16T10:01:00.000Z",
    });
  });
});
