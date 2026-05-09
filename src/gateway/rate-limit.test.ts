import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows connections below the threshold", () => {
    const limiter = createRateLimiter({ maxPerWindow: 5, windowMs: 1000 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.check("10.0.0.1");
      expect(result.allowed).toBe(true);
    }
    limiter.dispose();
  });

  it("blocks connections at the threshold", () => {
    const limiter = createRateLimiter({ maxPerWindow: 3, windowMs: 1000 });
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit exceeded");
    limiter.dispose();
  });

  it("resets after the window expires", () => {
    const limiter = createRateLimiter({ maxPerWindow: 2, windowMs: 1000 });
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    expect(limiter.check("10.0.0.1").allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(limiter.check("10.0.0.1").allowed).toBe(true);
    limiter.dispose();
  });

  it("tracks concurrent connections", () => {
    const limiter = createRateLimiter({ maxConcurrent: 2, maxPerWindow: 100 });
    limiter.check("10.0.0.1");
    limiter.onConnect("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.onConnect("10.0.0.1");

    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Too many concurrent connections");

    // Disconnecting one should allow a new connection
    limiter.onDisconnect("10.0.0.1");
    expect(limiter.check("10.0.0.1").allowed).toBe(true);
    limiter.dispose();
  });

  it("applies higher limits for loopback addresses", () => {
    const limiter = createRateLimiter({
      maxPerWindow: 2,
      maxPerWindowLoopback: 10,
      windowMs: 1000,
    });
    // Remote IP is blocked after 2
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    expect(limiter.check("10.0.0.1").allowed).toBe(false);

    // Loopback gets 10
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("127.0.0.1").allowed).toBe(true);
    }
    expect(limiter.check("127.0.0.1").allowed).toBe(false);
    limiter.dispose();
  });

  it("treats ::1 as loopback", () => {
    const limiter = createRateLimiter({
      maxPerWindow: 1,
      maxPerWindowLoopback: 5,
      windowMs: 1000,
    });
    expect(limiter.check("::1").allowed).toBe(true);
    expect(limiter.check("::1").allowed).toBe(true);
    limiter.dispose();
  });

  it("treats ::ffff:127.0.0.1 as loopback", () => {
    const limiter = createRateLimiter({
      maxPerWindow: 1,
      maxPerWindowLoopback: 5,
      windowMs: 1000,
    });
    expect(limiter.check("::ffff:127.0.0.1").allowed).toBe(true);
    expect(limiter.check("::ffff:127.0.0.1").allowed).toBe(true);
    limiter.dispose();
  });

  it("isolates IPs from each other", () => {
    const limiter = createRateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    expect(limiter.check("10.0.0.1").allowed).toBe(true);
    expect(limiter.check("10.0.0.1").allowed).toBe(false);
    // Different IP should still be allowed
    expect(limiter.check("10.0.0.2").allowed).toBe(true);
    limiter.dispose();
  });

  it("allows unknown IP (undefined)", () => {
    const limiter = createRateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    expect(limiter.check(undefined).allowed).toBe(true);
    expect(limiter.check(undefined).allowed).toBe(true);
    limiter.dispose();
  });

  it("concurrent count never goes below zero", () => {
    const limiter = createRateLimiter();
    limiter.onDisconnect("10.0.0.1");
    limiter.onDisconnect("10.0.0.1");
    const result = limiter.check("10.0.0.1");
    expect(result.concurrent).toBe(0);
    limiter.dispose();
  });
});
