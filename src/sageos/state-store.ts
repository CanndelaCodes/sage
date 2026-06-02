import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { resolveSageOsStateDir } from "./event-log.js";
import {
  createSageOsStatusSnapshot,
  type SageOsApproval,
  type SageOsAgentSpec,
  type SageOsAppCandidate,
  type SageOsCodingReport,
  type SageOsCollaborationEvent,
  type SageOsObservation,
  type SageOsRun,
  type SageOsSkillRecord,
  type SageOsStatusSnapshot,
  type SageOsTaskSpec,
  type SageOsWorkflow,
} from "./types.js";

export type SageOsStateStore = {
  path: string;
};

export type SageOsPersistedState = {
  version: 1;
  status: SageOsStatusSnapshot;
  agents: SageOsAgentSpec[];
  tasks: SageOsTaskSpec[];
  runs: SageOsRun[];
  workflows: SageOsWorkflow[];
  skills: SageOsSkillRecord[];
  apps: SageOsAppCandidate[];
  collaborations: SageOsCollaborationEvent[];
  codingReports: SageOsCodingReport[];
  approvals: SageOsApproval[];
  observations: SageOsObservation[];
  updatedAt: string;
};

export type SageOsSupervisorControl = {
  state: "paused" | "running" | "stopped";
  reason?: string;
  emergency?: boolean;
  updatedAt: string;
};

export function createSageOsStateStore(
  opts: { stateDir?: string; path?: string } = {},
): SageOsStateStore {
  return {
    path:
      opts.path ??
      path.join(resolveSageOsStateDir(opts.stateDir ?? resolveStateDir()), "state.json"),
  };
}

export function createSageOsControlStore(
  opts: { stateDir?: string; path?: string } = {},
): SageOsStateStore {
  return {
    path:
      opts.path ??
      path.join(resolveSageOsStateDir(opts.stateDir ?? resolveStateDir()), "control.json"),
  };
}

function siblingStore(store: SageOsStateStore, filename: string): SageOsStateStore {
  return { path: path.join(path.dirname(store.path), filename) };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      throw err;
    }
    return fallback;
  }
}

const fileWriteChains = new Map<string, Promise<unknown>>();

async function serializeFileOperation<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = fileWriteChains.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  fileWriteChains.set(filePath, next);
  try {
    return await next;
  } finally {
    if (fileWriteChains.get(filePath) === next) {
      fileWriteChains.delete(filePath);
    }
  }
}

async function writeJsonFile<T>(filePath: string, value: T): Promise<T> {
  return serializeFileOperation(filePath, async () => {
    await writeJsonFileUnlocked(filePath, value);
    return value;
  });
}

async function updateJsonFile<T>(
  filePath: string,
  fallback: T,
  update: (current: T) => T,
): Promise<T> {
  return serializeFileOperation(filePath, async () => {
    const next = update(await readJsonFile(filePath, fallback));
    await writeJsonFileUnlocked(filePath, next);
    return next;
  });
}

async function writeJsonFileUnlocked<T>(filePath: string, value: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(tempPath, filePath);
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code !== "EEXIST" && code !== "EPERM") {
      throw err;
    }
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
  }
}

