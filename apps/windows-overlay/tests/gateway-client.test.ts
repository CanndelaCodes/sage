import { describe, expect, it, vi } from "vitest";
import { OverlayGatewayBrowserClient } from "../src/renderer/gateway-client.js";

type Listener = (event: { data?: string; code?: number; reason?: string }) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit("close", { code: 1000, reason: "closed" });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(value: unknown) {
    this.emit("message", { data: JSON.stringify(value) });
  }

  private emit(event: string, payload: { data?: string; code?: number; reason?: string }) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

function createClient(overrides: Partial<ConstructorParameters<typeof OverlayGatewayBrowserClient>[0]> = {}) {
  FakeWebSocket.instances = [];
  return new OverlayGatewayBrowserClient({
    url: "ws://127.0.0.1:18789",
    token: "token",
    password: "",
    connectDelayMs: 0,
    createId: vi.fn().mockReturnValueOnce("connect_1").mockReturnValueOnce("request_1"),
    WebSocketCtor: FakeWebSocket,
    ...overrides,
  });
}

describe("OverlayGatewayBrowserClient", () => {
  it("sends the gateway connect request when the socket opens", async () => {
    const client = createClient();
    client.start();

    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    await Promise.resolve();

    const frame = JSON.parse(ws.sent[0]!);
    expect(frame).toMatchObject({
      type: "req",
      id: "connect_1",
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        role: "operator",
        client: {
          id: "sage-control-ui",
          mode: "ui",
          platform: "windows-overlay",
        },
        auth: {
          token: "token",
        },
      },
    });
  });

  it("resolves requests from gateway response frames", async () => {
    const client = createClient();
    client.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    await Promise.resolve();

    const pending = client.request("sageos.status", {});
    const requestFrame = JSON.parse(ws.sent[1]!);
    expect(requestFrame).toMatchObject({
      type: "req",
      id: "request_1",
      method: "sageos.status",
    });

    ws.message({ type: "res", id: "request_1", ok: true, payload: { status: { mode: "observe" } } });

    await expect(pending).resolves.toEqual({ status: { mode: "observe" } });
  });

  it("forwards gateway events to the event handler", () => {
    const onEvent = vi.fn();
    const client = createClient({ onEvent });
    client.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();

    ws.message({ type: "event", event: "sageos", payload: { status: { mode: "execute_scoped" } } });

    expect(onEvent).toHaveBeenCalledWith({
      type: "event",
      event: "sageos",
      payload: { status: { mode: "execute_scoped" } },
    });
  });
});
