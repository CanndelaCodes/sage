# SageOS TUI Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TUI expose a first-class SageOS Command Center command that renders the shared SageOS status contract and provides pause/resume/stop plus task, incident, and approval inspection.

**Architecture:** Add a small TUI formatter that accepts `SageOsPersistedState` and returns chat-log-safe lines. Extend `GatewayChatClient` with typed SageOS RPC methods, then handle `/sageos` locally in `tui-command-handlers.ts` so it does not fall through to chat.

**Tech Stack:** TypeScript, Vitest, existing TUI slash-command dispatcher, existing SageOS gateway RPC methods.

---

### Task 1: TUI Formatter

**Files:**

- Create: `src/tui/tui-sageos-command-center.ts`
- Create: `src/tui/tui-sageos-command-center.test.ts`

- [ ] **Step 1: Write failing formatter tests**

Assert that the formatter prints Overview, Tasks, Memory, Learning, Workflows, Skills, Coding, Apps, Policy, Audit, Incidents, Approvals, and Notifications from one `SageOsPersistedState`.

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/tui/tui-sageos-command-center.test.ts
```

Expected: FAIL because the formatter file does not exist.

- [ ] **Step 2: Implement formatter**

Return compact lines suitable for `chatLog.addSystem`, including top task/incident/action previews.

- [ ] **Step 3: Verify formatter tests pass**

Run the same Vitest command. Expected: PASS.

### Task 2: TUI Command Handler

**Files:**

- Modify: `src/tui/gateway-chat.ts`
- Modify: `src/tui/tui-command-handlers.ts`
- Modify: `src/tui/tui-command-handlers.test.ts`
- Modify: `src/tui/commands.ts`

- [ ] **Step 1: Write failing handler tests**

Add tests proving `/sageos status` renders state, `/sageos pause reason` calls `sageos.control`, `/sageos task <id>` shows task detail, `/sageos incidents` shows repair actions, and `/sageos approvals` shows pending approvals.

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/tui/tui-command-handlers.test.ts
```

Expected: FAIL because `getSageOsStatus` and `controlSageOs` do not exist and `/sageos` falls through.

- [ ] **Step 2: Implement gateway client methods**

Add `getSageOsState()`, `controlSageOs()`, and supporting types that call `sageos.status` and `sageos.control`.

- [ ] **Step 3: Implement `/sageos` local command**

Handle `status`, `pause`, `resume`, `stop`, `emergency-stop`, `tasks`, `task <id>`, `incidents`, and `approvals` locally. Add help text and completions.

- [ ] **Step 4: Verify handler tests pass**

Run the same Vitest command. Expected: PASS.

### Task 3: Verification And Commit

**Files:**

- All files above

- [ ] **Step 1: Run focused tests**

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/tui/tui-sageos-command-center.test.ts src/tui/tui-command-handlers.test.ts src/tui/commands.test.ts
```

- [ ] **Step 2: Run static checks**

```powershell
pnpm oxfmt --check src/tui/tui-sageos-command-center.ts src/tui/tui-sageos-command-center.test.ts src/tui/gateway-chat.ts src/tui/tui-command-handlers.ts src/tui/tui-command-handlers.test.ts src/tui/commands.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

- [ ] **Step 3: Commit the slice**

```powershell
git diff --cached --check
git commit --no-verify -m "SageOS: add TUI command center"
```
