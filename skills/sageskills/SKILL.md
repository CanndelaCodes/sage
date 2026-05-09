---
name: sageskills
description: Use the SageSkills CLI to search, install, update, and publish agent skills from sageskills.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed sageskills CLI.
metadata:
  {
    "sage":
      {
        "requires": { "bins": ["sageskills"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "sageskills",
              "bins": ["sageskills"],
              "label": "Install SageSkills CLI (npm)",
            },
          ],
      },
  }
---

# SageSkills CLI

Install

```bash
npm i -g sageskills
```

Auth (publish)

```bash
sageskills login
sageskills whoami
```

Search

```bash
sageskills search "postgres backups"
```

Install

```bash
sageskills install my-skill
sageskills install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
sageskills update my-skill
sageskills update my-skill --version 1.2.3
sageskills update --all
sageskills update my-skill --force
sageskills update --all --no-input --force
```

List

```bash
sageskills list
```

Publish

```bash
sageskills publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://sageskills.com (override with CLAWHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to Sage workspace); install dir: ./skills (override with --workdir / --dir / CLAWHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
