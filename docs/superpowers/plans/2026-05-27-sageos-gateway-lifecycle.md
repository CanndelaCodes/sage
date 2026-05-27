# SageOS Gateway Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the SageOS supervisor with the gateway by default and stop it cleanly during gateway shutdown.

**Architecture:** Add a small gateway lifecycle helper that converts `cfg.sageos.supervisor.intervalSeconds` into supervisor options, respects explicit `sageos.enabled: false` and `mode: "off"`, and starts `createSageOsSupervisor()`. Wire the returned supervisor handle into the gateway close handler so shutdown records a stopped supervisor state and clears the timer.

**Tech Stack:** TypeScript, Vitest, existing gateway startup and close handler, existing SageOS supervisor/state-store/event-log.

---

### Task 1: Gateway SageOS Startup Helper

**Files:**

- Create: `src/gateway/server-sageos.ts`
- Create: `src/gateway/server-sageos.test.ts`

- [x] **Step 1: Write failing helper tests**

Cover these behaviors:

```ts
await startGatewaySageOsSupervisor({
  cfg: { sageos: { mode: "execute_scoped", supervisor: { intervalSeconds: 2 } } },
  createSupervisor,
  log,
});

expect(createSupervisor).toHaveBeenCalledWith({
  mode: "execute_scoped",
  intervalMs: 2000,
});
expect(supervisor.start).toHaveBeenCalledOnce();
```

Also cover `sageos.enabled === false`, `mode === "off"`, and startup failure logging.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-sageos.test.ts
```

Expected: FAIL because `server-sageos.ts` does not exist.

- [x] **Step 2: Implement helper**

Create `startGatewaySageOsSupervisor()` with dependency injection for `createSupervisor`, log startup failures, return the supervisor handle on success, and return `null` when disabled or failed.

- [x] **Step 3: Verify helper tests pass**

Run the same Vitest command. Expected: PASS.

### Task 2: Gateway Shutdown Stops SageOS

**Files:**

- Modify: `src/gateway/server-close.ts`
- Create: `src/gateway/server-close.test.ts`

- [x] **Step 1: Write failing close-handler test**

Construct `createGatewayCloseHandler()` with a mock `sageOsSupervisor` and assert shutdown calls:

```ts
await close({ reason: "test shutdown" });
expect(sageOsSupervisor.stop).toHaveBeenCalledWith("test shutdown");
```

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-close.test.ts
```

Expected: FAIL because the close handler does not accept or stop a SageOS supervisor.

- [x] **Step 2: Implement close wiring**

Add optional `sageOsSupervisor` to the close handler params and call `stop(reason)` during shutdown with `.catch(() => {})` so a stop failure does not prevent the rest of the gateway from closing.

- [x] **Step 3: Verify close-handler test passes**

Run the same Vitest command. Expected: PASS.

### Task 3: Gateway Runtime Wiring

**Files:**

- Modify: `src/gateway/server.impl.ts`

- [x] **Step 1: Write failing integration assertion**

Use TypeScript/build coverage plus the helper and close-handler tests to prove `startGatewayServer()` can hold and stop a SageOS supervisor handle.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-sageos.test.ts src/gateway/server-close.test.ts
```

Expected before wiring: helper and close-handler pass, but `server.impl.ts` has not yet started the helper.

- [x] **Step 2: Wire helper into `startGatewayServer()`**

Import `startGatewaySageOsSupervisor`, start it after sidecars are initialized, and pass the returned handle to `createGatewayCloseHandler()`.

- [x] **Step 3: Verify focused tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-sageos.test.ts src/gateway/server-close.test.ts src/sageos/supervisor.test.ts
```

Expected: PASS.

### Task 4: Static Verification And Commit

**Files:**

- All files above

- [x] **Step 1: Run formatting and type checks**

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-gateway-lifecycle.md src/gateway/server-sageos.ts src/gateway/server-sageos.test.ts src/gateway/server-close.ts src/gateway/server-close.test.ts src/gateway/server.impl.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

- [x] **Step 2: Commit the slice**

```powershell
git diff --cached --check
git commit --no-verify -m "SageOS: start supervisor with gateway"
```
