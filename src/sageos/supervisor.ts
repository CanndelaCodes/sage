import { createSageOsEventLog, appendSageOsEvent, type SageOsEventLog } from "./event-log.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsControl,
  writeSageOsState,
  type SageOsStateStore,
} from "./state-store.js";
import {
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
  type SageOsSupervisorStatus,
  type SageOsStatusSnapshot,
} from "./types.js";

export type SageOsSupervisorOptions = {
  stateDir?: string;
  intervalMs?: number;
  mode?: unknown;
  eventLog?: SageOsEventLog;
  stateStore?: SageOsStateStore;
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

export function createSageOsSupervisor(options: SageOsSupervisorOptions = {}): SageOsSupervisor {
  const intervalMs = Math.max(1, options.intervalMs ?? 30_000);
  const eventLog = options.eventLog ?? createSageOsEventLog({ stateDir: options.stateDir });
  const stateStore = options.stateStore ?? createSageOsStateStore({ stateDir: options.stateDir });
  const controlStore = createSageOsControlStore({ stateDir: options.stateDir });
  let timer: NodeJS.Timeout | undefined;
  let status: SageOsSupervisorStatus = { enabled: true, paused: false, state: "stopped" };
  let lastAppliedControlAt: string | undefined;

  const persist = async () => {
    await writeSageOsState(
      stateStore,
      createSageOsStatusSnapshot({
        mode: normalizeSageOsMode(options.mode),
        supervisor: status,
        audit: { recentEvents: 0, eventLogPath: eventLog.path },
      }),
    );
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
        mode: normalizeSageOsMode(options.mode),
        supervisor: status,
        audit: { recentEvents: 0, eventLogPath: eventLog.path },
      });
    },
  };
}
