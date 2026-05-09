---
summary: "CLI reference for `sage config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `sage config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `sage configure`).

## Examples

```bash
sage config get browser.executablePath
sage config set browser.executablePath "/usr/bin/google-chrome"
sage config set agents.defaults.heartbeat.every "2h"
sage config set agents.list[0].tools.exec.node "node-id-or-name"
sage config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
sage config get agents.defaults.workspace
sage config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
sage config get agents.list
sage config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
sage config set agents.defaults.heartbeat.every "0m"
sage config set gateway.port 19001 --json
sage config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
