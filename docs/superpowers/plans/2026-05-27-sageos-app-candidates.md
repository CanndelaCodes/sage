# SageOS App Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SageOS draft local app/widget candidates from repeated observed needs, with provenance, policy scope, and Command Center visibility.

**Architecture:** Extend SageOS state with app candidate records and status summaries. Add a deterministic app-candidate detector that clusters repeated captured observations into candidate specs. Expose list/discover controls through CLI and gateway methods.

**Tech Stack:** TypeScript, Vitest, existing SageOS JSON state store, status renderer, Commander CLI, gateway request handlers.

---

### Task 1: App Candidate Contracts and State

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/types.test.ts`
- Modify: `src/sageos/state-store.ts`
- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`
- Modify: `src/sageos/status-renderer.ts`
- Modify: `src/sageos/status-renderer.test.ts`

- [x] **Step 1: Write failing contract/status tests**

Add tests for `SageOsAppCandidate`, default app status counts, durable `apps.json` read/write, status collection, and renderer output.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: fail because app candidate contracts and persisted state do not exist yet.

- [x] **Step 3: Implement contracts and state**

Add `SageOsAppCandidate`, `SageOsAppCandidateState`, `apps` to status and persisted state, `upsertSageOsAppCandidate()`, status summaries, and renderer lines.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: pass.

### Task 2: App Candidate Discovery

**Files:**

- Create: `src/sageos/app-candidates.ts`
- Test: `src/sageos/app-candidates.test.ts`

- [x] **Step 1: Write failing discovery tests**

Seed repeated captured observations and assert `discoverSageOsAppCandidates()` creates one durable draft candidate with purpose, target surface, provenance, sensitivity, policy scopes, preview command, rollback reference, and audit evidence. Add duplicate and secret-skip coverage.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/app-candidates.test.ts
```

Expected: fail because the app candidate module does not exist.

- [x] **Step 3: Implement discovery**

Cluster repeated non-secret observations by source/title pattern, create deterministic candidate ids, persist candidates, append audit events, and refresh status.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/app-candidates.test.ts
```

Expected: pass.

### Task 3: CLI and Gateway App Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing CLI/gateway tests**

Add CLI tests for `sage os apps --json` and `sage os apps discover --json`. Add gateway tests for `sageos.apps.list`, `sageos.apps.discover`, method registration, write scope, and state broadcast.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because app controls do not exist.

- [x] **Step 3: Implement controls**

Wire app list/discover CLI and gateway commands to the state store and app candidate detector.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/app-candidates.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/sageos/types.test.ts
```

Expected: pass.

### Task 4: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-app-candidates.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/app-candidates.ts src/sageos/app-candidates.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add app candidate discovery" docs/superpowers/plans/2026-05-27-sageos-app-candidates.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/app-candidates.ts src/sageos/app-candidates.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
```
