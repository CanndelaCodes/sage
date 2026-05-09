---
summary: "CLI reference for `sage agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `sage agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
sage agents list
sage agents add work --workspace ~/.sage/workspace-work
sage agents set-identity --workspace ~/.sage/workspace --from-identity
sage agents set-identity --agent main --avatar avatars/sage.png
sage agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.sage/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
sage agents set-identity --workspace ~/.sage/workspace --from-identity
```

Override fields explicitly:

```bash
sage agents set-identity --agent main --name "Sage" --emoji "🦞" --avatar avatars/sage.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Sage",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/sage.png",
        },
      },
    ],
  },
}
```
