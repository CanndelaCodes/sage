import type { SageOsConfig } from "./types.js";
import { pruneSageOsObservations, type SageOsStateStore } from "./state-store.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function applySageOsObservationRetention(params: {
  store: SageOsStateStore;
  cfg?: SageOsConfig;
  now: Date;
}): Promise<void> {
  const cutoff = sageOsObservationRetentionCutoff(params.now, params.cfg);
  if (cutoff) {
    await pruneSageOsObservations(params.store, cutoff);
  }
}

export function sageOsObservationRetentionCutoff(
  now: Date,
  cfg: SageOsConfig | undefined,
): Date | undefined {
  const retentionDays = cfg?.privacy?.observationRetentionDays;
  if (typeof retentionDays !== "number" || !Number.isFinite(retentionDays) || retentionDays < 0) {
    return undefined;
  }
  return new Date(now.getTime() - Math.floor(retentionDays) * MS_PER_DAY);
}
