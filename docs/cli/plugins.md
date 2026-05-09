---
summary: "CLI reference for `sage plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `sage plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
sage plugins list
sage plugins info <id>
sage plugins enable <id>
sage plugins disable <id>
sage plugins doctor
sage plugins update <id>
sage plugins update --all
```

Bundled plugins ship with Sage but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `sage.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
sage plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
sage plugins install -l ./my-plugin
```

### Update

```bash
sage plugins update <id>
sage plugins update --all
sage plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).
