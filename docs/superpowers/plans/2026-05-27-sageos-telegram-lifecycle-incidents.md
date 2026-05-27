# SageOS Telegram Lifecycle And Incident Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram startup, incident, and completion notifications to close the MVP notification coverage beyond digest and task updates.

**Architecture:** Extend `src/sageos/notifications.ts` with additional typed builders and send-once helpers that reuse the existing Telegram target, redaction, event-log, and status collection patterns. Expose preview/send controls through `sage os notifications` and gateway methods so Command Center and local operators can trigger the same notification contract.

**Tech Stack:** TypeScript ESM, existing `sendMessageTelegram`, SageOS event log/state store, Commander CLI, gateway request handlers, Vitest.

---

### Task 1: Notification Builders And Senders

**Files:**

- Modify: `src/sageos/notifications.ts`
- Test: `src/sageos/notifications.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that:

```ts
const startup = buildSageOsLifecycleNotification({ kind: "startup", status, cfg });
expect(startup.text).toContain("SageOS: Startup");
expect(startup.text).toContain("Supervisor: running");

const incident = buildSageOsIncidentNotification({ incident, status, cfg });
expect(incident.text).toContain("SageOS: Incident");
expect(incident.text).toContain("Repair: Replay memory queues");

const completion = buildSageOsCompletionNotification({ report, status, cfg });
expect(completion.text).toContain("SageOS: Night Shift completed");
expect(completion.text).toContain("Tests: 1 passed / 0 failed");
```

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/sageos/notifications.test.ts`
Expected: FAIL because the builders and senders do not exist.

- [ ] **Step 2: Implement builders and send helpers**

Extend `SageOsNotificationKind` with `startup`, `shutdown`, `incident`, and `completion`. Add build/send helpers that:

- Skip when Telegram notifications are disabled or target is missing.
- Use existing `telegramTarget`.
- Redact by only using titles, summaries, counts, command labels, report ids, changed file counts, and test counts.
- Append `notification_sent`, `notification_skipped`, or `notification_failed` audit events.

- [ ] **Step 3: Verify builders and senders**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/sageos/notifications.test.ts`
Expected: PASS.

### Task 2: CLI And Gateway Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods.ts`

- [ ] **Step 1: Write failing surface tests**

Add CLI tests for:

```bash
sage os notifications startup --json
sage os notifications incident incident_memory_queue_failed --send --json
sage os notifications completion coding_report_1 --json
```

Add gateway tests for:

```ts
invoke("sageos.notifications.startup", { send: true });
invoke("sageos.notifications.incident", { incidentId: "incident_memory_queue_failed", send: true });
invoke("sageos.notifications.completion", { reportId: "coding_report_1" });
```

Run focused CLI/gateway notification tests and expect unknown command/method failures.

- [ ] **Step 2: Wire CLI and gateway methods**

Add preview/send actions for startup, incident, and completion. Register gateway methods and scope authorization as write methods when `send` can cause Telegram delivery.

- [ ] **Step 3: Verify surfaces**

Run:

```bash
pnpm exec vitest run --config vitest.unit.config.ts src/cli/sageos-cli.test.ts
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: PASS.

### Task 3: Slice Verification And Commit

**Files:**

- All files above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/notifications.test.ts src/cli/sageos-cli.test.ts
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run gates**

Run:

```bash
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-telegram-lifecycle-incidents.md src/sageos/notifications.ts src/sageos/notifications.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit scoped slice**

Commit message: `SageOS: add Telegram lifecycle notifications`.

### Self-Review

- Spec coverage: Covers Telegram startup, urgent incident, and completion updates while preserving existing digest and task notifications.
- Placeholder scan: No placeholders remain.
- Type consistency: Notification kind, send helper, CLI, gateway, and test names are aligned.
