import fs from "node:fs/promises";

type JsonObject = Record<string, unknown>;

export type SageMemoryLlmSessionMessage = {
  role: string;
  content: string;
  timestamp?: string;
  model?: string;
  tool_name?: string;
  attachments?: JsonObject[];
  metadata?: JsonObject;
};

export type SageMemoryLlmSessionIngestInput = {
  namespace: string;
  source: "sage";
  session_id: string;
  title: string;
  source_uri: string;
  started_at?: string;
  ended_at?: string;
  workspace: JsonObject;
  messages: SageMemoryLlmSessionMessage[];
  metadata: JsonObject;
  sensitivity: "private";
};

export async function loadSageSessionTranscriptForMemory(params: {
  sessionFile: string;
  sessionId?: string;
  sessionKey: string;
  namespace?: string;
  markdownPath?: string;
}): Promise<SageMemoryLlmSessionIngestInput | null> {
  const rows = parseJsonl(await fs.readFile(params.sessionFile, "utf-8"));
  const header = rows.find((row) => readString(row.type) === "session");
  const sessionId = params.sessionId?.trim() || readString(header?.id) || "unknown";
  const messages = rows.flatMap((row) => mapTranscriptRow(row));
  if (messages.length === 0) {
    return null;
  }

  const startedAt = normalizeTimestamp(header?.timestamp);
  const endedAt = latestTimestamp(messages);
  const workspace: JsonObject = {
    session_key: params.sessionKey,
    session_file: params.sessionFile,
  };
  const cwd = readString(header?.cwd);
  if (cwd) {
    workspace.cwd = cwd;
  }

  const metadata: JsonObject = {
    capture_method: "sage-session-memory-hook",
    sessionKey: params.sessionKey,
    sessionId,
    sessionFile: params.sessionFile,
  };
  if (params.markdownPath) {
    metadata.markdownPath = params.markdownPath;
  }

  return {
    namespace: params.namespace?.trim() || "sage.sessions",
    source: "sage",
    session_id: sessionId,
    title: `Sage Session ${sessionId}`,
    source_uri: `sage://session/${encodeURIComponent(sessionId)}`,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(endedAt ? { ended_at: endedAt } : {}),
    workspace,
    messages,
    metadata,
    sensitivity: "private",
  };
}

function parseJsonl(content: string): JsonObject[] {
  const rows: JsonObject[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isObject(parsed)) {
        rows.push(parsed);
      }
    } catch {
      // Transcripts are append-only logs; a bad line should not block capture.
    }
  }
  return rows;
}

function mapTranscriptRow(row: JsonObject): SageMemoryLlmSessionMessage[] {
  const message = isObject(row.message) ? row.message : undefined;
  const source = message ?? row;
  const role = normalizeRole(readString(source.role) || readString(row.role));
  if (!role) {
    return [];
  }
  const content = extractContent(source.content ?? row.content);
  if (!content) {
    return [];
  }

  const mapped: SageMemoryLlmSessionMessage = {
    role,
    content,
    ...(normalizeTimestamp(source.timestamp ?? row.timestamp)
      ? { timestamp: normalizeTimestamp(source.timestamp ?? row.timestamp) }
      : {}),
    ...(readString(source.model ?? row.model)
      ? { model: readString(source.model ?? row.model) }
      : {}),
    ...(readString(source.tool_name ?? source.toolName ?? row.tool_name ?? row.toolName)
      ? {
          tool_name: readString(
            source.tool_name ?? source.toolName ?? row.tool_name ?? row.toolName,
          ),
        }
      : {}),
    metadata: { sage_entry_type: readString(row.type) || "unknown" },
  };
  const attachments = readObjectArray(source.attachments ?? row.attachments);
  if (attachments.length > 0) {
    mapped.attachments = attachments;
  }
  return [mapped];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function normalizeRole(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized === "human") {
    return "user";
  }
  if (normalized === "toolresult" || normalized === "tool_result") {
    return "tool";
  }
  if (["user", "assistant", "tool", "system"].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function extractContent(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const parts = value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (!isObject(entry)) {
        return "";
      }
      return readString(entry.text) || readString(entry.content) || "";
    })
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const raw = readString(value);
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function latestTimestamp(messages: SageMemoryLlmSessionMessage[]): string | undefined {
  let latest = 0;
  for (const message of messages) {
    if (!message.timestamp) {
      continue;
    }
    const time = new Date(message.timestamp).getTime();
    if (Number.isFinite(time) && time > latest) {
      latest = time;
    }
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}
