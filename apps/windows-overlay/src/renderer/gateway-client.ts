import { GATEWAY_CLIENT_IDS } from "../../../../src/gateway/protocol/client-info.js";

export type OverlayGatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type OverlayGatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string; details?: unknown };
};

export type OverlayGatewayHelloOk = {
  type: "hello-ok";
  protocol?: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

type OverlayWebSocket = {
  readyState: number;
  addEventListener(event: string, listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void;
  send(data: string): void;
  close(): void;
};

type OverlayWebSocketCtor = {
  new (url: string): OverlayWebSocket;
  OPEN?: number;
};

export type OverlayGatewayClient = {
  request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
};

export type OverlayGatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientVersion?: string;
  platform?: string;
  instanceId?: string;
  connectDelayMs?: number;
  WebSocketCtor?: OverlayWebSocketCtor;
  createId?: () => string;
  onHello?: (hello: OverlayGatewayHelloOk) => void;
  onEvent?: (event: OverlayGatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
};

const GATEWAY_OPEN_STATE = 1;

export class OverlayGatewayBrowserClient implements OverlayGatewayClient {
  private ws: OverlayWebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private connectSent = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: OverlayGatewayBrowserClientOptions) {}

  start() {
    const WebSocketCtor = this.opts.WebSocketCtor ?? globalThis.WebSocket;
    this.ws = new WebSocketCtor(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (event) => {
      this.handleMessage(typeof event.data === "string" ? event.data : "");
    });
    this.ws.addEventListener("close", (event) => {
      this.flushPending(new Error(`gateway closed (${event.code ?? 0}): ${event.reason ?? ""}`));
      this.opts.onClose?.({ code: event.code ?? 0, reason: event.reason ?? "" });
      this.ws = null;
    });
  }

  stop() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.isOpen()) {
      return Promise.reject(new Error("gateway not connected"));
    }

    const id = this.opts.createId?.() ?? createRequestId();
    const frame = { type: "req", id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
    this.ws?.send(JSON.stringify(frame));
    return promise;
  }

  private queueConnect() {
    this.connectSent = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    const delay = this.opts.connectDelayMs ?? 250;
    if (delay === 0) {
      void this.sendConnect();
      return;
    }
    this.connectTimer = setTimeout(() => {
      void this.sendConnect();
    }, delay);
  }

  private async sendConnect() {
    if (this.connectSent || !this.isOpen()) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const auth =
      this.opts.token || this.opts.password
        ? {
            token: this.opts.token,
            password: this.opts.password,
          }
        : undefined;

    const hello = await this.request<OverlayGatewayHelloOk>("connect", {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: GATEWAY_CLIENT_IDS.WINDOWS_OVERLAY,
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? "windows-overlay",
        mode: "ui",
        instanceId: this.opts.instanceId,
      },
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    });
    this.opts.onHello?.(hello);
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const event = parsed as OverlayGatewayEventFrame;
      if (event.event === "connect.challenge") {
        void this.sendConnect();
        return;
      }
      this.opts.onEvent?.(event);
      return;
    }

    if (frame.type === "res") {
      const response = parsed as OverlayGatewayResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        pending.reject(new Error(response.error?.message ?? "request failed"));
      }
    }
  }

  private isOpen() {
    const openState = this.opts.WebSocketCtor?.OPEN ?? globalThis.WebSocket?.OPEN ?? GATEWAY_OPEN_STATE;
    return this.ws?.readyState === openState;
  }

  private flushPending(err: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(err);
    }
    this.pending.clear();
  }
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `overlay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
