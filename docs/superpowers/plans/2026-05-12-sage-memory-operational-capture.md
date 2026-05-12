# Sage Memory Operational Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Sage-side session replay, live Sage Memory diagnostics, and automatic best-effort transcript capture for the remaining Sage lifecycle surfaces.

**Architecture:** Keep the existing transcript mapper and remote manager as the core capture contract. Add small operational helpers in `src/memory/`, wire thin CLI commands, and reuse the same helper from heartbeat, memory-flush compaction, and Gateway session lifecycle handlers.

**Tech Stack:** TypeScript ESM, Commander, Vitest, Sage Memory HTTP API, existing Sage JSONL transcript mapper.

---

## File Structure

- Create `src/memory/sage-memory-session-capture.ts`: resolves remote backend config and manually ingests a Sage session transcript.
- Create `src/memory/sage-memory-session-capture.test.ts`: focused replay tests.
- Create `src/memory/sage-memory-doctor.ts`: live diagnostic checklist with injectable fetch/process/vault probes.
- Create `src/memory/sage-memory-doctor.test.ts`: diagnostic checklist tests.
- Create `src/memory/sage-memory-auto-capture.ts`: best-effort lifecycle capture with background scheduling and deduplication.
- Create `src/memory/sage-memory-auto-capture.test.ts`: focused automatic capture tests.
- Modify `src/cli/memory-cli.ts`: add `capture-session` and `doctor` subcommands with delegated implementation.
- Modify `src/cli/memory-cli.test.ts` or add focused CLI tests if needed for command wiring.
- Modify `src/cli/program/register.maintenance.ts`: add `sage doctor memory` alias.
- Modify `src/auto-reply/reply/agent-runner-memory.ts`: schedule capture after memory-flush compaction.
- Modify `src/infra/heartbeat-runner.ts`: schedule heartbeat-safe background capture.
- Modify `src/gateway/server-methods/sessions.ts`: capture before reset/delete/compact mutations.
- Modify `docs/cli/memory.md` and `docs/cli/index.md` if the commands become user-facing in this slice.

## Task 1: Manual Replay Helper

**Files:**

- Create: `src/memory/sage-memory-session-capture.ts`
- Test: `src/memory/sage-memory-session-capture.test.ts`

- [x] **Step 1: Write failing replay tests**

Test that `captureSageSessionTranscript()`:

- rejects a non-`sage-memory` backend,
- rejects a transcript with no useful messages,
- uses `sessionFile`, `agentId`, `sessionKey`, `sessionId`, and `namespace` overrides,
- calls `SageMemoryManager.ingestLlmSession()`,
- returns `sessionNodePath`, `sourceUri`, `namespace`, `deduplicated`, `eventId`, and `derivedNodeIds`.

- [x] **Step 2: Run replay tests red**

Run:

```powershell
pnpm vitest run src/memory/sage-memory-session-capture.test.ts
```

Expected: fail because the helper does not exist.

- [x] **Step 3: Implement replay helper**

Create the helper with dependency injection for config resolution and manager creation. Reuse `loadSageSessionTranscriptForMemory()` and `SageMemoryManager.ingestLlmSession()`.

- [x] **Step 4: Run replay tests green**

Run the same focused Vitest command and confirm it passes.

## Task 2: Diagnostic Helper

**Files:**

- Create: `src/memory/sage-memory-doctor.ts`
- Test: `src/memory/sage-memory-doctor.test.ts`

- [x] **Step 1: Write failing doctor tests**

Test that `runSageMemoryDoctor()`:

- reports a failed config check for non-remote backends,
- checks `/health` and OpenAPI required paths,
- includes bearer auth for ingest and export,
- ingests a diagnostic session, searches for the marker, expands the returned node, and exports the namespace,
- records warnings for duplicate process probe failures without failing the whole doctor.

- [x] **Step 2: Run doctor tests red**

Run:

```powershell
pnpm vitest run src/memory/sage-memory-doctor.test.ts
```

Expected: fail because the helper does not exist.

- [x] **Step 3: Implement doctor helper**

Create typed check results with `pass`, `warn`, and `fail` states. Continue after failures where possible and return a complete report with an overall `ok` boolean.

- [x] **Step 4: Run doctor tests green**

Run the same focused Vitest command and confirm it passes.

## Task 3: CLI Wiring

**Files:**

- Modify: `src/cli/memory-cli.ts`
- Test: `src/cli/memory-cli.test.ts` or focused new CLI test file

- [x] **Step 1: Write failing CLI tests**

Add command wiring tests for:

- `sage memory capture-session <file> --json`
- `sage memory doctor --json`

Mock the helper modules so tests assert the CLI passes options and prints JSON.

- [x] **Step 2: Wire commands**

Add the two subcommands under `memory`, keeping command bodies thin and delegating behavior to the new helpers.

- [x] **Step 3: Run CLI tests green**

Run:

```powershell
pnpm vitest run src/cli/memory-cli.test.ts
```

Expected: pass.

## Task 4: Docs

**Files:**

- Modify: `docs/cli/memory.md`
- Modify: `docs/cli/index.md`

- [x] **Step 1: Update CLI docs**

Document the two new commands, their required backend, and example invocations.

- [x] **Step 2: Format-check docs**

Run touched-file `oxfmt --check` with the docs included.

## Task 5: Automatic Capture Helper

**Files:**

