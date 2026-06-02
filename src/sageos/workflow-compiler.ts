import type {
  SageOsConfig,
  SageOsObservation,
  SageOsPolicyScope,
  SageOsStatusSnapshot,
  SageOsWorkflow,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsWorkflow,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsWorkflowCandidateDiscoveryResult = {
  observed: number;
  created: number;
  skipped: number;
  candidates: SageOsWorkflow[];
  status: SageOsStatusSnapshot;
};

export async function discoverSageOsWorkflowCandidates(
  params: {
    stateDir?: string;
    minOccurrences?: number;
    now?: Date;
    cfg?: SageOsConfig;
  } = {},
): Promise<SageOsWorkflowCandidateDiscoveryResult> {
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const minOccurrences = Math.max(2, Math.floor(params.minOccurrences ?? 2));
  const now = (params.now ?? new Date()).toISOString();
  const captured = state.observations.filter((observation) => observation.state === "captured");
  const eligible = captured.filter((observation) => observation.sensitivity !== "secret");
  const skipped = captured.length - eligible.length;
  const existingIds = new Set(state.workflows.map((workflow) => workflow.id));
  const groups = groupEligibleObservations(eligible);
  const candidates: SageOsWorkflow[] = [];

  for (const group of groups.values()) {
    if (group.observations.length < minOccurrences || existingIds.has(group.id)) {
      continue;
    }
    const workflow = workflowFromGroup(group, now);
    await upsertSageOsWorkflow(store, workflow);
    existingIds.add(workflow.id);
    candidates.push(workflow);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "workflow_candidate_created",
      actor: "sageos.workflow_compiler",
      summary: `Created SageOS workflow candidate ${workflow.id}: ${workflow.name}`,
      sensitivity: "normal",
    });
  }

  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(store, status);
  return {
    observed: captured.length,
    created: candidates.length,
    skipped,
    candidates,
    status,
  };
}

type ObservationGroup = {
  id: string;
  observedPattern: string;
  displayName: string;
  trigger: string;
  policyScopes: SageOsPolicyScope[];
  observations: SageOsObservation[];
};

function groupEligibleObservations(
  observations: SageOsObservation[],
): Map<string, ObservationGroup> {
  const groups = new Map<string, ObservationGroup>();
  for (const observation of observations) {
    const group = groupForObservation(observation);
    const existing = groups.get(group.id);
    if (existing) {
      existing.observations.push(observation);
    } else {
      groups.set(group.id, group);
    }
  }
  return groups;
}

function groupForObservation(observation: SageOsObservation): ObservationGroup {
  const processName = readString(observation.payload.processName);
  const windowTitle = readString(observation.payload.windowTitle);
  if (observation.source === "app_focus" && processName && windowTitle) {
    const observedPattern = `${observation.source}:${slugify(processName)}:${slugify(windowTitle)}`;
    return {
      id: `workflow_${slugify(observedPattern)}`,
      observedPattern,
      displayName: `${processName} ${windowTitle}`,
      trigger: `Repeated ${observation.source} observations for ${processName} / ${windowTitle}`,
      policyScopes: [{ kind: "app", allow: [processName], risk: "low" }],
      observations: [observation],
    };
  }

  const title = observation.title || observation.source;
  const observedPattern = `${observation.source}:${slugify(title)}`;
  return {
    id: `workflow_${slugify(observedPattern)}`,
    observedPattern,
    displayName: title,
    trigger: `Repeated ${observation.source} observations for ${title}`,
    policyScopes: [{ kind: "system", allow: [observation.source], risk: "low" }],
    observations: [observation],
  };
}

function workflowFromGroup(group: ObservationGroup, now: string): SageOsWorkflow {
  const observations = group.observations.toSorted(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );
  return {
    id: group.id,
    name: `Automate repeated ${truncate(group.displayName, 64)}`,
    state: "candidate",
    observedPattern: group.observedPattern,
    sourceObservationIds: observations.map((observation) => observation.id),
    trigger: group.trigger,
    inputs: ["captured observation pattern"],
    outputs: ["workflow candidate"],
    policyScopes: group.policyScopes,
    implementationRefs: [],
    evalRefs: observations.map((observation) => observation.id),
    createdAt: now,
    updatedAt: now,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "pattern";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
