import type { SageConfig } from "../config/config.js";
import type { LearningEvent, SageMemoryActivityEventsIngestResult } from "../learning/types.js";
import type { SageOsMemoryDoctorSummary, SageOsStatusSnapshot } from "./types.js";
import {
  replayLearningEventQueue,
  resolveLearningEventQueuePath,
  type LearningEventQueueReplayResult,
} from "../learning/activity-queue.js";
import { resolveMemoryBackendConfig } from "../memory/backend-config.js";
import {
  replaySageMemoryCaptureQueue,
  resolveSageMemoryCaptureQueuePath,
  type SageMemoryCaptureQueueReplayResult,
} from "../memory/sage-memory-capture-queue.js";
import { runSageMemoryDoctor, type SageMemoryDoctorReport } from "../memory/sage-memory-doctor.js";
import { SageMemoryManager } from "../memory/sage-memory-manager.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import { createSageOsStateStore, writeSageOsState } from "./state-store.js";
import { applySageOsMemoryDoctorSummary, collectSageOsStatus } from "./status.js";

export type SageOsMemoryStewardResult = {
  memory: SageMemoryCaptureQueueReplayResult;
  learning: LearningEventQueueReplayResult;
  status: SageOsStatusSnapshot;
};

export type SageOsMemoryDoctorResult = {
  doctor: SageMemoryDoctorReport;
  status: SageOsStatusSnapshot;
};

export type SageOsMemoryStewardDeps = {
  replayMemoryCaptureQueue?: typeof replaySageMemoryCaptureQueue;
  ingestActivityEvents?: (
    events: LearningEvent[],
    namespace?: string,
  ) => Promise<SageMemoryActivityEventsIngestResult>;
};

export type SageOsMemoryDoctorDeps = {
  runMemoryDoctor?: typeof runSageMemoryDoctor;
};

export async function runSageOsMemoryStewardOnce(
  params: {
    cfg: SageConfig;
    agentId?: string;
    stateDir?: string;
    memoryCaptureQueuePath?: string;
    learningActivityQueuePath?: string;
    limit?: number;
    now?: () => Date;
  } & SageOsMemoryStewardDeps,
): Promise<SageOsMemoryStewardResult> {
  const agentId = params.agentId ?? "main";
  const env = params.stateDir ? { ...process.env, SAGE_STATE_DIR: params.stateDir } : undefined;
  const memoryCaptureQueuePath =
    params.memoryCaptureQueuePath ?? resolveSageMemoryCaptureQueuePath({ agentId, env });
  const learningActivityQueuePath =
    params.learningActivityQueuePath ?? resolveLearningEventQueuePath({ agentId, env });

  const replayMemory = params.replayMemoryCaptureQueue ?? replaySageMemoryCaptureQueue;
  const memory = await replayMemory({
    cfg: params.cfg,
    agentId,
    queuePath: memoryCaptureQueuePath,
    limit: params.limit,
    now: params.now,
  });
  const learning = await replayLearningEventQueue({
    queuePath: learningActivityQueuePath,
    agentId,
    namespace: resolveLearningNamespace(params.cfg, agentId),
    limit: params.limit,
    ingest: (events, namespace) =>
      params.ingestActivityEvents
        ? params.ingestActivityEvents(events, namespace)
        : ingestActivityEventsWithSageMemory(params.cfg, agentId, events, namespace),
    now: params.now,
  });

  const failed = memory.failed + learning.failed;
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: failed > 0 ? "memory_steward_replay_failed" : "memory_steward_replayed",
    actor: "sageos.memory_steward",
    summary: `Memory steward replayed queues: memory ${memory.captured}/${memory.attempted} captured, learning ${learning.accepted}/${learning.attempted} accepted, ${failed} failed.`,
    sensitivity: "normal",
  });

  const status = await collectSageOsStatus({
    stateDir: params.stateDir,
    agentId,
    memoryCaptureQueuePath,
    learningActivityQueuePath,
    cfg: params.cfg.sageos,
  });
  await writeSageOsState(createSageOsStateStore({ stateDir: params.stateDir }), status);
  return { memory, learning, status };
}

