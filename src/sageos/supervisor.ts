import type { SageConfig } from "../config/types.sage.js";
import { createSageOsEventLog, appendSageOsEvent, type SageOsEventLog } from "./event-log.js";
import { runSageOsMemoryStewardOnce } from "./memory-steward.js";
import { observeAppFocusOnce } from "./observations.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsControl,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";
import { observeSystemStatusOnce } from "./system-observer.js";
import { runNextSageOsTaskOnce } from "./task-runner.js";
import {
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
  type SageOsConfig,
  type SageOsSupervisorStatus,
  type SageOsStatusSnapshot,
} from "./types.js";

export type SageOsSupervisorOptions = {
  stateDir?: string;
  agentId?: string;
  intervalMs?: number;
  mode?: unknown;
  config?: SageConfig;
  eventLog?: SageOsEventLog;
  stateStore?: SageOsStateStore;
  runWorkLoopOnce?: typeof runSageOsSupervisorWorkLoopOnce;
};

export type SageOsSupervisorWorkLoopDeps = {
  observeAppFocusOnce?: typeof observeAppFocusOnce;
  observeSystemStatusOnce?: typeof observeSystemStatusOnce;
  runMemoryStewardOnce?: typeof runSageOsMemoryStewardOnce;
  runNextTaskOnce?: typeof runNextSageOsTaskOnce;
  collectStatus?: typeof collectSageOsStatus;
};

export type SageOsSupervisorWorkLoopResult = {
  appFocus?: Awaited<ReturnType<typeof observeAppFocusOnce>>;
  system?: Awaited<ReturnType<typeof observeSystemStatusOnce>>;
  memory?: Awaited<ReturnType<typeof runSageOsMemoryStewardOnce>>;
  task: Awaited<ReturnType<typeof runNextSageOsTaskOnce>>;
  status: SageOsStatusSnapshot;
};

export type SageOsSupervisor = {
  start: () => Promise<void>;
  pause: (reason?: string) => Promise<void>;
  resume: (reason?: string) => Promise<void>;
  stop: (reason?: string) => Promise<void>;
  emergencyStop: (reason?: string) => Promise<void>;
  getStatus: () => SageOsSupervisorStatus;
  getSnapshot: () => SageOsStatusSnapshot;
};

export async function runSageOsSupervisorWorkLoopOnce(params: {
  cfg?: SageConfig;
  stateDir?: string;
  agentId?: string;
  requestedBy?: string;
  deps?: SageOsSupervisorWorkLoopDeps;
}): Promise<SageOsSupervisorWorkLoopResult> {
  const cfg = params.cfg ?? {};
  const sageos = cfg.sageos ?? {};
  const agentId = params.agentId ?? "main";
  const deps = params.deps ?? {};
  const result: Partial<SageOsSupervisorWorkLoopResult> = {};

  if (sageos.sources?.appFocus === true) {
    result.appFocus = await (deps.observeAppFocusOnce ?? observeAppFocusOnce)({
      cfg: sageos,
      stateDir: params.stateDir,
      agentId,
    });
  }

  if (hasEnabledSystemSource(sageos)) {
    result.system = await (deps.observeSystemStatusOnce ?? observeSystemStatusOnce)({
      cfg: sageos,
      stateDir: params.stateDir,
    });
  }

  if (sageos.memory?.replayQueues === true) {
    result.memory = await (deps.runMemoryStewardOnce ?? runSageOsMemoryStewardOnce)({
      cfg,
      agentId,
      stateDir: params.stateDir,
    });
  }

  result.task = await (deps.runNextTaskOnce ?? runNextSageOsTaskOnce)({
    stateDir: params.stateDir,
    requestedBy: params.requestedBy ?? "sageos.supervisor",
    notify: sageos.notifications?.telegram?.enabled === true,
    cfg: sageos,
  });
  result.status = await (deps.collectStatus ?? collectSageOsStatus)({
    stateDir: params.stateDir,
    agentId,
    cfg: sageos,
  });
  return result as SageOsSupervisorWorkLoopResult;
}

