import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import type { SageOsConfig, SageOsObservation } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import { applySageOsObservationRetention } from "./observation-retention.js";
import {
  createSageOsStateStore,
  upsertSageOsObservation,
  type SageOsStateStore,
} from "./state-store.js";

const execFileAsync = promisify(execFile) as unknown as (
  file: string,
  args: string[],
  opts: { encoding: "utf8"; timeout: number; maxBuffer: number; windowsHide?: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export type SageOsSystemCheckStatus = "ok" | "warning" | "failed" | "unavailable" | "redacted";

export type SageOsSystemCheck = {
  id: string;
  label: string;
  status: SageOsSystemCheckStatus;
  summary: string;
  details?: Record<string, unknown>;
};

export type SageOsSystemStatusSnapshot = {
  platform: string;
  checkedAt: string;
  checks: SageOsSystemCheck[];
};

export type SageOsSystemObserveResult =
  | { status: "recorded"; observation: SageOsObservation }
  | { status: "skipped"; reason: "disabled" };

export async function observeSystemStatusOnce(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now?: () => Date;
  readSystemStatus?: () => Promise<SageOsSystemStatusSnapshot>;
}): Promise<SageOsSystemObserveResult> {
  if (!isSystemSourceEnabled(params.cfg)) {
    return { status: "skipped", reason: "disabled" };
  }

  const now = params.now?.() ?? new Date();
  try {
    const snapshot = await (params.readSystemStatus ?? (() => readSystemStatusSnapshot()))();
    const observation = await persistSystemObservation({
      cfg: params.cfg,
      stateDir: params.stateDir,
      stateStore: params.stateStore,
      now,
      snapshot,
    });
    return { status: "recorded", observation };
  } catch (err) {
    const observation = await persistSystemFailureObservation({
      cfg: params.cfg,
      stateDir: params.stateDir,
      stateStore: params.stateStore,
      now,
      error: String(err),
    });
    return { status: "recorded", observation };
  }
}

export async function readSystemStatusSnapshot(
  params: {
    platform?: NodeJS.Platform;
    now?: () => Date;
    execPowerShellJson?: (command: string) => Promise<unknown>;
  } = {},
): Promise<SageOsSystemStatusSnapshot> {
  const platform = params.platform ?? process.platform;
  const checkedAt = (params.now?.() ?? new Date()).toISOString();
  const checks: SageOsSystemCheck[] = [runtimeCheck()];

  if (platform !== "win32") {
    checks.push({
      id: "windows_readonly",
      label: "Windows read-only collectors",
      status: "unavailable",
      summary: `Windows read-only collectors are unavailable on ${platform}.`,
    });
    return { platform, checkedAt, checks };
  }

  const execJson = params.execPowerShellJson ?? runPowerShellJson;
  checks.push(await defenderCheck(execJson));
  checks.push(await startupCheck(execJson));
  checks.push(await diskCheck(execJson));
  checks.push(await servicesCheck(execJson));
  checks.push(await processesCheck(execJson));
  checks.push(await portsCheck(execJson));
  return { platform, checkedAt, checks };
}

function isSystemSourceEnabled(cfg: SageOsConfig | undefined): boolean {
  const sources = cfg?.sources ?? {};
  return [
    sources.system,
    sources.defender,
    sources.startupItems,
    sources.services,
    sources.disk,
    sources.processStatus,
  ].some((enabled) => enabled === true);
}

async function persistSystemObservation(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now: Date;
  snapshot: SageOsSystemStatusSnapshot;
}): Promise<SageOsObservation> {
  const checks = redactDeniedSystemChecks(params.snapshot.checks, params.cfg);
  const summary = summarizeChecks(checks);
  const observation: SageOsObservation = {
    id: `obs_${randomUUID()}`,
    source: "system",
    state: "captured",
    title: "System status",
    text: `System status: ${params.snapshot.checks.length} check(s), ${summary.warnings} warning(s), ${summary.failures} failure(s).`,
    sensitivity: "private",
    observedAt: params.now.toISOString(),
    payload: {
      platform: params.snapshot.platform,
      checkedAt: params.snapshot.checkedAt,
      checks,
      summary,
    },
    provenance: { adapter: "system" },
    createdAt: params.now.toISOString(),
    updatedAt: params.now.toISOString(),
  };
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  await applySageOsObservationRetention({ store: stateStore, cfg: params.cfg, now: params.now });

  const event = await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "observation_recorded",
    actor: "sageos.system_observer",
    summary: `Recorded SageOS system observation: ${summary.ok} ok, ${summary.warnings} warning(s), ${summary.failures} failure(s).`,
    sensitivity: "private",
  });
  const observationWithEvent = { ...observation, eventId: event.id };
  await upsertSageOsObservation(stateStore, observationWithEvent);
  return observationWithEvent;
}

