---
summary: "CLI reference for `sage memory` (status/index/search/capture-session/capture-queue/doctor)"
read_when:
  - You want to index or search semantic memory
  - You’re debugging memory availability or indexing
title: "memory"
---

# `sage memory`

Manage semantic memory indexing, search, Sage Memory capture, and diagnostics.
Provided by the active memory plugin (default: `memory-core`; set `plugins.slots.memory = "none"` to disable).

Related:

- Memory concept: [Memory](/concepts/memory)
- Plugins: [Plugins](/plugins)

## Examples

```bash
sage memory status
sage memory status --deep
sage memory status --deep --index
sage memory status --deep --index --verbose
sage memory index
sage memory index --verbose
sage memory search "release checklist"
sage memory status --agent main
sage memory index --agent main --verbose
sage memory capture-session ~/.sage/agents/main/sessions/session.jsonl
sage memory capture-session ./session.jsonl --namespace jason.sage.manual --json
sage memory capture-queue
sage memory capture-queue --replay --limit 5
sage memory doctor
sage memory doctor --json
sage doctor memory
```

## Options

Common:

- `--agent <id>`: scope to a single agent (default: all configured agents).
- `--verbose`: emit detailed logs during probes and indexing.

Notes:

- `memory status --deep` probes vector + embedding availability.
- `memory status --deep --index` runs a reindex if the store is dirty.
- `memory index --verbose` prints per-phase details (provider, model, sources, batch activity).
- `memory status` includes any extra paths configured via `memorySearch.extraPaths`.
- With `memory.backend = "sage-memory"`, `memory status` prints the remote
  endpoint and namespace instead of local SQLite index paths. Manual reindex is
  not supported because indexing is owned by the Sage Memory service.

## Sage Memory backend

When `memory.backend = "sage-memory"` is active, two additional commands help
operate the remote second-brain loop:

- `sage memory capture-session <session-file>` ingests a Sage JSONL transcript
  through Sage Memory's LLM session ingest route.
- `sage memory doctor` verifies endpoint reachability, auth, required API
  routes, diagnostic ingest, search, node expansion, export, vault file output,
  and duplicate listener warnings where available.
- `sage doctor memory` is a top-level alias for the same diagnostic report.

Sage also best-effort captures session transcripts automatically after the
existing `/new` session-memory hook, memory-flush compaction, heartbeat runs,
and Gateway `sessions.reset`, `sessions.delete`, and `sessions.compact`
lifecycle operations. Automatic capture uses the same LLM session ingest
contract as `capture-session`, includes lifecycle metadata in the ingested
payload, queues failed capture attempts locally, and deduplicates background
heartbeat/compaction captures for a short window so repeated triggers do not
spam the remote service.

Minimal backend config:

```bash
sage config set memory.backend sage-memory
sage config set memory.remote.baseUrl http://127.0.0.1:18790
sage config set memory.remote.tokenEnv SAGE_MEMORY_TOKEN
sage config set memory.remote.defaultNamespace sage.sessions
```

The token value must be present in the Sage process environment under the
configured `tokenEnv` name before capture or diagnostic writes can succeed.

`capture-session` options:

- `--agent <id>`: resolve memory config for a specific agent.
- `--session-key <key>`: set transcript session-key metadata.
- `--session-id <id>`: override the transcript header session id.
- `--namespace <namespace>`: override the configured Sage Memory namespace.
- `--json`: print machine-readable output.

`doctor` options:

- `--agent <id>`: resolve memory config for a specific agent.
- `--namespace <namespace>`: use an explicit diagnostic namespace.
- `--json`: print the full diagnostic report.

`sage doctor memory` accepts the same `--agent`, `--namespace`, and `--json`
options.

`capture-queue` shows durable failed automatic captures waiting for replay.
Sage writes this queue under the agent state directory, for example
`~/.sage/agents/main/sage-memory/capture-queue.json`. Successful automatic
captures are not queued. Failed replay attempts remain in the queue with
attempt count and last-error metadata.

`capture-queue` options:

- `--agent <id>`: resolve the queue for a specific agent.
- `--replay`: retry queued captures through the current Sage Memory backend
  configuration.
- `--limit <n>`: replay at most `n` queued captures.
- `--json`: print machine-readable output.
