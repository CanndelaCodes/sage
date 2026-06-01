import type { OverlayGatewayClient, OverlayGatewayEventFrame } from "./gateway-client.js";
import {
  approveSageOsApproval,
  cancelSageOsTask,
  denySageOsApproval,
  emergencyStopSageOs,
  loadSageOsOverlayStatus,
  pauseSageOs,
  queueSageOsTask,
  resumeSageOs,
  runNextSageOsTask,
  type SageOsOverlayStatusState,
} from "./sageos-actions.js";

export type SageOsOverlayControllerState = {
  connected: boolean;
  loading: boolean;
  error: string | null;
  sageOsState: SageOsOverlayStatusState | null;
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

  async cancelTask(id: string) {
    await this.runMutation(() => cancelSageOsTask(this.client, id));
  }

  async runNextTask() {
    await this.runMutation(() => runNextSageOsTask(this.client));
  }

  private async runMutation(run: () => Promise<unknown>) {
    this.state = { ...this.state, error: null };
    this.onChange();
    try {
      const result = await run();
      if (isSageOsOverlayStatusState(result)) {
        this.state = { ...this.state, connected: true, sageOsState: result };
      }
    } catch (err) {
      this.state = { ...this.state, error: String(err) };
    }
    this.onChange();
  }
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
