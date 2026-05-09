import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  buildCorsHeaders,
  checkUpgradeUrlCredentials,
  checkWsUpgradeSecurity,
  detectSuspiciousConnection,
  validateWsOrigin,
} from "./ws-security.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(url: string, headers?: Record<string, string>): IncomingMessage {
  return {
    url,
    headers: headers ?? {},
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// validateWsOrigin
// ---------------------------------------------------------------------------

describe("validateWsOrigin", () => {
  it("allows connections without Origin header (native clients)", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: undefined,
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("allows loopback connection with loopback origin", () => {
    const result = validateWsOrigin({
      remoteAddr: "127.0.0.1",
      origin: "http://localhost:5173",
      requestHost: "127.0.0.1:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("allows loopback connection with 127.0.0.1 origin", () => {
    const result = validateWsOrigin({
      remoteAddr: "::ffff:127.0.0.1",
      origin: "http://127.0.0.1:18789",
      requestHost: "127.0.0.1:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("allows same-origin connections", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "https://gateway.example.com:18789",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("allows explicitly allowed origins", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "https://dashboard.example.com",
      requestHost: "gateway.example.com:18789",
      allowedOrigins: ["https://dashboard.example.com"],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects cross-origin remote connections", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "https://attacker.evil.com",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("origin not allowed");
    }
  });

  it("rejects null origin from remote", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "null",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(false);
  });

  it("allows null origin from loopback", () => {
    const result = validateWsOrigin({
      remoteAddr: "127.0.0.1",
      origin: "null",
      requestHost: "127.0.0.1:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("allows loopback IPv6 origin", () => {
    const result = validateWsOrigin({
      remoteAddr: "::1",
      origin: "http://[::1]:18789",
      requestHost: "[::1]:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects attacker origin from loopback when host is non-local", () => {
    const result = validateWsOrigin({
      remoteAddr: "127.0.0.1",
      origin: "https://attacker.evil.com",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(false);
  });

  it("is case-insensitive for origins", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "HTTPS://Gateway.Example.COM:18789",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("handles empty origin string", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "",
      requestHost: "gateway.example.com:18789",
    });
    // Empty string = no origin = native client
    expect(result.ok).toBe(true);
  });

  it("handles whitespace-only origin string", () => {
    const result = validateWsOrigin({
      remoteAddr: "10.0.0.5",
      origin: "   ",
      requestHost: "gateway.example.com:18789",
    });
    // Trims to empty = no origin
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkUpgradeUrlCredentials
// ---------------------------------------------------------------------------

describe("checkUpgradeUrlCredentials", () => {
  it("allows URL without query params", () => {
    const req = mockReq("/ws");
    expect(checkUpgradeUrlCredentials(req).ok).toBe(true);
  });

  it("allows URL with safe query params", () => {
    const req = mockReq("/ws?session=main&tab=chat");
    expect(checkUpgradeUrlCredentials(req).ok).toBe(true);
  });

  it("rejects URL with token param", () => {
    const req = mockReq("/ws?token=my-secret-token");
    const result = checkUpgradeUrlCredentials(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("token");
    }
  });

  it("rejects URL with password param", () => {
    const req = mockReq("/ws?password=my-secret-pass");
    const result = checkUpgradeUrlCredentials(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("password");
    }
  });

  it("rejects URL with apiKey param", () => {
    const req = mockReq("/ws?apiKey=sk-test-123");
    const result = checkUpgradeUrlCredentials(req);
    expect(result.ok).toBe(false);
  });

  it("rejects URL with secret param", () => {
    const req = mockReq("/ws?secret=abc");
    const result = checkUpgradeUrlCredentials(req);
    expect(result.ok).toBe(false);
  });

  it("rejects URL with key param", () => {
    const req = mockReq("/ws?key=abc");
    const result = checkUpgradeUrlCredentials(req);
    expect(result.ok).toBe(false);
  });

  it("handles URL with no path", () => {
    const req = mockReq("");
    expect(checkUpgradeUrlCredentials(req).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCorsHeaders
// ---------------------------------------------------------------------------

describe("buildCorsHeaders", () => {
  it("always includes Vary header", () => {
    const headers = buildCorsHeaders({});
    expect(headers["Vary"]).toBe("Origin");
  });

  it("returns only Vary when no origin", () => {
    const headers = buildCorsHeaders({ requestHost: "localhost:18789" });
    expect(Object.keys(headers)).toEqual(["Vary"]);
  });

  it("sets CORS headers for allowed origins", () => {
    const headers = buildCorsHeaders({
      origin: "http://localhost:5173",
      requestHost: "localhost:18789",
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Credentials"]).toBe("false");
  });

  it("does not set CORS for disallowed origins", () => {
    const headers = buildCorsHeaders({
      origin: "https://attacker.com",
      requestHost: "gateway.example.com:18789",
    });
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("respects allowedOrigins list", () => {
    const headers = buildCorsHeaders({
      origin: "https://custom-ui.example.com",
      requestHost: "gateway.example.com:18789",
      allowedOrigins: ["https://custom-ui.example.com"],
    });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://custom-ui.example.com");
  });
});

// ---------------------------------------------------------------------------
// detectSuspiciousConnection
// ---------------------------------------------------------------------------

describe("detectSuspiciousConnection", () => {
  it("returns null for normal loopback connection", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "127.0.0.1",
      origin: "http://localhost:5173",
      requestHost: "127.0.0.1:18789",
      userAgent: "Mozilla/5.0",
      upgradeHeader: "websocket",
    });
    expect(result).toBeNull();
  });

  it("returns null for native client without origin", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "10.0.0.5",
      requestHost: "gateway.example.com:18789",
      userAgent: "sage/1.0",
    });
    expect(result).toBeNull();
  });

  it("detects origin mismatch from remote browser", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "10.0.0.5",
      origin: "https://attacker.evil.com",
      requestHost: "gateway.example.com:18789",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      upgradeHeader: "websocket",
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("origin-mismatch");
  });

  it("detects missing origin from remote browser-like UA", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "10.0.0.5",
      requestHost: "gateway.example.com:18789",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0",
      upgradeHeader: "websocket",
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("missing-origin-remote");
  });

  it("detects non-websocket upgrade", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "10.0.0.5",
      upgradeHeader: "h2c",
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("unknown-upgrade");
  });

  it("skips origin mismatch for known sage clients", () => {
    const result = detectSuspiciousConnection({
      remoteAddr: "10.0.0.5",
      origin: "https://other-host.com",
      requestHost: "gateway.example.com:18789",
      userAgent: "sage/2.0.0",
      upgradeHeader: "websocket",
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkWsUpgradeSecurity (integration)
// ---------------------------------------------------------------------------

describe("checkWsUpgradeSecurity", () => {
  it("allows normal loopback connection", () => {
    const req = mockReq("/ws");
    const result = checkWsUpgradeSecurity({
      req,
      remoteAddr: "127.0.0.1",
      origin: "http://localhost:5173",
      requestHost: "127.0.0.1:18789",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects connection with token in URL", () => {
    const req = mockReq("/ws?token=stolen");
    const result = checkWsUpgradeSecurity({
      req,
      remoteAddr: "127.0.0.1",
      requestHost: "127.0.0.1:18789",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects cross-origin remote connection", () => {
    const req = mockReq("/ws");
    const result = checkWsUpgradeSecurity({
      req,
      remoteAddr: "10.0.0.5",
      origin: "https://attacker.evil.com",
      requestHost: "gateway.example.com:18789",
    });
    expect(result.ok).toBe(false);
  });

  it("calls onSuspicious for flagged connections", () => {
    const onSuspicious = vi.fn();
    const req = mockReq("/ws?token=leaked", { "user-agent": "Mozilla/5.0" });
    checkWsUpgradeSecurity({
      req,
      remoteAddr: "10.0.0.5",
      origin: "https://attacker.evil.com",
      requestHost: "gateway.example.com:18789",
      onSuspicious,
    });
    expect(onSuspicious).toHaveBeenCalled();
    expect(onSuspicious.mock.calls[0]![0].kind).toBe("url-credentials");
  });

  it("allows connection and still reports suspicious patterns", () => {
    const onSuspicious = vi.fn();
    const req = mockReq("/ws", {
      "user-agent": "Mozilla/5.0 Chrome/120.0.0.0",
      upgrade: "websocket",
    });
    const result = checkWsUpgradeSecurity({
      req,
      remoteAddr: "10.0.0.5",
      requestHost: "gateway.example.com:18789",
      onSuspicious,
    });
    // No origin = native client = allowed, but browser-like UA triggers suspicious
    expect(result.ok).toBe(true);
    expect(onSuspicious).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "missing-origin-remote" }),
    );
  });
});
