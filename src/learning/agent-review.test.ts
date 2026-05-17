import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listLearningEventQueue } from "./activity-queue.js";
import { recordAgentRunLearningReview } from "./agent-review.js";

describe("agent run learning review", () => {
  it("queues compact after-task review packets for substantive runs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sage-agent-learning-review-"));
    const queuePath = path.join(root, "activity-queue.json");

    const result = await recordAgentRunLearningReview({
      cfg: {
        learning: {
          enabled: true,
          review: { timing: "after-task" },
        },
      },
      agentId: "main",
      sessionKey: "agent:main:main",
      workspace: "C:/repo",
      messages: [
        {
          role: "user",
          content:
            "Please remember this browser workflow: open the customer tab, snapshot before clicking, and patch the skill next time.",
        },
        {
          role: "assistant",
          content: "I used the browser tool and identified a repeatable workflow.",
        },
      ],
      success: true,
      durationMs: 1234,
      toolMetas: [{ toolName: "browser", meta: "navigate" }],
      queuePath,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "queued", created: 1, skipped: 0 });
    const queue = await listLearningEventQueue({ queuePath });
    expect(queue.entries[0]?.event).toMatchObject({
      source: "review_decision",
      actor: "agent:learning",
      sessionKey: "agent:main:main",
      workspace: "C:/repo",
      payload: {
        success: true,
        durationMs: 1234,
        toolMetas: [{ toolName: "browser", meta: "navigate" }],
        candidateTypes: expect.arrayContaining(["workflow", "skill_gap", "browser_pattern"]),
      },
    });
  });
});
