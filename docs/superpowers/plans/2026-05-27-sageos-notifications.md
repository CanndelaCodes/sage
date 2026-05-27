# SageOS Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first SageOS notification manager so Command Center state can produce redacted Telegram-ready digests and send them through CLI/gateway controls with audit evidence.

**Architecture:** Keep message formatting local to `src/sageos/notifications.ts`, with a sender dependency so tests never call Telegram. CLI and gateway methods call the same module, then broadcast the refreshed SageOS state.

**Tech Stack:** TypeScript, Vitest, existing SageOS JSON state store, existing Telegram sender.

---

### Task 1: Notification Manager

**Files:**

- Create: `src/sageos/notifications.ts`
- Test: `src/sageos/notifications.test.ts`

- [x] **Step 1: Write failing notification manager tests**

Create tests that seed tasks, approvals, incidents, and private/secret observations; assert that `buildSageOsDigestNotification()` includes status counts and actions while redacting private observation bodies by default. Add a send test that injects a sender, sends to a configured target, appends `notification_sent`, and never sends when Telegram is disabled.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts
```

Expected: fail because `src/sageos/notifications.ts` does not exist yet.

- [x] **Step 3: Implement notification manager**

Implement:

- `buildSageOsDigestNotification({ state, status, cfg })`
- `sendSageOsTelegramDigestOnce({ stateDir, cfg, target, sender })`
- conservative redaction where private observation text/title is omitted unless `sageos.privacy.telegramPrivateContent` is true, and secret observations are always summarized only by count.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts
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

Add CLI coverage for `sage os notifications digest --send --json`, injecting a fake sender and asserting JSON output plus audit. Add gateway coverage for `sageos.notifications.digest`, method registration, write-scope registration, and broadcast of refreshed state.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because the commands and methods do not exist yet.

- [x] **Step 3: Implement CLI/gateway controls**

Wire:

- `sage os notifications digest [--send] [--target <target>] [--json]`
- `sageos.notifications.digest` with params `{ send?: boolean, target?: string }`
- Gateway method discovery and operator write scope.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

### Task 3: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-notifications.md src/sageos/notifications.ts src/sageos/notifications.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add Telegram digest notifications" docs/superpowers/plans/2026-05-27-sageos-notifications.md src/sageos/notifications.ts src/sageos/notifications.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
```
