# Sage Memory Session Transcript Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture full previous Sage session transcripts into Sage Memory on `/new` using the `POST /v1/ingest/llm-session` contract.

**Architecture:** Add a small transcript mapper in `src/memory/` that converts Sage Pi JSONL transcripts into Sage Memory LLM session ingest payloads. Add an authenticated `ingestLlmSession()` client method to `SageMemoryManager`, then wire the existing `session-memory` hook to call it best-effort before retaining the current Markdown handoff behavior.

**Tech Stack:** TypeScript ESM, Vitest, Sage Memory HTTP API, existing Sage session JSONL files, existing `session-memory` hook.

---

## File Structure

- Create `src/memory/sage-session-transcript.ts`: owns JSONL parsing and mapping to the remote LLM session ingest payload.
- Create `src/memory/sage-session-transcript.test.ts`: focused mapper tests.
- Modify `src/memory/sage-memory-manager.ts`: add request and response types plus `ingestLlmSession()`.
- Modify `src/memory/sage-memory-manager.test.ts`: add HTTP/auth/body test for ingest.
- Modify `src/hooks/bundled/session-memory/handler.ts`: call full transcript ingest when remote backend is active and the previous session file exists.
- Modify `src/hooks/bundled/session-memory/handler.test.ts`: update remote hook expectations and add failure best-effort coverage.
- Add docs artifacts only in `docs/superpowers/`; no generated `docs/zh-CN/**` edits.

## Task 1: Transcript Mapper

**Files:**

- Create: `src/memory/sage-session-transcript.ts`
- Test: `src/memory/sage-session-transcript.test.ts`

- [x] **Step 1: Write the failing mapper test**

Create `src/memory/sage-session-transcript.test.ts` with tests that build a temporary JSONL transcript containing:

```ts
{
  type: "session",
  id: "sage-session-1",
  timestamp: "2026-05-12T12:00:00.000Z",
  cwd: "C:\\Users\\jason\\Desktop\\sage"
}
```

and message entries for a user text, assistant text with `model: "gpt-5"`, and a tool result with `toolName: "exec_command"`. Assert that `loadSageSessionTranscriptForMemory()` returns `source: "sage"`, `source_uri: "sage://session/sage-session-1"`, `sensitivity: "private"`, workspace metadata, and three normalized messages.

- [x] **Step 2: Run the mapper test to verify red**

Run: `pnpm vitest run src/memory/sage-session-transcript.test.ts`

Expected: fail because `src/memory/sage-session-transcript.ts` does not exist.

- [x] **Step 3: Implement the mapper**

Create `src/memory/sage-session-transcript.ts` with:

- `SageMemoryLlmSessionMessage`
- `SageMemoryLlmSessionIngestInput`
- `loadSageSessionTranscriptForMemory(params)`
- helpers for JSONL parsing, content extraction, timestamp normalization, role mapping, and title fallback.

The mapper skips invalid JSON lines, skips messages with no text, includes user and assistant message text, includes tool result text when present, and returns `null` when no useful messages are found.

- [x] **Step 4: Run the mapper test to verify green**

Run: `pnpm vitest run src/memory/sage-session-transcript.test.ts`

Expected: pass.

## Task 2: Sage Memory Ingest Client

**Files:**

- Modify: `src/memory/sage-memory-manager.ts`
- Test: `src/memory/sage-memory-manager.test.ts`

- [x] **Step 1: Write the failing client test**

Add a test to `src/memory/sage-memory-manager.test.ts` that calls `manager.ingestLlmSession()` with a one-message payload and asserts:

- URL is `http://127.0.0.1:18790/v1/ingest/llm-session`.
- Method is `POST`.
- `Authorization` is `Bearer test-token`.
- JSON body keeps snake_case fields required by Sage Memory.
- Return value maps `evidence_id`, `source_uri`, `session_node_id`, `derived_node_ids`, `deduplicated`, and `event_id` to camelCase.

- [x] **Step 2: Run the client test to verify red**

Run: `pnpm vitest run src/memory/sage-memory-manager.test.ts`

Expected: fail because `ingestLlmSession` is not implemented.

- [x] **Step 3: Implement `ingestLlmSession()`**

Update `src/memory/sage-memory-manager.ts` to import the mapper types, add response types, and post the payload through existing `requestJson()`.

- [x] **Step 4: Run the client test to verify green**

Run: `pnpm vitest run src/memory/sage-memory-manager.test.ts`

Expected: pass.

## Task 3: Hook Integration

**Files:**

- Modify: `src/hooks/bundled/session-memory/handler.ts`
- Test: `src/hooks/bundled/session-memory/handler.test.ts`

- [x] **Step 1: Write the failing hook tests**

Update the existing remote backend test so the first remote call is `/v1/ingest/llm-session` and the body contains full transcript messages. Add a second test where `/v1/ingest/llm-session` returns 500 and assert the hook still writes the Markdown memory file without throwing.

- [x] **Step 2: Run the hook test to verify red**

Run: `pnpm vitest run src/hooks/bundled/session-memory/handler.test.ts`

Expected: fail because the hook still only calls `/v1/capture`.

- [x] **Step 3: Wire the hook**

Update `captureSessionMemoryToRemote()` so it receives `sessionFile`, calls `loadSageSessionTranscriptForMemory()`, and uses `manager.ingestLlmSession()` when a transcript payload is available. If no payload is available, call the existing `manager.capture()` fallback.

- [x] **Step 4: Run the hook test to verify green**

Run: `pnpm vitest run src/hooks/bundled/session-memory/handler.test.ts`

Expected: pass.

## Task 4: Focused Verification

**Files:**

- Touched files from Tasks 1 to 3.

- [x] **Step 1: Run focused tests**

Run:

```powershell
pnpm vitest run src/memory/sage-session-transcript.test.ts src/memory/sage-memory-manager.test.ts src/hooks/bundled/session-memory/handler.test.ts
```

Expected: all focused tests pass.

- [x] **Step 2: Run type and format checks for touched files**

Run:

```powershell
pnpm exec tsgo --noEmit
pnpm exec oxfmt --check src/memory/sage-session-transcript.ts src/memory/sage-session-transcript.test.ts src/memory/sage-memory-manager.ts src/memory/sage-memory-manager.test.ts src/hooks/bundled/session-memory/handler.ts src/hooks/bundled/session-memory/handler.test.ts docs/superpowers/specs/2026-05-12-sage-memory-session-transcript-capture-design.md docs/superpowers/plans/2026-05-12-sage-memory-session-transcript-capture.md
git diff --check
```

Expected: type check passes, format check passes, and whitespace check passes.

## Self Review

- Spec coverage: the plan covers transcript mapping, remote ingest, hook wiring, fallback behavior, and focused verification.
- Placeholder scan: no placeholders or deferred implementation steps are present.
- Type consistency: payload and result names are defined in the mapper/client tasks before hook use.
