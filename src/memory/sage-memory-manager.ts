import type { ResolvedSageMemoryConfig } from "./backend-config.js";
import type { SageMemoryLlmSessionIngestInput } from "./sage-session-transcript.js";
import type {
  MemoryEmbeddingProbeResult,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SageMemorySearchResponse = {
  query: string;
  results: SageMemorySearchResult[];
};

type SageMemorySearchResult = {
  id: string;
  namespace: string;
  kind: string;
  title: string | null;
  excerpt: string;
  source_uri: string | null;
  sensitivity: string;
  rank?: number;
  score?: number;
  updated_at: string;
};

type SageMemoryNode = {
  id: string;
  namespace: string;
  kind: string;
  title: string | null;
  body_md: string;
  source_uri: string | null;
  updated_at: string;
};

export type SageMemoryCaptureInput = {
  namespace?: string;
  sourceUri: string;
  sourceType: string;
  captureMethod: string;
  contentText: string;
  metadata?: Record<string, unknown>;
  sensitivity?: "public" | "normal" | "private" | "secret";
  createNode?: boolean;
  nodeKind?: string;
  title?: string;
};

export type SageMemoryCaptureResult = {
  evidenceId: string;
  nodeId: string | null;
  namespace: string;
  deduplicated: boolean;
  eventId: string;
};

type SageMemoryCaptureResponse = {
  evidence_id: string;
  node_id: string | null;
  namespace: string;
  deduplicated: boolean;
  event_id: string;
};

export type SageMemoryLlmSessionIngestResult = {
  evidenceId: string;
  sourceUri: string;
  sessionNodeId: string;
  derivedNodeIds: string[];
  deduplicated: boolean;
  eventId: string;
};

type SageMemoryLlmSessionIngestResponse = {
  evidence_id: string;
  source_uri: string;
  session_node_id: string;
  derived_node_ids: string[];
  deduplicated: boolean;
  event_id: string;
};

export class SageMemoryManager implements MemorySearchManager {
  private readonly fetchImpl: FetchLike;
  private readonly env: Record<string, string | undefined>;

  static async create(params: {
    resolved: { remote?: ResolvedSageMemoryConfig };
  }): Promise<SageMemoryManager | null> {
    if (!params.resolved.remote) {
      return null;
    }
    return new SageMemoryManager({ config: params.resolved.remote });
  }

  constructor(params: {
    config: ResolvedSageMemoryConfig;
    fetch?: FetchLike;
    env?: Record<string, string | undefined>;
  }) {
    this.config = params.config;
    this.fetchImpl = params.fetch ?? ((input, init) => fetch(input, init));
    this.env = params.env ?? process.env;
  }

  private readonly config: ResolvedSageMemoryConfig;

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const limit = normalizeLimit(opts?.maxResults);
    const body: Record<string, string | number> = {
      query,
      limit,
      mode: "hybrid",
    };
    if (this.config.defaultNamespace) {
      body.namespace = this.config.defaultNamespace;
    }
    const response = await this.requestJson<SageMemorySearchResponse>("/v1/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const minScore = typeof opts?.minScore === "number" ? opts.minScore : undefined;
    return response.results
      .map((entry) => mapSearchResult(entry))
      .filter((entry) => minScore === undefined || entry.score >= minScore);
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const nodeId = parseNodePath(params.relPath);
    const node = await this.requestJson<SageMemoryNode>(`/v1/nodes/${encodeURIComponent(nodeId)}`, {
      method: "GET",
    });
    const text = sliceLines(formatNodeText(node), params.from, params.lines);
    return { path: params.relPath, text };
  }

  async capture(input: SageMemoryCaptureInput): Promise<SageMemoryCaptureResult> {
    const namespace = input.namespace?.trim() || this.config.defaultNamespace;
    if (!namespace) {
      throw new Error("sage-memory capture requires a namespace or memory.remote.defaultNamespace");
    }
    const response = await this.requestJson<SageMemoryCaptureResponse>("/v1/capture", {
      method: "POST",
      body: JSON.stringify({
        namespace,
        source_uri: input.sourceUri,
        source_type: input.sourceType,
        capture_method: input.captureMethod,
        content_text: input.contentText,
        metadata: input.metadata ?? {},
        sensitivity: input.sensitivity ?? "normal",
        create_node: input.createNode ?? true,
        node_kind: input.nodeKind ?? "note",
        title: input.title,
      }),
    });
    return {
      evidenceId: response.evidence_id,
      nodeId: response.node_id,
      namespace: response.namespace,
      deduplicated: response.deduplicated,
      eventId: response.event_id,
    };
  }

  async ingestLlmSession(
    input: SageMemoryLlmSessionIngestInput,
  ): Promise<SageMemoryLlmSessionIngestResult> {
    const response = await this.requestJson<SageMemoryLlmSessionIngestResponse>(
      "/v1/ingest/llm-session",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return {
      evidenceId: response.evidence_id,
      sourceUri: response.source_uri,
      sessionNodeId: response.session_node_id,
      derivedNodeIds: response.derived_node_ids,
      deduplicated: response.deduplicated,
      eventId: response.event_id,
    };
  }

  status() {
    return {
      backend: "sage-memory" as const,
      provider: "sage-memory",
      model: "remote",
      requestedProvider: "sage-memory",
      dirty: false,
      custom: {
        baseUrl: this.config.baseUrl,
        defaultNamespace: this.config.defaultNamespace,
      },
    };
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    return { ok: true };
  }

  async probeVectorAvailability(): Promise<boolean> {
    return true;
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const token = this.resolveToken();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `sage-memory ${init.method ?? "GET"} ${path} failed (${response.status}): ${text}`,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveToken(): string | undefined {
    const token = this.env[this.config.tokenEnv]?.trim();
    return token || undefined;
  }
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 6;
  }
  return Math.min(50, Math.floor(value));
}

function mapSearchResult(entry: SageMemorySearchResult): MemorySearchResult {
  const score =
    typeof entry.score === "number" && Number.isFinite(entry.score)
      ? entry.score
      : typeof entry.rank === "number" && Number.isFinite(entry.rank)
        ? entry.rank
        : 0;
  return {
    path: `sage-memory/${entry.id}`,
    startLine: 1,
    endLine: 1,
    score,
    snippet: [entry.title, entry.excerpt].filter((part) => part?.trim()).join("\n"),
    source: "memory",
  };
}

function parseNodePath(path: string): string {
  const trimmed = path.trim();
  const nodeId = trimmed.startsWith("sage-memory/")
    ? trimmed.slice("sage-memory/".length)
    : trimmed;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nodeId)) {
    throw new Error("sage-memory path must be sage-memory/<node-id>");
  }
  return nodeId;
}

function formatNodeText(node: SageMemoryNode): string {
  const title = node.title?.trim();
  if (!title) {
    return node.body_md;
  }
  return `# ${title}\n\n${node.body_md}`;
}

function sliceLines(text: string, from?: number, lines?: number): string {
  if (!from && !lines) {
    return text;
  }
  const allLines = text.split(/\r?\n/);
  const start =
    typeof from === "number" && Number.isFinite(from) ? Math.max(0, Math.floor(from) - 1) : 0;
  const end =
    typeof lines === "number" && Number.isFinite(lines) && lines >= 0
      ? start + Math.floor(lines)
      : undefined;
  return allLines.slice(start, end).join("\n");
}
