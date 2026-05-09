/**
 * E2B cloud sandbox integration.
 *
 * E2B (https://e2b.dev) provides cloud-based sandboxed code execution.
 * This module integrates E2B as an optional alternative to local containers
 * for environments where Docker/Podman aren't available or when cloud
 * execution is preferred.
 *
 * Requires: SAGE_E2B_API_KEY environment variable.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("sandbox/e2b");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type E2BSandboxConfig = {
  /** E2B API key. Falls back to SAGE_E2B_API_KEY env var. */
  apiKey?: string;
  /** E2B sandbox template ID (default: base). */
  template?: string;
  /** Sandbox timeout in seconds (default: 300). */
  timeoutSeconds?: number;
  /** CPU count (default: 2). */
  cpus?: number;
  /** Memory in MB (default: 512). */
  memoryMb?: number;
};

export type E2BSandboxInstance = {
  sandboxId: string;
  status: "running" | "stopped" | "error";
  template: string;
  createdAt: number;
};

export type E2BExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
};

export type E2BDeps = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_E2B_TEMPLATE = "base";
const DEFAULT_E2B_TIMEOUT_SECONDS = 300;
const DEFAULT_E2B_BASE_URL = "https://api.e2b.dev";
const E2B_API_KEY_ENV = "SAGE_E2B_API_KEY";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function resolveApiKey(deps?: E2BDeps): string | null {
  return deps?.apiKey ?? process.env[E2B_API_KEY_ENV]?.trim() ?? null;
}

function resolveBaseUrl(deps?: E2BDeps): string {
  return deps?.baseUrl ?? DEFAULT_E2B_BASE_URL;
}

async function e2bRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  deps?: E2BDeps,
): Promise<T> {
  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    throw new Error(
      `E2B API key not configured. Set ${E2B_API_KEY_ENV} environment variable or config.`,
    );
  }

  const fetchImpl = deps?.fetch ?? globalThis.fetch;
  const baseUrl = resolveBaseUrl(deps);
  const url = `${baseUrl}${path}`;

  const response = await fetchImpl(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-E2B-Api-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`E2B API error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if E2B integration is available (API key configured).
 */
export function isE2BAvailable(deps?: E2BDeps): boolean {
  return resolveApiKey(deps) !== null;
}

/**
 * Create a new E2B cloud sandbox.
 */
export async function createE2BSandbox(
  config?: E2BSandboxConfig,
  deps?: E2BDeps,
): Promise<E2BSandboxInstance> {
  const template = config?.template ?? DEFAULT_E2B_TEMPLATE;
  const timeout = config?.timeoutSeconds ?? DEFAULT_E2B_TIMEOUT_SECONDS;

  log.info("creating E2B sandbox", { template, timeout });

  const result = await e2bRequest<{
    sandboxID: string;
    templateID: string;
    clientID: string;
  }>(
    "POST",
    "/sandboxes",
    {
      templateID: template,
      timeout,
      metadata: {
        source: "sage-vde",
      },
    },
    deps,
  );

  return {
    sandboxId: result.sandboxID,
    status: "running",
    template,
    createdAt: Date.now(),
  };
}

/**
 * Execute a command in an E2B sandbox.
 */
export async function execInE2BSandbox(
  sandboxId: string,
  command: string,
  opts?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  },
  deps?: E2BDeps,
): Promise<E2BExecResult> {
  const result = await e2bRequest<{
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
  }>(
    "POST",
    `/sandboxes/${sandboxId}/commands`,
    {
      command,
      cwd: opts?.cwd,
      envVars: opts?.env,
      timeout: opts?.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : undefined,
    },
    deps,
  );

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? 0,
    error: result.error,
  };
}

/**
 * Stop and destroy an E2B sandbox.
 */
export async function destroyE2BSandbox(
  sandboxId: string,
  deps?: E2BDeps,
): Promise<void> {
  log.info("destroying E2B sandbox", { sandboxId });
  await e2bRequest("DELETE", `/sandboxes/${sandboxId}`, undefined, deps);
}

/**
 * List active E2B sandboxes.
 */
export async function listE2BSandboxes(
  deps?: E2BDeps,
): Promise<E2BSandboxInstance[]> {
  const result = await e2bRequest<
    Array<{
      sandboxID: string;
      templateID: string;
      startedAt: string;
      metadata?: Record<string, string>;
    }>
  >("GET", "/sandboxes", undefined, deps);

  return result
    .filter((s) => s.metadata?.source === "sage-vde")
    .map((s) => ({
      sandboxId: s.sandboxID,
      status: "running" as const,
      template: s.templateID,
      createdAt: new Date(s.startedAt).getTime(),
    }));
}

/**
 * Write a file into an E2B sandbox.
 */
export async function writeFileToE2BSandbox(
  sandboxId: string,
  filePath: string,
  content: string,
  deps?: E2BDeps,
): Promise<void> {
  await e2bRequest(
    "POST",
    `/sandboxes/${sandboxId}/filesystem`,
    { path: filePath, content },
    deps,
  );
}

/**
 * Read a file from an E2B sandbox.
 */
export async function readFileFromE2BSandbox(
  sandboxId: string,
  filePath: string,
  deps?: E2BDeps,
): Promise<string> {
  const result = await e2bRequest<{ content: string }>(
    "GET",
    `/sandboxes/${sandboxId}/filesystem?path=${encodeURIComponent(filePath)}`,
    undefined,
    deps,
  );
  return result.content;
}
