/**
 * In-memory sliding-window rate limiter for gateway connections.
 *
 * Tracks connection attempts per IP address and enforces configurable
 * limits with higher thresholds for loopback addresses (localhost tools
 * make many connections).
 */

import { isLoopbackAddress } from "./net.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitConfig = {
  /** Maximum connection attempts per window for remote clients. Default: 60. */
  maxPerWindow?: number;
  /** Maximum connection attempts per window for loopback clients. Default: 300. */
  maxPerWindowLoopback?: number;
  /** Sliding window duration in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Maximum number of concurrent connections per IP. Default: 20. */
  maxConcurrent?: number;
  /** Maximum concurrent connections for loopback. Default: 100. */
  maxConcurrentLoopback?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Reason for rejection, if any. */
  reason?: string;
  /** Current count of attempts in the window. */
  currentCount: number;
  /** Current concurrent connections. */
  concurrent: number;
};

type IpRecord = {
  /** Timestamps of connection attempts within the current window. */
  timestamps: number[];
  /** Count of currently open connections. */
  concurrent: number;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PER_WINDOW = 60;
const DEFAULT_MAX_PER_WINDOW_LOOPBACK = 300;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 20;
const DEFAULT_MAX_CONCURRENT_LOOPBACK = 100;
const CLEANUP_INTERVAL_MS = 120_000;

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export type RateLimiter = {
  /** Check whether a new connection from this IP should be allowed. */
  check(ip: string | undefined): RateLimitResult;
  /** Record that a connection was opened (increment concurrent count). */
  onConnect(ip: string | undefined): void;
  /** Record that a connection was closed (decrement concurrent count). */
  onDisconnect(ip: string | undefined): void;
  /** Dispose cleanup timer. */
  dispose(): void;
};

export function createRateLimiter(config?: RateLimitConfig): RateLimiter {
  const maxPerWindow = config?.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW;
  const maxPerWindowLoopback = config?.maxPerWindowLoopback ?? DEFAULT_MAX_PER_WINDOW_LOOPBACK;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxConcurrent = config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const maxConcurrentLoopback = config?.maxConcurrentLoopback ?? DEFAULT_MAX_CONCURRENT_LOOPBACK;

  const records = new Map<string, IpRecord>();

  // Periodically clean up stale entries to prevent memory growth.
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of records) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0 && record.concurrent <= 0) {
        records.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process exit.
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }

  function getOrCreate(ip: string): IpRecord {
    let record = records.get(ip);
    if (!record) {
      record = { timestamps: [], concurrent: 0 };
      records.set(ip, record);
    }
    return record;
  }

  function check(ip: string | undefined): RateLimitResult {
    if (!ip) {
      // Unknown IP — allow but don't track.
      return { allowed: true, currentCount: 0, concurrent: 0 };
    }

    const loopback = isLoopbackAddress(ip);
    const limit = loopback ? maxPerWindowLoopback : maxPerWindow;
    const concurrentLimit = loopback ? maxConcurrentLoopback : maxConcurrent;

    const record = getOrCreate(ip);
    const now = Date.now();

    // Trim timestamps outside the window.
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    // Check concurrent limit.
    if (record.concurrent >= concurrentLimit) {
      return {
        allowed: false,
        reason: `Too many concurrent connections (${record.concurrent}/${concurrentLimit})`,
        currentCount: record.timestamps.length,
        concurrent: record.concurrent,
      };
    }

    // Check rate limit.
    if (record.timestamps.length >= limit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded (${record.timestamps.length}/${limit} per ${windowMs}ms)`,
        currentCount: record.timestamps.length,
        concurrent: record.concurrent,
      };
    }

    // Record this attempt.
    record.timestamps.push(now);
    return {
      allowed: true,
      currentCount: record.timestamps.length,
      concurrent: record.concurrent,
    };
  }

  function onConnect(ip: string | undefined): void {
    if (!ip) {
      return;
    }
    const record = getOrCreate(ip);
    record.concurrent += 1;
  }

  function onDisconnect(ip: string | undefined): void {
    if (!ip) {
      return;
    }
    const record = records.get(ip);
    if (record && record.concurrent > 0) {
      record.concurrent -= 1;
    }
  }

  function dispose(): void {
    clearInterval(cleanupTimer);
    records.clear();
  }

  return { check, onConnect, onDisconnect, dispose };
}
