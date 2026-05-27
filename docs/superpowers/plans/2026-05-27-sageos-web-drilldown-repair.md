# SageOS Web Drilldown And Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task drill-down and actionable safe incident repair controls to the SageOS Control UI.

**Architecture:** Keep the existing `/sageos` Control UI surface and controller. Add a typed repair action wrapper that only invokes allowlisted safe SageOS repair gateway methods from the trusted incident contract, then refreshes `sageos.status`. Add inline task details with native `<details>` disclosure so task inspection requires no new global UI state.

**Tech Stack:** TypeScript, Lit, Vitest, existing Gateway browser client, existing SageOS incident repair action contract.

---

### Task 1: Controller Safe Repair Action

**Files:**

- Modify: `ui/src/ui/controllers/sageos.ts`
- Modify: `ui/src/ui/controllers/sageos.test.ts`

- [x] **Step 1: Write the failing controller test**

Add a test that creates a `SageOsUiState` with an incident whose `repairAction.gatewayMethod` is `sageos.memory.replay`, calls `runSageOsIncidentRepair(state, "incident_memory")`, and asserts:

- the client requests `sageos.memory.replay` with `{}`
- the client requests `sageos.status` after the repair
- `sageOsState` is replaced with the refreshed status state
- `requestUpdate()` is called while busy and after completion

Run:

```powershell
pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/controllers/sageos.test.ts
```

Expected: FAIL because `runSageOsIncidentRepair` does not exist.

- [x] **Step 2: Implement repair action wrapper**

Add `runSageOsIncidentRepair(state, incidentId)` that:

- finds the incident in `state.sageOsState?.status.incidents`
- requires `autoRepairSafe === true`
- requires `repairAction.approvalRequired === false`
- requires `repairAction.gatewayMethod` to be one of:
  - `sageos.memory.replay`
  - `sageos.memory.doctor`
  - `sageos.approvals.list`
  - `sageos.observations.list`
- sends that method with `{}`
- refreshes `sageos.status`
- stores a readable `sageOsError` when the incident is missing or blocked

- [x] **Step 3: Verify controller test passes**

Run:

```powershell
pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/controllers/sageos.test.ts
```

Expected: PASS.

### Task 2: Task Details And Repair Button View

**Files:**

- Modify: `ui/src/ui/views/sageos.ts`
- Modify: `ui/src/ui/views/sageos.test.ts`

- [x] **Step 1: Write failing view assertions**

Extend the SageOS view test to assert:

- task rows render a `Details` disclosure
- detail text includes `Requested by`, `Created`, `Updated`, `Rollback`, and policy scope content
- incident rows render a `Run repair` button for safe no-approval repair actions
- clicking `Run repair` calls `onRunRepair("incident_memory")`

Run:

```powershell
pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/views/sageos.test.ts
```

Expected: FAIL because task details and repair action callbacks are not wired.

- [x] **Step 2: Implement view details and action controls**

Add `onRunRepair(incidentId)` to `SageOsViewProps`. Render task details in each task row using a stable `<details class="sageos-details">` block. Render incident repair metadata plus a `Run repair` button only when `incident.autoRepairSafe` is true, the repair action exists, and it does not require approval.

- [x] **Step 3: Verify view test passes**

Run:

```powershell
pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/views/sageos.test.ts
```

Expected: PASS.

### Task 3: Wire UI And Verify

**Files:**

- Modify: `ui/src/ui/app-render.ts`

- [x] **Step 1: Wire app renderer**

Import `runSageOsIncidentRepair` and pass `onRunRepair: (id) => void runSageOsIncidentRepair(state, id)` into `renderSageOs`.

- [x] **Step 2: Run focused checks**

Run:

```powershell
pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/controllers/sageos.test.ts src/ui/views/sageos.test.ts
```

Expected: PASS.

- [x] **Step 3: Run static, build, and browser checks**

Run:

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-web-drilldown-repair.md ui/src/ui/controllers/sageos.ts ui/src/ui/controllers/sageos.test.ts ui/src/ui/views/sageos.ts ui/src/ui/views/sageos.test.ts ui/src/ui/app-render.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm --dir ui build
pnpm build
```

Expected: all commands exit 0. Also verify `/sageos` in a browser against a temporary gateway state with a failed memory queue entry so the task details and safe `Run repair` path are exercised end-to-end.

- [x] **Step 4: Commit the slice**

Commit message: `SageOS: add web drilldown repair controls`.

### Self-Review

- Spec coverage: Covers the Phase 12 requirements for task drill-down and incident repair actions in the web Command Center.
- Placeholder scan: No placeholders remain.
- Type consistency: `onRunRepair`, `runSageOsIncidentRepair`, and `incident.repairAction.gatewayMethod` names match existing view/controller contracts.
