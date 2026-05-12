/**
 * WebSocket security middleware for CVE-2026-25253 hardening.
 *
 * Provides origin validation, suspicious connection detection, and
 * security logging for all gateway WebSocket connections.
 *
 * CVE-2026-25253: An attacker could craft a malicious webpage that opens
 * a WebSocket connection to a locally-running gateway. Without origin
 * validation, the browser would include cookies and the connection would
 * be accepted, allowing the attacker to hijack the gateway session.
 *
 * Mitigations:
 *   1. Origin validation on all WebSocket upgrade requests
 *   2. Rejection of auth credentials in URL query parameters
 *   3. CORS headers on HTTP responses
 *   4. Suspicious connection attempt logging
 */

import type { IncomingMessage } from "node:http";
import { isLoopbackAddress } from "./net.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WsOriginPolicy = {
  /** Allowed origins for non-loopback connections. */
  allowedOrigins?: string[];
  /** Whether to require Origin header on non-loopback connections (default: false). */
  requireOrigin?: boolean;
  /** Reject connections with auth credentials in the URL (default: true). */
  rejectUrlCredentials?: boolean;
};

export type WsSecurityCheckResult = { ok: true } | { ok: false; code: number; reason: string };

export type SuspiciousConnectionEvent = {
  kind:
    | "origin-mismatch"
    | "url-credentials"
    | "missing-origin-remote"
    | "rapid-reconnect"
    | "unknown-upgrade";
  remoteAddr?: string;
  origin?: string;
  host?: string;
  userAgent?: string;
  detail?: string;
  timestamp: number;
};

type SuspiciousConnectionLogger = (event: SuspiciousConnectionEvent) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Query parameters that must never appear in WebSocket upgrade URLs. */
const REJECTED_QUERY_PARAMS = ["token", "password", "apiKey", "secret", "key"];

/** Known legitimate non-browser user agents (partial matches). */
const KNOWN_CLIENT_UA_PATTERNS = [
  "sage/",
  "sage-cli",
  "sage-node",
  "sage-gateway",
  "sagebot",
  "node-fetch",
  "undici",
];

// ---------------------------------------------------------------------------
// Origin validation
// ---------------------------------------------------------------------------

