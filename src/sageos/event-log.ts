import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SageOsSensitivity } from "./types.js";
import { resolveStateDir } from "../config/paths.js";

export type SageOsEventType =
  | "supervisor_started"
  | "supervisor_paused"
  | "supervisor_resumed"
  | "supervisor_stopped"
  | "task_queued"
  | "incident_created"
  | (string & {});

export type SageOsEventInput = {
  type: SageOsEventType;
  actor: string;
  summary: string;
  sensitivity?: SageOsSensitivity;
  traceId?: string;
  taskId?: string;
  runId?: string;
};

export type SageOsEvent = Required<Pick<SageOsEventInput, "type" | "actor" | "summary">> & {
  id: string;
  traceId: string;
  ts: string;
  sensitivity: SageOsSensitivity;
  taskId?: string;
  runId?: string;
};

export type SageOsEventLog = {
  path: string;
};

const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export function resolveSageOsStateDir(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "sageos");
}

export function createSageOsEventLog(
  opts: { stateDir?: string; path?: string } = {},
): SageOsEventLog {
  return { path: opts.path ?? path.join(resolveSageOsStateDir(opts.stateDir), "events.jsonl") };
}

export async function appendSageOsEvent(
  log: SageOsEventLog,
  input: SageOsEventInput,
): Promise<SageOsEvent> {
  const event: SageOsEvent = {
    id: id("evt"),
    traceId: input.traceId ?? id("trc"),
    ts: new Date().toISOString(),
    type: input.type,
    actor: input.actor,
    summary: input.summary,
    sensitivity: input.sensitivity ?? "normal",
    taskId: input.taskId,
    runId: input.runId,
  };
  await mkdir(path.dirname(log.path), { recursive: true });
  await appendFile(log.path, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readSageOsEvents(
  log: SageOsEventLog,
  opts: { limit?: number } = {},
): Promise<SageOsEvent[]> {
  try {
    const raw = await readFile(log.path, "utf8");
    const events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SageOsEvent);
    const limit =
      typeof opts.limit === "number" && Number.isFinite(opts.limit)
        ? Math.max(0, Math.floor(opts.limit))
        : undefined;
    return limit === undefined || limit >= events.length ? events : events.slice(-limit);
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