export async function runSageOsMemoryDoctorOnce(
  params: {
    cfg: SageConfig;
    agentId?: string;
    namespace?: string;
    stateDir?: string;
    memoryCaptureQueuePath?: string;
    learningActivityQueuePath?: string;
    now?: () => Date;
  } & SageOsMemoryDoctorDeps,
): Promise<SageOsMemoryDoctorResult> {
  const agentId = params.agentId ?? "main";
  const checkedAt = params.now?.() ?? new Date();
  const env = params.stateDir ? { ...process.env, SAGE_STATE_DIR: params.stateDir } : undefined;
  const memoryCaptureQueuePath =
    params.memoryCaptureQueuePath ?? resolveSageMemoryCaptureQueuePath({ agentId, env });
  const runDoctor = params.runMemoryDoctor ?? runSageMemoryDoctor;
  const doctor = await runDoctor({
    cfg: params.cfg,
    agentId,
    namespace: params.namespace,
    queuePath: memoryCaptureQueuePath,
    now: () => checkedAt,
  });
  const summary = summarizeSageOsMemoryDoctorReport(doctor, checkedAt);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: doctor.ok ? "memory_doctor_passed" : "memory_doctor_failed",
    actor: "sageos.memory_steward",
    summary: `Memory doctor ${doctor.ok ? "passed" : "failed"}: ${summary.checks} checks, ${summary.failures} failure(s), ${summary.warnings} warning(s), ${summary.exportedFiles.length} wiki export file(s).`,
    sensitivity: "normal",
  });

  const collected = await collectSageOsStatus({
    stateDir: params.stateDir,
    agentId,
    memoryCaptureQueuePath,
    learningActivityQueuePath: params.learningActivityQueuePath,
    cfg: params.cfg.sageos,
  });
  const status = applySageOsMemoryDoctorSummary(collected, summary);
  await writeSageOsState(createSageOsStateStore({ stateDir: params.stateDir }), status);
  return { doctor, status };
}

function summarizeSageOsMemoryDoctorReport(
  report: SageMemoryDoctorReport,
  checkedAt: Date,
): SageOsMemoryDoctorSummary {
  return {
    ok: report.ok,
    checkedAt: checkedAt.toISOString(),
    checks: report.checks.length,
    warnings: report.warnings.length,
    failures: report.failures.length,
    exportedFiles: [...report.exportedFiles],
    ...(report.namespace ? { namespace: report.namespace } : {}),
    ...(report.diagnosticNamespace ? { diagnosticNamespace: report.diagnosticNamespace } : {}),
    ...(report.marker ? { marker: report.marker } : {}),
    ...(report.nodeId ? { nodeId: report.nodeId } : {}),
    ...(report.sessionNodePath ? { sessionNodePath: report.sessionNodePath } : {}),
  };
}

function resolveLearningNamespace(cfg: SageConfig, agentId: string): string | undefined {
  const resolved = resolveMemoryBackendConfig({ cfg, agentId });
  return resolved.remote?.defaultNamespace;
}

async function ingestActivityEventsWithSageMemory(
  cfg: SageConfig,
  agentId: string,
  events: LearningEvent[],
  namespace?: string,
): Promise<SageMemoryActivityEventsIngestResult> {
  const resolved = resolveMemoryBackendConfig({ cfg, agentId });
  if (resolved.backend !== "sage-memory" || !resolved.remote) {
    throw new Error('memory steward requires memory.backend = "sage-memory"');
  }
  const manager = await SageMemoryManager.create({ resolved });
  if (!manager) {
    throw new Error("sage-memory manager is unavailable");
  }
  return await manager.ingestActivityEvents({ events, namespace });
}
