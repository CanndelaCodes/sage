import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { SageConfig } from "../config/config.js";
import { resolveMemoryBackendConfig } from "./backend-config.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SageMemoryDoctorCheckStatus = "pass" | "warn" | "fail";

export type SageMemoryDoctorCheck = {
  name: string;
  status: SageMemoryDoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type SageMemoryDoctorReport = {
  ok: boolean;
  agentId: string;
  baseUrl?: string;
  namespace?: string;
  diagnosticNamespace?: string;
  marker?: string;
  nodeId?: string;
  sessionNodePath?: string;
  exportedFiles: string[];
  checks: SageMemoryDoctorCheck[];
  warnings: string[];
  failures: string[];
  suggestions: string[];
};

type ProcessProbeResult = {
  processIds: number[];
};

type ProcessProbe = (port: number) => Promise<ProcessProbeResult>;
type FileExistsProbe = (file: string) => Promise<boolean>;

type JsonRequestResult<T> =
  | { ok: true; status: number; value: T }
  | { ok: false; status?: number; error: string };

type OpenApiResponse = {
  paths?: Record<string, unknown>;
};

type IngestResponse = {
  source_uri: string;
  session_node_id: string;
};

type SearchResponse = {
  results?: Array<{
    id?: string;
    source_uri?: string | null;
  }>;
};

type ExportWikiResponse = {
  exported_count?: number;
  files?: string[];
};

const execFileAsync = promisify(execFile);
const REQUIRED_OPENAPI_PATHS = [
  "/v1/ingest/llm-session",
  "/v1/search",
  "/v1/nodes/{node_id}",
  "/v1/capture",
  "/v1/export/wiki",
];

export async function runSageMemoryDoctor(params: {
  cfg: SageConfig;
  agentId: string;
  namespace?: string;
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  randomSuffix?: () => string;
  processProbe?: ProcessProbe;
  fileExists?: FileExistsProbe;
}): Promise<SageMemoryDoctorReport> {
  const report: SageMemoryDoctorReport = {
    ok: false,
    agentId: params.agentId,
    exportedFiles: [],
    checks: [],
    warnings: [],
    failures: [],
    suggestions: [],
  };
  const addCheck = createCheckRecorder(report);
  const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId: params.agentId });
  if (resolved.backend !== "sage-memory" || !resolved.remote) {
    addCheck("config", "fail", 'memory.backend is not "sage-memory"');
    report.suggestions.push(
      'Set memory.backend to "sage-memory" and configure memory.remote.baseUrl.',
    );
    return finishReport(report);
  }

  const remote = resolved.remote;
  const fetchImpl = params.fetch ?? ((input, init) => fetch(input, init));
  const env = params.env ?? process.env;
  const namespace = params.namespace?.trim() || remote.defaultNamespace || "sage.sessions";
  const diagnosticNamespace = params.namespace?.trim() || `${namespace}.diagnostics`;
  const now = params.now?.() ?? new Date();
  const marker = createDiagnosticMarker(now, params.randomSuffix?.() ?? randomSuffix());
  const token = env[remote.tokenEnv]?.trim();
  report.baseUrl = remote.baseUrl;
  report.namespace = namespace;
  report.diagnosticNamespace = diagnosticNamespace;
  report.marker = marker;
  addCheck("config", "pass", `Using ${remote.baseUrl}`, {
    namespace,
    diagnosticNamespace,
    tokenEnv: remote.tokenEnv,
  });

  await checkHealth({
    remoteBaseUrl: remote.baseUrl,
    timeoutMs: remote.timeoutMs,
    fetchImpl,
    addCheck,
  });
  await checkOpenApi({
    remoteBaseUrl: remote.baseUrl,
    timeoutMs: remote.timeoutMs,
    fetchImpl,
    addCheck,
  });

  if (!token) {
    addCheck("auth", "fail", `${remote.tokenEnv} is not set`);
    report.suggestions.push(
      `Set ${remote.tokenEnv} in the Sage process environment before running capture diagnostics.`,
    );
    await checkProcesses({
      remoteBaseUrl: remote.baseUrl,
      processProbe: params.processProbe,
      addCheck,
    });
    return finishReport(report);
  }
  addCheck("auth", "pass", `${remote.tokenEnv} is set`);

  const ingest = await ingestDiagnosticSession({
    remoteBaseUrl: remote.baseUrl,
    timeoutMs: remote.timeoutMs,
    fetchImpl,
    token,
    agentId: params.agentId,
    namespace: diagnosticNamespace,
    marker,
    now,
    addCheck,
  });
  if (!ingest) {
    await checkProcesses({
      remoteBaseUrl: remote.baseUrl,
      processProbe: params.processProbe,
      addCheck,
    });
    return finishReport(report);
  }

  const nodeId = await searchDiagnosticSession({
    remoteBaseUrl: remote.baseUrl,
    timeoutMs: remote.timeoutMs,
    fetchImpl,
    namespace: diagnosticNamespace,
    marker,
    sourceUri: ingest.source_uri,
    addCheck,
  });
  if (nodeId) {
    report.nodeId = nodeId;
    report.sessionNodePath = `sage-memory/${nodeId}`;
    await readDiagnosticNode({
      remoteBaseUrl: remote.baseUrl,
      timeoutMs: remote.timeoutMs,
      fetchImpl,
      nodeId,
      addCheck,
    });
  }

  await exportDiagnosticNamespace({
    remoteBaseUrl: remote.baseUrl,
    timeoutMs: remote.timeoutMs,
    fetchImpl,
    token,
    namespace: diagnosticNamespace,
    report,
    addCheck,
  });
  await checkExportedFiles({
    files: report.exportedFiles,
    fileExists: params.fileExists ?? defaultFileExists,
    addCheck,
  });
  await checkProcesses({
    remoteBaseUrl: remote.baseUrl,
    processProbe: params.processProbe,
    addCheck,
  });
  return finishReport(report);
}

