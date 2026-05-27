# SageOS Telegram Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram-native SageOS control command so Jason can pause, resume, stop, check status, and inspect tasks without opening the CLI.

**Architecture:** Add one shared `/sageos` command to the chat-command registry, because Telegram native commands are generated from that registry and dispatched through the existing command handler. Keep SageOS control state changes in a focused reply command handler that writes the existing SageOS state/control/event stores and uses the existing status renderer for readback.

**Tech Stack:** TypeScript ESM, Vitest, existing command registry, Telegram native command dispatch, SageOS state store, SageOS status renderer.

---

### Task 1: Registry Contract

**Files:**

- Modify: `src/auto-reply/commands-registry.data.ts`
- Modify: `src/auto-reply/commands-registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

Add assertions that `listNativeCommandSpecs()` exposes `sageos`, that `findCommandByNativeName("sageos", "telegram")` resolves to the `sageos` command, and that `/sageos pause` normalizes as a known text command with args.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/auto-reply/commands-registry.test.ts`
Expected: FAIL because `sageos` is not registered.

- [ ] **Step 3: Register `/sageos`**

Add a management command with native name `sageos`, text alias `/sageos`, positional `action` and `target` arguments, and action choices: `status`, `pause`, `resume`, `stop`, `emergency-stop`, `tasks`, `task`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/auto-reply/commands-registry.test.ts`
Expected: PASS.

### Task 2: Command Handler

**Files:**

- Create: `src/auto-reply/reply/commands-sageos.ts`
- Modify: `src/auto-reply/reply/commands-core.ts`
- Modify: `src/auto-reply/reply/commands.test.ts`

- [ ] **Step 1: Write the failing command tests**

Add tests that use `handleCommands()` for `/sageos status`, `/sageos pause telegram`, `/sageos resume telegram`, `/sageos stop telegram`, `/sageos emergency-stop telegram`, `/sageos tasks`, and `/sageos task task_1`. Use `SAGE_STATE_DIR` to isolate durable state in the test temp directory.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/auto-reply/reply/commands.test.ts`
Expected: FAIL because no SageOS command handler exists.

- [ ] **Step 3: Implement the command handler**

Implement `handleSageOsCommand()`:

- Ignore non-`/sageos` commands.
- Require command authorization.
- `status`: collect status and render it with `renderSageOsStatus()`.
- `pause`, `resume`, `stop`, `emergency-stop`: write state/control, append an audit event, refresh status, and return a compact confirmation.
- `tasks`: list recent durable tasks.
- `task <id>`: render task details and recent runs for that task.
- Unknown or missing task ids return usage/help text without running the agent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/auto-reply/reply/commands.test.ts src/auto-reply/commands-registry.test.ts`
Expected: PASS.

### Task 3: Telegram Dispatch Coverage

**Files:**

- Modify: `src/telegram/bot.test.ts`

- [ ] **Step 1: Write the failing Telegram test**

Add coverage that Telegram native commands register `sageos` and that invoking the native `/sageos pause telegram` handler produces a direct SageOS control reply instead of forwarding to the agent reply mock.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/telegram/bot.test.ts -t sageos`
Expected: FAIL until the registry/handler path is complete.

- [ ] **Step 3: Verify native dispatch**

No Telegram-only production code should be needed; the registry and command handler should be enough. If native dispatch still reaches the agent, adjust command handling so `/sageos` short-circuits before agent execution.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run --config vitest.unit.config.ts src/telegram/bot.test.ts -t sageos`
Expected: PASS.

### Task 4: Verification And Commit

**Files:**

- All files above.

- [ ] **Step 1: Run focused verification**

Run:
`pnpm exec vitest run --config vitest.unit.config.ts src/auto-reply/commands-registry.test.ts src/auto-reply/reply/commands.test.ts src/telegram/bot.test.ts`

- [ ] **Step 2: Run static checks**

Run:
`pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-telegram-controls.md src/auto-reply/commands-registry.data.ts src/auto-reply/commands-registry.test.ts src/auto-reply/reply/commands-sageos.ts src/auto-reply/reply/commands-core.ts src/auto-reply/reply/commands.test.ts src/telegram/bot.test.ts`
`git diff --check`
`pnpm tsgo`
`pnpm lint`
`pnpm build`

- [ ] **Step 3: Commit**

Commit message: `SageOS: add Telegram control command`.

### Self-Review

- Spec coverage: Covers the MVP acceptance line for Telegram pause, resume, stop, status, and task inspection using the existing Telegram native command path.
- Placeholder scan: No placeholders remain.
- Type consistency: The command names and action values match the registry, handler, and planned tests.
