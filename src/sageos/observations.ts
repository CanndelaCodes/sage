import { randomUUID } from "node:crypto";
import path from "node:path";
import type { LearningEvent } from "../learning/types.js";
import type { SageOsConfig, SageOsObservation } from "./types.js";
import { enqueueLearningEvents } from "../learning/activity-queue.js";
import { readActiveAppFocus, type ActiveAppFocusResult } from "../learning/app-focus.js";
import { normalizeLearningEvent } from "../learning/events.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  upsertSageOsObservation,
  type SageOsStateStore,
} from "./state-store.js";

type AppFocusSkipReason = "disabled" | "unsupported-platform" | "empty-result" | "invalid-result";

export type SageOsObserveResult =
  | {
      status: "recorded";
      observation: SageOsObservation;
      learning: { created: number; skipped: number };
    }
  | {
      status: "skipped";
      reason: AppFocusSkipReason;
    };

export async function observeAppFocusOnce(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  agentId?: string;
  stateStore?: SageOsStateStore;
  now?: () => Date;
  readFocus?: () => Promise<ActiveAppFocusResult>;
}): Promise<SageOsObserveResult> {
  if (params.cfg?.sources?.appFocus !== true) {
    return { status: "skipped", reason: "disabled" };
  }

  const focus = await (params.readFocus ?? (() => readActiveAppFocus()))();
  if (!focus.supported) {
    return { status: "skipped", reason: focus.reason };
  }

  const now = params.now?.() ?? new Date();
  const denialReason = getAppFocusDenialReason(focus.event, params.cfg);
  const learningEvent =
    denialReason === undefined
      ? focus.event
      : normalizeLearningEvent(
          {
            source: "app_focus",
            actor: focus.event.actor,
            title: "App focus redacted",
            text: "Active app focus redacted by SageOS privacy policy.",
            payload: { redacted: true, reason: denialReason },
            sensitivity: "private",
            provenance: {
              redactedFrom: focus.event.id,
              activityHash: focus.event.activityHash,
            },
          },
          { now: params.now },
        );
  const observation: SageOsObservation = {
    id: `obs_${randomUUID()}`,
    source: "app_focus",
    state: denialReason === undefined ? "captured" : "redacted",
    title: learningEvent.title ?? "App focus",
    text: learningEvent.text,
    sensitivity: learningEvent.sensitivity,
    observedAt: now.toISOString(),
    payload: learningEvent.payload,
    provenance: {
      adapter: "app_focus",
      learningActivityHash: learningEvent.activityHash,
    },
    ...(denialReason ? { reason: denialReason } : {}),
    learningEventId: learningEvent.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const event = await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: denialReason === undefined ? "observation_recorded" : "observation_redacted",
    actor: "sageos.observer",
    summary:
      denialReason === undefined
        ? `Recorded SageOS app focus observation: ${observation.title}`
        : `Redacted SageOS app focus observation: ${denialReason}`,
    sensitivity: observation.sensitivity,
  });
  const observationWithEvent = { ...observation, eventId: event.id };
  await upsertSageOsObservation(
    params.stateStore ?? createSageOsStateStore({ stateDir: params.stateDir }),
    observationWithEvent,
  );
  const learning = await enqueueLearningEvents({
    queuePath: learningQueuePath(params.stateDir, params.agentId),
    agentId: params.agentId,
    events: [learningEvent],
  });
  return { status: "recorded", observation: observationWithEvent, learning };
}

function learningQueuePath(
  stateDir: string | undefined,
  agentId: string | undefined,
): string | undefined {
  return stateDir
    ? path.join(stateDir, "agents", agentId ?? "main", "learning", "activity-queue.json")
    : undefined;
}

function getAppFocusDenialReason(
  event: LearningEvent,
  cfg: SageOsConfig | undefined,
): "deny_app" | "deny_window_title" | undefined {
  const processName = readString(event.payload.processName);
  if (processName) {
    const denied = cfg?.privacy?.denyApps ?? [];
    if (denied.some((entry) => entry.trim().toLowerCase() === processName.toLowerCase())) {
      return "deny_app";
    }
  }
  const windowTitle = readString(event.payload.windowTitle);
  if (windowTitle) {
    const patterns = cfg?.privacy?.denyWindowTitlePatterns ?? [];
    if (patterns.some((pattern) => matchesPattern(pattern, windowTitle))) {
      return "deny_window_title";
    }
  }
  return undefined;
}

function matchesPattern(pattern: string, value: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return false;
  }
  try {
    return new RegExp(trimmed, "i").test(value);
  } catch {
    return value.toLowerCase().includes(trimmed.toLowerCase());
  }
}

function readString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}
