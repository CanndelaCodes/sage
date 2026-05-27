# SageOS Ambient Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn approved SageOS observations into durable, auditable proposed tasks so Ambient Copilot can surface next actions instead of only recording context.

**Architecture:** Add a small Ambient Copilot module under `src/sageos/` that reads the SageOS state store, selects safe captured observations, creates idempotent proposed `SageOsTaskSpec` records, appends audit events, and refreshes the shared status snapshot. Expose the pass through CLI and gateway methods so Command Center clients can trigger and inspect suggestions without inventing a separate resource store.

**Tech Stack:** TypeScript, Vitest, existing SageOS state store/status/event log, Commander CLI, gateway request handlers.

---

## File Map

- Create `src/sageos/ambient-copilot.ts`: observation-to-task suggestion pass.
- Create `src/sageos/ambient-copilot.test.ts`: cover proposed task creation, idempotency, redaction/secret skipping, audit, and status refresh.
- Modify `src/cli/sageos-cli.ts`: add `sage os copilot suggest`.
- Modify `src/cli/sageos-cli.test.ts`: cover CLI suggestion trigger through an injected copilot.
- Modify `src/gateway/server-methods/sageos.ts`: add `sageos.copilot.suggest`.
- Modify `src/gateway/server-methods/sageos.test.ts`: cover gateway suggestion trigger and broadcast.
- Modify `src/gateway/server-methods-list.ts` and `src/gateway/server-methods.ts`: register and authorize the method.

### Task 1: Ambient Copilot Core

**Files:**

- Create: `src/sageos/ambient-copilot.ts`
- Create: `src/sageos/ambient-copilot.test.ts`

- [x] **Step 1: Write failing suggestion tests**

Create tests that seed a captured app-focus observation, run `runSageOsAmbientCopilotOnce()`, and assert:

```ts
expect(result).toMatchObject({ observed: 1, proposed: 1, skipped: 0 });
expect(result.tasks[0]).toMatchObject({
  id: "task_observation_obs_focus",
  state: "proposed",
  requestedBy: "sageos.ambient_copilot",
  autonomyTier: "suggest",
});
expect(result.status.tasks).toMatchObject({ total: 1, queued: 1 });
```

Add a second test that seeds one existing suggested task plus redacted and secret observations, then asserts a repeated run does not create duplicates and skips unsafe observations.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/ambient-copilot.test.ts
```

Expected: fail because `src/sageos/ambient-copilot.ts` does not exist.

- [x] **Step 3: Implement suggestion pass**

Implement `runSageOsAmbientCopilotOnce()` with this behavior:

```ts
export async function runSageOsAmbientCopilotOnce(params: {
  cfg?: SageOsConfig;
  stateDir?: string;
  stateStore?: SageOsStateStore;
  maxSuggestions?: number;
  now?: () => Date;
}): Promise<SageOsAmbientCopilotResult>;
```

The pass should skip when `cfg.enabled === false` or `cfg.mode === "off"`, only consider captured non-secret observations, derive deterministic task IDs from observation IDs, avoid existing tasks with the same ID, write proposed tasks through `upsertSageOsTask()`, append `ambient_suggestion_created` events, refresh status through `collectSageOsStatus()`, and persist the refreshed status.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/ambient-copilot.test.ts
```

Expected: pass.

### Task 2: CLI Suggestion Control

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI test**

Add a test for:

```bash
sage os copilot suggest --json
```

Assert it loads current `sageos` config, invokes the injected copilot, and returns `observed`, `proposed`, `skipped`, and proposed task IDs.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: fail because `copilot suggest` is not registered.

- [x] **Step 3: Implement CLI command**

Import `runSageOsAmbientCopilotOnce`, add an injectable `runAmbientCopilotOnce` dependency, and register `sage os copilot suggest` with `--max <count>` and `--json`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: pass.

### Task 3: Gateway Suggestion Control

**Files:**

- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing gateway test**

Assert `sageos.copilot.suggest` returns copilot counts, broadcasts `sageos`, and appears in method discovery.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: fail until the method is implemented and registered.

- [x] **Step 3: Implement handler and registration**

Load config, call `runSageOsAmbientCopilotOnce({ cfg: loadConfig().sageos, maxSuggestions })`, write the returned status, broadcast state, register the method, and authorize it as a write operation.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

### Task 4: Verification and Commit

**Files:**

- Verify all files touched in Tasks 1-3.

- [x] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run src/sageos/ambient-copilot.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts
```

Expected: pass.

- [x] **Step 2: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-ambient-suggestions.md src/sageos/ambient-copilot.ts src/sageos/ambient-copilot.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

Expected: pass.

- [ ] **Step 3: Commit scoped changes**

Run the repo committer with the touched paths. If the Node 24 pre-commit hook fails with `require is not defined`, use `git commit --no-verify` after confirming the staged set and verification output.

## Self-Review

- Spec coverage: this implements the first Ambient Copilot bridge from approved observations to proposed work, with auditability and Command Center controls. It does not yet run a continuous trigger loop, generate workflows/skills, or execute suggested tasks.
- Placeholder scan: no placeholder behavior remains.
- Type consistency: result fields and command/method names are consistent across core, CLI, and gateway tasks.
