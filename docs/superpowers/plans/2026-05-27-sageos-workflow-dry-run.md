# SageOS Workflow Dry Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SageOS dry-run a workflow candidate against its captured example observations, producing auditable pass/fail status before any automation is enabled.

**Architecture:** Add a focused workflow dry-run module that reads one workflow, verifies its captured example observations, records an evaluation summary in the workflow refs, updates workflow state, appends audit evidence, refreshes status, and exposes the operation through CLI/gateway controls.

**Tech Stack:** TypeScript, Vitest, existing SageOS JSON state store, status collector, Commander CLI, gateway request handlers.

---

### Task 1: Workflow Dry Run Core

**Files:**

- Create: `src/sageos/workflow-runner.ts`
- Test: `src/sageos/workflow-runner.test.ts`
- Modify: `src/sageos/status.test.ts`

- [x] **Step 1: Write failing workflow dry-run tests**

Seed a workflow candidate and source observations. Assert `dryRunSageOsWorkflow()`:

- returns `outcome: "passed"` for present non-secret examples;
- updates workflow state to `dry_run_passed`;
- appends a deterministic eval ref;
- refreshes status so workflow is active;
- writes a `workflow_dry_run_passed` audit event.

Add missing workflow and missing/secret example failure coverage.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-runner.test.ts
```

Expected: fail because workflow dry-run module does not exist.

- [x] **Step 3: Implement dry-run core**

Create deterministic run ids, validate examples, update workflow state/refs, append pass/fail audit events, and refresh status.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-runner.test.ts src/sageos/status.test.ts
```

Expected: pass.

### Task 2: CLI and Gateway Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing CLI/gateway tests**

Add CLI tests for `sage os workflows dry-run <id> --json`. Add gateway tests for `sageos.workflows.dryRun`, method registration, write scope, and state broadcast.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because workflow dry-run controls do not exist.

- [x] **Step 3: Implement controls**

Wire the CLI and gateway to `dryRunSageOsWorkflow()`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-runner.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts
```

Expected: pass.

### Task 3: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-workflow-dry-run.md src/sageos/workflow-runner.ts src/sageos/workflow-runner.test.ts src/sageos/status.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add workflow dry runs" docs/superpowers/plans/2026-05-27-sageos-workflow-dry-run.md src/sageos/workflow-runner.ts src/sageos/workflow-runner.test.ts src/sageos/status.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
```
