import type { SageConfig } from "../config/types.sage.js";
import {
  createSageOsSupervisor,
  type SageOsSupervisor,
  type SageOsSupervisorOptions,
} from "../sageos/supervisor.js";

export type GatewaySageOsLifecycleLog = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error: (msg: string) => void;
};

export type GatewaySageOsSupervisorFactory = (
  options?: SageOsSupervisorOptions,
) => SageOsSupervisor;

export async function startGatewaySageOsSupervisor(params: {
  cfg: Pick<SageConfig, "sageos">;
  createSupervisor?: GatewaySageOsSupervisorFactory;
  log: GatewaySageOsLifecycleLog;
}): Promise<SageOsSupervisor | null> {
  const sageos = params.cfg.sageos;
  if (sageos?.enabled === false || sageos?.mode === "off") {
    params.log.info?.("SageOS supervisor not started: disabled by config");
    return null;
  }

  const options: SageOsSupervisorOptions = { config: params.cfg };
  if (sageos?.mode) {
    options.mode = sageos.mode;
  }
  const intervalSeconds = sageos?.supervisor?.intervalSeconds;
  if (typeof intervalSeconds === "number" && Number.isFinite(intervalSeconds)) {
    options.intervalMs = Math.max(1, Math.floor(intervalSeconds * 1000));
  }

  try {
    const supervisor = (params.createSupervisor ?? createSageOsSupervisor)(options);
    await supervisor.start();
    params.log.info?.("SageOS supervisor started");
    return supervisor;
  } catch (err) {
    params.log.error(`SageOS supervisor failed to start: ${String(err)}`);
    return null;
  }
}
