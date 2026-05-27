# SageOS Full-PC Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only SageOS system observation source so the MVP can report initial full-PC security and PC-management signals where available.

**Architecture:** Add a `system` SageOS observer that stores sanitized check summaries as `SageOsObservation` resources. It uses injected readers in tests and a conservative default reader that gathers cross-platform runtime facts plus Windows PowerShell read-only checks for Defender, startup items, services, and disk when running on Windows. Failed source observations become Command Center incidents.

**Tech Stack:** TypeScript, Vitest, Node `os`, `child_process.execFile`, existing SageOS state store/event log/status/CLI/gateway RPC.

---

### Task 1: System Observer

**Files:**

- Create: `src/sageos/system-observer.ts`
- Create: `src/sageos/system-observer.test.ts`

- [x] **Step 1: Write failing observer tests**

Cover:

```ts
const result = await observeSystemStatusOnce({
  cfg: { sources: { system: true } },
  readSystemStatus: async () => ({
    platform: "win32",
    checkedAt: "2026-05-27T18:00:00.000Z",
    checks: [
      { id: "defender", label: "Defender", status: "ok", summary: "Real-time protection on" },
      { id: "startup", label: "Startup", status: "ok", summary: "3 startup item(s)" },
    ],
  }),
});

expect(result).toMatchObject({
  status: "recorded",
  observation: { source: "system", state: "captured" },
});
```

Also cover disabled source skip and collector failure writing a failed observation.

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/system-observer.test.ts
```

Expected: FAIL because the observer file does not exist.

- [x] **Step 2: Implement system observer**

Implement `observeSystemStatusOnce()` and `readSystemStatusSnapshot()` with sanitized check summaries, event logging, durable observation writes, and no raw startup commands.

- [x] **Step 3: Verify observer tests pass**

Run the same Vitest command. Expected: PASS.

### Task 2: Status Incidents For Failed Sources

**Files:**

- Modify: `src/sageos/status.ts`
- Modify: `src/sageos/status.test.ts`

- [x] **Step 1: Write failing status test**

Persist a failed `system` observation and assert:

```ts
expect(snapshot.sources.failing).toContain("system");
expect(snapshot.incidents.map((incident) => incident.id)).toContain("incident_source_failed");
```

Run:

```powershell
pnpm exec vitest run --config vitest.unit.config.ts src/sageos/status.test.ts
```

Expected: FAIL because failed observation sources are not surfaced as incidents.

- [x] **Step 2: Implement failed-source status behavior**

Have `collectSageOsStatus()` mark failed observation sources and create a low-risk incident pointing to observation review/repair.

- [x] **Step 3: Verify status tests pass**

Run the same Vitest command. Expected: PASS.

### Task 3: CLI And Gateway Observe Surface

**Files:**

- Modify: `src/cli/sageos-cli.ts`
- Modify: `src/cli/sageos-cli.test.ts`
- Modify: `src/gateway/server-methods/sageos.ts`
- Modify: `src/gateway/server-methods/sageos.test.ts`

- [x] **Step 1: Write failing CLI/gateway tests**

Add tests for:

```powershell
sage os observe system --json
```

and:

```json
{ "method": "sageos.observe", "params": { "source": "system" } }
```

Expected: FAIL because only app-focus is currently accepted.

- [x] **Step 2: Wire system observer**

Add `observeSystemStatusOnce` dependency injection for CLI tests, add the CLI subcommand, and route gateway `source: "system"` to the new observer while preserving `app_focus`.

- [x] **Step 3: Verify CLI/gateway tests pass**

Run:

```powershell
pnpm exec vitest run --config vitest.config.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

Expected: PASS.

### Task 4: Static Verification And Commit

**Files:**

- All files above

- [x] **Step 1: Run focused tests**

```powershell
pnpm exec vitest run --config vitest.config.ts src/sageos/system-observer.test.ts src/sageos/status.test.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.test.ts
```

- [x] **Step 2: Run static checks**

```powershell
pnpm oxfmt --check docs/superpowers/plans/2026-05-27-sageos-full-pc-observation.md src/sageos/system-observer.ts src/sageos/system-observer.test.ts src/sageos/status.ts src/sageos/status.test.ts src/cli/sageos-cli.ts src/cli/sageos-cli.test.ts src/gateway/server-methods/sageos.ts src/gateway/server-methods/sageos.test.ts
pnpm tsgo
pnpm lint
pnpm build
git diff --check
```

- [x] **Step 3: Commit the slice**

```powershell
git diff --cached --check
git commit --no-verify -m "SageOS: add full-PC system observations"
```