function redactDeniedSystemChecks(
  checks: SageOsSystemCheck[],
  cfg: SageOsConfig | undefined,
): SageOsSystemCheck[] {
  const denied = new Set((cfg?.privacy?.denySystemChecks ?? []).map(normalizeCheckKey));
  if (denied.size === 0) {
    return checks;
  }
  return checks.map((check) => {
    if (!denied.has(normalizeCheckKey(check.id)) && !denied.has(normalizeCheckKey(check.label))) {
      return check;
    }
    return {
      id: check.id,
      label: check.label,
      status: "redacted",
      summary: `${check.label} check redacted by SageOS privacy policy.`,
    };
  });
}

function normalizeCheckKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function persistSystemFailureObservation(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  now: Date;
  error: string;
}): Promise<SageOsObservation> {
  const observation: SageOsObservation = {
    id: `obs_${randomUUID()}`,
    source: "system",
    state: "failed",
    title: "System status unavailable",
    text: "System status collection failed.",
    sensitivity: "private",
    observedAt: params.now.toISOString(),
    payload: { error: truncate(params.error, 300) },
    provenance: { adapter: "system" },
    reason: "collector_failed",
    createdAt: params.now.toISOString(),
    updatedAt: params.now.toISOString(),
  };
  const stateStore = params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir });
  await applySageOsObservationRetention({ store: stateStore, cfg: params.cfg, now: params.now });

  const event = await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "observation_failed",
    actor: "sageos.system_observer",
    summary: `SageOS system observation failed: ${truncate(params.error, 160)}`,
    sensitivity: "private",
  });
  const observationWithEvent = { ...observation, eventId: event.id };
  await upsertSageOsObservation(stateStore, observationWithEvent);
  return observationWithEvent;
}

function runtimeCheck(): SageOsSystemCheck {
  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : null;
  return {
    id: "runtime",
    label: "Runtime",
    status: "ok",
    summary: `Host uptime ${Math.round(os.uptime())}s, memory used ${usedPct ?? "unknown"}%.`,
    details: {
      uptimeSeconds: Math.round(os.uptime()),
      cpuCount: os.cpus().length,
      memoryUsedPercent: usedPct,
    },
  };
}

async function defenderCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const data = asRecord(
      await execJson(
        "Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareEnabled,ComputerState,QuickScanAge,FullScanAge | ConvertTo-Json -Compress",
      ),
    );
    const antivirusEnabled = readBoolean(data.AntivirusEnabled);
    const realTimeProtectionEnabled = readBoolean(data.RealTimeProtectionEnabled);
    const ok = antivirusEnabled === true && realTimeProtectionEnabled === true;
    return {
      id: "defender",
      label: "Defender",
      status: ok ? "ok" : "warning",
      summary: ok
        ? "Defender antivirus and real-time protection are enabled."
        : "Defender needs review.",
      details: {
        antivirusEnabled,
        realTimeProtectionEnabled,
        antispywareEnabled: readBoolean(data.AntispywareEnabled),
        computerState: readString(data.ComputerState),
        quickScanAge: readNumber(data.QuickScanAge),
        fullScanAge: readNumber(data.FullScanAge),
      },
    };
  } catch (err) {
    return unavailableCheck("defender", "Defender", err);
  }
}

async function startupCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const rows = asArray(
      await execJson(
        "@(Get-CimInstance Win32_StartupCommand | Select-Object -First 50 Name,Location,User) | ConvertTo-Json -Compress",
      ),
    ).map(asRecord);
    return {
      id: "startup",
      label: "Startup",
      status: rows.length > 40 ? "warning" : "ok",
      summary: `${rows.length} startup item(s) visible.`,
      details: {
        count: rows.length,
        entries: rows.slice(0, 10).map((row) => ({
          name: readString(row.Name),
          location: readString(row.Location),
          user: readString(row.User),
        })),
      },
    };
  } catch (err) {
    return unavailableCheck("startup", "Startup", err);
  }
}

