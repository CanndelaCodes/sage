import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { createSageOsEventLog, appendSageOsEvent } from "../sageos/event-log.js";
import {
  createSageOsControlStore,
  readSageOsState,
  writeSageOsControl,
  writeSageOsState,
  createSageOsStateStore,
} from "../sageos/state-store.js";
import { createSageOsStatusSnapshot } from "../sageos/types.js";

const renderStatus = (snapshot: ReturnType<typeof createSageOsStatusSnapshot>): string => {
  const lines = [
    "SageOS Command Center",
    `Mode: ${snapshot.mode}`,
    `Supervisor: ${snapshot.supervisor.state}${snapshot.supervisor.paused ? " (paused)" : ""}`,
    `Employees: ${snapshot.employees.active}/${snapshot.employees.total} active`,
    `Tasks: ${snapshot.tasks.active} active, ${snapshot.tasks.queued} queued, ${snapshot.tasks.blocked} blocked`,
    `Approvals: ${snapshot.approvals.pending} pending`,
    `Incidents: ${snapshot.incidents.length}`,
  ];
  if (snapshot.audit.eventLogPath) {
    lines.push(`Audit: ${snapshot.audit.eventLogPath}`);
  }
  return lines.join("\n");
};

async function loadSnapshot() {
  const store = createSageOsStateStore();
  const state = await readSageOsState(store);
  return state.status;
}

async function updateSupervisorState(
  state: "paused" | "running" | "stopped",
  opts: { reason?: string; emergency?: boolean } = {},
) {
  const store = createSageOsStateStore();
  const controlStore = createSageOsControlStore();
  const eventLog = createSageOsEventLog();
  const current = await readSageOsState(store);
  const now = new Date();
  const isStopped = state === "stopped";
  const nextTickAt =
    state === "running" ? new Date(now.getTime() + 30_000).toISOString() : undefined;
  const supervisor = {
    ...current.status.supervisor,
    enabled: opts.emergency ? false : !isStopped,
    paused: state === "paused" || Boolean(opts.emergency),
    state,
    lastTickAt: state === "running" ? now.toISOString() : current.status.supervisor.lastTickAt,
    stoppedAt: isStopped ? now.toISOString() : undefined,
    nextTickAt,
  };
  const status = createSageOsStatusSnapshot({
    ...current.status,
    supervisor,
    audit: { ...current.status.audit, eventLogPath: eventLog.path },
  });
  const eventType = opts.emergency
    ? "emergency_stop"
    : state === "running"
      ? "supervisor_resumed"
      : state === "paused"
        ? "supervisor_paused"
        : "supervisor_stopped";
  await appendSageOsEvent(eventLog, {
    type: eventType,
    actor: "sageos.cli",
    summary: `SageOS ${opts.emergency ? "emergency stop" : state}: ${opts.reason ?? "manual"}`,
  });
  await writeSageOsState(store, status);
  await writeSageOsControl(controlStore, { state, reason: opts.reason, emergency: opts.emergency });
  return status;
}

export function registerSageOsCli(program: Command) {
  const os = program.command("os").description("SageOS command center controls");

  os.command("status")
    .description("Show SageOS Command Center status")
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const snapshot = await loadSnapshot();
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : renderStatus(snapshot));
    });

  os.command("pause")
    .description("Pause SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("paused", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS paused");
    });

  os.command("resume")
    .description("Resume SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("running", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS resumed");
    });

  os.command("stop")
    .description("Stop SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("stopped", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS stopped");
    });

  os.command("emergency-stop")
    .description("Immediately stop SageOS and disable autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("stopped", {
        reason: opts.reason,
        emergency: true,
      });
      defaultRuntime.log(
        opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS emergency stop engaged",
      );
    });
}