export function createSageOsSupervisor(options: SageOsSupervisorOptions = {}): SageOsSupervisor {
  const intervalMs = Math.max(1, options.intervalMs ?? 30_000);
  const eventLog = options.eventLog ?? createSageOsEventLog({ stateDir: options.stateDir });
  const stateStore = options.stateStore ?? createSageOsStateStore({ stateDir: options.stateDir });
  const controlStore = createSageOsControlStore({ stateDir: options.stateDir });
  let timer: NodeJS.Timeout | undefined;
  let status: SageOsSupervisorStatus = { enabled: true, paused: false, state: "stopped" };
  let lastSnapshot = createSageOsStatusSnapshot({
    mode: normalizeSageOsMode(options.config?.sageos?.mode ?? options.mode),
    supervisor: status,
    audit: { recentEvents: 0, eventLogPath: eventLog.path },
  });
  let lastAppliedControlAt: string | undefined;

  const persist = async (overrides: Partial<SageOsStatusSnapshot> = {}) => {
    lastSnapshot = createSageOsStatusSnapshot({
      ...lastSnapshot,
      ...overrides,
      mode: normalizeSageOsMode(options.config?.sageos?.mode ?? options.mode ?? overrides.mode),
      supervisor: status,
      audit: {
        ...lastSnapshot.audit,
        ...overrides.audit,
        eventLogPath: eventLog.path,
      },
    });
    await writeSageOsState(stateStore, lastSnapshot);
  };

  const clear = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const armTimer = () => {
    clear();
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
  };

  const markTickWindow = (now = new Date()) => ({
    lastTickAt: now.toISOString(),
    nextTickAt: new Date(now.getTime() + intervalMs).toISOString(),
  });

  let controlCheckInFlight = false;

  const applyPersistedControl = async (): Promise<boolean> => {
    const desired = await readSageOsControl(controlStore);
    if (!desired || desired.updatedAt === lastAppliedControlAt) {
      return false;
    }
    lastAppliedControlAt = desired.updatedAt;
    if (desired.state === "paused" && status.state === "running") {
      status = { ...status, paused: true, state: "paused", nextTickAt: undefined };
      await persist();
      return true;
    }
    if (desired.state === "stopped" && status.state !== "stopped") {
      clear();
      status = {
        ...status,
        enabled: false,
        paused: Boolean(desired.emergency),
        state: "stopped",
        stoppedAt: new Date().toISOString(),
        nextTickAt: undefined,
      };
      await persist();
      return true;
    }
    if (desired.state === "running" && status.state === "paused") {
      status = {
        ...status,
        enabled: true,
        paused: false,
        state: "running",
        stoppedAt: undefined,
        ...markTickWindow(),
      };
      await persist();
      return true;
    }
    return false;
  };

  const tick = () => {
    if (controlCheckInFlight) {
      return;
    }
    controlCheckInFlight = true;
    void (async () => {
      if (await applyPersistedControl()) {
        return;
      }
      if (status.paused || status.state !== "running") {
        return;
      }
      status = {
        ...status,
        ...markTickWindow(),
      };
      await persist();
      const workLoop = options.runWorkLoopOnce ?? runSageOsSupervisorWorkLoopOnce;
      const result = await workLoop({
        cfg: options.config,
        stateDir: options.stateDir,
        agentId: options.agentId,
        requestedBy: "sageos.supervisor",
      });
      if (!status.paused && status.state === "running") {
        await persist(result.status);
      }
    })()
      .catch((err: unknown) => {
        if (status.state === "running") {
          status = { ...status, state: "degraded", lastError: String(err) };
        }
      })
      .finally(() => {
        controlCheckInFlight = false;
      });
  };

  return {
    async start() {
      clear();
      const now = new Date();
      const control = await readSageOsControl(controlStore);
      lastAppliedControlAt = control?.updatedAt;
      if (control?.state === "stopped") {
        status = {
          enabled: false,
          paused: Boolean(control.emergency),
          state: "stopped",
          stoppedAt: now.toISOString(),
          nextTickAt: undefined,
        };
        await appendSageOsEvent(eventLog, {
          type: control.emergency ? "emergency_stop" : "supervisor_stopped",
          actor: "sageos.supervisor",
          summary: `SageOS supervisor start blocked by persisted control: ${control.reason ?? "manual"}`,
        });
        await persist();
        return;
      }
      status = {
        enabled: true,
        paused: control?.state === "paused",
        state: control?.state === "paused" ? "paused" : "running",
        startedAt: now.toISOString(),
        ...(control?.state === "paused" ? { nextTickAt: undefined } : markTickWindow(now)),
      };
      await appendSageOsEvent(eventLog, {
        type: "supervisor_started",
        actor: "sageos.supervisor",
        summary: "SageOS supervisor started",
      });
      await persist();
      armTimer();
    },
    async pause(reason = "manual") {
      status = { ...status, paused: true, state: "paused", nextTickAt: undefined };
      await appendSageOsEvent(eventLog, {
        type: "supervisor_paused",
        actor: "sageos.supervisor",
        summary: `SageOS supervisor paused: ${reason}`,
      });
      await persist();
    },
    async resume(reason = "manual") {
      const now = new Date();
      status = {
        ...status,
        enabled: true,
        paused: false,
        state: "running",
        startedAt: status.startedAt ?? now.toISOString(),
        stoppedAt: undefined,
        ...markTickWindow(now),
      };
      armTimer();
      await appendSageOsEvent(eventLog, {
        type: "supervisor_resumed",
        actor: "sageos.supervisor",
        summary: `SageOS supervisor resumed: ${reason}`,
      });
      await persist();
    },
    async stop(reason = "manual") {
      clear();
      status = {
        ...status,
        enabled: false,
        paused: false,
        state: "stopped",
        stoppedAt: new Date().toISOString(),
        nextTickAt: undefined,
      };
      await appendSageOsEvent(eventLog, {
        type: "supervisor_stopped",
        actor: "sageos.supervisor",
        summary: `SageOS supervisor stopped: ${reason}`,
      });
      await persist();
    },
    async emergencyStop(reason = "manual") {
      clear();
      status = {
        enabled: false,
        paused: true,
        state: "stopped",
        stoppedAt: new Date().toISOString(),
      };
      await appendSageOsEvent(eventLog, {
        type: "emergency_stop",
        actor: "sageos.supervisor",
        summary: `SageOS emergency stop: ${reason}`,
        sensitivity: "normal",
      });
      await persist();
    },
    getStatus() {
      return { ...status };
    },
    getSnapshot() {
      return createSageOsStatusSnapshot({
        ...lastSnapshot,
        mode: normalizeSageOsMode(options.config?.sageos?.mode ?? options.mode),
        supervisor: status,
        audit: { ...lastSnapshot.audit, eventLogPath: eventLog.path },
      });
    },
  };
}

function hasEnabledSystemSource(cfg: SageOsConfig): boolean {
  const sources = cfg.sources ?? {};
  return [
    sources.system,
    sources.defender,
    sources.startupItems,
    sources.services,
    sources.disk,
    sources.processStatus,
  ].some((enabled) => enabled === true);
}
