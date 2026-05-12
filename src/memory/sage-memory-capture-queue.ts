import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SageConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { type ResolvedSageMemoryConfig } from "./backend-config.js";
import { SageMemoryManager } from "./sage-memory-manager.js";
import {
  captureSageSessionTranscript,
  type SageMemorySessionCaptureResult,
} from "./sage-memory-session-capture.js";

type SessionIngestManager = {
  ingestLlmSession: SageMemoryManager["ingestLlmSession"];
};

export type SageMemoryCaptureQueueStatus = "pending" | "failed";

export type SageMemoryCaptureQueueEntry = {
  id: string;
  status: SageMemoryCaptureQueueStatus;
  agentId: string;
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  namespace?: string;
  captureMethod: string;
  metadata?: Record<string, unknown>;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export type SageMemoryCaptureQueueSummary = {
  path: string;
  counts: {
    total: number;
    pending: number;
    failed: number;
  };
  entries: SageMemoryCaptureQueueEntry[];
};

export type SageMemoryCaptureQueueReplayResult = {
  attempted: number;
  captured: number;
  failed: number;
  remaining: number;
  results: Array<
    | {
        id: string;
        status: "captured";
        sessionNodePath: string;
      }
    | {
        id: string;
        status: "failed";
        error: string;
      }
  >;
};

type QueueFile = {
  version: 1;
  entries: SageMemoryCaptureQueueEntry[];
};

const queueLocks = new Map<string, Promise<unknown>>();

export function resolveSageMemoryCaptureQueuePath(params: {
  agentId: string;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}) {
  const stateDir = resolveStateDir(params.env ?? process.env, params.homedir ?? os.homedir);
  return path.join(stateDir, "agents", params.agentId, "sage-memory", "capture-queue.json");
}

export async function enqueueSageMemoryCaptureFailure(params: {
  queuePath?: string;
  agentId: string;
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  namespace?: string;
  captureMethod: string;
  metadata?: Record<string, unknown>;
  error: string;
  now?: () => Date;
}): Promise<{ created: boolean; entry: SageMemoryCaptureQueueEntry }> {
  const queuePath =
    params.queuePath ?? resolveSageMemoryCaptureQueuePath({ agentId: params.agentId });
  const now = (params.now?.() ?? new Date()).toISOString();
  const id = createQueueEntryId({
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    captureMethod: params.captureMethod,
  });
  return await updateQueue(queuePath, (store) => {
    const existing = store.entries.find((entry) => entry.id === id);
    if (existing) {
      existing.status = "pending";
      existing.updatedAt = now;
      existing.lastError = params.error;
      existing.agentId = params.agentId;
      existing.sessionFile = params.sessionFile;
      existing.sessionId = optionalTrim(params.sessionId);
      existing.sessionKey = optionalTrim(params.sessionKey);
      existing.namespace = optionalTrim(params.namespace);
      existing.captureMethod = params.captureMethod;
      existing.metadata = params.metadata;
      return { created: false, entry: structuredClone(existing) };
    }
    const entry: SageMemoryCaptureQueueEntry = {
      id,
      status: "pending",
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      ...(optionalTrim(params.sessionId) ? { sessionId: optionalTrim(params.sessionId) } : {}),
      ...(optionalTrim(params.sessionKey) ? { sessionKey: optionalTrim(params.sessionKey) } : {}),
      ...(optionalTrim(params.namespace) ? { namespace: optionalTrim(params.namespace) } : {}),
      captureMethod: params.captureMethod,
      ...(params.metadata ? { metadata: params.metadata } : {}),
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      lastError: params.error,
    };
    store.entries.push(entry);
    return { created: true, entry: structuredClone(entry) };
  });
}

export async function removeSageMemoryCaptureQueueEntry(params: {
  queuePath?: string;
  agentId: string;
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  captureMethod: string;
}): Promise<boolean> {
  const queuePath =
    params.queuePath ?? resolveSageMemoryCaptureQueuePath({ agentId: params.agentId });
  const id = createQueueEntryId({
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    captureMethod: params.captureMethod,
  });
  return await withQueueLock(queuePath, async () => {
    const store = await loadQueue(queuePath);
    const next = store.entries.filter((entry) => entry.id !== id);
    if (next.length === store.entries.length) {
      return false;
    }
    store.entries = next;
    await saveQueue(queuePath, store);
    return true;
  });
}

export async function listSageMemoryCaptureQueue(params: {
  queuePath?: string;
  agentId?: string;
}): Promise<SageMemoryCaptureQueueSummary> {
  const queuePath =
    params.queuePath ??
    resolveSageMemoryCaptureQueuePath({
      agentId: params.agentId ?? "main",
    });
  const store = await loadQueue(queuePath);
  return summarizeQueue(queuePath, store.entries);
}

export async function replaySageMemoryCaptureQueue(params: {
  cfg: SageConfig;
  agentId: string;
  queuePath?: string;
  limit?: number;
  managerFactory?: (
    config: ResolvedSageMemoryConfig,
  ) => SessionIngestManager | Promise<SessionIngestManager>;
  now?: () => Date;
}): Promise<SageMemoryCaptureQueueReplayResult> {
  const queuePath =
    params.queuePath ?? resolveSageMemoryCaptureQueuePath({ agentId: params.agentId });
  const store = await loadQueue(queuePath);
  const limit = Math.max(0, params.limit ?? Number.POSITIVE_INFINITY);
  const candidates = store.entries
    .filter((entry) => entry.agentId === params.agentId)
    .slice(0, limit);
  let captured = 0;
  let failed = 0;
  const results: SageMemoryCaptureQueueReplayResult["results"] = [];

  for (const entry of candidates) {
    try {
      const result = await replayEntry(params.cfg, entry, params.managerFactory);
      captured += 1;
      results.push({
        id: entry.id,
        status: "captured",
        sessionNodePath: result.sessionNodePath,
      });
      await updateQueue(queuePath, (current) => {
        current.entries = current.entries.filter((candidate) => candidate.id !== entry.id);
      });
    } catch (err) {
      failed += 1;
      const error = formatErrorMessage(err);
      results.push({ id: entry.id, status: "failed", error });
      const now = (params.now?.() ?? new Date()).toISOString();
      await updateQueue(queuePath, (current) => {
        const currentEntry = current.entries.find((candidate) => candidate.id === entry.id);
        if (!currentEntry) {
          return;
        }
        currentEntry.status = "failed";
        currentEntry.attempts += 1;
        currentEntry.updatedAt = now;
        currentEntry.lastAttemptAt = now;
        currentEntry.lastError = error;
      });
    }
  }

  const remaining = (await listSageMemoryCaptureQueue({ queuePath })).counts.total;
  return {
    attempted: candidates.length,
    captured,
    failed,
    remaining,
    results,
  };
}

async function replayEntry(
  cfg: SageConfig,
  entry: SageMemoryCaptureQueueEntry,
  managerFactory?: (
    config: ResolvedSageMemoryConfig,
  ) => SessionIngestManager | Promise<SessionIngestManager>,
): Promise<SageMemorySessionCaptureResult> {
  return await captureSageSessionTranscript({
    cfg,
    agentId: entry.agentId,
    sessionFile: entry.sessionFile,
    sessionId: entry.sessionId,
    sessionKey: entry.sessionKey,
    namespace: entry.namespace,
    captureMethod: entry.captureMethod,
    metadata: entry.metadata,
    managerFactory,
  });
}

function summarizeQueue(
  queuePath: string,
  entries: SageMemoryCaptureQueueEntry[],
): SageMemoryCaptureQueueSummary {
  const sorted = entries.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    path: queuePath,
    counts: {
      total: sorted.length,
      pending: sorted.filter((entry) => entry.status === "pending").length,
      failed: sorted.filter((entry) => entry.status === "failed").length,
    },
    entries: sorted,
  };
}

