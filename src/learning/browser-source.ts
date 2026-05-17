import { enqueueLearningEvents } from "./activity-queue.js";
import { normalizeLearningEvent } from "./events.js";

export type BrowserLearningConfig = {
  enabled?: boolean;
  queuePath?: string;
  agentId?: string;
  sessionKey?: string;
  workspace?: string;
};

export type BrowserLearningRecordResult =
  | { status: "queued"; created: number; skipped: number }
  | { status: "skipped"; reason: "disabled" | "missing-action" };

export async function recordBrowserToolLearningEvent(params: {
  learning?: BrowserLearningConfig;
  action?: string;
  profile?: string;
  target?: string;
  requestedNode?: string;
  args?: Record<string, unknown>;
  error?: string;
  now?: () => Date;
}): Promise<BrowserLearningRecordResult> {
  if (params.learning?.enabled !== true) {
    return { status: "skipped", reason: "disabled" };
  }
  const action = params.action?.trim();
  if (!action) {
    return { status: "skipped", reason: "missing-action" };
  }
  const compactArgs = compactBrowserArgs(params.args ?? {});
  const outcome = params.error ? `failed: ${params.error}` : "succeeded";
  const event = normalizeLearningEvent(
    {
      source: "browser",
      actor: "agent:browser",
      sessionKey: params.learning.sessionKey,
      workspace: params.learning.workspace,
      title: `browser ${action}`,
      text: `Browser action ${action} ${outcome}.`,
      payload: {
        action,
        profile: params.profile,
        target: params.target,
        requestedNode: params.requestedNode,
        args: compactArgs,
        error: params.error,
      },
      provenance: {
        toolName: "browser",
      },
    },
    { now: params.now },
  );
  const queued = await enqueueLearningEvents({
    queuePath: params.learning.queuePath,
    agentId: params.learning.agentId,
    events: [event],
  });
  return { status: "queued", ...queued };
}

function compactBrowserArgs(args: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    "action",
    "profile",
    "target",
    "node",
    "targetUrl",
    "targetId",
    "snapshotFormat",
    "refs",
    "selector",
    "frame",
    "level",
    "fullPage",
    "type",
  ];
  const compact: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = args[key];
    if (value === undefined) {
      continue;
    }
    compact[key] = typeof value === "string" ? truncate(value, 500) : value;
  }
  const request = args.request;
  if (request && typeof request === "object" && !Array.isArray(request)) {
    const record = request as Record<string, unknown>;
    compact.request = {
      kind: typeof record.kind === "string" ? record.kind : undefined,
      ref: typeof record.ref === "string" ? truncate(record.ref, 200) : undefined,
      element: typeof record.element === "string" ? truncate(record.element, 200) : undefined,
      text: typeof record.text === "string" ? truncate(record.text, 200) : undefined,
    };
  }
  return compact;
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
