import { describe, expect, it, vi } from "vitest";
import { SageMemoryManager } from "./sage-memory-manager.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("SageMemoryManager", () => {
  it("maps sage-memory search results to memory search snippets", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(requestUrl(url)).toBe("http://127.0.0.1:18790/v1/search");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(requestBody(init))).toEqual({
        query: "remote backend",
        limit: 3,
        mode: "hybrid",
        namespace: "jason.sage.coding",
      });
      return jsonResponse({
        query: "remote backend",
        results: [
          {
            id: nodeId,
            namespace: "jason.sage.coding",
            kind: "note",
            title: "Remote backend",
            excerpt: "Use sage-memory as an additive backend.",
            source_uri: "sage://manual",
            sensitivity: "normal",
            rank: 0.73,
            updated_at: "2026-05-11T12:00:00Z",
          },
        ],
      });
    });
    const manager = new SageMemoryManager({
      config: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        timeoutMs: 5000,
        defaultNamespace: "jason.sage.coding",
        failOpenToBuiltin: true,
      },
      fetch: fetchImpl,
      env: {},
    });

    const results = await manager.search("remote backend", { maxResults: 3 });

    expect(results).toEqual([
      {
        path: `sage-memory/${nodeId}`,
        startLine: 1,
        endLine: 1,
        score: 0.73,
        snippet: "Remote backend\nUse sage-memory as an additive backend.",
        source: "memory",
      },
    ]);
  });

  it("reads sage-memory node bodies by result path", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(requestUrl(url)).toBe(`http://127.0.0.1:18790/v1/nodes/${nodeId}`);
      return jsonResponse({
        id: nodeId,
        namespace_id: "22222222-2222-4222-8222-222222222222",
        namespace: "jason.sage.coding",
        kind: "note",
        title: "Remote backend",
        body_md: "Full remote node body.",
        body_json: {},
        source_uri: "sage://manual",
        evidence_ids: [],
        importance: 0.5,
        quality: 0.5,
        sensitivity: "normal",
        created_at: "2026-05-11T12:00:00Z",
        updated_at: "2026-05-11T12:00:00Z",
        metadata: {},
      });
    });
    const manager = new SageMemoryManager({
      config: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        timeoutMs: 5000,
        failOpenToBuiltin: true,
      },
      fetch: fetchImpl,
      env: {},
    });

    await expect(manager.readFile({ relPath: `sage-memory/${nodeId}` })).resolves.toEqual({
      path: `sage-memory/${nodeId}`,
      text: "# Remote backend\n\nFull remote node body.",
    });
  });

  it("captures text into sage-memory using default namespace and bearer token", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(requestUrl(url)).toBe("http://127.0.0.1:18790/v1/capture");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer test-token");
      expect(JSON.parse(requestBody(init))).toEqual({
        namespace: "jason.sage.sessions",
        source_uri: "sage://session/abc",
        source_type: "session",
        capture_method: "sage-session-memory",
        content_text: "Useful handoff text.",
        metadata: { sessionKey: "agent:main:main" },
        sensitivity: "normal",
        create_node: true,
        node_kind: "note",
        title: "Session handoff",
      });
      return jsonResponse({
        evidence_id: "33333333-3333-4333-8333-333333333333",
        node_id: nodeId,
        namespace_id: "22222222-2222-4222-8222-222222222222",
        namespace: "jason.sage.sessions",
        content_sha256: "a".repeat(64),
        normalized_sha256: "b".repeat(64),
        deduplicated: false,
        event_id: "44444444-4444-4444-8444-444444444444",
      });
    });
    const manager = new SageMemoryManager({
      config: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        timeoutMs: 5000,
        defaultNamespace: "jason.sage.sessions",
        failOpenToBuiltin: true,
      },
      fetch: fetchImpl,
      env: { SAGE_MEMORY_TOKEN: "test-token" },
    });

    await expect(
      manager.capture({
        sourceUri: "sage://session/abc",
        sourceType: "session",
        captureMethod: "sage-session-memory",
        contentText: "Useful handoff text.",
        metadata: { sessionKey: "agent:main:main" },
        title: "Session handoff",
      }),
    ).resolves.toEqual({
      evidenceId: "33333333-3333-4333-8333-333333333333",
      nodeId,
      namespace: "jason.sage.sessions",
      deduplicated: false,
      eventId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("does not expose manual index sync for the remote backend", () => {
    const manager = new SageMemoryManager({
      config: {
        baseUrl: "http://127.0.0.1:18790",
        tokenEnv: "SAGE_MEMORY_TOKEN",
        timeoutMs: 5000,
        failOpenToBuiltin: true,
      },
      fetch: vi.fn(),
      env: {},
    });

    expect((manager as { sync?: unknown }).sync).toBeUndefined();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function requestBody(init?: RequestInit): string {
  if (typeof init?.body === "string") {
    return init.body;
  }
  throw new Error("expected string request body");
}
