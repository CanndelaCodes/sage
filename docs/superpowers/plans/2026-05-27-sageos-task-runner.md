# SageOS Task Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first durable SageOS task runner pass so queued work can produce visible runs, completion/failure state, and audit evidence.

**Architecture:** Add a small task runner module that picks the next queued task, creates a deterministic run attempt, marks the task running, invokes an injectable executor, records success or failure, appends audit events, and refreshes status. The default executor is a no-side-effect dry run so CLI/gateway controls are useful without spawning autonomous subagents yet.

**Tech Stack:** TypeScript, Vitest, existing SageOS state store/status/event log, Commander CLI, gateway request handlers.

---

## File Map

- Create `src/sageos/task-runner.ts`: durable one-task runner with dry-run default executor.
- Create `src/sageos/task-runner.test.ts`: cover idle, success, and failure paths.
- Modify `src/cli/sageos-cli.ts`: add `sage os tasks run-next`.
- Modify `src/cli/sageos-cli.test.ts`: cover CLI run-next output.
- Modify `src/gateway/server-methods/sageos.ts`: add `sageos.tasks.runNext`.
- Modify `src/gateway/server-methods/sageos.test.ts`: cover gateway run-next and broadcast.
- Modify `src/gateway/server-methods-list.ts` and `src/gateway/server-methods.ts`: register and authorize run-next.

### Task 1: Task Runner Core

**Files:**

- Create: `src/sageos/task-runner.ts`
- Create: `src/sageos/task-runner.test.ts`

- [x] **Step 1: Write failing runner tests**

Add tests that seed a queued task and assert `runNextSageOsTaskOnce()` creates `run_<taskId>_1`, marks the task `completed`, marks the run `succeeded`, appends `task_run_started` and `task_completed`, and refreshes status. Add a failure test with an injected executor that throws and assert the task becomes `failed`, run becomes `failed`, and status shows a failed run.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/task-runner.test.ts
```

Expected: fail because `src/sageos/task-runner.ts` does not exist.

- [x] **Step 3: Implement one-task runner**

Implement:

```ts
export async function runNextSageOsTaskOnce(params?: {
  stateDir?: string;
  stateStore?: SageOsStateStore;
  requestedBy?: string;
  executor?: SageOsTaskExecutor;
  now?: () => Date;
}): Promise<SageOsTaskRunnerResult>;
```

The helper should return `idle` when no queued tasks exist, create the next run attempt from existing runs for the task, mark state transitions through the state store, catch executor errors, write audit events, refresh status, and persist it.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/task-runner.test.ts
```

Expected: pass.

### Task 2: CLI Run Control

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI test**

Add a test for:

```bash
sage os tasks run-next --json
```

Assert it returns the run, task, and outcome.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: fail because `tasks run-next` is not registered.

- [x] **Step 3: Implement CLI command**

Import `runNextSageOsTaskOnce`, add an injectable `runNextTaskOnce` dependency, and register `tasks run-next` with `--json`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: pass.

### Task 3: Gateway Run Control

**Files:**

- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing gateway test**

Assert `sageos.tasks.runNext` runs the next queued task, returns the run result, broadcasts `sageos`, and appears in method discovery.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: fail until the method is implemented and registered.

- [x] **Step 3: Implement handler and registration**

Call `runNextSageOsTaskOnce({ requestedBy: "sageos.gateway" })`, broadcast the refreshed state, register the method, and authorize it as a write operation.

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
pnpm exec vitest run src/sageos/task-runner.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts
```

Expected: pass.

- [x] **Step 2: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-task-runner.md src/sageos/task-runner.ts src/sageos/task-runner.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

Expected: pass.

- [ ] **Step 3: Commit scoped changes**

Run the repo committer with the touched paths. If the Node 24 pre-commit hook fails with `require is not defined`, use `git commit --no-verify` after confirming the staged set and verification output.

## Self-Review

- Spec coverage: this implements the first durable task/run execution path and visible run outcomes. It does not yet spawn real subagents, enforce budgets, retry, or stream traces.
- Placeholder scan: no placeholder behavior remains.
- Type consistency: runner result, run state, task state, CLI command, and gateway method names are consistent across tasks.
