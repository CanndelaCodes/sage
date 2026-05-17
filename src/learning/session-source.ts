import type { SageConfig } from "../config/config.js";
import type { SageMemorySessionCaptureResult } from "../memory/sage-memory-session-capture.js";
import { enqueueLearningEvents } from "./activity-queue.js";
import { normalizeLearningEvent } from "./events.js";

export type SageSessionLearningRecordResult =
  | { status: "queued"; created: number; skipped: number }
  | { status: "skipped"; reason: "disabled" };

export async function recordSageSessionLearningEvent(params: {
  cfg: SageConfig;
  agentId: string;
  sessionFile: string;
  sessionId?: string;
  sessionKey?: string;
  workspace?: string;
  captureMethod: string;
  metadata?: Record<string, unknown>;
  captureResult: SageMemorySessionCaptureResult;
  queuePath?: string;
  now?: () => Date;
}): Promise<SageSessionLearningRecordResult> {
  if (
    params.cfg.learning?.enabled !== true ||
    params.cfg.learning.sources?.sageSessions === false
  ) {
    return { status: "skipped", reason: "disabled" };
  }

  const title = `Sage session ${params.sessionKey?.trim() || params.sessionId?.trim() || params.agentId}`;
  const event = normalizeLearningEvent(
    {
      source: "sage_session",
      actor: `agent:${params.agentId}`,
      sessionKey: params.sessionKey,
      workspace: params.workspace,
      title,
      text: `Sage session transcript captured by ${params.captureMethod} with ${params.captureResult.messageCount} messages.`,
      payload: {
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
        captureMethod: params.captureMethod,
        messageCount: params.captureResult.messageCount,
        namespace: params.captureResult.namespace,
        sourceUri: params.captureResult.sourceUri,
        sessionNodeId: params.captureResult.sessionNodeId,
        derivedNodeIds: params.captureResult.derivedNodeIds,
        deduplicated: params.captureResult.deduplicated,
        metadata: params.metadata ?? {},
      },
      provenance: {
        captureMethod: params.captureMethod,
        evidenceIds: [params.captureResult.evidenceId],
        activityNodeIds: [
          params.captureResult.sessionNodeId,
          ...params.captureResult.derivedNodeIds,
        ],
        eventId: params.captureResult.eventId,
      },
    },
    { now: params.now },
  );
  const queued = await enqueueLearningEvents({
    queuePath: params.queuePath,
    agentId: params.agentId,
    events: [event],
  });
  return { status: "queued", ...queued };
}
