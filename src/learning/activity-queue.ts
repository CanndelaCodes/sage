import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LearningEvent, SageMemoryActivityEventsIngestResult } from "./types.js";
import { resolveStateDir } from "../config/paths.js";

export type LearningEventQueueStatus = "pending" | "failed";

export type LearningEventQueueEntry = {
  id: string;
  status: LearningEventQueueStatus;
  event: LearningEvent;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export type LearningEventQueueSummary = {
  path: string;
  counts: {
    total: number;
    pending: number;
    failed: number;
  };
  entries: LearningEventQueueEntry[];
};

export type LearningEventQueueReplayResult = {
  attempted: number;
  accepted: number;
  failed: number;
  remaining: number;
  result?: SageMemoryActivityEventsIngestResult;
};

type QueueFile = {
  version: 1;
  entries: LearningEventQueueEntry[];
};

const queueLocks = new Map<string, Promise<unknown>>();

export function resolveLearningEventQueuePath(params: {
  agentId?: string;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}) {
  const stateDir = resolveStateDir(params.env ?? process.env, params.homedir ?? os.homedir);
  return path.join(stateDir, "agents", params.agentId ?? "main", "learning", "activity-queue.json");
}

export async function enqueueLearningEvents(params: {
  queuePath?: string;
  agentId?: string;
  events: LearningEvent[];
  now?: () => Date;
}): Promise<{ created: number; skipped: number }> {
  const queuePath = params.queuePath ?? resolveLearningEventQueuePath({ agentId: params.agentId });
  const now = (params.now?.() ?? new Date()).toISOString();
  let created = 0;
  let skipped = 0;
  await updateQueue(queuePath, (store) => {
    const hashes = new Set(store.entries.map((entry) => entry.event.activityHash));
    for (const event of params.events) {
      if (hashes.has(event.activityHash)) {
        skipped += 1;
        continue;
      }
      hashes.add(event.activityHash);
      store.entries.push({
        id: createQueueEntryId(event),
        status: "pending",
        event,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
  });
  return { created, skipped };
}

export async function listLearningEventQueue(params: {
  queuePath?: string;
  agentId?: string;
}): Promise<LearningEventQueueSummary> {
  const queuePath = params.queuePath ?? resolveLearningEventQueuePath({ agentId: params.agentId });
  const store = await loadQueue(queuePath);
  const entries = store.entries.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    path: queuePath,
    counts: {
      total: entries.length,
      pending: entries.filter((entry) => entry.status === "pending").length,
      failed: entries.filter((entry) => entry.status === "failed").length,
    },
    entries,
  };
}

export async function replayLearningEventQueue(params: {
  queuePath?: string;
  agentId?: string;
  namespace?: string;
  limit?: number;
  ingest: (
    events: LearningEvent[],
    namespace?: string,
  ) => Promise<SageMemoryActivityEventsIngestResult>;
  now?: () => Date;
}): Promise<LearningEventQueueReplayResult> {
  const queuePath = params.queuePath ?? resolveLearningEventQueuePath({ agentId: params.agentId });
  const store = await loadQueue(queuePath);
  const limit = Math.max(0, params.limit ?? Number.POSITIVE_INFINITY);
  const candidates = store.entries.slice(0, limit);
  if (candidates.length === 0) {
    return { attempted: 0, accepted: 0, failed: 0, remaining: 0 };
  }
  try {
    const result = await params.ingest(
      candidates.map((entry) => entry.event),
      params.namespace,
    );
    const accepted = new Set(result.eventIds);
    await updateQueue(queuePath, (current) => {
      current.entries = current.entries.filter((entry) => !accepted.has(entry.event.id));
    });
    const remaining = (await listLearningEventQueue({ queuePath })).counts.total;
    return {
      attempted: candidates.length,
      accepted: accepted.size,
      failed: candidates.length - accepted.size,
      remaining,
      result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = (params.now?.() ?? new Date()).toISOString();
    await updateQueue(queuePath, (current) => {
      const ids = new Set(candidates.map((entry) => entry.id));
      for (const entry of current.entries) {
        if (!ids.has(entry.id)) {
          continue;
        }
        entry.status = "failed";
        entry.attempts += 1;
        entry.updatedAt = now;
        entry.lastAttemptAt = now;
        entry.lastError = message;
      }
    });
    const remaining = (await listLearningEventQueue({ queuePath })).counts.total;
    return { attempted: candidates.length, accepted: 0, failed: candidates.length, remaining };
  }
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
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isQueueEntry) : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function saveQueue(queuePath: string, store: QueueFile): Promise<void> {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  const body = `${JSON.stringify({ version: 1, entries: store.entries }, null, 2)}\n`;
  if (process.platform === "win32") {
    await fs.writeFile(queuePath, body, "utf-8");
    return;
  }
  const tmp = `${queuePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, body, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tmp, queuePath);
    await fs.chmod(queuePath, 0o600);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

function createQueueEntryId(event: LearningEvent): string {
  return crypto.createHash("sha256").update(event.activityHash).digest("hex").slice(0, 32);
}

function isQueueEntry(input: unknown): input is LearningEventQueueEntry {
  const entry = input as Partial<LearningEventQueueEntry>;
  return (
    !!entry &&
    typeof entry.id === "string" &&
    (entry.status === "pending" || entry.status === "failed") &&
    typeof entry.event?.id === "string" &&
    typeof entry.event?.activityHash === "string" &&
    typeof entry.attempts === "number" &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string"
  );
}
