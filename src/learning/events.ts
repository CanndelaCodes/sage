import crypto from "node:crypto";
import type { LearningEvent, LearningEventInput, LearningEventSummary } from "./types.js";

type NormalizeDeps = {
  now?: () => Date;
  idFactory?: () => string;
};

export function normalizeLearningEvent(
  input: LearningEventInput,
  deps: NormalizeDeps = {},
): LearningEvent {
  const now = deps.now?.() ?? new Date();
  const startedAt = normalizeDate(input.startedAt, now);
  const endedAt = normalizeDate(input.endedAt, new Date(startedAt));
  const text = input.text?.trim() ?? "";
  const title = input.title?.trim();
  const payload = normalizeRecord(input.payload);
  const provenance = normalizeRecord(input.provenance);
  const event: Omit<LearningEvent, "id" | "activityHash"> = {
    source: input.source,
    actor: input.actor?.trim() || "local-user",
    ...(input.sessionKey?.trim() ? { sessionKey: input.sessionKey.trim() } : {}),
    ...(input.workspace?.trim() ? { workspace: input.workspace.trim() } : {}),
    startedAt,
    endedAt,
    ...(title ? { title } : {}),
    text,
    payload,
    sensitivity: input.sensitivity ?? "private",
    provenance,
  };
  return {
    id: deps.idFactory?.() ?? crypto.randomUUID(),
    ...event,
    activityHash: hashLearningEvent(event),
  };
}

export function summarizeLearningEvent(event: LearningEvent): LearningEventSummary {
  return {
    id: event.id,
    source: event.source,
    actor: event.actor,
    ...(event.title ? { title: event.title } : {}),
    text: event.text,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    activityHash: event.activityHash,
  };
}

function hashLearningEvent(event: Omit<LearningEvent, "id" | "activityHash">): string {
  const stable = {
    source: event.source,
    actor: event.actor,
    sessionKey: event.sessionKey,
    workspace: event.workspace,
    title: event.title,
    text: event.text,
    payload: event.payload,
    provenance: event.provenance,
  };
  return crypto.createHash("sha256").update(stableStringify(stable)).digest("hex");
}

function normalizeDate(input: string | Date | undefined, fallback: Date): string {
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input.toISOString();
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = new Date(input);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback.toISOString();
}

function normalizeRecord(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) {
    return {};
  }
  return JSON.parse(stableStringify(input)) as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).toSorted();
  return `{${keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