export async function readSageOsState(store: SageOsStateStore): Promise<SageOsPersistedState> {
  const fallbackStatus = createSageOsStatusSnapshot();
  const base = await readJsonFile<Partial<SageOsPersistedState>>(store.path, {
    version: 1,
    status: fallbackStatus,
    updatedAt: fallbackStatus.generatedAt,
  });

  const agents = await readJsonFile<SageOsAgentSpec[]>(
    siblingStore(store, "agents.json").path,
    base.agents ?? [],
  );
  const tasks = await readJsonFile<SageOsTaskSpec[]>(
    siblingStore(store, "tasks.json").path,
    base.tasks ?? [],
  );
  const runs = await readJsonFile<SageOsRun[]>(
    siblingStore(store, "runs.json").path,
    base.runs ?? [],
  );
  const workflows = await readJsonFile<SageOsWorkflow[]>(
    siblingStore(store, "workflows.json").path,
    base.workflows ?? [],
  );
  const skills = await readJsonFile<SageOsSkillRecord[]>(
    siblingStore(store, "skills.json").path,
    base.skills ?? [],
  );
  const apps = await readJsonFile<SageOsAppCandidate[]>(
    siblingStore(store, "apps.json").path,
    base.apps ?? [],
  );
  const collaborations = await readJsonFile<SageOsCollaborationEvent[]>(
    siblingStore(store, "collaborations.json").path,
    base.collaborations ?? [],
  );
  const codingReports = await readJsonFile<SageOsCodingReport[]>(
    siblingStore(store, "coding-reports.json").path,
    base.codingReports ?? [],
  );
  const approvals = await readJsonFile<SageOsApproval[]>(
    siblingStore(store, "approvals.json").path,
    base.approvals ?? [],
  );
  const observations = await readJsonFile<SageOsObservation[]>(
    siblingStore(store, "observations.json").path,
    base.observations ?? [],
  );

  if (base.version === 1 && base.status) {
    return {
      version: 1,
      status: base.status,
      agents,
      tasks,
      runs,
      workflows,
      skills,
      apps,
      collaborations,
      codingReports,
      approvals,
      observations,
      updatedAt: base.updatedAt ?? base.status.generatedAt,
    };
  }

  return {
    version: 1,
    status: fallbackStatus,
    agents,
    tasks,
    runs,
    workflows,
    skills,
    apps,
    collaborations,
    codingReports,
    approvals,
    observations,
    updatedAt: fallbackStatus.generatedAt,
  };
}

