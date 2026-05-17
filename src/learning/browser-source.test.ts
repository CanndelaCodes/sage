import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listLearningEventQueue } from "./activity-queue.js";
import { recordBrowserToolLearningEvent } from "./browser-source.js";

describe("browser learning source", () => {
  it("queues compact browser action summaries without raw snapshots", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sage-browser-learning-"));
    const queuePath = path.join(root, "activity-queue.json");

    const result = await recordBrowserToolLearningEvent({
      learning: {
        enabled: true,
        queuePath,
        agentId: "main",
        sessionKey: "agent:main:main",
        workspace: "C:/repo",
      },
      action: "navigate",
      profile: "chrome",
      target: "host",
      args: {
        action: "navigate",
        profile: "chrome",
        targetUrl: "https://example.test/pricing",
        snapshot: "raw snapshot content should not be copied",
      },
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "queued", created: 1, skipped: 0 });
    const queue = await listLearningEventQueue({ queuePath });
    expect(queue.entries[0]?.event).toMatchObject({
      source: "browser",
      sessionKey: "agent:main:main",
      workspace: "C:/repo",
      title: "browser navigate",
      text: "Browser action navigate succeeded.",
      payload: {
        action: "navigate",
        profile: "chrome",
        target: "host",
        args: {
          action: "navigate",
          profile: "chrome",
          targetUrl: "https://example.test/pricing",
        },
      },
    });
    expect(JSON.stringify(queue.entries[0]?.event.payload)).not.toContain("raw snapshot");
  });
});