async function diskCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const rows = asArray(
      await execJson(
        '@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FreeSpace,Size) | ConvertTo-Json -Compress',
      ),
    ).map(asRecord);
    const disks = rows.map((row) => {
      const size = readNumber(row.Size);
      const free = readNumber(row.FreeSpace);
      const freePercent = size && free !== undefined ? Math.round((free / size) * 1000) / 10 : null;
      return { deviceId: readString(row.DeviceID), freePercent };
    });
    const low = disks.find((disk) => typeof disk.freePercent === "number" && disk.freePercent < 10);
    return {
      id: "disk",
      label: "Disk",
      status: low ? "warning" : "ok",
      summary: low
        ? `Low disk space on ${low.deviceId || "a local disk"}: ${low.freePercent}% free.`
        : `${disks.length} local disk(s) checked.`,
      details: { disks },
    };
  } catch (err) {
    return unavailableCheck("disk", "Disk", err);
  }
}

async function servicesCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const count = readNumber(
      await execJson(
        "(Get-Service | Where-Object {$_.Status -eq 'Running'} | Measure-Object).Count | ConvertTo-Json -Compress",
      ),
    );
    return {
      id: "services",
      label: "Services",
      status: "ok",
      summary: `${count ?? 0} running service(s) visible.`,
      details: { runningCount: count ?? 0 },
    };
  } catch (err) {
    return unavailableCheck("services", "Services", err);
  }
}

async function processesCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const rows = asArray(
      await execJson(
        "@(Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 ProcessName,Id,CPU,WorkingSet64) | ConvertTo-Json -Compress",
      ),
    ).map(asRecord);
    const samples = rows.map((row) => ({
      name: readString(row.ProcessName),
      pid: readNumber(row.Id),
      cpuSeconds: readNumber(row.CPU),
      workingSetBytes: readNumber(row.WorkingSet64),
    }));
    return {
      id: "processes",
      label: "Processes",
      status: samples.length > 0 ? "ok" : "warning",
      summary: `${samples.length} top process(es) sampled.`,
      details: { samples },
    };
  } catch (err) {
    return unavailableCheck("processes", "Processes", err);
  }
}

async function portsCheck(
  execJson: (command: string) => Promise<unknown>,
): Promise<SageOsSystemCheck> {
  try {
    const rows = asArray(
      await execJson(
        "@(Get-NetTCPConnection -State Listen | Select-Object -First 50 LocalAddress,LocalPort,OwningProcess) | ConvertTo-Json -Compress",
      ),
    ).map(asRecord);
    const listeners = rows.map((row) => ({
      localAddress: readString(row.LocalAddress),
      localPort: readNumber(row.LocalPort),
      owningProcess: readNumber(row.OwningProcess),
    }));
    return {
      id: "ports",
      label: "Listening Ports",
      status: listeners.length > 40 ? "warning" : "ok",
      summary: `${listeners.length} listening TCP port(s) visible.`,
      details: { listeners },
    };
  } catch (err) {
    return unavailableCheck("ports", "Listening Ports", err);
  }
}

async function runPowerShellJson(command: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", timeout: 2_500, maxBuffer: 1024 * 1024, windowsHide: true },
  );
  const raw = stdout.trim();
  return raw ? JSON.parse(raw) : null;
}

function summarizeChecks(checks: SageOsSystemCheck[]) {
  return {
    ok: checks.filter((check) => check.status === "ok").length,
    warnings: checks.filter((check) => check.status === "warning").length,
    failures: checks.filter((check) => check.status === "failed").length,
    unavailable: checks.filter((check) => check.status === "unavailable").length,
  };
}

function unavailableCheck(id: string, label: string, err: unknown): SageOsSystemCheck {
  return {
    id,
    label,
    status: "unavailable",
    summary: `${label} check unavailable: ${truncate(String(err), 120)}`,
  };
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === null || value === undefined ? [] : [value];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}