- Create: `src/memory/sage-memory-auto-capture.ts`
- Test: `src/memory/sage-memory-auto-capture.test.ts`
- Modify: `src/memory/sage-session-transcript.ts`
- Test: `src/memory/sage-session-transcript.test.ts`

- [x] **Step 1: Write failing automatic capture tests**

Cover backend-disabled skips, lifecycle metadata mapping, and short-window scheduled capture deduplication.

- [x] **Step 2: Implement best-effort helper**

Add `captureSageSessionTranscriptBestEffort()` and `scheduleSageSessionTranscriptCapture()` with no-throw behavior, background scheduling, and dedupe by transcript/session/method.

- [x] **Step 3: Run focused tests green**

Run:

```powershell
pnpm vitest run src/memory/sage-session-transcript.test.ts src/memory/sage-memory-auto-capture.test.ts
```

## Task 6: Lifecycle Wiring

**Files:**

- Modify: `src/auto-reply/reply/agent-runner-memory.ts`
- Modify: `src/infra/heartbeat-runner.ts`
- Modify: `src/gateway/server-methods/sessions.ts`

- [x] **Step 1: Write failing lifecycle tests**

Cover memory-flush compaction scheduling, heartbeat scheduling, and Gateway reset/delete/compact capture before transcript mutation.

- [x] **Step 2: Wire automatic capture**

Schedule background capture for heartbeat and memory-flush compaction. Await best-effort capture before Gateway reset/delete/compact mutates or archives transcripts.

- [x] **Step 3: Run lifecycle tests green**

Run:

```powershell
pnpm vitest run src/auto-reply/reply/agent-runner.memory-flush.runreplyagent-memory-flush.increments-compaction-count-flush-compaction-completes.test.ts src/infra/heartbeat-runner.sage-memory-capture.test.ts
pnpm vitest run --config vitest.e2e.config.ts --hookTimeout 120000 src/gateway/server.sessions.gateway-server-sessions-a.e2e.test.ts
```

## Task 7: Doctor Alias and Guidance

**Files:**

- Modify: `src/cli/program/register.maintenance.ts`
- Create: `src/cli/program/register.maintenance.memory-doctor.test.ts`
- Create: `src/memory/sage-memory-doctor-format.ts`
- Modify: `src/memory/sage-memory-doctor.ts`

- [x] **Step 1: Write failing alias/guidance tests**

Cover `sage doctor memory --json`, config guidance, and token environment guidance.

- [x] **Step 2: Implement alias and suggestions**

Route the scoped doctor command to the same helper as `sage memory doctor`, and include actionable suggestions for missing backend and token configuration.

- [x] **Step 3: Run tests green**

Run:

```powershell
pnpm vitest run src/memory/sage-memory-doctor.test.ts src/cli/memory-cli.test.ts src/cli/program/register.maintenance.memory-doctor.test.ts
```

## Task 8: Verification

- [x] **Step 1: Run focused tests**

Run:

```powershell
pnpm vitest run src/memory/sage-session-transcript.test.ts src/memory/sage-memory-auto-capture.test.ts src/memory/sage-memory-session-capture.test.ts src/memory/sage-memory-doctor.test.ts src/auto-reply/reply/agent-runner.memory-flush.runreplyagent-memory-flush.increments-compaction-count-flush-compaction-completes.test.ts src/infra/heartbeat-runner.sage-memory-capture.test.ts src/cli/memory-cli.test.ts src/cli/program/register.maintenance.memory-doctor.test.ts
pnpm vitest run --config vitest.e2e.config.ts --hookTimeout 120000 src/gateway/server.sessions.gateway-server-sessions-a.e2e.test.ts
```

- [x] **Step 2: Run type check**

Run:

```powershell
pnpm exec tsgo --noEmit
```

- [x] **Step 3: Run touched-file format check**

Run:

```powershell
pnpm exec oxfmt --check src/memory/sage-session-transcript.ts src/memory/sage-session-transcript.test.ts src/memory/sage-memory-session-capture.ts src/memory/sage-memory-session-capture.test.ts src/memory/sage-memory-auto-capture.ts src/memory/sage-memory-auto-capture.test.ts src/memory/sage-memory-doctor.ts src/memory/sage-memory-doctor.test.ts src/memory/sage-memory-doctor-format.ts src/auto-reply/reply/agent-runner-memory.ts src/auto-reply/reply/agent-runner.memory-flush.runreplyagent-memory-flush.increments-compaction-count-flush-compaction-completes.test.ts src/infra/heartbeat-runner.ts src/infra/heartbeat-runner.sage-memory-capture.test.ts src/gateway/server-methods/sessions.ts src/gateway/server.sessions.gateway-server-sessions-a.e2e.test.ts src/cli/memory-cli.ts src/cli/memory-cli.test.ts src/cli/program/register.maintenance.ts src/cli/program/register.maintenance.memory-doctor.test.ts docs/cli/memory.md docs/cli/index.md docs/superpowers/specs/2026-05-12-sage-memory-operational-capture-design.md docs/superpowers/plans/2026-05-12-sage-memory-operational-capture.md
```

- [x] **Step 4: Run whitespace check**

Run:

```powershell
git diff --check
```

## Self Review

- The slice keeps operator controls and automatic triggers on the same ingest contract.
- The commands are scoped to the remote backend and do not alter local SQLite/QMD behavior.
- The diagnostic command intentionally writes only a clearly marked diagnostic session into an isolated namespace.
- MCP is intentionally deferred until the native capture loop has been proven live.
