import type {
  SageOsAutonomyMode,
  SageOsCollaborationEvent,
  SageOsPolicyScope,
  SageOsTaskSpec,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  upsertSageOsCollaboration,
  upsertSageOsTask,
  type SageOsStateStore,
} from "./state-store.js";

export type SageOsTaskHandoffResult = {
  outcome: "created";
  collaboration: SageOsCollaborationEvent;
  task: SageOsTaskSpec;
};

export type SageOsReviewRequestResult = {
  outcome: "created";
  collaboration: SageOsCollaborationEvent;
};

export async function createSageOsTaskHandoff(params: {
  fromAgentId: string;
  toAgentId: string;
  title: string;
  objective: string;
  policyScopes?: SageOsPolicyScope[];
  autonomyTier?: SageOsAutonomyMode;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now?: () => Date;
}): Promise<SageOsTaskHandoffResult> {
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const nowIso = (params.now?.() ?? new Date()).toISOString();
  const taskId = `task_handoff_${slugify(params.fromAgentId)}_${slugify(params.toAgentId)}_${slugify(
    params.title,
  )}`;
  const task: SageOsTaskSpec = {
    id: taskId,
    title: params.title.trim(),
    objective: params.objective.trim(),
    state: "proposed",
    ownerAgentId: params.toAgentId.trim(),
    requestedBy: `agent:${params.fromAgentId.trim()}`,
    autonomyTier: params.autonomyTier ?? "suggest",
    policyScopes: params.policyScopes ?? [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const collaboration: SageOsCollaborationEvent = {
    id: `collab_handoff_${slugify(params.fromAgentId)}_${slugify(params.toAgentId)}_${slugify(
      params.title,
    )}`,
    kind: "handoff",
    fromAgentId: params.fromAgentId.trim(),
    toAgentId: params.toAgentId.trim(),
    taskId,
    title: params.title.trim(),
    summary: `Task handoff from ${params.fromAgentId.trim()} to ${params.toAgentId.trim()}: ${params.objective.trim()}`,
    artifactRefs: [],
    state: "open",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await upsertSageOsTask(stateStore, task);
  await upsertSageOsCollaboration(stateStore, collaboration);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "collaboration_handoff",
    actor: params.fromAgentId.trim(),
    summary: collaboration.summary,
    taskId,
    sensitivity: "normal",
  });

  return { outcome: "created", collaboration, task };
}

export async function requestSageOsReview(params: {
  fromAgentId: string;
  reviewerAgentId: string;
  title: string;
  summary: string;
  taskId?: string;
  artifactRefs?: string[];
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now?: () => Date;
}): Promise<SageOsReviewRequestResult> {
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const nowIso = (params.now?.() ?? new Date()).toISOString();
  const collaboration: SageOsCollaborationEvent = {
    id: `collab_review_${slugify(params.fromAgentId)}_${slugify(params.reviewerAgentId)}_${slugify(
      params.taskId ?? params.title,
    )}`,
    kind: "review_request",
    fromAgentId: params.fromAgentId.trim(),
    toAgentId: params.reviewerAgentId.trim(),
    taskId: params.taskId?.trim() || undefined,
    title: params.title.trim(),
    summary: params.summary.trim(),
    artifactRefs: params.artifactRefs?.map((ref) => ref.trim()).filter(Boolean) ?? [],
    state: "open",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await upsertSageOsCollaboration(stateStore, collaboration);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "collaboration_review_requested",
    actor: params.fromAgentId.trim(),
    summary: `Review requested from ${params.reviewerAgentId.trim()}: ${params.summary.trim()}`,
    taskId: collaboration.taskId,
    sensitivity: "normal",
  });

  return { outcome: "created", collaboration };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "item";
}
