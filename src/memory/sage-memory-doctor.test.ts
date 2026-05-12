import { describe, expect, it, vi } from "vitest";
import type { SageConfig } from "../config/config.js";
import { runSageMemoryDoctor } from "./sage-memory-doctor.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

describe("runSageMemoryDoctor", () => {
  it("fails early when memory backend is not sage-memory", async () => {
    const report = await runSageMemoryDoctor({
      cfg: { memory: { backend: "builtin" } } as SageConfig,
      agentId: "main",
      fetch: vi.fn(),
      env: {},
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "config",
        status: "fail",
      }),
    );
    expect(report.suggestions).toContain(
      'Set memory.backend to "sage-memory" and configure memory.remote.baseUrl.',
    );
  });

  it("reports token setup guidance when auth is missing", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (url.endsWith("/openapi.json")) {
        return jsonResponse({
          paths: {
            "/v1/ingest/llm-session": {},
            "/v1/search": {},
            "/v1/nodes/{node_id}": {},
            "/v1/capture": {},
            "/v1/export/wiki": {},
          },
        });
      }
      throw new Error(`unexpected request ${url}`);
    });

    const report = await runSageMemoryDoctor({
      cfg: sageMemoryConfig(),
      agentId: "main",
      fetch: fetchImpl,
      env: {},
      processProbe: async () => ({ processIds: [] }),
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain("SAGE_MEMORY_TOKEN is not set");
    expect(report.suggestions).toContain(
      "Set SAGE_MEMORY_TOKEN in the Sage process environment before running capture diagnostics.",
    );
  });

  it("checks health openapi ingest search get export and process warnings", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      requests.push({ url, init });
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok" });
      }
      if (url.endsWith("/openapi.json")) {
        return jsonResponse({
          paths: {
            "/v1/ingest/llm-session": {},
            "/v1/search": {},
            "/v1/nodes/{node_id}": {},
            "/v1/capture": {},
            "/v1/export/wiki": {},
          },
        });
      }
      if (url.endsWith("/v1/ingest/llm-session")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
        expect(JSON.parse(requestBody(init))).toMatchObject({
          namespace: "jason.sage.sessions.diagnostics",
          source: "other",
          session_id: "sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
          source_uri: "sage://memory-doctor/sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
          metadata: {
            capture_method: "sage-memory-doctor",
            source_system: "sage",
            marker: "sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
            agentId: "main",
          },
          sensitivity: "private",
        });
        return jsonResponse(
          {
            evidence_id: "22222222-2222-4222-8222-222222222222",
            source_uri: "sage://memory-doctor/sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
            session_node_id: nodeId,
            derived_node_ids: [],
            deduplicated: false,
            event_id: "33333333-3333-4333-8333-333333333333",
          },
          201,
        );
      }
      if (url.endsWith("/v1/search")) {
        expect(JSON.parse(requestBody(init))).toEqual({
          query: "sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
          namespace: "jason.sage.sessions.diagnostics",
          limit: 5,
          mode: "hybrid",
        });
        return jsonResponse({
          query: "sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
          results: [
            {
              id: nodeId,
              namespace: "jason.sage.sessions.diagnostics",
              kind: "llm_session",
              title: "Sage Memory Doctor",
              excerpt: "sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
              source_uri: "sage://memory-doctor/sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
              sensitivity: "private",
              rank: 1,
              updated_at: "2026-05-12T12:00:00.000Z",
            },
          ],
        });
      }
      if (url.endsWith(`/v1/nodes/${nodeId}`)) {
        return jsonResponse({
          id: nodeId,
          namespace_id: "44444444-4444-4444-8444-444444444444",
          namespace: "jason.sage.sessions.diagnostics",
          kind: "llm_session",
          title: "Sage Memory Doctor",
          body_md: "Diagnostic marker found.",
          body_json: {},
          source_uri: "sage://memory-doctor/sage-memory-doctor-2026-05-12T12-00-00-000Z-abc123",
          evidence_ids: [],
          importance: 0.5,
          quality: 0.5,
          sensitivity: "private",
          created_at: "2026-05-12T12:00:00.000Z",
          updated_at: "2026-05-12T12:00:00.000Z",
          metadata: {},
        });
      }
      if (url.endsWith("/v1/export/wiki")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
        expect(JSON.parse(requestBody(init))).toEqual({
          namespace: "jason.sage.sessions.diagnostics",
        });
        return jsonResponse({
          exported_count: 1,
          files: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
        });
      }
      throw new Error(`unexpected request ${url}`);
    });

    const report = await runSageMemoryDoctor({
      cfg: sageMemoryConfig(),
      agentId: "main",
      fetch: fetchImpl,
      env: { SAGE_MEMORY_TOKEN: "test-token" },
      now: () => new Date("2026-05-12T12:00:00.000Z"),
      randomSuffix: () => "abc123",
      processProbe: async () => {
        throw new Error("process probe unavailable");
      },
      fileExists: async (file) => file === "C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md",
    });

    expect(report.ok).toBe(true);
    expect(report.nodeId).toBe(nodeId);
    expect(report.sessionNodePath).toBe(`sage-memory/${nodeId}`);
    expect(report.exportedFiles).toEqual([
      "C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md",
    ]);
    expect(report.warnings).toContain("process probe unavailable");
    expect(report.failures).toEqual([]);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "vault",
        status: "pass",
      }),
    );
    expect(requests.map((request) => request.url)).toEqual([
      "http://127.0.0.1:18790/health",
      "http://127.0.0.1:18790/openapi.json",
      "http://127.0.0.1:18790/v1/ingest/llm-session",
      "http://127.0.0.1:18790/v1/search",
      `http://127.0.0.1:18790/v1/nodes/${nodeId}`,
      "http://127.0.0.1:18790/v1/export/wiki",
    ]);
  });
});

function sageMemoryConfig(): SageConfig {
  return {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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
