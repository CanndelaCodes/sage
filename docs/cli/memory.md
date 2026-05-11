---
summary: "CLI reference for `sage memory` (status/index/search)"
read_when:
  - You want to index or search semantic memory
  - You’re debugging memory availability or indexing
title: "memory"
---

# `sage memory`

Manage semantic memory indexing and search.
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
