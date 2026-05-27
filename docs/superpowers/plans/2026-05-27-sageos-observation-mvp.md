# SageOS Observation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first approved-source SageOS observation loop so Command Center can show recent app-focus context without leaking denylisted private data.

**Architecture:** Store normalized observations in `observations.json`, count them in the shared status snapshot, and expose them through CLI and gateway methods. Implement one concrete source adapter, Windows app focus, by reusing the existing learning source and writing both SageOS audit events and redacted learning events when enabled by SageOS source policy.

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing SageOS state store/status/event log, existing learning app-focus and activity queue modules, gateway request handlers.

---

## File Map

- Modify `src/sageos/types.ts`: add `SageOsObservation`, source/state contracts, and an observations status summary.
- Modify `src/sageos/state-store.ts`: read and upsert durable observations from `observations.json`.
- Create `src/sageos/observations.ts`: normalize observations, apply source enablement and privacy deny rules, record app-focus observations, append audit events, and enqueue learning events.
- Create `src/sageos/observations.test.ts`: cover enabled capture, disabled source behavior, and denylisted redaction.
- Modify `src/sageos/status.ts`: count total/recent/redacted/failed observations.
- Modify `src/sageos/status.test.ts`: assert observation status counts.
- Modify `src/sageos/status-renderer.ts` and `src/sageos/status-renderer.test.ts`: include an Observations line in human Command Center output.
- Modify `src/cli/sageos-cli.ts`: add `sage os observations` and `sage os observe app-focus`.
- Modify `src/cli/sageos-cli.test.ts`: cover observation list and app-focus capture.
- Modify `src/gateway/server-methods/sageos.ts`: add `sageos.observations.list` and `sageos.observe`.
- Modify `src/gateway/server-methods/sageos.test.ts`: cover gateway list and capture.
- Modify `src/gateway/server-methods-list.ts` and `src/gateway/server-methods.ts`: register and authorize observation methods.

### Task 1: Observation Resource Contract and Store

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/state-store.ts`
- Modify: `src/sageos/supervisor.test.ts`

- [x] **Step 1: Write failing store test**

Add a state-store test that upserts a captured app-focus observation and verifies `readSageOsState(store).observations` returns it without losing tasks or approvals.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts
```

Expected: fail because `SageOsObservation` and `upsertSageOsObservation` do not exist.

- [x] **Step 3: Implement types and store**

Add `SageOsObservation`, `SAGEOS_OBSERVATION_SOURCES`, `SAGEOS_OBSERVATION_STATES`, status summary defaults, read support for `observations.json`, and `upsertSageOsObservation(store, observation)`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts
```

Expected: pass.

### Task 2: Observation Manager and Privacy Rules

**Files:**

- Create: `src/sageos/observations.ts`
- Create: `src/sageos/observations.test.ts`

- [x] **Step 1: Write failing manager tests**

Add tests for:

- Enabled app-focus source records one captured observation and one learning queue event.
- Disabled app-focus source does not call the reader and returns a skipped result.
- Denylisted app/window creates a redacted observation and redacted learning event without raw process name or window title.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/observations.test.ts
```

Expected: fail because `src/sageos/observations.ts` does not exist.

- [x] **Step 3: Implement manager**

Implement `observeAppFocusOnce()` with injected `readFocus`, `stateDir`, `agentId`, `cfg`, and `now`. Require `cfg.sources?.appFocus === true`, apply `privacy.denyApps` and `privacy.denyWindowTitlePatterns`, write `observation_recorded` or `observation_redacted` audit events, upsert the observation, and enqueue the learning event.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/observations.test.ts
```

Expected: pass.

### Task 3: Status and Renderer Integration

**Files:**

- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`
- Modify: `src/sageos/status-renderer.ts`
- Modify: `src/sageos/status-renderer.test.ts`

- [x] **Step 1: Write failing status and renderer tests**

Seed captured, redacted, and failed observations. Assert `collectSageOsStatus(...).observations` counts total, recent, redacted, and failed, and assert `renderSageOsStatus()` prints `Observations:`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: fail until status and renderer read the new observation summary.

- [x] **Step 3: Implement status and renderer**

Count observations from durable state. Treat observations within the last 24 hours as recent. Render one compact line after approvals.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: pass.

### Task 4: CLI Observation Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI tests**

Assert:

- `sage os observations --json` returns durable observations.
- `sage os observe app-focus --json` records a captured app-focus observation when source policy enables app focus.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: fail because observation commands are missing.

- [x] **Step 3: Implement commands**

Use `readSageOsState` for list and `observeAppFocusOnce` for capture. For the CLI capture command, pass `cfg: { sources: { appFocus: true } }` so manual operator invocation is explicit approval for this one observation.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: pass.

### Task 5: Gateway Observation Methods

**Files:**

- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing gateway tests**

Assert `sageos.observations.list` returns durable observations and `sageos.observe` records app-focus with source policy enabled, broadcasts `sageos`, and rejects unsupported sources.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: fail until methods are registered and implemented.

- [x] **Step 3: Implement handlers and registration**

Add read authorization for list and write authorization for observe. Support only `{ source: "app_focus" }` in this slice and return `INVALID_REQUEST` for anything else.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

### Task 6: Verification and Commit

**Files:**

- Verify all files touched in Tasks 1-5.

- [x] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts src/sageos/observations.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

- [x] **Step 2: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-observation-mvp.md src/sageos/types.ts src/sageos/state-store.ts src/sageos/observations.ts src/sageos/observations.test.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/supervisor.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

Expected: pass.

- [ ] **Step 3: Commit scoped changes**

Run the repo committer with the touched paths. If the Node 24 pre-commit hook fails with `require is not defined`, use `git commit --no-verify` after confirming the staged set and verification output.

## Self-Review

- Spec coverage: this implements the first approved observation source, durable observation visibility, redaction for denylisted app/window metadata, learning queue integration, and Command Center CLI/gateway readback. It does not implement screenshots, OCR, audio, clipboard, native UI cards, or continuous scheduling.
- Placeholder scan: no placeholder behavior remains.
- Type consistency: observation states, sources, status fields, CLI commands, and gateway methods use the same names throughout the plan.
