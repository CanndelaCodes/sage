import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SageConfig } from "../config/config.js";
import { enqueueLearningEvents } from "./activity-queue.js";
import { normalizeLearningEvent } from "./events.js";

export type LearningReviewRecordResult =
  | { status: "queued"; created: number; skipped: number }
  | { status: "skipped"; reason: "disabled" | "not-substantive" };

export async function recordAgentRunLearningReview(params: {
  cfg?: SageConfig;
  agentId: string;
  sessionKey?: string;
  workspace?: string;
  messages: AgentMessage[];
  success: boolean;
  error?: string;
  durationMs: number;
  toolMetas?: Array<{ toolName: string; meta?: string }>;
  queuePath?: string;
  now?: () => Date;
}): Promise<LearningReviewRecordResult> {
  if (
    params.cfg?.learning?.enabled !== true ||
    params.cfg.learning.review?.timing === "idle-batch"
  ) {
    return { status: "skipped", reason: "disabled" };
  }

  const lastUser = findLastMessageText(params.messages, "user");
  const lastAssistant = findLastMessageText(params.messages, "assistant");
  const reviewText = [
    lastUser ? `User: ${lastUser}` : "",
    lastAssistant ? `Assistant: ${lastAssistant}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (reviewText.length < 80 && !params.error && (params.toolMetas?.length ?? 0) === 0) {
    return { status: "skipped", reason: "not-substantive" };
  }

  const event = normalizeLearningEvent(
    {
      source: "review_decision",
      actor: "agent:learning",
      sessionKey: params.sessionKey,
      workspace: params.workspace,
      title: `after-task learning review ${params.sessionKey ?? params.agentId}`,
      text: reviewText || params.error || "Agent run completed.",
      payload: {
        success: params.success,
        error: params.error,
        durationMs: params.durationMs,
        toolMetas: params.toolMetas ?? [],
        candidateTypes: inferCandidateTypes(reviewText || params.error || ""),
      },
      provenance: {
        reviewTiming: "after-task",
      },
    },
    { now: params.now },
  );
  const queued = await enqueueLearningEvents({
    queuePath: params.queuePath,
    agentId: params.agentId,
    events: [event],
  });
  return { status: "queued", ...queued };
}

function findLastMessageText(messages: AgentMessage[], role: "user" | "assistant"): string {
  for (const message of messages.toReversed()) {
    if (message.role !== role) {
      continue;
    }
    const text = textFromContent(message.content).trim();
    if (text) {
      return truncate(text, 1200);
    }
  }
  return "";
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const record = block as Record<string, unknown>;
      if (typeof record.text === "string") {
        return record.text;
      }
      if (typeof record.input_text === "string") {
        return record.input_text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function inferCandidateTypes(text: string): string[] {
  const lower = text.toLowerCase();
  const types = new Set<string>();
  if (lower.includes("prefer") || lower.includes("remember") || lower.includes("always")) {
    types.add("preference");
  }
  if (lower.includes("workflow") || lower.includes("steps") || lower.includes("process")) {
    types.add("workflow");
  }
  if (lower.includes("skill") || lower.includes("next time")) {
    types.add("skill_gap");
  }
  if (lower.includes("browser") || lower.includes("tab") || lower.includes("click")) {
    types.add("browser_pattern");
  }
  if (lower.includes("tool") || lower.includes("error") || lower.includes("failed")) {
    types.add("tool_fix");
  }
  return [...types];
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
