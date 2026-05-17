import fs from "node:fs/promises";
import type { SageConfig } from "../config/config.js";
import { recordSageSessionLearningEvent } from "../learning/session-source.js";
import { resolveMemoryBackendConfig, type ResolvedSageMemoryConfig } from "./backend-config.js";
import {
  enqueueSageMemoryCaptureFailure,
  removeSageMemoryCaptureQueueEntry,
} from "./sage-memory-capture-queue.js";
import { SageMemoryManager } from "./sage-memory-manager.js";
import {
  captureSageSessionTranscript,
  type SageMemorySessionCaptureResult,
} from "./sage-memory-session-capture.js";

type SessionIngestManager = {
  ingestLlmSession: SageMemoryManager["ingestLlmSession"];
};

type TimerLike = {
  unref?: () => void;
};

type ScheduleCapture = (run: () => void) => TimerLike | undefined | void;

export type SageMemoryAutoCaptureResult =
  | {
      status: "captured";
      key: string;
      result: SageMemorySessionCaptureResult;
    }
  | {
      status: "skipped";
      reason: "backend-disabled" | "missing-session-file" | "empty-transcript" | "deduped";
      key?: string;
    }
  | {
      status: "failed";
      reason: string;
      key?: string;
    };

export type SageMemoryAutoCaptureScheduleResult =
  | {
      status: "scheduled";
      key: string;
    }
  | {
      status: "skipped";
      reason: "backend-disabled" | "missing-session-file" | "deduped" | "schedule-failed";
      key?: string;
    };

export type SageMemoryAutoCaptureParams = {
  cfg: SageConfig;
  agentId: string;
  sessionFile?: string;
  sessionKey?: string;
  sessionId?: string;
  workspace?: string;
  namespace?: string;
  captureMethod: string;
  metadata?: Record<string, unknown>;
  queuePath?: string;
  learningQueuePath?: string;
  managerFactory?: (
    config: ResolvedSageMemoryConfig,
  ) => SessionIngestManager | Promise<SessionIngestManager>;
  logger?: (message: string) => void;
  nowMs?: () => number;
  dedupeTtlMs?: number;
};

type ReservedCaptureParams = SageMemoryAutoCaptureParams & {
  reservedKey?: string;
};

const DEFAULT_DEDUPE_TTL_MS = 5 * 60_000;
const inFlightCaptures = new Map<string, Promise<SageMemoryAutoCaptureResult>>();
const recentCaptures = new Map<string, number>();
const reservedCaptures = new Map<string, number>();

export async function captureSageSessionTranscriptBestEffort(
  params: SageMemoryAutoCaptureParams,
): Promise<SageMemoryAutoCaptureResult> {
  return captureSageSessionTranscriptBestEffortReserved(params);
}

export function scheduleSageSessionTranscriptCapture(
  params: SageMemoryAutoCaptureParams & {
    schedule?: ScheduleCapture;
  },
): SageMemoryAutoCaptureScheduleResult {
  if (!isSageMemoryBackend(params)) {
    return { status: "skipped", reason: "backend-disabled" };
  }
  const sessionFile = params.sessionFile?.trim();
  if (!sessionFile) {
    return { status: "skipped", reason: "missing-session-file" };
  }

  const nowMs = params.nowMs?.() ?? Date.now();
  const key = makeCaptureKey({ ...params, sessionFile });
  const reserved = reserveCaptureKey({
    key,
    nowMs,
    dedupeTtlMs: params.dedupeTtlMs,
  });
  if (!reserved) {
    return { status: "skipped", reason: "deduped", key };
  }

  const run = () => {
    void captureSageSessionTranscriptBestEffortReserved({
      ...params,
      sessionFile,
      reservedKey: key,
    }).then((result) => {
      if (result.status === "captured") {
        params.logger?.(
          `sage-memory auto capture ${params.captureMethod} captured ${result.result.sessionNodePath}`,
        );
      } else if (result.status === "failed") {
        params.logger?.(
          `sage-memory auto capture ${params.captureMethod} failed: ${result.reason}`,
        );
      }
    });
  };

  try {
    const timer = params.schedule ? params.schedule(run) : setTimeout(run, 0);
    timer?.unref?.();
  } catch {
    reservedCaptures.delete(key);
    return { status: "skipped", reason: "schedule-failed", key };
  }
  return { status: "scheduled", key };
}

export function resetSageMemoryAutoCaptureStateForTests() {
  inFlightCaptures.clear();
  recentCaptures.clear();
  reservedCaptures.clear();
}

