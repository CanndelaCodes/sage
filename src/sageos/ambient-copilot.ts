import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import {
  createSageOsStatusSnapshot,
  type SageOsConfig,
  type SageOsIncident,
  type SageOsObservation,
  type SageOsPolicyScope,
  type SageOsStatusSnapshot,
  type SageOsTaskSpec,
} from "./types.js";

export type SageOsAmbientCopilotResult = {
  observed: number;
  proposed: number;
  skipped: number;
  tasks: SageOsTaskSpec[];
  status: SageOsStatusSnapshot;
};

export async function runSageOsAmbientCopilotOnce(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  maxSuggestions?: number;
  now?: () => Date;
}): Promise<SageOsAmbientCopilotResult> {
  const store = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const observations = state.observations;
  const existingTaskIds = new Set(state.tasks.map((task) => task.id));
  const created: SageOsTaskSpec[] = [];
  const quarantined: SageOsObservation[] = [];
  const maxSuggestions = normalizeLimit(params.maxSuggestions);

  if (params.cfg?.enabled !== false && params.cfg?.mode !== "off") {
    for (const observation of observations) {
      if (isSuspiciousObservedInstruction(observation)) {
        quarantined.push(observation);
        continue;
      }
      if (created.length >= maxSuggestions) {
        continue;
      }
      const task = taskFromObservation(observation, existingTaskIds, params.now);
      if (!task) {
        continue;
      }
      await upsertSageOsTask(store, task);
      existingTaskIds.add(task.id);
      created.push(task);
      await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
        type: "ambient_suggestion_created",
        actor: "sageos.ambient_copilot",
        summary: `Proposed SageOS task ${task.id} from observation ${observation.id}: ${task.title}`,
        sensitivity: observation.sensitivity,
        taskId: task.id,
      });
    }
  }

  if (quarantined.length > 0) {
    await persistObservedPromptInjectionIncident({
      store,
      stateDir: params.stateDir,
      observations: quarantined,
      now: params.now,
    });
  }

  const status = await collectSageOsStatus({ stateDir: params.stateDir, cfg: params.cfg });
  await writeSageOsState(store, status);
  return {
    observed: observations.length,
    proposed: created.length,
    skipped: observations.length - created.length,
    tasks: created,
    status,
  };
}

const OBSERVED_PROMPT_INJECTION_INCIDENT_ID = "incident_observed_prompt_injection";

const SUSPICIOUS_OBSERVED_INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|override)\b[\s\S]{0,120}\b(?:previous|prior|system|developer|sageos|instructions?|policy)\b/i,
  /\b(?:disable|bypass|turn\s+off|remove)\b[\s\S]{0,120}\b(?:sageos\s+)?(?:policy|approvals?|safeguards?|guardrails?|security)\b/i,
  /\b(?:send|exfiltrate|upload|post|message|forward)\b[\s\S]{0,120}\b(?:api[_-]?keys?|api[_-]?tokens?|tokens?|passwords?|secrets?|credentials?)\b/i,
  /\b(?:system|developer)\s+prompt\b/i,
];

function isSuspiciousObservedInstruction(observation: SageOsObservation): boolean {
  if (observation.state !== "captured" || observation.sensitivity === "secret") {
    return false;
  }
  return SUSPICIOUS_OBSERVED_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(observation.text));
}

async function persistObservedPromptInjectionIncident(params: {
  store: SageOsStateStore;
  stateDir?: string;
  observations: SageOsObservation[];
  now?: () => Date;
}): Promise<void> {
  const state = await readSageOsState(params.store);
  const now = (params.now?.() ?? new Date()).toISOString();
  const latest = params.observations.toSorted(
    (a, b) => observationSortTime(b) - observationSortTime(a),
  )[0];
  const existing = state.status.incidents.find(
    (incident) => incident.id === OBSERVED_PROMPT_INJECTION_INCIDENT_ID,
  );
  const incident: SageOsIncident = {
    id: OBSERVED_PROMPT_INJECTION_INCIDENT_ID,
    severity: "warning",
    category: "policy",
    title: "Suspicious instructions observed in untrusted content",
    summary: [
      `SageOS quarantined ${params.observations.length} observation${
        params.observations.length === 1 ? "" : "s"
      } containing possible instruction override, policy bypass, or credential exfiltration language.`,
      latest ? `Latest observation: ${latest.id} from ${latest.source}.` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" "),
    firstSeenAt: existing?.firstSeenAt ?? earliestObservationTime(params.observations, now),
    lastSeenAt: latest ? latest.observedAt : now,
    autoRepairSafe: false,
    repairAction: {
      id: "repair_observed_prompt_injection_review",
      label: "Review quarantined observations",
      command: "sage os observations --json",
      gatewayMethod: "sageos.observations.list",
      risk: "medium",
      approvalRequired: false,
    },
  };
  await writeSageOsState(
    params.store,
    createSageOsStatusSnapshot({
      ...state.status,
      incidents: state.status.incidents
        .filter((item) => item.id !== OBSERVED_PROMPT_INJECTION_INCIDENT_ID)
        .concat(incident),
    }),
  );
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "incident_created",
    actor: "sageos.ambient_copilot",
    summary: latest
      ? `Created ${OBSERVED_PROMPT_INJECTION_INCIDENT_ID} from observation ${latest.id} (${latest.source}).`
      : `Created ${OBSERVED_PROMPT_INJECTION_INCIDENT_ID}.`,
    sensitivity: "private",
  });
}

function taskFromObservation(
  observation: SageOsObservation,
  existingTaskIds: Set<string>,
  nowFactory: (() => Date) | undefined,
): SageOsTaskSpec | undefined {
  if (observation.state !== "captured" || observation.sensitivity === "secret") {
    return undefined;
  }
  const id = taskIdForObservation(observation);
  if (existingTaskIds.has(id)) {
    return undefined;
  }
  const now = (nowFactory?.() ?? new Date()).toISOString();
  const title = `Review observed work: ${truncate(observation.title || observation.source, 80)}`;
  return {
    id,
    title,
    objective: [
      `Ambient Copilot observed ${observation.source} at ${observation.observedAt}.`,
      `Observation ${observation.id}: ${observation.text}`,
    ].join("\n"),
    state: "proposed",
    requestedBy: "sageos.ambient_copilot",
    autonomyTier: "suggest",
    policyScopes: policyScopesForObservation(observation),
    createdAt: now,
    updatedAt: now,
  };
}

function earliestObservationTime(observations: SageOsObservation[], fallback: string): string {
  const earliest = observations.toSorted(
    (a, b) => observationSortTime(a) - observationSortTime(b),
  )[0];
  return earliest?.observedAt ?? fallback;
}

function observationSortTime(observation: SageOsObservation): number {
  for (const timestamp of [observation.observedAt, observation.updatedAt, observation.createdAt]) {
    const millis = Date.parse(timestamp);
    if (Number.isFinite(millis)) {
      return millis;
    }
  }
  return 0;
}

function taskIdForObservation(observation: SageOsObservation): string {
  const safe = observation.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `task_observation_${safe || "unknown"}`;
}

function policyScopesForObservation(observation: SageOsObservation): SageOsPolicyScope[] {
  const processName = readString(observation.payload.processName);
  if (observation.source === "app_focus" && processName) {
    return [{ kind: "app", allow: [processName], risk: "low" }];
  }
  return [];
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return 5;
  }
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 5;
}

function readString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
