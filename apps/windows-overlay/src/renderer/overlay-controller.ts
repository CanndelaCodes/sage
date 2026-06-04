import type { OverlayGatewayClient, OverlayGatewayEventFrame } from "./gateway-client.js";
import {
  activateSageOsEmployee,
  abortSageAiChatSession,
  approveSageOsApproval,
  cancelSageOsTask,
  createSageOsTask,
  denySageOsApproval,
  emergencyStopSageOs,
  loadSageAiChatHistory,
  loadSageAiChatSessions,
  loadSageOsOverlayStatus,
  pauseSageOsEmployee,
  pauseSageOs,
  queueSageOsTask,
  resumeSageOsEmployee,
  resumeSageOs,
  retireSageOsEmployee,
  runSageOsIncidentRepair,
  runNextSageOsTask,
  runSageOsLauncherCommand,
  sendSageAiChatMessage,
  stopSageOs,
  type SageAiChatHistory,
  type SageAiChatSessions,
  type SageAiChatSessionRow,
  type SageOsOverlayStatusState,
} from "./sageos-actions.js";

export type SageOsOverlayChatState = {
  sessionKey: string;
  runId: string | null;
  state: "idle" | "sending" | "delta" | "final" | "aborted" | "error";
  stream: string | null;
  lastUserMessage: string | null;
  error: string | null;
  history: SageOsOverlayChatMessage[];
  historyLoading: boolean;
  sessions: SageOsOverlayChatSession[];
  sessionsLoading: boolean;
};

export type SageOsOverlayChatMessage = {
  key: string;
  role: "user" | "assistant" | "system" | "tool" | "unknown";
  label: string;
  text: string;
};
export type SageOsOverlayChatSession = {
  key: string;
  title: string;
  detail: string;
  updatedAt: string;
};

export type SageOsOverlayControllerState = {
  connected: boolean;
  loading: boolean;
  error: string | null;
  sageOsState: SageOsOverlayStatusState | null;
  chat: SageOsOverlayChatState;
};

export type StartableOverlayGatewayClient = OverlayGatewayClient & {
  start?: () => void;
  stop?: () => void;
};

export class SageOsOverlayController {
  state: SageOsOverlayControllerState = {
    connected: false,
    loading: false,
    error: null,
    sageOsState: null,
    chat: createInitialChatState(),
  };

  constructor(
    private readonly client: StartableOverlayGatewayClient,
    private readonly onChange: () => void = () => {},
  ) {}

  start() {
    this.client.start?.();
  }

  stop() {
    this.client.stop?.();
  }

  setConnected(connected: boolean) {
    this.state = { ...this.state, connected };
    this.onChange();
  }

  async loadStatus() {
    this.state = { ...this.state, loading: true, error: null };
    this.onChange();
    try {
      const sageOsState = await loadSageOsOverlayStatus(this.client);
      this.state = { ...this.state, connected: true, loading: false, sageOsState };
    } catch (err) {
      this.state = { ...this.state, loading: false, error: String(err) };
    }
    this.onChange();
  }

  handleGatewayEvent(event: OverlayGatewayEventFrame) {
    if (event.event === "chat") {
      this.handleChatGatewayEvent(event.payload);
      return;
    }

    if (event.event !== "sageos" || !isSageOsOverlayStatusState(event.payload)) {
      return;
    }
    this.state = {
      ...this.state,
      connected: true,
      error: null,
      sageOsState: event.payload,
    };
    this.onChange();
  }

  async pause() {
    await this.runMutation(() => pauseSageOs(this.client));
  }

  async resume() {
    await this.runMutation(() => resumeSageOs(this.client));
  }

  async stopSageOs() {
    await this.runMutation(() => stopSageOs(this.client));
  }

  async emergencyStop() {
    await this.runMutation(() => emergencyStopSageOs(this.client));
  }

  async approveApproval(id: string) {
    await this.runMutation(() => approveSageOsApproval(this.client, id));
  }

  async denyApproval(id: string) {
    await this.runMutation(() => denySageOsApproval(this.client, id));
  }

  async queueTask(id: string) {
    await this.runMutation(() => queueSageOsTask(this.client, id));
  }

  async createTask(task: { title: string; objective: string; ownerAgentId?: string; autonomyTier?: string }) {
    await this.runMutation(() => createSageOsTask(this.client, task));
  }

  async cancelTask(id: string) {
    await this.runMutation(() => cancelSageOsTask(this.client, id));
  }

  async runNextTask() {
    await this.runMutation(() => runNextSageOsTask(this.client));
  }

  async activateEmployee(id: string) {
    await this.runMutation(() => activateSageOsEmployee(this.client, id));
  }

  async pauseEmployee(id: string) {
    await this.runMutation(() => pauseSageOsEmployee(this.client, id));
  }

