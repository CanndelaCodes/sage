# SageOS Memory Doctor Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SageOS run the existing Sage Memory doctor, record wiki export proof in Command Center status, and raise a memory incident when doctor checks fail.

**Architecture:** Reuse `runSageMemoryDoctor()` as the canonical diagnostic/export implementation. Add a SageOS wrapper in the memory steward layer that records an audit event, writes a compact doctor summary into `SageOsStatusSnapshot.memory`, and exposes the action through `sage os memory doctor` and `sageos.memory.doctor`.

**Tech Stack:** TypeScript, Vitest, Commander CLI, Sage gateway request handlers, existing Sage Memory doctor/export-wiki APIs.

---

### Task 1: Status Model And Rendering

**Files:**
- Modify: `src/sageos/types.ts`
- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`
- Modify: `src/sageos/status-renderer.ts`
- Modify: `src/sageos/status-renderer.test.ts`

- [ ] **Step 1: Write failing status tests**

Add coverage that a persisted failed memory doctor summary is preserved by `collectSageOsStatus()`, degrades memory status, creates `incident_memory_doctor_failed`, and renders wiki export proof.

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts
```

Expected: FAIL because `memory.doctor` does not exist and the renderer does not mention doctor/export proof.

- [ ] **Step 2: Add status types and collection behavior**

Add `SageOsMemoryDoctorSummary` with `ok`, `checkedAt`, check counts, warnings/failures, `exportedFiles`, `diagnosticNamespace`, and optional node path. Preserve that summary when status is recollected, degrade memory when `ok` is false, and add a low-risk doctor rerun repair action.

- [ ] **Step 3: Render doctor/export proof**

Append compact human output to the Memory line, for example `doctor fail, wiki exports 1`, when a doctor summary is present.

- [ ] **Step 4: Verify status tests pass**

Run the same Vitest command. Expected: PASS.

### Task 2: SageOS Memory Doctor Runner

**Files:**
- Modify: `src/sageos/memory-steward.ts`
- Modify: `src/sageos/memory-steward.test.ts`

- [ ] **Step 1: Write failing runner tests**

Add tests for `runSageOsMemoryDoctorOnce()`:

```ts
expect(result.status.memory.doctor).toMatchObject({
  ok: true,
  exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
});
```

and for the failure path:

```ts
expect(result.status.memory.status).toBe("degraded");
expect(result.status.incidents.map((incident) => incident.id)).toContain(
  "incident_memory_doctor_failed",
);
```

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/memory-steward.test.ts
```

Expected: FAIL because `runSageOsMemoryDoctorOnce()` does not exist.

- [ ] **Step 2: Implement the wrapper**

Call `runSageMemoryDoctor({ cfg, agentId, namespace, queuePath, now })`, summarize the report, append either `memory_doctor_passed` or `memory_doctor_failed`, write the refreshed SageOS state, and return `{ doctor, status }`.

- [ ] **Step 3: Verify runner tests pass**

Run the same Vitest command. Expected: PASS.

### Task 3: CLI And Gateway Controls

**Files:**
- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`
- Modify: `src/gateway/server-methods.ts`
- Modify: `src/gateway/server-methods-list.ts`

- [ ] **Step 1: Write failing CLI and gateway tests**

Add tests for `sage os memory doctor --agent main --namespace sage.diagnostics --json` and `sageos.memory.doctor` proving config, agent id, namespace, state write, broadcast, and method listing/authorization.

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: FAIL because the CLI command and gateway method do not exist.

- [ ] **Step 2: Implement CLI command**

Add `runMemoryDoctorOnce` dependency injection, wire `sage os memory doctor`, and print JSON or `formatDoctorReport(result.doctor)` plus the SageOS memory status.

- [ ] **Step 3: Implement gateway method**

Add `sageos.memory.doctor` to the method list and write scope, call the SageOS runner, persist state, broadcast `sageos`, and return `{ result, state }`.

- [ ] **Step 4: Verify CLI and gateway tests pass**

Run the same Vitest command. Expected: PASS.

### Task 4: Final Verification And Commit

**Files:**
- All files above

- [ ] **Step 1: Run focused tests**

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/sageos/memory-steward.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

- [ ] **Step 2: Run static checks**

```powershell
pnpm oxfmt --check src/sageos/types.ts src/sageos/status.ts src/sageos/status-renderer.ts src/sageos/memory-steward.ts src/cli/sageos-cli.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods.ts src/gateway/server-methods-list.ts
pnpm tsgo
pnpm lint
pnpm build
```

- [ ] **Step 3: Commit the slice**

Use a scoped commit message:

```powershell
git diff --cached --check
git commit --no-verify -m "SageOS: add memory doctor export proof"
```
