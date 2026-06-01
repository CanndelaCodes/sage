import type { SageOsStatusSnapshot } from "../../../../src/sageos/types.js";
import type { OverlayGatewayClient } from "./gateway-client.js";

export type SageOsOverlayStatusState = {
  status: SageOsStatusSnapshot;
} & Record<string, unknown>;

export function loadSageOsOverlayStatus(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.status", {});
}

export function pauseSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "paused",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function resumeSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "running",
    emergency: false,
    reason: "windows-overlay",
  });
}

export function emergencyStopSageOs(client: OverlayGatewayClient) {
  return client.request<SageOsOverlayStatusState>("sageos.control", {
    state: "stopped",
    emergency: true,
    reason: "windows-overlay",
  });
}

export function approveSageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "approved",
    reason: "windows-overlay",
  });
}

export function denySageOsApproval(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.approvals.resolve", {
    id,
    decision: "denied",
    reason: "windows-overlay",
  });
}

export function queueSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.queue", { id, reason: "windows-overlay" });
}

export function runNextSageOsTask(client: OverlayGatewayClient) {
  return client.request("sageos.tasks.runNext", {});
}

export function cancelSageOsTask(client: OverlayGatewayClient, id: string) {
  return client.request("sageos.tasks.cancel", { id, reason: "windows-overlay" });
}
