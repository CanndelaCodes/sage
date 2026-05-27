# SageOS Workflow Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first SageOS workflow compiler pass so repeated approved observations become durable workflow candidates with evidence, policy scope, and Command Center visibility.

**Architecture:** Extend the SageOS state store with workflow records, then add a deterministic compiler that clusters repeated captured observations by source and normalized pattern. CLI/gateway controls invoke the same compiler and expose candidates without generating executable artifacts yet.

**Tech Stack:** TypeScript, Vitest, existing SageOS JSON state store, existing CLI/gateway method patterns.

---

### Task 1: Workflow Contracts and State

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/types.test.ts`
- Modify: `src/sageos/state-store.ts`
- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`
- Modify: `src/sageos/status-renderer.ts`
- Modify: `src/sageos/status-renderer.test.ts`

- [x] **Step 1: Write failing contract/status tests**

Add tests for `SageOsWorkflow`, default workflow status counts, durable `workflows.json` read/write, status collection, and renderer output.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: fail because workflow contracts and persisted state do not exist yet.

- [x] **Step 3: Implement contracts and state**

Add `SageOsWorkflow`, `SageOsWorkflowState`, workflow summary fields, `workflows` to persisted state, `upsertSageOsWorkflow()`, status summaries, and renderer lines.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: pass.

### Task 2: Candidate Compiler

**Files:**

- Create: `src/sageos/workflow-compiler.ts`
- Test: `src/sageos/workflow-compiler.test.ts`

- [x] **Step 1: Write failing compiler tests**

Seed repeated non-secret observations and assert `discoverSageOsWorkflowCandidates()` creates exactly one `candidate` workflow with observation evidence and emits `workflow_candidate_created`. Add a duplicate/secret test to prove it skips existing workflows and secret observations.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-compiler.test.ts
```

Expected: fail because the compiler module does not exist.

- [x] **Step 3: Implement compiler**

Cluster captured observations by `source` plus process/window/title pattern, create deterministic workflow ids, persist candidates, append audit events, and refresh status.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-compiler.test.ts
```

Expected: pass.

### Task 3: CLI and Gateway Workflow Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing CLI/gateway tests**

Add CLI tests for `sage os workflows --json` and `sage os workflows discover --min 2 --json`. Add gateway tests for `sageos.workflows.list`, `sageos.workflows.discover`, method registration, write scope, and state broadcast.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because workflow commands and methods do not exist.

- [x] **Step 3: Implement controls**

Wire workflow list/discover CLI and gateway commands to the state store and compiler.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/workflow-compiler.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/sageos/types.test.ts
```

Expected: pass.

### Task 4: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-workflow-candidates.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/workflow-compiler.ts src/sageos/workflow-compiler.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add workflow candidate discovery" docs/superpowers/plans/2026-05-27-sageos-workflow-candidates.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/workflow-compiler.ts src/sageos/workflow-compiler.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
```
