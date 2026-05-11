import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryGetTool, createMemorySearchTool } from "./memory-tool.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("memory tools with sage-memory backend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches and expands remote Sage Memory results through existing tool names", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = requestUrl(input);
        calls.push(url);
        if (url.endsWith("/v1/search")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(requestBody(init))).toMatchObject({
            query: "remote memory",
            limit: 2,
            namespace: "jason.sage.tool_test",
          });
          return jsonResponse({
            query: "remote memory",
            results: [
              {
                id: nodeId,
                namespace: "jason.sage.tool_test",
                kind: "note",
                title: "Remote memory",
                excerpt: "Remote result excerpt.",
                source_uri: "sage://test",
                sensitivity: "normal",
                rank: 0.9,
                updated_at: "2026-05-11T12:00:00Z",
              },
            ],
          });
        }
        if (url.endsWith(`/v1/nodes/${nodeId}`)) {
          return jsonResponse({
            id: nodeId,
            namespace_id: "22222222-2222-4222-8222-222222222222",
            namespace: "jason.sage.tool_test",
            kind: "note",
            title: "Remote memory",
            body_md: "Expanded remote body.",
            body_json: {},
            source_uri: "sage://test",
            evidence_ids: [],
            importance: 0.5,
            quality: 0.5,
            sensitivity: "normal",
            created_at: "2026-05-11T12:00:00Z",
            updated_at: "2026-05-11T12:00:00Z",
            metadata: {},
          });
        }
        throw new Error(`unexpected URL ${url}`);
      }),
    );
    const cfg = {
      memory: {
        backend: "sage-memory",
        remote: {
          baseUrl: "http://127.0.0.1:18790",
          defaultNamespace: "jason.sage.tool_test",
          failOpenToBuiltin: false,
        },
      },
      agents: { list: [{ id: "main", default: true, workspace: "/tmp/workspace" }] },
    } as const;

    const searchTool = createMemorySearchTool({ config: cfg });
    const getTool = createMemoryGetTool({ config: cfg });
    if (!searchTool || !getTool) {
      throw new Error("memory tools missing");
    }

    const search = await searchTool.execute("remote_search", {
      query: "remote memory",
      maxResults: 2,
    });
    const searchDetails = search.details as { results: Array<{ path: string; snippet: string }> };
    expect(searchDetails.results[0]).toMatchObject({
      path: `sage-memory/${nodeId}`,
      snippet: expect.stringContaining("Remote result excerpt."),
    });

    const expanded = await getTool.execute("remote_get", {
      path: searchDetails.results[0]?.path,
    });

    expect(expanded.details).toEqual({
      path: `sage-memory/${nodeId}`,
      text: "# Remote memory\n\nExpanded remote body.",
    });
    expect(calls).toEqual([
      "http://127.0.0.1:18790/v1/search",
      `http://127.0.0.1:18790/v1/nodes/${nodeId}`,
    ]);
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