  async resumeEmployee(id: string) {
    await this.runMutation(() => resumeSageOsEmployee(this.client, id));
  }

  async retireEmployee(id: string) {
    await this.runMutation(() => retireSageOsEmployee(this.client, id));
  }

  async runIncidentRepair(id: string) {
    await this.runMutation(() => {
      if (!this.state.sageOsState) {
        throw new Error("SageOS state is not loaded");
      }
      return runSageOsIncidentRepair(this.client, this.state.sageOsState, id);
    });
  }

  async sendLauncherCommand(message: string, idempotencyKey?: string) {
    await this.runMutation(() =>
      runSageOsLauncherCommand(this.client, message, { idempotencyKey }),
    );
  }

  async loadChatHistory(sessionKey = this.state.chat.sessionKey, limit = 50): Promise<SageAiChatHistory | null> {
    this.state = {
      ...this.state,
      chat: { ...this.state.chat, sessionKey, historyLoading: true, error: null },
    };
    this.onChange();
    try {
      const history = await loadSageAiChatHistory(this.client, sessionKey, limit);
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          sessionKey,
          history: normalizeChatHistoryMessages(history.messages),
          historyLoading: false,
        },
      };
      return history;
    } catch (err) {
      this.state = {
        ...this.state,
        chat: { ...this.state.chat, historyLoading: false, error: String(err) },
      };
      return null;
    } finally {
      this.onChange();
    }
  }

  async loadChatSessions(limit = 8): Promise<SageAiChatSessions | null> {
    this.state = {
      ...this.state,
      chat: { ...this.state.chat, sessionsLoading: true, error: null },
    };
    this.onChange();
    try {
      const result = await loadSageAiChatSessions(this.client, limit);
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          sessions: normalizeChatSessions(result.sessions),
          sessionsLoading: false,
        },
      };
      return result;
    } catch (err) {
      this.state = {
        ...this.state,
        chat: { ...this.state.chat, sessionsLoading: false, error: String(err) },
      };
      return null;
    } finally {
      this.onChange();
    }
  }

  async resumeChatSession(sessionKey: string) {
    const trimmed = sessionKey.trim();
    if (!trimmed) {
      return null;
    }
    return this.loadChatHistory(trimmed);
  }

  async sendChatMessage(
    message: string,
    idempotencyKey?: string,
    sessionKey = this.state.chat.sessionKey,
  ) {
    const trimmed = message.trim();
    if (!trimmed) {
      return null;
    }
    this.state = {
      ...this.state,
      chat: {
        ...this.state.chat,
        sessionKey,
        runId: idempotencyKey ?? this.state.chat.runId,
        state: "sending",
        stream: "",
        lastUserMessage: trimmed,
        error: null,
      },
    };
    this.onChange();
    try {
      const result = await sendSageAiChatMessage(this.client, trimmed, {
        sessionKey,
        idempotencyKey,
      });
      const runId = extractRunId(result) ?? idempotencyKey ?? this.state.chat.runId;
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          sessionKey,
          runId,
          state: "sending",
          stream: this.state.chat.stream ?? "",
        },
      };
      return result;
    } catch (err) {
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          sessionKey,
          runId: null,
          state: "error",
          stream: null,
          error: String(err),
        },
      };
      return null;
    } finally {
      this.onChange();
    }
  }

  async abortChatSession(sessionKey = this.state.chat.sessionKey) {
    const runId = this.state.chat.runId;
    try {
      const result = await abortSageAiChatSession(this.client, sessionKey, runId);
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          sessionKey,
          runId: null,
          state: "aborted",
          stream: null,
        },
      };
      return result;
    } catch (err) {
      this.state = {
        ...this.state,
        chat: { ...this.state.chat, state: "error", error: String(err) },
      };
      return null;
    } finally {
      this.onChange();
    }
  }

  startNewChatSession(sessionKey = `overlay-${Date.now().toString(36)}`) {
    this.state = {
      ...this.state,
      chat: {
        ...createInitialChatState(sessionKey),
        sessions: this.state.chat.sessions,
      },
    };
    this.onChange();
    return sessionKey;
  }

  private handleChatGatewayEvent(payload: unknown) {
    if (!isOverlayChatEventPayload(payload)) {
      return;
    }
    if (payload.sessionKey !== this.state.chat.sessionKey) {
      return;
    }

    if (payload.state === "delta") {
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          runId: payload.runId,
          state: "delta",
          stream: extractChatEventText(payload.message) ?? this.state.chat.stream ?? "",
          error: null,
        },
      };
    } else if (payload.state === "final") {
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          runId: null,
          state: "final",
          stream: null,
          error: null,
        },
      };
    } else if (payload.state === "aborted") {
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          runId: null,
          state: "aborted",
          stream: null,
        },
      };
    } else {
      this.state = {
        ...this.state,
        chat: {
          ...this.state.chat,
          runId: null,
          state: "error",
          stream: null,
          error: payload.errorMessage ?? "chat error",
        },
      };
    }
    this.onChange();
  }

  private async runMutation(run: () => Promise<unknown>) {
    this.state = { ...this.state, loading: true, error: null };
    this.onChange();
    try {
      const result = await run();
      const sageOsState = extractSageOsOverlayStatusState(result);
      if (sageOsState) {
        this.state = { ...this.state, connected: true, loading: false, sageOsState };
      } else {
        this.state = { ...this.state, loading: false };
      }
    } catch (err) {
      this.state = { ...this.state, loading: false, error: String(err) };
    }
    this.onChange();
  }
}

