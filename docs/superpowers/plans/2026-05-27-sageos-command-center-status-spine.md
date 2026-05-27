# SageOS Command Center Status Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SageOS Command Center status contract derive from durable local resources, audit data, and existing memory/learning queues.

**Architecture:** Add a small status collector under `src/sageos/` that reads the existing SageOS state store plus memory and learning queue summaries, then returns one stable `SageOsStatusSnapshot`. Keep rendering separate so CLI and gateway share the same contract without duplicating summary logic.

**Tech Stack:** TypeScript, Vitest, existing SageOS state store/event log, existing Sage Memory capture queue, existing learning activity queue, Commander CLI, gateway request handlers.

---

## File Map

- Create `src/sageos/status.ts`: collect resource counts, health sections, queue summaries, and audit metadata into a `SageOsStatusSnapshot`.
- Create `src/sageos/status.test.ts`: TDD coverage for collected resource counts, memory/learning queue incidents, and audit metadata.
- Create `src/sageos/status-renderer.ts`: human-readable Command Center rendering shared by CLI tests and command output.
- Create `src/sageos/status-renderer.test.ts`: human output coverage for core sections.
- Modify `src/sageos/types.ts`: extend `SageOsStatusSnapshot` with memory, learning, policy, coding, notifications, sources, and runs sections.
- Modify `src/cli/sageos-cli.ts`: replace local skeleton rendering/loading with shared collector and renderer.
- Modify `src/gateway/server-methods/sageos.ts`: return collected status for `sageos.status` and broadcasts after control changes.
- Modify `src/cli/sageos-cli.test.ts` and `src/gateway/server-methods/sageos.test.ts`: assert the richer JSON contract is exposed.

### Task 1: Status Types and Collector Tests

**Files:**

- Modify: `src/sageos/types.ts`
- Create: `src/sageos/status.test.ts`
- Create: `src/sageos/status.ts`

- [ ] **Step 1: Write the failing collector test**

Create `src/sageos/status.test.ts` with a test that seeds one active employee, queued/running/blocked tasks, a running run, one audit event, one memory capture queue failure, and one failed learning event queue entry. Assert that `collectSageOsStatus({ stateDir, agentId: "main" })` returns:

```ts
expect(snapshot.employees).toMatchObject({ total: 1, active: 1 });
expect(snapshot.tasks).toMatchObject({ total: 3, active: 1, queued: 1, blocked: 1 });
expect(snapshot.runs).toMatchObject({ total: 1, active: 1, failed: 0 });
expect(snapshot.memory.captureQueue.failed).toBe(1);
expect(snapshot.learning.activityQueue.failed).toBe(1);
expect(snapshot.audit.recentEvents).toBe(1);
expect(snapshot.incidents.map((incident) => incident.category)).toEqual(
  expect.arrayContaining(["memory", "learning"]),
);
```

- [ ] **Step 2: Run the collector test to verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts
```

Expected: fail because `src/sageos/status.ts` and the richer snapshot fields do not exist yet.

- [ ] **Step 3: Implement the minimal collector**

Implement `collectSageOsStatus` by reading `readSageOsState`, `listSageMemoryCaptureQueue`, `listLearningEventQueue`, and the local event log line count. Count active employees, task states, run states, and emit warning incidents for failed memory or learning queue entries.

- [ ] **Step 4: Run the collector test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/sageos/status.test.ts
```

Expected: pass with the richer collected snapshot.

### Task 2: Shared Human Renderer

**Files:**

- Create: `src/sageos/status-renderer.test.ts`
- Create: `src/sageos/status-renderer.ts`
- Modify: `src/cli/sageos-cli.ts`

- [ ] **Step 1: Write the failing renderer test**

Create `src/sageos/status-renderer.test.ts` and assert that `renderSageOsStatus(snapshot)` includes the Command Center header plus `Memory:`, `Learning:`, `Runs:`, `Policy:`, `Sources:`, `Notifications:`, `Incidents:`, and `Audit:` lines.

- [ ] **Step 2: Run the renderer test to verify RED**

Run:

```bash
pnpm exec vitest run src/sageos/status-renderer.test.ts
```

Expected: fail because the shared renderer does not exist yet.

- [ ] **Step 3: Implement the renderer and wire CLI status**

Move human status formatting out of `src/cli/sageos-cli.ts` into `src/sageos/status-renderer.ts`; make `sage os status` call `collectSageOsStatus()` before printing JSON or human output.

- [ ] **Step 4: Run CLI and renderer tests**

Run:

```bash
pnpm exec vitest run src/sageos/status-renderer.test.ts src/cli/sageos-cli.test.ts
```

Expected: pass and CLI JSON includes the new sections.

### Task 3: Gateway Status Contract

**Files:**

- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [ ] **Step 1: Write the failing gateway assertion**

Update the `sageos.status` test to assert `payload.status.memory`, `payload.status.learning`, `payload.status.runs`, and `payload.status.audit.eventLogPath` exist.

- [ ] **Step 2: Run the gateway test to verify RED**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: fail until the handler uses the shared collector.

- [ ] **Step 3: Wire gateway status and control broadcasts**

Make `sageos.status` respond with `{ ...state, status: await collectSageOsStatus() }`. After `sageos.control`, write the control state, append audit, collect a fresh snapshot, persist it, broadcast it, and respond with the same state shape.

- [ ] **Step 4: Run gateway test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/gateway/server-methods/sageos.test.ts
```

Expected: pass with the richer contract.

### Task 4: Slice Verification and Commit

**Files:**

- Verify all files touched in Tasks 1-3.

- [ ] **Step 1: Run focused SageOS tests**

Run:

```bash
pnpm exec vitest run src/sageos/types.test.ts src/sageos/supervisor.test.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/config/sageos-schema.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: pass.

- [ ] **Step 2: Run formatting/build gate for the slice**

Run:

```bash
pnpm check
pnpm build
git diff --check
```

Expected: pass, or document unrelated baseline failures separately.

- [ ] **Step 3: Commit scoped changes**

Run:

```bash
scripts/committer "SageOS: collect command center status" docs/superpowers/plans/2026-05-27-sageos-command-center-status-spine.md src/sageos/types.ts src/sageos/status.ts src/sageos/status.test.ts src/sageos/status-renderer.ts src/sageos/status-renderer.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
```

Expected: commit contains only this status-spine slice.

## Self-Review

- Spec coverage: this plan completes the first-brick gap for stable JSON status and minimal Command Center overview. It does not implement employee creation, task cancellation, approval decisions, Telegram alerts, or native UI; those remain later MVP slices.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test steps remain.
- Type consistency: collector, renderer, CLI, and gateway all use `SageOsStatusSnapshot`.
