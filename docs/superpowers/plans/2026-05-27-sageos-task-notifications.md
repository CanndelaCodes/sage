# SageOS Task Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task-level Telegram reports so queued SageOS work can optionally notify Jason when a run completes or fails.

**Architecture:** Extend the notification manager with task-result message builders and a sender wrapper. Keep the task runner side-effect free by default; CLI/gateway pass `--notify`/`notify: true` when a Telegram report should be sent.

**Tech Stack:** TypeScript, Vitest, existing SageOS task runner, existing notification manager, existing CLI/gateway method patterns.

---

### Task 1: Task Notification Manager

**Files:**

- Modify: `src/sageos/notifications.ts`
- Modify: `src/sageos/notifications.test.ts`

- [x] **Step 1: Write failing notification tests**

Add tests that build a task completion message with task id/title, run id/state, risk summary, and action footer. Add a send test with an injected sender that records `notification_sent`; disabled Telegram must skip without sending.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts
```

Expected: fail because task notification functions do not exist.

- [x] **Step 3: Implement task notification functions**

Add `buildSageOsTaskNotification()` and `sendSageOsTaskNotificationOnce()` using the existing Telegram sender and audit log pattern.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts
```

Expected: pass.

### Task 2: Runner, CLI, and Gateway Integration

**Files:**

- Modify: `src/sageos/task-runner.ts`
- Modify: `src/sageos/task-runner.test.ts`
- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [x] **Step 1: Write failing integration tests**

Add task-runner coverage for optional notification calls on completion/failure. Add CLI coverage for `sage os tasks run-next --notify --json`, and gateway coverage for `sageos.tasks.runNext` with `{ notify: true }`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/task-runner.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: fail because the notify option is not wired.

- [x] **Step 3: Implement integration**

Add optional notification dependencies to the task runner, CLI deps, and gateway handler. Default behavior remains no notification.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/notifications.test.ts src/sageos/task-runner.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

### Task 3: Slice Verification and Commit

**Files:**

- All files above.

- [x] **Step 1: Run slice gates**

Run:

```bash
pnpm exec oxfmt --check docs/superpowers/plans/2026-05-27-sageos-task-notifications.md src/sageos/notifications.ts src/sageos/notifications.test.ts src/sageos/task-runner.ts src/sageos/task-runner.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: add task result notifications" docs/superpowers/plans/2026-05-27-sageos-task-notifications.md src/sageos/notifications.ts src/sageos/notifications.test.ts src/sageos/task-runner.ts src/sageos/task-runner.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
```
