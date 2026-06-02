import type {
  SageOsAppCandidate,
  SageOsConfig,
  SageOsObservation,
  SageOsPolicyScope,
  SageOsSensitivity,
  SageOsStatusSnapshot,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsAppCandidate,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsAppCandidateDiscoveryResult = {
  observed: number;
  created: number;
  skipped: number;
  candidates: SageOsAppCandidate[];
  status: SageOsStatusSnapshot;
};

export async function discoverSageOsAppCandidates(
  params: {
    stateDir?: string;
    minOccurrences?: number;
    now?: Date;
    cfg?: SageOsConfig;
  } = {},
): Promise<SageOsAppCandidateDiscoveryResult> {
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const minOccurrences = Math.max(2, Math.floor(params.minOccurrences ?? 2));
  const now = (params.now ?? new Date()).toISOString();
  const captured = state.observations.filter((observation) => observation.state === "captured");
  const eligible = captured.filter((observation) => observation.sensitivity !== "secret");
  const skipped = captured.length - eligible.length;
  const existingIds = new Set(state.apps.map((app) => app.id));
  const groups = groupEligibleObservations(eligible);
  const candidates: SageOsAppCandidate[] = [];

  for (const group of groups.values()) {
    if (group.observations.length < minOccurrences || existingIds.has(group.id)) {
      continue;
    }
    const candidate = appCandidateFromGroup(group, now);
    await upsertSageOsAppCandidate(store, candidate);
    existingIds.add(candidate.id);
    candidates.push(candidate);
    await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
      type: "app_candidate_created",
      actor: "sageos.app_candidate_discovery",
      summary: `Created SageOS app candidate ${candidate.id}: ${candidate.name}`,
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
  displayName: string;
  purpose: string;
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
      id: `app_widget_${slugify(observedPattern)}`,
      displayName: `${processName} ${windowTitle}`,
      purpose: `Summarize repeated ${observation.source} observations for ${processName} / ${windowTitle}.`,
      policyScopes: [{ kind: "app", allow: [processName], risk: "low" }],
      observations: [observation],
    };
  }

  const title = observation.title || observation.source;
  const observedPattern = `${observation.source}:${slugify(title)}`;
  return {
    id: `app_widget_${slugify(observedPattern)}`,
    displayName: title,
    purpose: `Summarize repeated ${observation.source} observations for ${title}.`,
    policyScopes: [{ kind: "system", allow: [observation.source], risk: "low" }],
    observations: [observation],
  };
}

function appCandidateFromGroup(group: ObservationGroup, now: string): SageOsAppCandidate {
  const observations = group.observations.toSorted(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );
  const sourceObservationIds = observations.map((observation) => observation.id);
  return {
    id: group.id,
    name: `${truncate(group.displayName, 64)} Widget`,
    state: "draft",
    targetSurface: "widget",
    purpose: group.purpose,
    sourceObservationIds,
    provenance: sourceObservationIds,
    sensitivity: maxSensitivity(observations.map((observation) => observation.sensitivity)),
    inputs: ["captured observation pattern"],
    outputs: ["local widget candidate"],
    policyScopes: group.policyScopes,
    previewCommand: `sage os apps preview ${group.id}`,
    artifactRefs: [],
    rollbackRef: `delete apps.json entry ${group.id}`,
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
  return slug || "need";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function maxSensitivity(values: SageOsSensitivity[]): SageOsSensitivity {
  const rank: Record<SageOsSensitivity, number> = {
    public: 0,
    normal: 1,
    private: 2,
    secret: 3,
  };
  return values.reduce<SageOsSensitivity>(
    (max, value) => (rank[value] > rank[max] ? value : max),
    "public",
  );
}
