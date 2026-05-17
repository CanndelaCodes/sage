import { describe, expect, it } from "vitest";
import { SageMemoryManager } from "./sage-memory-manager.js";

describe("SageMemoryManager activity events", () => {
  it("posts batched learning activity events to Sage Memory", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const manager = new SageMemoryManager({
      config: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        timeoutMs: 1000,
        tokenBudget: 8000,
        defaultNamespace: "sage.learning",
        failOpenToBuiltin: false,
      },
      env: { SAGE_MEMORY_TOKEN: "secret" },
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            namespace: "sage.learning",
            accepted: 1,
            evidence_ids: ["evidence-1"],
            activity_node_ids: ["node-1"],
            deduplicated: false,
            event_ids: ["event-1"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const result = await manager.ingestActivityEvents({
      namespace: "sage.learning",
      events: [
        {
          id: "event-1",
          source: "sage_session",
          actor: "agent:main",
          startedAt: "2026-05-16T10:00:00.000Z",
          endedAt: "2026-05-16T10:00:00.000Z",
          title: "Workflow",
          text: "A durable workflow emerged.",
          payload: {},
          sensitivity: "private",
          provenance: {},
          activityHash: "a".repeat(64),
        },
      ],
    });

    expect(result).toEqual({
      namespace: "sage.learning",
      accepted: 1,
      evidenceIds: ["evidence-1"],
      activityNodeIds: ["node-1"],
      deduplicated: false,
      eventIds: ["event-1"],
    });
    const firstCall = calls[0];
    expect(firstCall?.url).toBe("http://127.0.0.1:18790/v1/ingest/activity-events");
    const headers = firstCall?.init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    if (!(headers instanceof Headers)) {
      throw new Error("expected request headers");
    }
    expect(headers.get("authorization")).toBe("Bearer secret");
    const body = firstCall?.init?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") {
      throw new Error("expected request body string");
    }
    expect(JSON.parse(body)).toMatchObject({
      namespace: "sage.learning",
      events: [{ id: "event-1", source: "sage_session" }],
    });
  });
});
