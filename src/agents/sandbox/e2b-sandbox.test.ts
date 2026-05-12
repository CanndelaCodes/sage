import { describe, expect, it, vi } from "vitest";
import {
  createE2BSandbox,
  destroyE2BSandbox,
  execInE2BSandbox,
  isE2BAvailable,
  listE2BSandboxes,
  readFileFromE2BSandbox,
  writeFileToE2BSandbox,
  type E2BDeps,
} from "./e2b-sandbox.js";

function makeMockFetch(responses: Record<string, { status: number; body: unknown }>): typeof fetch {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? "GET";
    const pathname = new URL(urlStr).pathname + (new URL(urlStr).search ?? "");
    const key = `${method} ${pathname}`;

    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}

function makeDeps(overrides?: Partial<E2BDeps>): E2BDeps {
  return {
    apiKey: "e2b-test-key",
    baseUrl: "https://api.e2b.test",
    ...overrides,
  };
}

describe("isE2BAvailable", () => {
  it("returns true when API key is configured", () => {
    expect(isE2BAvailable({ apiKey: "test-key" })).toBe(true);
  });

  it("returns false when no API key", () => {
    expect(isE2BAvailable({ apiKey: undefined })).toBe(false);
  });
});

describe("createE2BSandbox", () => {
  it("creates a sandbox via API", async () => {
    const fetch = makeMockFetch({
      "POST /sandboxes": {
        status: 200,
        body: {
          sandboxID: "sbx-123",
          templateID: "base",
          clientID: "client-1",
        },
      },
    });

    const deps = makeDeps({ fetch });
    const sandbox = await createE2BSandbox({ template: "base", timeoutSeconds: 600 }, deps);

    expect(sandbox.sandboxId).toBe("sbx-123");
    expect(sandbox.status).toBe("running");
    expect(sandbox.template).toBe("base");
    expect(sandbox.createdAt).toBeGreaterThan(0);
  });

  it("uses default template when not specified", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ sandboxID: "sbx-1", templateID: "base", clientID: "c" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const deps = makeDeps({ fetch: fetchMock });
    await createE2BSandbox(undefined, deps);

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.templateID).toBe("base");
  });

  it("throws on missing API key", async () => {
    await expect(createE2BSandbox(undefined, { apiKey: undefined })).rejects.toThrow(
      "E2B API key not configured",
    );
  });

  it("throws on API error", async () => {
    const fetch = makeMockFetch({
      "POST /sandboxes": { status: 401, body: { error: "unauthorized" } },
    });

    const deps = makeDeps({ fetch });
    await expect(createE2BSandbox(undefined, deps)).rejects.toThrow("E2B API error (401)");
  });
});

describe("execInE2BSandbox", () => {
  it("executes a command and returns result", async () => {
    const fetch = makeMockFetch({
      "POST /sandboxes/sbx-1/commands": {
        status: 200,
        body: { stdout: "hello world\n", stderr: "", exitCode: 0 },
      },
    });

    const deps = makeDeps({ fetch });
    const result = await execInE2BSandbox("sbx-1", "echo hello world", undefined, deps);

    expect(result.stdout).toBe("hello world\n");
    expect(result.exitCode).toBe(0);
  });

  it("passes environment and cwd", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ stdout: "", stderr: "", exitCode: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const deps = makeDeps({ fetch: fetchMock });
    await execInE2BSandbox("sbx-1", "ls", { cwd: "/workspace", env: { NODE_ENV: "test" } }, deps);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.cwd).toBe("/workspace");
    expect(body.envVars).toEqual({ NODE_ENV: "test" });
  });
});

describe("destroyE2BSandbox", () => {
  it("sends delete request", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const deps = makeDeps({ fetch: fetchMock });
    await destroyE2BSandbox("sbx-1", deps);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sandboxes/sbx-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("listE2BSandboxes", () => {
  it("filters to sage-vde sandboxes", async () => {
    const fetch = makeMockFetch({
      "GET /sandboxes": {
        status: 200,
        body: [
          {
            sandboxID: "sbx-1",
            templateID: "base",
            startedAt: "2026-02-06T10:00:00Z",
            metadata: { source: "sage-vde" },
          },
          {
            sandboxID: "sbx-2",
            templateID: "custom",
            startedAt: "2026-02-06T11:00:00Z",
            metadata: { source: "other-app" },
          },
        ],
      },
    });

    const deps = makeDeps({ fetch });
    const sandboxes = await listE2BSandboxes(deps);

    expect(sandboxes).toHaveLength(1);
    expect(sandboxes[0].sandboxId).toBe("sbx-1");
  });
});

describe("file operations", () => {
  it("writes file to sandbox", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const deps = makeDeps({ fetch: fetchMock });
    await writeFileToE2BSandbox("sbx-1", "/workspace/test.ts", "const x = 1;", deps);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.path).toBe("/workspace/test.ts");
    expect(body.content).toBe("const x = 1;");
  });

  it("reads file from sandbox", async () => {
    const fetch = makeMockFetch({
      "GET /sandboxes/sbx-1/filesystem": {
        status: 200,
        body: { content: "file contents here" },
      },
    });

    const deps = makeDeps({ fetch });
    const content = await readFileFromE2BSandbox("sbx-1", "/workspace/test.ts", deps);
    expect(content).toBe("file contents here");
  });
});
