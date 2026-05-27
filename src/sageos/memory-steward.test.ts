import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enqueueLearningEvents, listLearningEventQueue } from "../learning/activity-queue.js";
import { normalizeLearningEvent } from "../learning/events.js";
import { runSageOsMemoryStewardOnce } from "./memory-steward.js";

const cfg = {
  memory: {
    backend: "sage-memory",
    remote: {
      baseUrl: "http://127.0.0.1:18790",
      tokenEnv: "SAGE_MEMORY_TOKEN",
      defaultNamespace: "sage.activity",
    },
  },
  sageos: { memory: { replayQueues: true } },
} as const;

describe("SageOS memory steward", () => {
  it("replays learning queue events and refreshes status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-steward-ok-"));
    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");
    const event = normalizeLearningEvent(
      {
        source: "app_focus",
        actor: "local-user",
        title: "Code: SageOS",
        text: "Observed approved app focus.",
      },
      {
        now: () => new Date("2026-05-27T17:00:00.000Z"),
        idFactory: () => "learning_focus",
      },
    );
    await enqueueLearningEvents({ queuePath: learningQueuePath, events: [event] });

    const result = await runSageOsMemoryStewardOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: path.join(
        root,
        "agents",
        "main",
        "sage-memory",
        "capture-queue.json",
      ),
      learningActivityQueuePath: learningQueuePath,
      replayMemoryCaptureQueue: async () => ({
        attempted: 0,
        captured: 0,
        failed: 0,
        remaining: 0,
        results: [],
      }),
      ingestActivityEvents: async (events, namespace) => ({
        namespace: namespace ?? "sage.activity",
        accepted: events.length,
        evidenceIds: ["evidence_activity"],
        activityNodeIds: ["activity_node"],
        deduplicated: false,
        eventIds: events.map((entry) => entry.id),
      }),
      now: () => new Date("2026-05-27T17:01:00.000Z"),
    });

    expect(result.memory).toMatchObject({ attempted: 0, captured: 0, failed: 0 });
    expect(result.learning).toMatchObject({
      attempted: 1,
      accepted: 1,
      failed: 0,
      remaining: 0,
    });
    await expect(listLearningEventQueue({ queuePath: learningQueuePath })).resolves.toMatchObject({
      counts: { total: 0, pending: 0, failed: 0 },
    });
    expect(result.status.learning.activityQueue).toMatchObject({ total: 0, failed: 0 });
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_steward_replayed");
  });

  it("keeps failed replay visible in status and audit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-steward-fail-"));
    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");
    const event = normalizeLearningEvent(
      {
        source: "tool_usage",
        actor: "agent:main",
        title: "Useful command",
        text: "A useful command should be retained.",
      },
      {
        now: () => new Date("2026-05-27T17:05:00.000Z"),
        idFactory: () => "learning_tool",
      },
    );
    await enqueueLearningEvents({ queuePath: learningQueuePath, events: [event] });

    const result = await runSageOsMemoryStewardOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: path.join(
        root,
        "agents",
        "main",
        "sage-memory",
        "capture-queue.json",
      ),
      learningActivityQueuePath: learningQueuePath,
      replayMemoryCaptureQueue: async () => ({
        attempted: 1,
        captured: 0,
        failed: 1,
        remaining: 1,
        results: [{ id: "capture_1", status: "failed", error: "memory offline" }],
      }),
      ingestActivityEvents: async () => {
        throw new Error("activity ingest offline");
      },
      now: () => new Date("2026-05-27T17:06:00.000Z"),
    });

    expect(result.memory).toMatchObject({ attempted: 1, captured: 0, failed: 1, remaining: 1 });
    expect(result.learning).toMatchObject({
      attempted: 1,
      accepted: 0,
      failed: 1,
      remaining: 1,
    });
    expect(result.status.learning.activityQueue).toMatchObject({ total: 1, failed: 1 });
    expect(result.status.incidents.map((incident) => incident.category)).toContain("learning");
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_steward_replay_failed");
  });
});
