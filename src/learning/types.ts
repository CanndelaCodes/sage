import type { LearningEventSource } from "../config/types.learning.js";

export type LearningEventSensitivity = "public" | "normal" | "private" | "secret";

export type LearningEvent = {
  id: string;
  source: LearningEventSource;
  actor: string;
  sessionKey?: string;
  workspace?: string;
  startedAt: string;
  endedAt: string;
  title?: string;
  text: string;
  payload: Record<string, unknown>;
  sensitivity: LearningEventSensitivity;
  provenance: Record<string, unknown>;
  activityHash: string;
};

export type LearningEventInput = {
  source: LearningEventSource;
  actor?: string;
  sessionKey?: string;
  workspace?: string;
  startedAt?: string | Date;
  endedAt?: string | Date;
  title?: string;
  text?: string;
  payload?: Record<string, unknown>;
  sensitivity?: LearningEventSensitivity;
  provenance?: Record<string, unknown>;
};

export type LearningEventSummary = Pick<
  LearningEvent,
  "id" | "source" | "actor" | "startedAt" | "endedAt" | "activityHash"
> & {
  title?: string;
  text: string;
};

export type SageMemoryActivityEventsIngestInput = {
  namespace?: string;
  events: LearningEvent[];
};

export type SageMemoryActivityEventsIngestResult = {
  namespace: string;
  accepted: number;
  evidenceIds: string[];
  activityNodeIds: string[];
  deduplicated: boolean;
  eventIds: string[];
};
