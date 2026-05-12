# Sage Memory Session Transcript Capture Design

Date: 2026-05-12

## Goal

Make Sage automatically preserve full previous-session transcripts in Sage Memory when a session is reset with `/new`, then make the captured session searchable through the existing `memory_search` and expandable through `memory_get`.

## Context

Sage already supports `memory.backend = "sage-memory"` as an optional remote memory backend. Search and get use the existing tool names and map remote results to `sage-memory/<node-id>` paths.

The bundled `session-memory` hook currently writes a Markdown handoff file on `/new` and best-effort captures that short handoff through `/v1/capture`. That is useful, but it is not full transcript preservation. The sibling `sage-memory` service already has a richer `POST /v1/ingest/llm-session` contract that stores immutable transcript evidence and creates `llm_session` nodes for retrieval and vault export.

## Scope

This slice captures the previous Sage session transcript when `/new` fires and `memory.backend = "sage-memory"` is active.

This slice does not add a new MCP adapter, does not change local SQLite or QMD indexing, and does not add compaction, heartbeat, or explicit session-end capture triggers. Those triggers should reuse the same mapper and ingest client once the `/new` path is proven.

## Approach Options

### Option 1: Capture the Markdown handoff through `/v1/capture`

This is already implemented. It is low risk but only preserves a short summary and loses tool calls, model metadata, timestamps, and full transcript evidence.

### Option 2: Send Sage JSONL transcripts to `/v1/ingest/llm-session`

This is the recommended approach for the first real capture loop. Sage already knows the previous session file during `/new`, and Sage Memory already has the canonical transcript ingest contract. The mapper can stay local and deterministic, and the hook can remain best-effort so `/new` is not blocked by memory service failures.

### Option 3: Wait for MCP and ingest through tools

This creates an avoidable dependency on an adapter that should wrap the same contracts later. It also makes Windows startup and automated testing harder than a direct HTTP path.

## Chosen Design

Add a small Sage-side transcript mapper that reads a Sage Pi session JSONL file and converts it to an `LLMSessionIngestRequest` compatible payload:

- `namespace`: remote default namespace, or `sage.sessions`.
- `source`: `sage`.
- `session_id`: the Sage session id from the session store or transcript header.
- `source_uri`: `sage://session/<sessionId>`.
- `title`: `Sage Session <sessionId>`.
- `started_at`: transcript header timestamp when present.
- `ended_at`: latest message timestamp when present.
- `workspace`: transcript header `cwd`, hook session key, and source path metadata.
- `messages`: user, assistant, and tool style transcript entries with role, content, timestamp, model, tool name, attachments, and small metadata.
- `metadata`: Sage-specific fields such as `sessionKey`, `capture_method`, `sessionFile`, and Markdown handoff path when available.
- `sensitivity`: `private`.

Extend `SageMemoryManager` with `ingestLlmSession()` that sends this payload to `/v1/ingest/llm-session` with the same auth, timeout, and JSON error behavior used by existing search, get, and capture calls.

Update the `session-memory` hook so `/new` keeps writing the Markdown handoff and then, for the remote backend only, attempts full transcript ingest before falling back to the existing short `/v1/capture` call if the transcript file is missing or cannot produce any messages. Remote failures are logged as warnings and must not break `/new`.

## Data Flow

1. User sends `/new`.
2. Sage resets the active session and invokes the bundled `session-memory` hook with `previousSessionEntry`.
3. The hook writes the existing Markdown summary into the agent workspace.
4. If `memory.backend = "sage-memory"`, the hook resolves the remote config.
5. If `previousSessionEntry.sessionFile` exists, Sage maps the JSONL transcript to an LLM session ingest payload.
6. Sage posts the payload to `/v1/ingest/llm-session`.
7. Sage Memory stores immutable evidence, creates an `llm_session` node, and later exports the node to the Obsidian vault.
8. Sage `memory_search` can find the created `llm_session` node and `memory_get` can expand it through `sage-memory/<node-id>`.

## Error Handling

- Missing config or non-remote backend: skip remote ingest.
- Missing or unreadable transcript file: keep existing Markdown write and short `/v1/capture` behavior.
- Empty transcript with no useful messages: keep short `/v1/capture` behavior.
- Remote HTTP/auth/timeout errors: log a warning and do not fail `/new`.
- Invalid JSONL lines: skip the bad line and continue parsing the rest.
- Overlarge transcript text: send all parsed messages; Sage Memory owns evidence preservation and node body capping.

## Testing

Unit tests should cover:

- Mapping Sage JSONL headers and messages into `LLMSessionIngestRequest`.
- Parsing string and array message content.
- Preserving assistant model metadata and tool call or tool result text where available.
- Posting `ingestLlmSession()` to `/v1/ingest/llm-session` with bearer token auth.
- The `/new` hook choosing full transcript ingest when remote backend and transcript file are available.
- The `/new` hook preserving best-effort behavior when ingest fails.

Verification should run focused Vitest for changed files, type checking for touched TypeScript where practical, `pnpm exec oxfmt --check` for touched files, and `git diff --check`.

## Follow-On Work

After this slice is proven, add:

- An explicit `sage memory capture-session` command for manual replay.
- `sage doctor memory` checks for `/health`, auth, namespace, search, get, ingest, and export readiness.
- Compaction and heartbeat-safe capture triggers using the same mapper.
- A live proof script that captures a session, searches it through Sage, expands it through `memory_get`, and verifies the Obsidian note after export.
