import type { SageConfig } from "../config/config.js";
import { resolveMemoryBackendConfig, type ResolvedSageMemoryConfig } from "./backend-config.js";
import { SageMemoryManager, type SageMemoryLlmSessionIngestResult } from "./sage-memory-manager.js";
import { loadSageSessionTranscriptForMemory } from "./sage-session-transcript.js";

type SessionIngestManager = {
  ingestLlmSession: SageMemoryManager["ingestLlmSession"];
};

export type SageMemorySessionCaptureResult = {
  namespace: string;
  sourceUri: string;
  sessionNodeId: string;
  sessionNodePath: string;
  evidenceId: string;
  derivedNodeIds: string[];
  deduplicated: boolean;
  eventId: string;
  messageCount: number;
};

export async function captureSageSessionTranscript(params: {
  cfg: SageConfig;
  agentId: string;
  sessionFile: string;
  sessionKey?: string;
  sessionId?: string;
  namespace?: string;
  markdownPath?: string;
  captureMethod?: string;
  metadata?: Record<string, unknown>;
  managerFactory?: (
    config: ResolvedSageMemoryConfig,
  ) => SessionIngestManager | Promise<SessionIngestManager>;
}): Promise<SageMemorySessionCaptureResult> {
  const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId: params.agentId });
  if (resolved.backend !== "sage-memory" || !resolved.remote) {
    throw new Error('sage memory capture-session requires memory.backend = "sage-memory"');
  }

  const namespace = params.namespace?.trim() || resolved.remote.defaultNamespace || "sage.sessions";
  const sessionKey = params.sessionKey?.trim() || params.agentId;
  const payload = await loadSageSessionTranscriptForMemory({
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    sessionKey,
    namespace,
    markdownPath: params.markdownPath,
    captureMethod: params.captureMethod,
    metadata: params.metadata,
  });
  if (!payload) {
    throw new Error(`No usable transcript messages found in ${params.sessionFile}`);
  }

  const manager =
    (await params.managerFactory?.(resolved.remote)) ??
    new SageMemoryManager({ config: resolved.remote });
  const result = await manager.ingestLlmSession(payload);
  return mapCaptureResult(result, namespace, payload.messages.length);
}

function mapCaptureResult(
  result: SageMemoryLlmSessionIngestResult,
  namespace: string,
  messageCount: number,
): SageMemorySessionCaptureResult {
  return {
    namespace,
    sourceUri: result.sourceUri,
    sessionNodeId: result.sessionNodeId,
    sessionNodePath: `sage-memory/${result.sessionNodeId}`,
    evidenceId: result.evidenceId,
    derivedNodeIds: result.derivedNodeIds,
    deduplicated: result.deduplicated,
    eventId: result.eventId,
    messageCount,
  };
}
