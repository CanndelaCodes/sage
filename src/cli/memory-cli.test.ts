import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const getMemorySearchManager = vi.fn();
const loadConfig = vi.fn(() => ({}));
const resolveDefaultAgentId = vi.fn(() => "main");
const captureSageSessionTranscript = vi.fn();
const runSageMemoryDoctor = vi.fn();
const listSageMemoryCaptureQueue = vi.fn();
const replaySageMemoryCaptureQueue = vi.fn();

vi.mock("../memory/index.js", () => ({
  getMemorySearchManager,
}));

vi.mock("../config/config.js", () => ({
  loadConfig,
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId,
}));

vi.mock("../memory/sage-memory-session-capture.js", () => ({
  captureSageSessionTranscript,
}));

vi.mock("../memory/sage-memory-doctor.js", () => ({
  runSageMemoryDoctor,
}));

vi.mock("../memory/sage-memory-capture-queue.js", () => ({
  listSageMemoryCaptureQueue,
  replaySageMemoryCaptureQueue,
}));

afterEach(async () => {
  vi.restoreAllMocks();
  getMemorySearchManager.mockReset();
  captureSageSessionTranscript.mockReset();
  runSageMemoryDoctor.mockReset();
  listSageMemoryCaptureQueue.mockReset();
  replaySageMemoryCaptureQueue.mockReset();
  process.exitCode = undefined;
  const { setVerbose } = await import("../globals.js");
  setVerbose(false);
});