async function updateQueue<T>(
  queuePath: string,
  update: (store: QueueFile) => T | Promise<T>,
): Promise<T> {
  return await withQueueLock(queuePath, async () => {
    const store = await loadQueue(queuePath);
    const result = await update(store);
    await saveQueue(queuePath, store);
    return result;
  });
}

async function withQueueLock<T>(queuePath: string, run: () => Promise<T>): Promise<T> {
  const previous = queueLocks.get(queuePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  const keepAlive = current.then(
    () => undefined,
    () => undefined,
  );
  queueLocks.set(queuePath, keepAlive);
  try {
    return await current;
  } finally {
    if (queueLocks.get(queuePath) === keepAlive) {
      queueLocks.delete(queuePath);
    }
  }
}

async function loadQueue(queuePath: string): Promise<QueueFile> {
  try {
    const raw = await fs.readFile(queuePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<QueueFile>;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.filter(isQueueEntry).map(normalizeQueueEntry)
        : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function saveQueue(queuePath: string, store: QueueFile): Promise<void> {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  const json = `${JSON.stringify({ version: 1, entries: store.entries }, null, 2)}\n`;
  if (process.platform === "win32") {
    await fs.writeFile(queuePath, json, "utf-8");
    return;
  }
  const tmp = `${queuePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, json, { mode: 0o600, encoding: "utf-8" });
    await fs.rename(tmp, queuePath);
    await fs.chmod(queuePath, 0o600);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

function createQueueEntryId(params: {
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  captureMethod: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        params.sessionFile,
        optionalTrim(params.sessionId) ?? "",
        optionalTrim(params.sessionKey) ?? "",
        params.captureMethod.trim(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

function isQueueEntry(value: unknown): value is SageMemoryCaptureQueueEntry {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { agentId?: unknown }).agentId === "string" &&
    typeof (value as { sessionFile?: unknown }).sessionFile === "string" &&
    typeof (value as { captureMethod?: unknown }).captureMethod === "string",
  );
}

function normalizeQueueEntry(entry: SageMemoryCaptureQueueEntry): SageMemoryCaptureQueueEntry {
  const status = entry.status === "failed" ? "failed" : "pending";
  return {
    ...entry,
    status,
    attempts: Number.isFinite(entry.attempts) ? Math.max(0, entry.attempts) : 0,
    createdAt: entry.createdAt || new Date(0).toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date(0).toISOString(),
  };
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
