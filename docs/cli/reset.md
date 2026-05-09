---
summary: "CLI reference for `sage reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `sage reset`

Reset local config/state (keeps the CLI installed).

```bash
sage reset
sage reset --dry-run
sage reset --scope config+creds+sessions --yes --non-interactive
```