describe("memory cli", () => {
  it("prints vector status when available", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        status: () => ({
          files: 2,
          chunks: 5,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
          cache: { enabled: true, entries: 123, maxEntries: 50000 },
          fts: { enabled: true, available: true },
          vector: {
            enabled: true,
            available: true,
            extensionPath: "/opt/sqlite-vec.dylib",
            dims: 1024,
          },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status"], { from: "user" });

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Vector: ready"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Vector dims: 1024"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Vector path: /opt/sqlite-vec.dylib"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("FTS: ready"));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Embedding cache: enabled (123 entries)"),
    );
    expect(close).toHaveBeenCalled();
  });

  it("prints sage-memory remote status without local index fields", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        status: () => ({
          backend: "sage-memory",
          provider: "sage-memory",
          model: "remote",
          requestedProvider: "sage-memory",
          dirty: false,
          custom: {
            baseUrl: "http://127.0.0.1:18790",
            defaultNamespace: "jason.sage.sessions",
          },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status"], { from: "user" });

    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Backend: sage-memory");
    expect(output).toContain("Endpoint: http://127.0.0.1:18790");
    expect(output).toContain("Namespace: jason.sage.sessions");
    expect(output).not.toContain("Indexed:");
    expect(output).not.toContain("Store:");
    expect(output).not.toContain("Workspace:");
    expect(close).toHaveBeenCalled();
  });

  it("does not manually reindex sage-memory backends even when the wrapper exposes sync", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const sync = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        sync,
        status: () => ({
          backend: "sage-memory",
          provider: "sage-memory",
          model: "remote",
          requestedProvider: "sage-memory",
          dirty: false,
          custom: { baseUrl: "http://127.0.0.1:18790" },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "index"], { from: "user" });

    expect(sync).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Memory backend does not support manual reindex.");
    expect(log).not.toHaveBeenCalledWith("Memory index updated (main).");
    expect(close).toHaveBeenCalled();
  });

  it("does not run status --index for sage-memory backends", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const sync = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        probeEmbeddingAvailability: vi.fn(async () => ({ ok: true })),
        sync,
        status: () => ({
          backend: "sage-memory",
          provider: "sage-memory",
          model: "remote",
          requestedProvider: "sage-memory",
          dirty: false,
          custom: { baseUrl: "http://127.0.0.1:18790" },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status", "--index"], { from: "user" });

    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sync).not.toHaveBeenCalled();
    expect(output).toContain("Memory backend does not support manual reindex.");
    expect(output).not.toContain("Memory index complete.");
    expect(close).toHaveBeenCalled();
  });

  it("prints vector error when unavailable", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => false),
        status: () => ({
          files: 0,
          chunks: 0,
          dirty: true,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
          vector: {
            enabled: true,
            available: false,
            loadError: "load failed",
          },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status", "--agent", "main"], { from: "user" });

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Vector: unavailable"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Vector error: load failed"));
    expect(close).toHaveBeenCalled();
  });

  it("prints embeddings status when deep", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const probeEmbeddingAvailability = vi.fn(async () => ({ ok: true }));
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        probeEmbeddingAvailability,
        status: () => ({
          files: 1,
          chunks: 1,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
          vector: { enabled: true, available: true },
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status", "--deep"], { from: "user" });

    expect(probeEmbeddingAvailability).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Embeddings: ready"));
    expect(close).toHaveBeenCalled();
  });

  it("enables verbose logging with --verbose", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { isVerbose } = await import("../globals.js");
    const close = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        status: () => ({
          files: 0,
          chunks: 0,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
          vector: { enabled: true, available: true },
        }),
        close,
      },
    });

    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status", "--verbose"], { from: "user" });

    expect(isVerbose()).toBe(true);
  });

  it("logs close failure after status", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {
      throw new Error("close boom");
    });
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        status: () => ({
          files: 1,
          chunks: 1,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
        }),
        close,
      },
    });

    const error = vi.spyOn(defaultRuntime, "error").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status"], { from: "user" });

    expect(close).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Memory manager close failed: close boom"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("reindexes on status --index", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const sync = vi.fn(async () => {});
    const probeEmbeddingAvailability = vi.fn(async () => ({ ok: true }));
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        probeVectorAvailability: vi.fn(async () => true),
        probeEmbeddingAvailability,
        sync,
        status: () => ({
          files: 1,
          chunks: 1,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
          vector: { enabled: true, available: true },
        }),
        close,
      },
    });

    vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "status", "--index"], { from: "user" });

    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cli", force: false, progress: expect.any(Function) }),
    );
    expect(probeEmbeddingAvailability).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("closes manager after index", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const sync = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        sync,
        status: () => ({
          files: 0,
          chunks: 0,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
        }),
        close,
      },
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "index"], { from: "user" });

    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cli", force: false, progress: expect.any(Function) }),
    );
    expect(close).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Memory index updated (main).");
  });

  it("logs close failures without failing the command", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {
      throw new Error("close boom");
    });
    const sync = vi.fn(async () => {});
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        sync,
        status: () => ({
          files: 0,
          chunks: 0,
          dirty: false,
          workspaceDir: "/tmp/sage",
          dbPath: "/tmp/memory.sqlite",
          provider: "openai",
          model: "text-embedding-3-small",
          requestedProvider: "openai",
        }),
        close,
      },
    });

    const error = vi.spyOn(defaultRuntime, "error").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "index"], { from: "user" });

    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cli", force: false, progress: expect.any(Function) }),
    );
    expect(close).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Memory manager close failed: close boom"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("logs close failure after search", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {
      throw new Error("close boom");
    });
    const search = vi.fn(async () => [
      {
        path: "memory/2026-01-12.md",
        startLine: 1,
        endLine: 2,
        score: 0.5,
        snippet: "Hello",
      },
    ]);
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        search,
        close,
      },
    });

    const error = vi.spyOn(defaultRuntime, "error").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "search", "hello"], { from: "user" });

    expect(search).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Memory manager close failed: close boom"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("closes manager after search error", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const close = vi.fn(async () => {});
    const search = vi.fn(async () => {
      throw new Error("boom");
    });
    getMemorySearchManager.mockResolvedValueOnce({
      manager: {
        search,
        close,
      },
    });

    const error = vi.spyOn(defaultRuntime, "error").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "search", "oops"], { from: "user" });

    expect(search).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Memory search failed: boom"));
    expect(process.exitCode).toBe(1);
  });

  it("captures a session transcript with JSON output", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const cfg = { memory: { backend: "sage-memory" } };
    loadConfig.mockReturnValueOnce(cfg);
    captureSageSessionTranscript.mockResolvedValueOnce({
      namespace: "jason.sage.manual",
      sourceUri: "sage://session/manual-session",
      sessionNodeId: "11111111-1111-4111-8111-111111111111",
      sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
      evidenceId: "22222222-2222-4222-8222-222222222222",
      derivedNodeIds: [],
      deduplicated: false,
      eventId: "33333333-3333-4333-8333-333333333333",
      messageCount: 1,
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(
      [
        "memory",
        "capture-session",
        "session.jsonl",
        "--agent",
        "ops",
        "--session-key",
        "agent:ops:main",
        "--session-id",
        "manual-session",
        "--namespace",
        "jason.sage.manual",
        "--json",
      ],
      { from: "user" },
    );

    expect(captureSageSessionTranscript).toHaveBeenCalledWith({
      cfg,
      agentId: "ops",
      sessionFile: "session.jsonl",
      sessionKey: "agent:ops:main",
      sessionId: "manual-session",
      namespace: "jason.sage.manual",
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
      messageCount: 1,
    });
  });

  it("runs sage-memory doctor with JSON output", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const cfg = { memory: { backend: "sage-memory" } };
    loadConfig.mockReturnValueOnce(cfg);
    runSageMemoryDoctor.mockResolvedValueOnce({
      ok: true,
      agentId: "main",
      baseUrl: "http://127.0.0.1:18790",
      namespace: "jason.sage.sessions",
      diagnosticNamespace: "jason.sage.sessions.diagnostics",
      marker: "sage-memory-doctor-marker",
      nodeId: "11111111-1111-4111-8111-111111111111",
      sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
      exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
      checks: [{ name: "config", status: "pass", message: "ok" }],
      warnings: [],
      failures: [],
      suggestions: [],
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(
      ["memory", "doctor", "--agent", "main", "--namespace", "jason.sage.diagnostics", "--json"],
      { from: "user" },
    );

    expect(runSageMemoryDoctor).toHaveBeenCalledWith({
      cfg,
      agentId: "main",
      namespace: "jason.sage.diagnostics",
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
    });
  });

  it("prints capture queue status with JSON output", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const cfg = { memory: { backend: "sage-memory" } };
    loadConfig.mockReturnValueOnce(cfg);
    listSageMemoryCaptureQueue.mockResolvedValueOnce({
      path: "C:/Users/jason/.sage/agents/main/sage-memory/capture-queue.json",
      counts: { total: 1, pending: 1, failed: 0 },
      entries: [
        {
          id: "capture-1",
          status: "pending",
          agentId: "main",
          sessionFile: "session.jsonl",
          captureMethod: "sage-memory-heartbeat",
        },
      ],
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(["memory", "capture-queue", "--agent", "main", "--json"], {
      from: "user",
    });

    expect(listSageMemoryCaptureQueue).toHaveBeenCalledWith({ agentId: "main" });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      counts: { total: 1, pending: 1, failed: 0 },
    });
  });

  it("replays capture queue entries with JSON output", async () => {
    const { registerMemoryCli } = await import("./memory-cli.js");
    const { defaultRuntime } = await import("../runtime.js");
    const cfg = { memory: { backend: "sage-memory" } };
    loadConfig.mockReturnValueOnce(cfg);
    replaySageMemoryCaptureQueue.mockResolvedValueOnce({
      attempted: 1,
      captured: 1,
      failed: 0,
      remaining: 0,
      results: [
        {
          id: "capture-1",
          status: "captured",
          sessionNodePath: "sage-memory/11111111-1111-4111-8111-111111111111",
        },
      ],
    });

    const log = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    const program = new Command();
    program.name("test");
    registerMemoryCli(program);
    await program.parseAsync(
      ["memory", "capture-queue", "--agent", "main", "--replay", "--limit", "1", "--json"],
      { from: "user" },
    );

    expect(replaySageMemoryCaptureQueue).toHaveBeenCalledWith({
      cfg,
      agentId: "main",
      limit: 1,
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      attempted: 1,
      captured: 1,
      remaining: 0,
    });
  });
});