function createCheckRecorder(report: SageMemoryDoctorReport) {
  return (
    name: string,
    status: SageMemoryDoctorCheckStatus,
    message: string,
    details?: Record<string, unknown>,
  ) => {
    report.checks.push({ name, status, message, ...(details ? { details } : {}) });
    if (status === "fail") {
      report.failures.push(message);
    }
    if (status === "warn") {
      report.warnings.push(message);
    }
  };
}

async function checkHealth(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  const response = await requestJson<{ status?: string }>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: "/health",
    method: "GET",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
  });
  if (!response.ok) {
    params.addCheck("health", "fail", `/health failed: ${response.error}`);
    return;
  }
  if (response.value.status === "ok") {
    params.addCheck("health", "pass", "/health returned ok");
    return;
  }
  params.addCheck("health", "fail", "/health did not return ok", {
    status: response.value.status,
  });
}

async function checkOpenApi(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  const response = await requestJson<OpenApiResponse>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: "/openapi.json",
    method: "GET",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
  });
  if (!response.ok) {
    params.addCheck("openapi", "fail", `/openapi.json failed: ${response.error}`);
    return;
  }
  const paths = response.value.paths ?? {};
  const missing = REQUIRED_OPENAPI_PATHS.filter((entry) => !(entry in paths));
  if (missing.length > 0) {
    params.addCheck("openapi", "fail", `OpenAPI missing paths: ${missing.join(", ")}`, {
      missing,
    });
    return;
  }
  params.addCheck("openapi", "pass", "OpenAPI exposes required Sage Memory routes");
}

async function ingestDiagnosticSession(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  token: string;
  agentId: string;
  namespace: string;
  marker: string;
  now: Date;
  addCheck: ReturnType<typeof createCheckRecorder>;
}): Promise<IngestResponse | null> {
  const sourceUri = `sage://memory-doctor/${params.marker}`;
  const response = await requestJson<IngestResponse>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: "/v1/ingest/llm-session",
    method: "POST",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
    token: params.token,
    body: {
      namespace: params.namespace,
      source: "other",
      session_id: params.marker,
      title: "Sage Memory Doctor",
      source_uri: sourceUri,
      started_at: params.now.toISOString(),
      ended_at: params.now.toISOString(),
      workspace: { agent_id: params.agentId, diagnostic: true },
      messages: [
        {
          role: "user",
          content: `Sage Memory doctor marker ${params.marker}`,
          timestamp: params.now.toISOString(),
        },
        {
          role: "assistant",
          content: `Diagnostic capture for ${params.agentId}`,
          timestamp: params.now.toISOString(),
        },
      ],
      metadata: {
        capture_method: "sage-memory-doctor",
        source_system: "sage",
        marker: params.marker,
        agentId: params.agentId,
      },
      sensitivity: "private",
    },
  });
  if (!response.ok) {
    params.addCheck("ingest", "fail", `/v1/ingest/llm-session failed: ${response.error}`);
    return null;
  }
  params.addCheck("ingest", "pass", "Diagnostic LLM session ingested", {
    nodeId: response.value.session_node_id,
  });
  return response.value;
}

async function searchDiagnosticSession(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  namespace: string;
  marker: string;
  sourceUri: string;
  addCheck: ReturnType<typeof createCheckRecorder>;
}): Promise<string | null> {
  const response = await requestJson<SearchResponse>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: "/v1/search",
    method: "POST",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
    body: {
      query: params.marker,
      namespace: params.namespace,
      limit: 5,
      mode: "hybrid",
    },
  });
  if (!response.ok) {
    params.addCheck("search", "fail", `/v1/search failed: ${response.error}`);
    return null;
  }
  const result =
    response.value.results?.find((entry) => entry.source_uri === params.sourceUri) ??
    response.value.results?.[0];
  if (!result?.id) {
    params.addCheck("search", "fail", "Diagnostic marker was not searchable");
    return null;
  }
  params.addCheck("search", "pass", "Diagnostic marker was searchable", { nodeId: result.id });
  return result.id;
}

