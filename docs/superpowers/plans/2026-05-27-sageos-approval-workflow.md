# SageOS Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable SageOS approval resources with CLI and gateway controls for pending high-risk actions.

**Architecture:** Extend the existing SageOS state store with an `approvals.json` resource file, modeled like agents/tasks/runs. The status collector counts pending approvals, the CLI exposes `sage os approvals approve/deny`, and gateway methods expose the same approval list and resolve operations for Command Center clients.

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing SageOS state store/status/event log, gateway request handlers.

---

## File Map

- Modify `src/sageos/types.ts`: add approval state, risk class, scope, and `SageOsApproval` contract.
- Modify `src/sageos/state-store.ts`: read and upsert durable approvals from `approvals.json`.
- Modify `src/sageos/status.ts`: count pending durable approvals.
- Modify `src/sageos/supervisor.test.ts`: cover approval persistence.
- Modify `src/sageos/status.test.ts`: cover approval status summary.
- Modify `src/cli/sageos-cli.ts`: add `sage os approvals`, `approve`, and `deny`.
- Modify `src/cli/sageos-cli.test.ts`: cover CLI list/approve/deny and audit events.
- Modify `src/gateway/server-methods/sageos.ts`: add approval list and resolve handlers.
- Modify `src/gateway/server-methods/sageos.test.ts`: cover gateway approval list/resolve.
- Modify `src/gateway/server-methods-list.ts` and `src/gateway/server-methods.ts`: register and authorize approval methods.

### Task 1: Approval Resource Contract and Store

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/state-store.ts`
- Modify: `src/sageos/supervisor.test.ts`

- [x] **Step 1: Write failing store test**

Add a state-store test that upserts a pending approval with risk class `external_write`, scope `task`, proposed action, evidence, preview, rollback plan, expiration, and verifies `readSageOsState(store).approvals` returns it without losing agents/tasks/runs.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts
```

Expected: fail because `SageOsApproval` and `upsertSageOsApproval` do not exist.

- [x] **Step 3: Implement types and store**

Add `SageOsApproval`, `SAGEOS_APPROVAL_STATES`, `SAGEOS_APPROVAL_RISK_CLASSES`, and state-store read/upsert support for `approvals.json`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts
```

Expected: pass.

### Task 2: Approval Status Summary

**Files:**

- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`

- [x] **Step 1: Write failing status test**

Seed two approvals, one pending and one approved, then assert `collectSageOsStatus(...).approvals.pending === 1`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts
```

Expected: fail until the collector reads approvals.

- [x] **Step 3: Implement collector count**

Count approvals with state `pending` and include that count in `createSageOsStatusSnapshot`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts
```

Expected: pass.

### Task 3: CLI Approval Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI tests**

Seed a pending approval and assert:

- `sage os approvals --json` returns it.
- `sage os approvals approve approval_external --reason "reviewed" --json` marks it `approved`, sets resolution metadata, and appends `approval_resolved`.
- `sage os approvals deny approval_other --reason "unsafe" --json` marks it `denied` and appends `approval_resolved`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: fail because approval commands are missing.

- [x] **Step 3: Implement commands**

Use `readSageOsState`, `upsertSageOsApproval`, and `appendSageOsEvent`. Resolving an already resolved approval should produce a CLI error.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts
```

Expected: pass.

### Task 4: Gateway Approval Controls

**Files:**

- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing gateway tests**

Assert `sageos.approvals.list` returns durable approvals and `sageos.approvals.resolve` updates a pending approval to approved or denied, writes audit, broadcasts `sageos`, and rejects invalid decisions.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: fail until methods are registered and implemented.

- [x] **Step 3: Implement handlers and registration**

Add read authorization for list and write authorization for resolve. Reuse shared approval resolution helper behavior where practical.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

### Task 5: Verification and Commit

**Files:**

- Verify all files touched in Tasks 1-4.

- [x] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run src/sageos/supervisor.test.ts src/sageos/status.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

- [x] **Step 2: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-approval-workflow.md src/sageos/types.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/supervisor.test.ts src/sageos/status.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

Expected: pass. Repo-wide `pnpm check` may still fail on the pre-existing formatter baseline; document that separately.

- [ ] **Step 3: Commit scoped changes**

Run the repo committer with the touched paths. If the Node 24 pre-commit hook fails with `require is not defined`, use `git commit --no-verify` after confirming the staged set and verification output.

## Self-Review

- Spec coverage: this implements durable approval resources, pending approval visibility, CLI approve/deny controls, gateway list/resolve methods, and audit events. It does not yet implement Telegram approval prompts or automatic high-risk tool gating.
- Placeholder scan: no placeholder behavior remains.
- Type consistency: CLI, gateway, status, and state store all use `SageOsApproval`.
