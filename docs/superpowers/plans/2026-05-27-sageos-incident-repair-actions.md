# SageOS Incident Repair Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SageOS incidents actionable by attaching exact repair commands/gateway methods, and surface policy-blocked work as incidents.

**Architecture:** Extend the shared incident contract with an optional repair action descriptor. Populate queue failure incidents with memory replay repair actions and add a policy incident when approvals are pending or tasks are waiting for policy.

**Tech Stack:** TypeScript, Vitest, existing SageOS status collector and shared types.

---

### Task 1: Repair Action Contracts and Incidents

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/types.test.ts`
- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for `SageOsIncident.repairAction`, memory/learning queue incident repair commands, and policy-blocked approval incident visibility.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts
```

Expected: fail because repair actions and policy incidents do not exist yet.

- [x] **Step 3: Implement repair actions**

Add the repair action type, populate queue incident actions, and add policy incidents for pending approvals or waiting-for-policy tasks.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts
```

Expected: pass.

### Task 2: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-incident-repair-actions.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/status.ts src/sageos/status.test.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add incident repair actions" docs/superpowers/plans/2026-05-27-sageos-incident-repair-actions.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/status.ts src/sageos/status.test.ts
```
