# SageOS Collaboration Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured inter-agent collaboration events so SageOS employees can hand off work and request reviews without becoming opaque chat threads.

**Architecture:** Add a durable `SageOsCollaborationEvent` resource stored alongside agents/tasks/runs. Handoff creates both a collaboration event and a proposed task assigned to the receiving employee; review request creates a structured event linking a reviewer, task, summary, and artifacts. CLI and gateway controls expose the same helpers for local and Command Center use.

**Tech Stack:** TypeScript, Vitest, existing SageOS state store, event log, CLI, and gateway RPC handlers.

---

### Task 1: Collaboration Types And Store

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/state-store.ts`
- Create: `src/sageos/collaboration.test.ts`
- Create: `src/sageos/collaboration.ts`

- [x] **Step 1: Write failing collaboration core tests**

Create tests that assert:

```ts
const handoff = await createSageOsTaskHandoff({
  stateDir: root,
  stateStore: store,
  fromAgentId: "employee_pc_steward",
  toAgentId: "employee_reviewer",
  title: "Review disk warning",
  objective: "Review disk warning evidence and recommend next step.",
  now: () => now,
});

expect(handoff).toMatchObject({
  outcome: "created",
  collaboration: {
    kind: "handoff",
    fromAgentId: "employee_pc_steward",
    toAgentId: "employee_reviewer",
    taskId: "task_handoff_employee_pc_steward_employee_reviewer_review_disk_warning",
  },
  task: {
    ownerAgentId: "employee_reviewer",
    state: "proposed",
  },
});
```

Also assert `requestSageOsReview()` persists a `review_request` event with `taskId`, `artifactRefs`, and audit event `collaboration_review_requested`.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/collaboration.test.ts
```

Expected: FAIL because collaboration types, store plumbing, and helpers do not exist.

- [x] **Step 2: Implement collaboration store and helpers**

Add `SageOsCollaborationEvent` with:

```ts
kind: "handoff" | "review_request" | "incident_escalation" | "shared_artifact";
fromAgentId: string;
toAgentId?: string;
taskId?: string;
title: string;
summary: string;
artifactRefs: string[];
state: "open" | "acknowledged" | "closed";
createdAt: string;
updatedAt: string;
```

Add `collaborations: SageOsCollaborationEvent[]` to persisted state, read from `collaborations.json`, and add `upsertSageOsCollaboration()`.

Create helpers:

- `createSageOsTaskHandoff()`: writes a proposed task assigned to `toAgentId`, writes a `handoff` collaboration event, and appends `collaboration_handoff`.
- `requestSageOsReview()`: writes a `review_request` collaboration event and appends `collaboration_review_requested`.

- [x] **Step 3: Verify collaboration core tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/collaboration.test.ts
```

Expected: PASS.

### Task 2: CLI Collaboration Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI tests**

Add CLI tests for:

```powershell
sage os collaboration --json
sage os collaboration handoff employee_pc_steward employee_reviewer "Review disk warning" --objective "Review evidence" --json
sage os collaboration request-review employee_coding employee_reviewer "Review coding report" --task task_coding --summary "Check diff and tests" --artifact coding_report_task_coding_1 --json
```

Expected: list returns durable collaboration events, handoff returns created task/collaboration, and review request returns review collaboration.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/cli/sageos-cli.test.ts
```

Expected: FAIL because commands do not exist.

- [x] **Step 2: Wire CLI commands**

Add `sage os collaboration` with:

- default list command
- `handoff <from> <to> <title> --objective <text> --json`
- `request-review <from> <reviewer> <title> --task <id> --summary <text> --artifact <ref...> --json`

- [x] **Step 3: Verify CLI tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/cli/sageos-cli.test.ts
```

Expected: PASS.

### Task 3: Gateway Collaboration Controls

**Files:**

- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [x] **Step 1: Write failing gateway tests**

Assert registered methods:

```ts
expect(listGatewayMethods()).toContain("sageos.collaboration.list");
expect(listGatewayMethods()).toContain("sageos.collaboration.handoff");
expect(listGatewayMethods()).toContain("sageos.collaboration.requestReview");
```

Invoke handoff and review request methods and assert returned state contains the created collaboration events and handoff task.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
```

Expected: FAIL because methods are not registered or handled.

- [x] **Step 2: Wire gateway methods**

Add handlers:

- `sageos.collaboration.list`
- `sageos.collaboration.handoff`
- `sageos.collaboration.requestReview`

Handlers validate required string params, call shared helpers, broadcast updated SageOS state, and return `INVALID_REQUEST` for missing required fields.

- [x] **Step 3: Verify gateway tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
```

Expected: PASS.

### Task 4: Verification And Commit

**Files:**

- All files above

- [x] **Step 1: Run focused tests**

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/collaboration.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

- [x] **Step 2: Run static checks**

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-collaboration-events.md src/sageos/types.ts src/sageos/state-store.ts src/sageos/collaboration.ts src/sageos/collaboration.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

- [x] **Step 3: Commit the slice**

```powershell
git add docs/superpowers/plans/2026-05-27-sageos-collaboration-events.md src/sageos/types.ts src/sageos/state-store.ts src/sageos/collaboration.ts src/sageos/collaboration.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
git diff --cached --check
git commit --no-verify -m "SageOS: add structured collaboration events"
```
