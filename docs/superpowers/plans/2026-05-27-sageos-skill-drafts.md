# SageOS Skill Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SageOS promote a workflow candidate into a durable draft skill record with provenance, policy scopes, and Command Center visibility.

**Architecture:** Extend SageOS state with skill records, summarize them in status, then add a small skill steward that drafts one skill from one workflow candidate. CLI/gateway controls list skills and draft a skill from a workflow candidate.

**Tech Stack:** TypeScript, Vitest, existing SageOS JSON state store, existing CLI/gateway method patterns.

---

### Task 1: Skill Contracts and State

**Files:**

- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/types.test.ts`
- Modify: `src/sageos/state-store.ts`
- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`
- Modify: `src/sageos/status-renderer.ts`
- Modify: `src/sageos/status-renderer.test.ts`

- [x] **Step 1: Write failing contract/status tests**

Add tests for `SageOsSkillRecord`, default skill status counts, durable `skills.json` read/write, status collection, and renderer output.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: fail because skill contracts and persisted state do not exist yet.

- [x] **Step 3: Implement contracts and state**

Add `SageOsSkillRecord`, `SageOsSkillState`, `skills` to status and persisted state, `upsertSageOsSkill()`, status summaries, and renderer lines.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: pass.

### Task 2: Skill Steward

**Files:**

- Create: `src/sageos/skill-steward.ts`
- Test: `src/sageos/skill-steward.test.ts`

- [x] **Step 1: Write failing steward tests**

Seed a workflow candidate and assert `draftSageOsSkillFromWorkflow()` creates one draft skill with workflow/observation provenance, allowed scopes, and `skill_draft_created` audit evidence. Add duplicate and missing workflow tests.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/skill-steward.test.ts
```

Expected: fail because the skill steward module does not exist.

- [x] **Step 3: Implement skill steward**

Create deterministic skill ids, persist draft skills, skip existing drafts, append audit events, and refresh status.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/skill-steward.test.ts
```

Expected: pass.

### Task 3: CLI and Gateway Skill Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [x] **Step 1: Write failing CLI/gateway tests**

Add CLI tests for `sage os skills --json` and `sage os skills draft <workflowId> --json`. Add gateway tests for `sageos.skills.list`, `sageos.skills.draft`, method registration, write scope, and state broadcast.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because skill commands and methods do not exist.

- [x] **Step 3: Implement controls**

Wire skill list/draft CLI and gateway commands to the state store and steward.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/skill-steward.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/sageos/types.test.ts
```

Expected: pass.

### Task 4: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-skill-drafts.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/skill-steward.ts src/sageos/skill-steward.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add skill draft stewardship" docs/superpowers/plans/2026-05-27-sageos-skill-drafts.md src/sageos/types.ts src/sageos/types.test.ts src/sageos/state-store.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/sageos/skill-steward.ts src/sageos/skill-steward.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
```
