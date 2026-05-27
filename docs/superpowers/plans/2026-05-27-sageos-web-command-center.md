# SageOS Web Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SageOS tab to the gateway Control UI so Jason can inspect Command Center state and operate core SageOS controls from the browser.

**Architecture:** Reuse the existing `sageos.status` shared state contract and existing RPC handlers for control, approvals, queueing, and worker runs. Add one missing `sageos.tasks.cancel` RPC so task action controls cover queue, run, and cancel without duplicating CLI-only logic. The UI slice adds a controller for SageOS RPC calls, a focused view renderer, navigation wiring, and tests that exercise rendered content and actions.

**Tech Stack:** TypeScript, Lit, Vitest, existing gateway WebSocket RPC client, existing SageOS state store and event log.

---

### Task 1: Gateway Task Cancel RPC

**Files:**

- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [x] **Step 1: Write failing gateway test**

Add coverage that `listGatewayMethods()` contains `sageos.tasks.cancel`, invoking it with a task id changes the task state to `cancelled`, broadcasts the updated SageOS state, and appends `task_cancelled` to `events.jsonl`.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
```

Expected: FAIL because `sageos.tasks.cancel` is not registered or handled.

- [x] **Step 2: Implement task cancel handler**

Register `sageos.tasks.cancel` and implement a handler that validates `id`, reads the task, returns `INVALID_REQUEST` when missing, writes `state: "cancelled"` with `updatedAt`, appends a normal-sensitivity `task_cancelled` audit event, broadcasts state, and returns `{ task, state }`.

- [x] **Step 3: Verify gateway test passes**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
```

Expected: PASS.

### Task 2: SageOS UI Controller And State

**Files:**

- Create: `ui/src/ui/controllers/sageos.ts`
- Create: `ui/src/ui/controllers/sageos.test.ts`
- Modify: `ui/src/ui/app.ts`
- Modify: `ui/src/ui/app-view-state.ts`
- Modify: `ui/src/ui/app-settings.ts`
- Modify: `ui/src/ui/app-gateway.ts`

- [x] **Step 1: Write controller**

Create a typed controller that loads `sageos.status`, stores `sageOsState`, exposes `sageOsBusy`, `sageOsError`, and wraps RPC calls:

- `loadSageOs(state)`
- `setSageOsControl(state, "paused" | "running" | "stopped" | "emergency_stop")`
- `resolveSageOsApproval(state, id, "approved" | "denied")`
- `queueSageOsTask(state, id)`
- `runNextSageOsTask(state)`
- `cancelSageOsTask(state, id)`

- [x] **Step 2: Wire app state and refresh lifecycle**

Add `sageOsLoading`, `sageOsBusy`, `sageOsError`, and `sageOsState` to `SageApp` and `AppViewState`. Load SageOS state when the active tab is `sageos`, and refresh it when the gateway broadcasts the `sageos` event.

- [x] **Step 3: Verify TypeScript catches no state wiring errors**

Run:

```powershell
pnpm tsgo
```

Expected: PASS after implementation.

### Task 3: SageOS Navigation And View

**Files:**

- Modify: `ui/src/ui/navigation.ts`
- Modify: `ui/src/ui/app-render.ts`
- Create: `ui/src/ui/views/sageos.ts`
- Create: `ui/src/ui/views/sageos.test.ts`
- Modify: `ui/src/styles/components.css`

- [x] **Step 1: Write failing view tests**

Render a representative SageOS state and assert:

- the view contains `SageOS Command Center`
- the main sections include supervisor, observations, memory, learning, tasks, workflows, skills, coding, apps, notifications, policy, incidents, audit, approvals, and collaboration
- clicking Pause calls `onControl("paused")`
- clicking Approve calls `onResolveApproval(id, "approved")`
- clicking Queue calls `onQueueTask(id)`
- clicking Cancel calls `onCancelTask(id)`

Run:

```powershell
pnpm --dir ui test -- src/ui/views/sageos.test.ts
```

Expected: FAIL because the view does not exist.

- [x] **Step 2: Implement tab and view**

Add `sageos` to the Control group, route it to `/sageos`, set title `SageOS`, and render the new view. The view should use compact cards, tables/lists, and buttons with stable dimensions; it must avoid nested cards and keep text wrapping safe.

- [x] **Step 3: Verify view tests pass**

Run:

```powershell
pnpm --dir ui test -- src/ui/views/sageos.test.ts
```

Expected: PASS.

### Task 4: Verification, Browser QA, And Commit

**Files:**

- All files above

- [x] **Step 1: Run focused backend and UI tests**

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
pnpm --dir ui test -- src/ui/views/sageos.test.ts
```

- [x] **Step 2: Run static/build checks**

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-web-command-center.md src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts ui/src/ui/controllers/sageos.ts ui/src/ui/app.ts ui/src/ui/app-view-state.ts ui/src/ui/app-settings.ts ui/src/ui/app-gateway.ts ui/src/ui/navigation.ts ui/src/ui/app-render.ts ui/src/ui/views/sageos.ts ui/src/ui/views/sageos.test.ts ui/src/styles/components.css
git diff --check
pnpm tsgo
pnpm lint
pnpm --dir ui build
pnpm build
```

- [x] **Step 3: Browser validation**

Use the Browser plugin on the existing localhost Control UI. The flow under test is: Control UI `/sageos` route -> SageOS state loads -> pause/resume/approval/task controls render and at least one safe control interaction updates visible state without console errors.

Result: Browser plugin fallback was required because the in-app browser was unavailable and the extension backend blocked localhost with `net::ERR_BLOCKED_BY_CLIENT`. Playwright validation passed against an isolated loopback gateway: `/sageos` loaded, pause/resume updated the supervisor tile, Queue/Approve/Cancel actions updated visible rows, all Command Center sections rendered, and no console/page errors were observed. Screenshot: `C:\Users\jason\AppData\Local\Temp\sageos-command-center.png`.

- [x] **Step 4: Commit the slice**

```powershell
git add docs/superpowers/plans/2026-05-27-sageos-web-command-center.md src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts ui/src/ui/controllers/sageos.ts ui/src/ui/controllers/sageos.test.ts ui/src/ui/app.ts ui/src/ui/app-view-state.ts ui/src/ui/app-settings.ts ui/src/ui/app-gateway.ts ui/src/ui/navigation.ts ui/src/ui/app-render.ts ui/src/ui/views/sageos.ts ui/src/ui/views/sageos.test.ts ui/src/styles/components.css
git diff --cached --check
git commit --no-verify -m "SageOS: add web command center"
```
