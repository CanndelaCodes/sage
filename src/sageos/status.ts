import { readFile } from "node:fs/promises";
import {
  listLearningEventQueue,
  resolveLearningEventQueuePath,
} from "../learning/activity-queue.js";
import {
  listSageMemoryCaptureQueue,
  resolveSageMemoryCaptureQueuePath,
} from "../memory/sage-memory-capture-queue.js";
import { createSageOsEventLog } from "./event-log.js";
import { createSageOsStateStore, readSageOsState } from "./state-store.js";
import {
  createSageOsStatusSnapshot,
  type SageOsAgentSpec,
  type SageOsIncident,
  type SageOsQueueSummary,
  type SageOsRun,
  type SageOsRunSummary,
  type SageOsStatusSnapshot,
  type SageOsSummary,
  type SageOsTaskSpec,
} from "./types.js";

export type CollectSageOsStatusOptions = {
  stateDir?: string;
  agentId?: string;
  memoryCaptureQueuePath?: string;
  learningActivityQueuePath?: string;
};

export async function collectSageOsStatus(
  opts: CollectSageOsStatusOptions = {},
): Promise<SageOsStatusSnapshot> {
  const agentId = opts.agentId ?? "main";
  const store = createSageOsStateStore({ stateDir: opts.stateDir });
  const state = await readSageOsState(store);
  const eventLog = createSageOsEventLog({ stateDir: opts.stateDir });
  const [memoryQueue, learningQueue, recentEvents] = await Promise.all([
    listSageMemoryCaptureQueue({
      queuePath:
        opts.memoryCaptureQueuePath ??
        resolveSageMemoryCaptureQueuePath({
          agentId,
          env: envForStateDir(opts.stateDir),
        }),
    }),
    listLearningEventQueue({
      queuePath:
        opts.learningActivityQueuePath ??
        resolveLearningEventQueuePath({
          agentId,
          env: envForStateDir(opts.stateDir),
        }),
    }),
    countEventLogLines(eventLog.path),
  ]);
  const memoryCaptureQueue = queueSummary(memoryQueue);
  const learningActivityQueue = queueSummary(learningQueue);
  const incidents = [
    ...state.status.incidents,
    ...queueIncidents({
      now: state.status.generatedAt,
      category: "memory",
      title: "Sage Memory capture queue has failed entries",
      summary: `${memoryCaptureQueue.failed} Sage Memory capture entr${
        memoryCaptureQueue.failed === 1 ? "y is" : "ies are"
      } failed and need replay or repair.`,
      failed: memoryCaptureQueue.failed,
    }),
    ...queueIncidents({
      now: state.status.generatedAt,
      category: "learning",
      title: "Learning activity queue has failed entries",
      summary: `${learningActivityQueue.failed} learning activity entr${
        learningActivityQueue.failed === 1 ? "y is" : "ies are"
      } failed and need replay or repair.`,
      failed: learningActivityQueue.failed,
    }),
  ];

  return createSageOsStatusSnapshot({
    ...state.status,
    generatedAt: new Date().toISOString(),
    employees: summarizeAgents(state.agents),
    tasks: summarizeTasks(state.tasks),
    runs: summarizeRuns(state.runs),
    approvals: {
      pending: state.approvals.filter((approval) => approval.state === "pending").length,
    },
    memory: {
      status: memoryCaptureQueue.failed > 0 ? "degraded" : "ok",
      backend: "sage-memory",
      canonical: "sage-memory",
      captureQueue: memoryCaptureQueue,
    },
    learning: {
      status: learningActivityQueue.failed > 0 ? "degraded" : "ok",
      activityQueue: learningActivityQueue,
    },
    incidents,
    audit: {
      ...state.status.audit,
      recentEvents,
      eventLogPath: eventLog.path,
    },
  });
}

function envForStateDir(stateDir: string | undefined): NodeJS.ProcessEnv | undefined {
  return stateDir ? { ...process.env, SAGE_STATE_DIR: stateDir } : undefined;
}

function summarizeAgents(agents: SageOsAgentSpec[]): SageOsSummary {
  return {
    total: agents.length,
    active: agents.filter((agent) => agent.status === "active").length,
    queued: agents.filter((agent) => agent.status === "draft").length,
    blocked: agents.filter((agent) => agent.status === "paused" || agent.status === "disabled")
      .length,
  };
}

function summarizeTasks(tasks: SageOsTaskSpec[]): SageOsSummary {
  return {
    total: tasks.length,
    active: tasks.filter((task) => ["planning", "running", "verifying"].includes(task.state))
      .length,
    queued: tasks.filter((task) => ["proposed", "queued"].includes(task.state)).length,
    blocked: tasks.filter((task) =>
      ["waiting_for_policy", "blocked", "paused", "expired"].includes(task.state),
    ).length,
  };
}

function summarizeRuns(runs: SageOsRun[]): SageOsRunSummary {
  return {
    total: runs.length,
    active: runs.filter((run) => run.state === "running").length,
    queued: runs.filter((run) => run.state === "queued").length,
    failed: runs.filter((run) => run.state === "failed" || run.state === "timed_out").length,
  };
}

function queueSummary(input: {
  path: string;
  counts: { total: number; pending: number; failed: number };
}): SageOsQueueSummary {
  return {
    path: input.path,
    total: input.counts.total,
    pending: input.counts.pending,
    failed: input.counts.failed,
  };
}

function queueIncidents(params: {
  now: string;
  category: "memory" | "learning";
  title: string;
  summary: string;
  failed: number;
}): SageOsIncident[] {
  if (params.failed === 0) {
    return [];
  }
  return [
    {
      id: `incident_${params.category}_queue_failed`,
      severity: "warning",
      category: params.category,
      title: params.title,
      summary: params.summary,
      firstSeenAt: params.now,
      lastSeenAt: params.now,
      autoRepairSafe: true,
    },
  ];
}

async function countEventLogLines(logPath: string): Promise<number> {
  try {
    const raw = await readFile(logPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return 0;
    }
    throw err;
  }
}
