# Sage Memory Operational Capture Design

Date: 2026-05-12

## Goal

Make Sage Memory capture operationally reliable from Sage itself. The feature lets an operator replay a Sage session transcript on demand, diagnose whether the remote Sage Memory service can ingest, search, expand, and export captured content, and captures durable Sage session lifecycle events automatically without adding MCP yet.

## Context

Sage already supports `memory.backend = "sage-memory"` as a remote memory backend. Existing `memory_search` and `memory_get` calls work with `sage-memory/<node-id>` paths, and `/new` best-effort ingests the previous Sage session transcript through `POST /v1/ingest/llm-session`.

That proves the capture contract, but it leaves operational gaps:

- There is no deterministic Sage CLI replay path for a specific transcript file.
- There is no Sage-side health check that verifies the full second-brain loop: service reachability, auth, namespace, ingest, search, node expansion, export, and vault output.
- Automatic capture currently depends too heavily on `/new`; compaction, heartbeat, and explicit session lifecycle operations can still mutate or advance transcripts without first feeding Sage Memory.

## Scope

This slice adds operator-facing commands and automatic lifecycle capture:

- `sage memory capture-session <session-file>`: manually ingest a Sage JSONL transcript into the configured Sage Memory backend.
- `sage memory doctor`: run live diagnostics against the configured Sage Memory backend.
- `sage doctor memory`: top-level alias for the same diagnostic helper.
- Best-effort automatic transcript capture for memory-flush compaction, heartbeat runs, and Gateway `sessions.reset`, `sessions.delete`, and `sessions.compact`.

This slice does not add MCP and does not change the existing `memory_search` or `memory_get` tool names. MCP remains deferred until the native CLI and HTTP ingest contract are stable enough to make the MCP surface useful rather than speculative.

## Chosen Design

Use `sage memory` as the command namespace because the existing memory CLI already owns backend config, remote status output, and search behavior. Expose `sage doctor memory` as a thin alias so operators can find the check from the broader doctor workflow without duplicating diagnostic logic.

### Manual Replay

`sage memory capture-session <session-file>` loads a Sage JSONL transcript with the existing `loadSageSessionTranscriptForMemory()` mapper, then posts the payload with `SageMemoryManager.ingestLlmSession()`.

The live Sage Memory API currently accepts the generic LLM session source enum used by the service. Sage therefore sends `source: "other"` and records `source_system: "sage"` plus the `sage://session/<id>` URI in metadata/source fields, preserving Sage identity while staying compatible with the native ingest contract.

Options:

- `--agent <id>`: resolve memory config for a specific Sage agent.
- `--session-key <key>`: set transcript workspace metadata; default to the selected agent id.
- `--session-id <id>`: override the transcript header id.
- `--namespace <namespace>`: override the remote default namespace.
- `--json`: print machine-readable output.

If `memory.backend` is not `sage-memory`, the command fails clearly instead of silently falling back to local SQLite. If the transcript has no usable messages, the command fails clearly. On success, human output includes the session node path, namespace, source URI, and deduplication state.

### Diagnostics

`sage memory doctor` resolves the configured remote backend directly and runs a live checklist:

- Config resolves to `memory.backend = "sage-memory"`.
- Remote endpoint responds to `GET /health`.
- OpenAPI includes the required paths: `/v1/ingest/llm-session`, `/v1/search`, `/v1/nodes/{node_id}`, `/v1/capture`, and `/v1/export/wiki`.
- The configured token environment variable is present when authenticated writes are needed.
- A tiny diagnostic LLM session can be ingested into an isolated diagnostic namespace.
- The diagnostic marker can be found through `/v1/search`.
- The returned node can be expanded through `/v1/nodes/{node_id}`.
- `POST /v1/export/wiki` succeeds and reports exported files.
- On Windows, duplicate listeners on the configured port are reported as a warning.

Diagnostics should use a namespace derived from the configured namespace, such as `<namespace>.diagnostics`, or `sage.memory.diagnostics` when no default namespace exists. Diagnostic writes are intentionally marked with metadata and unique marker text so they can be identified in the vault and search results.

### Automatic Capture

Automatic capture uses the same `captureSageSessionTranscript()` helper as manual replay, so all paths share payload mapping, namespace resolution, and `sage-memory/<node-id>` result semantics.

Capture methods:

- `sage-memory-compaction`: scheduled after a memory-flush compaction completes.
- `sage-memory-heartbeat`: scheduled after a heartbeat run successfully returns from the agent.
- `sage-memory-session-reset`: awaited before Gateway `sessions.reset` replaces the session id.
- `sage-memory-session-delete`: awaited before Gateway `sessions.delete` removes store entries or archives transcripts.
- `sage-memory-session-compact`: awaited before Gateway `sessions.compact` truncates a transcript.

Heartbeat and compaction captures run in the background with short-window deduplication by transcript, session id, session key, and capture method. Gateway destructive lifecycle operations await the best-effort capture before mutating or archiving the transcript, but failures do not block the user operation.

## Output Contract

Human output should be compact and pasteable:

- `pass`: required check succeeded.
- `warn`: optional or environmental check needs attention.
- `fail`: required check failed.

`--json` should return the full checklist, endpoint, namespace, diagnostic marker, node id when available, export files, warnings, failures, suggestions, and an overall status.

Exit code behavior:

- `0` when all required checks pass.
- `1` when any required check fails.
- Warnings alone do not fail the command.

## Error Handling

- Non-remote backend: fail for `capture-session`, fail a required config check for `doctor`.
- Missing token: fail only when a write/export check needs auth.
- Remote timeout or HTTP error: mark the affected check failed and continue any independent checks where possible.
- Search with no matching diagnostic marker: fail the search check and skip node expansion.
- Export response with zero files: warn, because a service may export nothing if no nodes match, but the route/auth still worked.
- Duplicate process detection errors: warn only; never block capture.
- Automatic capture failures: log or report as best-effort outcomes and do not fail heartbeat/session operations.

## Testing

Unit tests should cover:

- Manual replay builds a payload from a transcript, applies namespace/session overrides, calls `ingestLlmSession()`, and prints a `sage-memory/<node-id>` path.
- Manual replay rejects non-remote backends and empty transcripts.
- Diagnostics records pass/fail/warn checks without throwing on early failures.
- Diagnostics sends bearer auth for write/export checks.
- Diagnostics searches for a unique marker, expands the found node, and exports the diagnostic namespace.
- CLI wiring for both commands, including `--json`.
- Automatic capture deduplicates scheduled background captures.
- Memory-flush compaction schedules automatic capture with lifecycle metadata.
- Heartbeat runs schedule automatic capture without changing delivery behavior.
- Gateway session reset/delete/compact capture before mutating the transcript.
- `sage doctor memory` delegates to the same helper as `sage memory doctor`.

Verification should run focused Vitest for changed files, type checking, touched-file formatting, and `git diff --check`.

## Follow-On Work

After this slice is proven:

- Run a live proof that captures a real session, searches it through Sage's `memory_search`, expands it with `memory_get`, exports the vault, and verifies the Obsidian note exists.
- Keep MCP deferred until the native capture contract has enough operational mileage to expose cleanly.
