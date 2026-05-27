import type {
  SageOsConfig,
  SageOsObservation,
  SageOsPolicyScope,
  SageOsStatusSnapshot,
  SageOsTaskSpec,
} from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsTask,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

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
  const maxSuggestions = normalizeLimit(params.maxSuggestions);

  if (params.cfg?.enabled !== false && params.cfg?.mode !== "off" && maxSuggestions > 0) {
    for (const observation of observations) {
      if (created.length >= maxSuggestions) {
        break;
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

  const status = await collectSageOsStatus({ stateDir: params.stateDir });
  await writeSageOsState(store, status);
  return {
    observed: observations.length,
    proposed: created.length,
    skipped: observations.length - created.length,
    tasks: created,
    status,
  };
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