function normalizeOriginHost(origin: string): string | null {
  try {
    const url = new URL(origin.trim());
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeRequestHost(hostHeader?: string): string {
  return (hostHeader ?? "").trim().toLowerCase();
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin.trim());
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
}

/**
 * Validate the Origin header of a WebSocket upgrade request.
 *
 * Rules:
 * - Loopback connections with loopback origins are always allowed
 *   (local CLI tools, dev servers, etc.)
 * - Non-browser clients (no Origin header) are allowed for native clients
 * - Browser connections (with Origin) must match the request Host or be
 *   in the allowed origins list
 * - Remote connections with non-matching origins are rejected
 */
export function validateWsOrigin(params: {
  remoteAddr?: string;
  origin?: string;
  requestHost?: string;
  allowedOrigins?: string[];
}): WsSecurityCheckResult {
  const { remoteAddr, origin, requestHost, allowedOrigins } = params;
  const isLocal = isLoopbackAddress(remoteAddr);

  // No Origin header = non-browser client (CLI, native app, etc.)
  // These are authenticated via token/device-identity at the protocol level.
  if (!origin || !origin.trim()) {
    return { ok: true };
  }

  const trimmedOrigin = origin.trim().toLowerCase();
  if (trimmedOrigin === "null") {
    // "null" origin can come from sandboxed iframes, file:// etc.
    // Reject for remote, allow for loopback.
    if (isLocal) {
      return { ok: true };
    }
    return { ok: false, code: 403, reason: "origin missing or null" };
  }

  // Loopback connections from loopback origins are always trusted
  if (isLocal && isLoopbackOrigin(trimmedOrigin)) {
    return { ok: true };
  }

  // Check against allowed origins list
  if (allowedOrigins?.length) {
    const normalizedAllowed = new Set(allowedOrigins.map((o) => o.trim().toLowerCase()));
    if (normalizedAllowed.has(trimmedOrigin)) {
      return { ok: true };
    }
    // Also try matching just the origin (scheme + host)
    try {
      const originUrl = new URL(trimmedOrigin);
      if (normalizedAllowed.has(originUrl.origin.toLowerCase())) {
        return { ok: true };
      }
    } catch {
      // invalid origin URL
    }
  }

  // Same-origin check: origin host matches request Host header
  const originHost = normalizeOriginHost(trimmedOrigin);
  const reqHost = normalizeRequestHost(requestHost);
  if (originHost && reqHost && originHost === reqHost) {
    return { ok: true };
  }

  // Loopback client with non-loopback origin (e.g. dev proxy)
  // Allow if the request host is also loopback
  if (isLocal) {
    const reqHostname = reqHost.split(":")[0] ?? "";
    if (reqHostname === "localhost" || reqHostname === "127.0.0.1" || reqHostname === "::1") {
      return { ok: true };
    }
  }

  return {
    ok: false,
    code: 403,
    reason: `origin not allowed: ${origin}`,
  };
}

// ---------------------------------------------------------------------------
// URL credential detection
// ---------------------------------------------------------------------------

/**
 * Check if the upgrade request URL contains auth credentials in query params.
 * CVE-2026-25253: Credentials in URLs are logged, cached, and can be leaked
 * via Referer headers.
 */
export function checkUpgradeUrlCredentials(req: IncomingMessage): WsSecurityCheckResult {
  const url = req.url ?? "";
  const qIdx = url.indexOf("?");
  if (qIdx === -1) {
    return { ok: true };
  }

  try {
    const params = new URLSearchParams(url.slice(qIdx));
    for (const name of REJECTED_QUERY_PARAMS) {
      if (params.has(name)) {
        return {
          ok: false,
          code: 400,
          reason: `credentials in URL rejected (${name}). Use protocol-level auth instead.`,
        };
      }
    }
  } catch {
    // malformed query string — allow through, will fail at protocol level
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/**
 * Build CORS headers for HTTP responses.
 * These are applied to all HTTP responses from the gateway server.
 *
 * Uses a simpler origin check than WebSocket validation since HTTP CORS
 * doesn't have the same hijack risk (browser enforces CORS policy).
 */
export function buildCorsHeaders(params: {
  origin?: string;
  requestHost?: string;
  allowedOrigins?: string[];
}): Record<string, string> {
  const headers: Record<string, string> = {};

  // Always set Vary to prevent caching issues with different origins
  headers["Vary"] = "Origin";

  const { origin } = params;
  if (!origin) {
    return headers;
  }

  const trimmedOrigin = origin.trim().toLowerCase();
  if (!trimmedOrigin || trimmedOrigin === "null") {
    return headers;
  }

  // Check if origin is allowed:
  // 1. Same host as request
  // 2. In the allowed origins list
  // 3. Loopback origin to loopback host
  let allowed = false;

  const originHost = normalizeOriginHost(trimmedOrigin);
  const reqHost = normalizeRequestHost(params.requestHost);

  // Same-origin check
  if (originHost && reqHost && originHost === reqHost) {
    allowed = true;
  }

  // Loopback-to-loopback (dev servers)
  if (!allowed && isLoopbackOrigin(trimmedOrigin)) {
    const reqHostname = reqHost.split(":")[0] ?? "";
    if (reqHostname === "localhost" || reqHostname === "127.0.0.1" || reqHostname === "::1") {
      allowed = true;
    }
  }

  // Explicit allowlist
  if (!allowed && params.allowedOrigins?.length) {
    const normalizedAllowed = new Set(params.allowedOrigins.map((o) => o.trim().toLowerCase()));
    if (normalizedAllowed.has(trimmedOrigin)) {
      allowed = true;
    }
    try {
      const originUrl = new URL(trimmedOrigin);
      if (normalizedAllowed.has(originUrl.origin.toLowerCase())) {
        allowed = true;
      }
    } catch {
      // invalid origin
    }
  }

  if (allowed) {
    headers["Access-Control-Allow-Origin"] = trimmedOrigin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      "Content-Type, Authorization, X-Sage-Token, X-Requested-With";
    headers["Access-Control-Max-Age"] = "86400";
    // Credentials are handled via protocol-level auth, not cookies
    headers["Access-Control-Allow-Credentials"] = "false";
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Suspicious connection detection
// ---------------------------------------------------------------------------

/**
 * Detect and classify suspicious WebSocket connection patterns.
 */
export function detectSuspiciousConnection(params: {
  remoteAddr?: string;
  origin?: string;
  requestHost?: string;
  userAgent?: string;
  upgradeHeader?: string;
}): SuspiciousConnectionEvent | null {
  const { remoteAddr, origin, requestHost, userAgent, upgradeHeader } = params;
  const isLocal = isLoopbackAddress(remoteAddr);

  // Check for non-websocket upgrade attempts
  if (upgradeHeader && upgradeHeader.toLowerCase() !== "websocket") {
    return {
      kind: "unknown-upgrade",
      remoteAddr,
      origin,
      host: requestHost,
      userAgent,
      detail: `unexpected upgrade: ${upgradeHeader}`,
      timestamp: Date.now(),
    };
  }

  // Remote connection with browser Origin that doesn't match host
  if (!isLocal && origin) {
    const originHost = normalizeOriginHost(origin);
    const reqHost = normalizeRequestHost(requestHost);
    if (originHost && reqHost && originHost !== reqHost) {
      const isKnownClient = KNOWN_CLIENT_UA_PATTERNS.some((p) =>
        userAgent?.toLowerCase().includes(p),
      );
      if (!isKnownClient) {
        return {
          kind: "origin-mismatch",
          remoteAddr,
          origin,
          host: requestHost,
          userAgent,
          detail: `origin ${originHost} does not match host ${reqHost}`,
          timestamp: Date.now(),
        };
      }
    }
  }

  // Remote browser connection without Origin header is unusual
  if (
    !isLocal &&
    !origin &&
    userAgent &&
    (userAgent.includes("Mozilla") || userAgent.includes("Chrome") || userAgent.includes("Safari"))
  ) {
    return {
      kind: "missing-origin-remote",
      remoteAddr,
      host: requestHost,
      userAgent,
      detail: "browser-like UA without Origin header from remote IP",
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Combined security check for WebSocket upgrade requests.
 * Runs all checks and returns the first failure, or ok.
 */
export function checkWsUpgradeSecurity(params: {
  req: IncomingMessage;
  remoteAddr?: string;
  origin?: string;
  requestHost?: string;
  allowedOrigins?: string[];
  onSuspicious?: SuspiciousConnectionLogger;
}): WsSecurityCheckResult {
  const { req, remoteAddr, origin, requestHost, allowedOrigins, onSuspicious } = params;

  // 1. Check for credentials in URL
  const credCheck = checkUpgradeUrlCredentials(req);
  if (!credCheck.ok) {
    onSuspicious?.({
      kind: "url-credentials",
      remoteAddr,
      origin,
      host: requestHost,
      detail: credCheck.reason,
      timestamp: Date.now(),
    });
    return credCheck;
  }

  // 2. Validate origin
  const originCheck = validateWsOrigin({
    remoteAddr,
    origin,
    requestHost,
    allowedOrigins,
  });
  if (!originCheck.ok) {
    onSuspicious?.({
      kind: "origin-mismatch",
      remoteAddr,
      origin,
      host: requestHost,
      detail: originCheck.reason,
      timestamp: Date.now(),
    });
    return originCheck;
  }

  // 3. Detect suspicious patterns (non-blocking, just logs)
  const suspicious = detectSuspiciousConnection({
    remoteAddr,
    origin,
    requestHost,
    userAgent: headerValue(req.headers["user-agent"]),
    upgradeHeader: headerValue(req.headers.upgrade),
  });
  if (suspicious) {
    onSuspicious?.(suspicious);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