function extractSageOsOverlayStatusState(value: unknown): SageOsOverlayStatusState | null {
  if (isSageOsOverlayStatusState(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null || !("state" in value)) {
    return null;
  }

  const wrappedState = (value as { state?: unknown }).state;
  return isSageOsOverlayStatusState(wrappedState) ? wrappedState : null;
}

function isSageOsOverlayStatusState(value: unknown): value is SageOsOverlayStatusState {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status?: unknown }).status === "object" &&
    (value as { status?: unknown }).status !== null
  );
}

function createInitialChatState(sessionKey = "main"): SageOsOverlayChatState {
  return {
    sessionKey,
    runId: null,
    state: "idle",
    stream: null,
    lastUserMessage: null,
    error: null,
    history: [],
    historyLoading: false,
    sessions: [],
    sessionsLoading: false,
  };
}

function normalizeChatHistoryMessages(messages: unknown): SageOsOverlayChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message, index) => {
    const text = extractChatEventText(message)?.trim();
    if (!text) {
      return [];
    }
    const role = normalizeChatHistoryRole(readStringField(message, "role"));
    return [
      {
        key: readStringField(message, "id") ?? `history-${index}`,
        role,
        label: formatChatHistoryRoleLabel(role),
        text,
      },
    ];
  });
}

function normalizeChatSessions(sessions: SageAiChatSessionRow[] | undefined): SageOsOverlayChatSession[] {
  return (sessions ?? []).map((session) => {
    const title =
      firstNonEmptyString(session.derivedTitle, session.displayName, session.label, session.subject) ??
      session.key;
    const detail =
      firstNonEmptyString(session.lastMessagePreview, session.subject, session.channel, session.kind) ??
      "No recent message preview";
    return {
      key: session.key,
      title,
      detail,
      updatedAt: formatSessionUpdatedAt(session.updatedAt),
    };
  });
}

function firstNonEmptyString(...values: Array<string | undefined | null>): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function formatSessionUpdatedAt(value: number | null | undefined): string {
  if (!value) {
    return "No recent activity";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeChatHistoryRole(role: string | null): SageOsOverlayChatMessage["role"] {
  const normalized = role?.toLowerCase();
  if (normalized === "user" || normalized === "assistant" || normalized === "system") {
    return normalized;
  }
  if (
    normalized === "tool" ||
    normalized === "toolresult" ||
    normalized === "tool_result" ||
    normalized === "function"
  ) {
    return "tool";
  }
  return "unknown";
}

function formatChatHistoryRoleLabel(role: SageOsOverlayChatMessage["role"]) {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "Sage";
  }
  if (role === "system") {
    return "System";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "Message";
}

function readStringField(value: unknown, field: string): string | null {
  return typeof value === "object" &&
    value !== null &&
    field in value &&
    typeof (value as Record<string, unknown>)[field] === "string"
    ? ((value as Record<string, unknown>)[field] as string)
    : null;
}

function extractRunId(value: unknown): string | null {
  return typeof value === "object" &&
    value !== null &&
    "runId" in value &&
    typeof (value as { runId?: unknown }).runId === "string"
    ? (value as { runId: string }).runId
    : null;
}

type OverlayChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function isOverlayChatEventPayload(value: unknown): value is OverlayChatEventPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const payload = value as { runId?: unknown; sessionKey?: unknown; state?: unknown };
  return (
    typeof payload.runId === "string" &&
    typeof payload.sessionKey === "string" &&
    (payload.state === "delta" ||
      payload.state === "final" ||
      payload.state === "aborted" ||
      payload.state === "error")
  );
}

function extractChatEventText(message: unknown): string | null {
  if (typeof message === "string") {
    return message;
  }
  if (typeof message !== "object" || message === null) {
    return null;
  }
  if ("text" in message && typeof (message as { text?: unknown }).text === "string") {
    return (message as { text: string }).text;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    const text = content.trim();
    return text || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .map((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "text" in entry &&
      typeof (entry as { text?: unknown }).text === "string"
        ? (entry as { text: string }).text
        : "",
    )
    .join("")
    .trim();
  return text || null;
}