async function readDiagnosticNode(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  nodeId: string;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  const response = await requestJson<unknown>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: `/v1/nodes/${encodeURIComponent(params.nodeId)}`,
    method: "GET",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
  });
  if (!response.ok) {
    params.addCheck("get", "fail", `/v1/nodes/${params.nodeId} failed: ${response.error}`);
    return;
  }
  params.addCheck("get", "pass", "Diagnostic node expanded", { nodeId: params.nodeId });
}

async function exportDiagnosticNamespace(params: {
  remoteBaseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  token: string;
  namespace: string;
  report: SageMemoryDoctorReport;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  const response = await requestJson<ExportWikiResponse>({
    remoteBaseUrl: params.remoteBaseUrl,
    path: "/v1/export/wiki",
    method: "POST",
    timeoutMs: params.timeoutMs,
    fetchImpl: params.fetchImpl,
    token: params.token,
    body: { namespace: params.namespace },
  });
  if (!response.ok) {
    params.addCheck("export", "fail", `/v1/export/wiki failed: ${response.error}`);
    return;
  }
  params.report.exportedFiles = response.value.files ?? [];
  if ((response.value.exported_count ?? 0) <= 0) {
    params.addCheck("export", "warn", "Export route succeeded but reported zero files");
    return;
  }
  params.addCheck("export", "pass", "Diagnostic namespace exported", {
    exportedCount: response.value.exported_count,
  });
}

async function checkExportedFiles(params: {
  files: string[];
  fileExists: FileExistsProbe;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  if (params.files.length === 0) {
    return;
  }
  const missing: string[] = [];
  for (const file of params.files) {
    if (!(await params.fileExists(file))) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    params.addCheck("vault", "fail", `Exported files missing from vault: ${missing.join(", ")}`, {
      missing,
    });
    return;
  }
  params.addCheck("vault", "pass", "Exported files exist in the vault", {
    files: params.files,
  });
}

async function checkProcesses(params: {
  remoteBaseUrl: string;
  processProbe?: ProcessProbe;
  addCheck: ReturnType<typeof createCheckRecorder>;
}) {
  const port = resolveEndpointPort(params.remoteBaseUrl);
  const probe =
    params.processProbe ?? (process.platform === "win32" ? defaultWindowsProcessProbe : undefined);
  if (!probe || !port) {
    return;
  }
  try {
    const result = await probe(port);
    const processIds = [...new Set(result.processIds)].toSorted((a, b) => a - b);
    if (processIds.length > 1) {
      params.addCheck("processes", "warn", `Multiple processes listen on port ${port}`, {
        processIds,
      });
      return;
    }
    params.addCheck("processes", "pass", `No duplicate listeners detected on port ${port}`, {
      processIds,
    });
  } catch (err) {
    params.addCheck("processes", "warn", err instanceof Error ? err.message : String(err));
  }
}

async function requestJson<T>(params: {
  remoteBaseUrl: string;
  path: string;
  method: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  token?: string;
  body?: unknown;
}): Promise<JsonRequestResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  const headers = new Headers();
  headers.set("accept", "application/json");
  if (params.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (params.token) {
    headers.set("authorization", `Bearer ${params.token}`);
  }
  try {
    const response = await params.fetchImpl(`${params.remoteBaseUrl}${params.path}`, {
      method: params.method,
      headers,
      ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: `HTTP ${response.status}: ${text}` };
    }
    return { ok: true, status: response.status, value: (await response.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function defaultWindowsProcessProbe(port: number): Promise<ProcessProbeResult> {
  const command = [
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    "Select-Object -ExpandProperty OwningProcess",
    "Sort-Object -Unique",
    "ConvertTo-Json -Compress",
  ].join(" | ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], {
    windowsHide: true,
  });
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { processIds: [] };
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed === "number") {
    return { processIds: [parsed] };
  }
  if (Array.isArray(parsed)) {
    return { processIds: parsed.filter((entry): entry is number => typeof entry === "number") };
  }
  return { processIds: [] };
}

async function defaultFileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function createDiagnosticMarker(now: Date, suffix: string): string {
  return `sage-memory-doctor-${now.toISOString().replace(/[:.]/g, "-")}-${suffix}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function resolveEndpointPort(baseUrl: string): number | null {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

function finishReport(report: SageMemoryDoctorReport): SageMemoryDoctorReport {
  report.ok = report.failures.length === 0;
  return report;
}
