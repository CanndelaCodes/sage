---
summary: "CLI reference for `sage browser` (profiles, tabs, actions, extension relay)"
read_when:
  - You use `sage browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to use the Chrome extension relay (attach/detach via toolbar button)
title: "browser"
---

# `sage browser`

Manage Sage’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)
- Chrome extension relay: [Chrome extension](/tools/chrome-extension)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
sage browser --browser-profile chrome tabs
sage browser --browser-profile sage start
sage browser --browser-profile sage open https://example.com
sage browser --browser-profile sage snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `sage`: launches/attaches to a dedicated Sage-managed Chrome instance (isolated user data dir).
- `chrome`: controls your existing Chrome tab(s) via the Chrome extension relay.

```bash
sage browser profiles
sage browser create-profile --name work --color "#FF5A36"
sage browser delete-profile --name work
```

Use a specific profile:

```bash
sage browser --browser-profile work tabs
```

## Tabs

```bash
sage browser tabs
sage browser open https://docs.sage.ai
sage browser focus <targetId>
sage browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
sage browser snapshot
```

Screenshot:

```bash
sage browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
sage browser navigate https://example.com
sage browser click <ref>
sage browser type <ref> "hello"
```

## Chrome extension relay (attach via toolbar button)

This mode lets the agent control an existing Chrome tab that you attach manually (it does not auto-attach).

Install the unpacked extension to a stable path:

```bash
sage browser extension install
sage browser extension path
```

Then Chrome → `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select the printed folder.

Full guide: [Chrome extension](/tools/chrome-extension)

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