export async function writeSageOsState(
  store: SageOsStateStore,
  status: SageOsStatusSnapshot,
): Promise<SageOsPersistedState> {
  const current = await readSageOsState(store);
  const next = {
    version: 1 as const,
    status,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(store.path, next);
  return {
    ...next,
    agents: current.agents,
    tasks: current.tasks,
    runs: current.runs,
    workflows: current.workflows,
    skills: current.skills,
    apps: current.apps,
    collaborations: current.collaborations,
    codingReports: current.codingReports,
    approvals: current.approvals,
    observations: current.observations,
  };
}

export async function upsertSageOsAgent(
  store: SageOsStateStore,
  agent: SageOsAgentSpec,
): Promise<SageOsPersistedState> {
  const agentsFile = siblingStore(store, "agents.json").path;
  const agents = await updateJsonFile<SageOsAgentSpec[]>(agentsFile, [], (current) =>
    current.filter((item) => item.id !== agent.id).concat(agent),
  );
  const current = await readSageOsState(store);
  return { ...current, agents, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsTask(
  store: SageOsStateStore,
  task: SageOsTaskSpec,
): Promise<SageOsPersistedState> {
  const tasksFile = siblingStore(store, "tasks.json").path;
  const tasks = await updateJsonFile<SageOsTaskSpec[]>(tasksFile, [], (current) =>
    current.filter((item) => item.id !== task.id).concat(task),
  );
  const current = await readSageOsState(store);
  return { ...current, tasks, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsRun(
  store: SageOsStateStore,
  run: SageOsRun,
): Promise<SageOsPersistedState> {
  const runsFile = siblingStore(store, "runs.json").path;
  const runs = await updateJsonFile<SageOsRun[]>(runsFile, [], (current) =>
    current.filter((item) => item.id !== run.id).concat(run),
  );
  const current = await readSageOsState(store);
  return { ...current, runs, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsWorkflow(
  store: SageOsStateStore,
  workflow: SageOsWorkflow,
): Promise<SageOsPersistedState> {
  const workflowsFile = siblingStore(store, "workflows.json").path;
  const workflows = await updateJsonFile<SageOsWorkflow[]>(workflowsFile, [], (current) =>
    current.filter((item) => item.id !== workflow.id).concat(workflow),
  );
  const current = await readSageOsState(store);
  return { ...current, workflows, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsSkill(
  store: SageOsStateStore,
  skill: SageOsSkillRecord,
): Promise<SageOsPersistedState> {
  const skillsFile = siblingStore(store, "skills.json").path;
  const skills = await updateJsonFile<SageOsSkillRecord[]>(skillsFile, [], (current) =>
    current.filter((item) => item.id !== skill.id).concat(skill),
  );
  const current = await readSageOsState(store);
  return { ...current, skills, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsAppCandidate(
  store: SageOsStateStore,
  app: SageOsAppCandidate,
): Promise<SageOsPersistedState> {
  const appsFile = siblingStore(store, "apps.json").path;
  const apps = await updateJsonFile<SageOsAppCandidate[]>(appsFile, [], (current) =>
    current.filter((item) => item.id !== app.id).concat(app),
  );
  const current = await readSageOsState(store);
  return { ...current, apps, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsCollaboration(
  store: SageOsStateStore,
  collaboration: SageOsCollaborationEvent,
): Promise<SageOsPersistedState> {
  const collaborationsFile = siblingStore(store, "collaborations.json").path;
  const collaborations = await updateJsonFile<SageOsCollaborationEvent[]>(
    collaborationsFile,
    [],
    (current) => current.filter((item) => item.id !== collaboration.id).concat(collaboration),
  );
  const current = await readSageOsState(store);
  return { ...current, collaborations, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsCodingReport(
  store: SageOsStateStore,
  report: SageOsCodingReport,
): Promise<SageOsPersistedState> {
  const reportsFile = siblingStore(store, "coding-reports.json").path;
  const codingReports = await updateJsonFile<SageOsCodingReport[]>(reportsFile, [], (current) =>
    current.filter((item) => item.id !== report.id).concat(report),
  );
  const current = await readSageOsState(store);
  return { ...current, codingReports, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsApproval(
  store: SageOsStateStore,
  approval: SageOsApproval,
): Promise<SageOsPersistedState> {
  const approvalsFile = siblingStore(store, "approvals.json").path;
  const approvals = await updateJsonFile<SageOsApproval[]>(approvalsFile, [], (current) =>
    current.filter((item) => item.id !== approval.id).concat(approval),
  );
  const current = await readSageOsState(store);
  return { ...current, approvals, updatedAt: new Date().toISOString() };
}

export async function upsertSageOsObservation(
  store: SageOsStateStore,
  observation: SageOsObservation,
): Promise<SageOsPersistedState> {
  const observationsFile = siblingStore(store, "observations.json").path;
  const observations = await updateJsonFile<SageOsObservation[]>(observationsFile, [], (current) =>
    current.filter((item) => item.id !== observation.id).concat(observation),
  );
  const current = await readSageOsState(store);
  return { ...current, observations, updatedAt: new Date().toISOString() };
}

export async function pruneSageOsObservations(
  store: SageOsStateStore,
  cutoff: Date,
): Promise<SageOsPersistedState> {
  const cutoffMs = cutoff.getTime();
  if (!Number.isFinite(cutoffMs)) {
    return readSageOsState(store);
  }

  const observationsFile = siblingStore(store, "observations.json").path;
  const observations = await updateJsonFile<SageOsObservation[]>(observationsFile, [], (current) =>
    current.filter((observation) => {
      const observedAtMs = Date.parse(observation.observedAt);
      return !Number.isFinite(observedAtMs) || observedAtMs >= cutoffMs;
    }),
  );
  const current = await readSageOsState(store);
  return { ...current, observations, updatedAt: new Date().toISOString() };
}

export async function readSageOsControl(
  store: SageOsStateStore,
): Promise<SageOsSupervisorControl | undefined> {
  return readJsonFile<SageOsSupervisorControl | undefined>(store.path, undefined);
}

export async function writeSageOsControl(
  store: SageOsStateStore,
  control: Omit<SageOsSupervisorControl, "updatedAt"> & { updatedAt?: string },
): Promise<SageOsSupervisorControl> {
  return writeJsonFile(store.path, {
    ...control,
    updatedAt: control.updatedAt ?? new Date().toISOString(),
  });
}
