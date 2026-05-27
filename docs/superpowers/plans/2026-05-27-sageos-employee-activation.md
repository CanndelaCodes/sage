# SageOS Employee Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an employee activation preview and activation path so SageOS can show tools, scopes, autonomy, memory access, schedules, and risks before a draft employee becomes active.

**Architecture:** Add a focused employee activation module that derives a reviewable preview from an existing `SageOsAgentSpec`, gates risky activation behind the durable approval store, and activates low-risk drafts in one step. CLI and gateway controls call the same helper so Command Center clients and local operators see identical behavior.

**Tech Stack:** TypeScript, Vitest, existing SageOS state store, event log, approvals, CLI, and gateway RPC handlers.

---

### Task 1: Employee Activation Core

**Files:**

- Modify: `src/sageos/types.ts`
- Create: `src/sageos/employee-activation.ts`
- Create: `src/sageos/employee-activation.test.ts`

- [x] **Step 1: Write failing activation tests**

Add tests that seed draft employees and assert:

```ts
const preview = buildSageOsEmployeeActivationPreview({
  id: "employee_memory",
  name: "Memory Steward",
  role: "memory",
  mission: "Keep memory healthy.",
  status: "draft",
  autonomyTier: "execute_scoped",
  responsibilities: ["replay queues"],
  allowedScopes: [
    { kind: "tool", allow: ["sage-memory"], risk: "medium" },
    { kind: "memory", allow: ["capture_queue"], risk: "medium" },
  ],
  deniedScopes: [{ kind: "memory", deny: ["private_data_export"], risk: "critical" }],
  tools: ["sage-memory"],
  memoryScopes: ["capture_queue"],
  schedules: ["gateway tick"],
  risks: ["incorrect replay"],
  createdAt: now,
  updatedAt: now,
});

expect(preview).toMatchObject({
  employeeId: "employee_memory",
  autonomyTier: "execute_scoped",
  tools: ["sage-memory"],
  memoryAccess: ["capture_queue"],
  schedules: ["gateway tick"],
  risks: ["incorrect replay"],
  approvalRequired: false,
});
```

Also cover:

- `activateSageOsEmployee()` changes a low-risk draft to `active`, appends `employee_activated`, and stores `activatedAt`.
- A high-risk scope returns `approval_required`, creates `approval_employee_<id>`, leaves the employee `draft`, and later activates after that approval is approved.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/employee-activation.test.ts
```

Expected: FAIL because the module and optional employee activation fields do not exist.

- [x] **Step 2: Implement activation core**

Add optional `tools`, `memoryScopes`, `schedules`, `risks`, and `activatedAt` fields to `SageOsAgentSpec`.

Create:

```ts
export function buildSageOsEmployeeActivationPreview(
  employee: SageOsAgentSpec,
): SageOsEmployeeActivationPreview;
export async function activateSageOsEmployee(params: {
  employeeId: string;
  requestedBy?: string;
  reason?: string;
  now?: () => Date;
  stateDir?: string;
  stateStore?: SageOsStateStore;
}): Promise<SageOsEmployeeActivationResult>;
```

Behavior:

- Preview always includes tools, allowed scopes, denied scopes, autonomy tier, memory access, schedules, risks, and whether approval is required.
- Medium system/channel/network scopes and high/critical scopes require approval.
- Approval-required activation creates or refreshes `approval_employee_<id>` with `scope: "employee"` and leaves the employee as `draft`.
- If `approval_employee_<id>` is already approved, activation may proceed.
- Low-risk activation sets `status: "active"`, writes `activatedAt`, persists the employee, and appends `employee_activated`.

- [x] **Step 3: Verify activation core tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/employee-activation.test.ts
```

Expected: PASS.

### Task 2: CLI Activation Controls

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`

- [x] **Step 1: Write failing CLI tests**

Extend the employee CLI test to seed a draft and assert:

```powershell
sage os employees preview employee_memory --json
sage os employees activate employee_memory --json
```

Expected JSON:

```ts
expect(lastJson()).toMatchObject({
  preview: {
    employeeId: "employee_memory",
    tools: ["sage-memory"],
    memoryAccess: ["capture_queue"],
    schedules: ["gateway tick"],
    risks: ["incorrect replay"],
  },
});

expect(lastJson()).toMatchObject({
  result: {
    outcome: "activated",
    employee: { id: "employee_memory", status: "active" },
  },
});
```

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/cli/sageos-cli.test.ts
```

Expected: FAIL because the commands do not exist.

- [x] **Step 2: Wire CLI commands**

Import the activation helpers and add:

- `sage os employees preview <id> --json`
- `sage os employees activate <id> --reason <text> --json`

Both commands should output JSON with the helper result and use existing `outputJsonOrText()`.

- [x] **Step 3: Verify CLI tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/cli/sageos-cli.test.ts
```

Expected: PASS.

### Task 3: Gateway Activation Controls

**Files:**

- Modify: `src/gateway/server-methods-list.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [x] **Step 1: Write failing gateway tests**

Assert registered methods include:

```ts
expect(listGatewayMethods()).toContain("sageos.agents.activationPreview");
expect(listGatewayMethods()).toContain("sageos.agents.activate");
```

Seed a draft employee, then invoke:

```ts
await invoke("sageos.agents.activationPreview", { id: "employee_memory" });
await invoke("sageos.agents.activate", { id: "employee_memory", reason: "reviewed" });
```

Expected: preview includes tools/memory/schedules/risks; activation returns an active employee and broadcasts updated SageOS state.

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts
```

Expected: FAIL because methods are not registered or handled.

- [x] **Step 2: Wire gateway methods**

Add handlers:

- `sageos.agents.activationPreview`: validate `id`, return `{ preview }`, fail with `INVALID_REQUEST` for missing/unknown employees.
- `sageos.agents.activate`: validate `id`, call `activateSageOsEmployee({ requestedBy: "sageos.gateway" })`, broadcast updated state, return `{ result, state }`.

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
pnpm exec vitest run --config vitest.config.ts src/sageos/employee-activation.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

- [x] **Step 2: Run static checks**

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-employee-activation.md src/sageos/types.ts src/sageos/employee-activation.ts src/sageos/employee-activation.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
git diff --check
pnpm tsgo
pnpm lint
pnpm build
```

- [x] **Step 3: Commit the slice**

```powershell
git add docs/superpowers/plans/2026-05-27-sageos-employee-activation.md src/sageos/types.ts src/sageos/employee-activation.ts src/sageos/employee-activation.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods-list.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
git diff --cached --check
git commit --no-verify -m "SageOS: add employee activation preview"
```