async function captureSageSessionTranscriptBestEffortReserved(
  params: ReservedCaptureParams,
): Promise<SageMemoryAutoCaptureResult> {
  if (!isSageMemoryBackend(params)) {
    return { status: "skipped", reason: "backend-disabled" };
  }
  const sessionFile = params.sessionFile?.trim();
  if (!sessionFile || !(await fileExists(sessionFile))) {
    return { status: "skipped", reason: "missing-session-file" };
  }

  const nowMs = params.nowMs?.() ?? Date.now();
  const key = params.reservedKey ?? makeCaptureKey({ ...params, sessionFile });
  if (!params.reservedKey) {
    const reserved = reserveCaptureKey({
      key,
      nowMs,
      dedupeTtlMs: params.dedupeTtlMs,
    });
    if (!reserved) {
      return { status: "skipped", reason: "deduped", key };
    }
  }

  const capturePromise = runCapture({ ...params, sessionFile, key });
  inFlightCaptures.set(key, capturePromise);
  let result: SageMemoryAutoCaptureResult | undefined;
  try {
    result = await capturePromise;
    return result;
  } finally {
    inFlightCaptures.delete(key);
    reservedCaptures.delete(key);
    if (result?.status === "captured") {
      recentCaptures.set(key, params.nowMs?.() ?? Date.now());
    }
  }
}

async function runCapture(
  params: ReservedCaptureParams & {
    sessionFile: string;
    key: string;
  },
): Promise<SageMemoryAutoCaptureResult> {
  try {
    const result = await captureSageSessionTranscript({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      namespace: params.namespace,
      captureMethod: params.captureMethod,
      metadata: params.metadata,
      managerFactory: params.managerFactory,
    });
    await removeSageMemoryCaptureQueueEntry({
      queuePath: params.queuePath,
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      captureMethod: params.captureMethod,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      params.logger?.(`sage-memory auto capture queue cleanup failed: ${message}`);
    });
    await recordSageSessionLearningEvent({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      workspace: params.workspace,
      captureMethod: params.captureMethod,
      metadata: params.metadata,
      captureResult: result,
      queuePath: params.learningQueuePath,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      params.logger?.(`sage learning session event queue failed: ${message}`);
    });
    return { status: "captured", key: params.key, result };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.includes("No usable transcript messages found")) {
      return { status: "skipped", reason: "empty-transcript", key: params.key };
    }
    await enqueueSageMemoryCaptureFailure({
      queuePath: params.queuePath,
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      namespace: params.namespace,
      captureMethod: params.captureMethod,
      metadata: params.metadata,
      error: reason,
      now: () => new Date(params.nowMs?.() ?? Date.now()),
    });
    params.logger?.(`sage-memory auto capture ${params.captureMethod} failed: ${reason}`);
    return { status: "failed", reason, key: params.key };
  }
}

function isSageMemoryBackend(params: Pick<SageMemoryAutoCaptureParams, "cfg" | "agentId">) {
  const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId: params.agentId });
  return resolved.backend === "sage-memory" && Boolean(resolved.remote);
}

function makeCaptureKey(params: {
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  captureMethod: string;
}) {
  return [
    params.sessionFile,
    params.sessionId?.trim() ?? "",
    params.sessionKey?.trim() ?? "",
    params.captureMethod.trim(),
  ].join("|");
}

function reserveCaptureKey(params: { key: string; nowMs: number; dedupeTtlMs?: number }) {
  const ttlMs = Math.max(0, params.dedupeTtlMs ?? DEFAULT_DEDUPE_TTL_MS);
  pruneOldEntries(params.nowMs, ttlMs);
  if (inFlightCaptures.has(params.key)) {
    return false;
  }
  const recentAt = recentCaptures.get(params.key);
  if (typeof recentAt === "number" && params.nowMs - recentAt < ttlMs) {
    return false;
  }
  const reservedAt = reservedCaptures.get(params.key);
  if (typeof reservedAt === "number" && params.nowMs - reservedAt < ttlMs) {
    return false;
  }
  reservedCaptures.set(params.key, params.nowMs);
  return true;
}

function pruneOldEntries(nowMs: number, ttlMs: number) {
  for (const [key, value] of recentCaptures) {
    if (nowMs - value >= ttlMs) {
      recentCaptures.delete(key);
    }
  }
  for (const [key, value] of reservedCaptures) {
    if (nowMs - value >= ttlMs) {
      reservedCaptures.delete(key);
    }
  }
}

async function fileExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
