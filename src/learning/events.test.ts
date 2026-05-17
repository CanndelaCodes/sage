import { describe, expect, it } from "vitest";
import { normalizeLearningEvent, summarizeLearningEvent } from "./events.js";

describe("learning event normalization", () => {
  it("creates stable private activity events with hashes", () => {
    const event = normalizeLearningEvent(
      {
        source: "browser",
        actor: "agent:main",
        sessionKey: "agent:main:direct",
        workspace: "C:/repo",
        title: "Pricing page",
        text: "User compared pricing and asked Sage to remember the workflow.",
        payload: { url: "https://example.test/pricing" },
        provenance: { toolName: "browser", eventId: "tab-1" },
      },
      {
        now: () => new Date("2026-05-16T10:00:00.000Z"),
        idFactory: () => "event-1",
      },
    );

    expect(event).toMatchObject({
      id: "event-1",
      source: "browser",
      actor: "agent:main",
      sessionKey: "agent:main:direct",
      workspace: "C:/repo",
      startedAt: "2026-05-16T10:00:00.000Z",
      endedAt: "2026-05-16T10:00:00.000Z",
      sensitivity: "private",
    });
    expect(event.activityHash).toHaveLength(64);

    const same = normalizeLearningEvent(
      {
        source: "browser",
        actor: "agent:main",
        sessionKey: "agent:main:direct",
        workspace: "C:/repo",
        title: "Pricing page",
        text: "User compared pricing and asked Sage to remember the workflow.",
        payload: { url: "https://example.test/pricing" },
        provenance: { toolName: "browser", eventId: "tab-1" },
      },
      {
        now: () => new Date("2026-05-17T10:00:00.000Z"),
        idFactory: () => "event-2",
      },
    );
    expect(same.activityHash).toBe(event.activityHash);
  });

  it("summarizes events without leaking raw payloads", () => {
    const event = normalizeLearningEvent(
      {
        source: "app_focus",
        actor: "jason",
        title: "Secret CRM",
        text: "Customer private workflow details",
        payload: { token: "do-not-emit", windowTitle: "Secret CRM" },
      },
      {
        now: () => new Date("2026-05-16T10:00:00.000Z"),
        idFactory: () => "event-1",
      },
    );

    expect(summarizeLearningEvent(event)).toEqual({
      id: "event-1",
      source: "app_focus",
      actor: "jason",
      title: "Secret CRM",
      text: "Customer private workflow details",
      startedAt: "2026-05-16T10:00:00.000Z",
      endedAt: "2026-05-16T10:00:00.000Z",
      activityHash: event.activityHash,
    });
  });
});
