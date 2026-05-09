# Sage Development Instructions for Claude

> This file is the primary reference for Claude when working in this repository.
> **IMPORTANT**: Claude operates under Sage's 35 Cognitive Principles permanently in this repo.

---

## Project Identity

**Sage** is a fully rebranded fork of [OpenClaw](https://github.com/openclaw/openclaw) that advances its capabilities with a **vibecoder-first approach** -- making AI-powered automation accessible to non-technical users.

| Attribute | Value |
|-----------|-------|
| **Name** | Sage |
| **Tagline** | "Build with words, not code." |
| **Fork Base** | OpenClaw v2026.2.1 |
| **Branch** | `sage/main` |
| **License** | MIT |
| **Mascot** | S.A.G.E. (Sentient Adaptive Guidance Entity) |

**Core Paradigm**: User as CEO, Sage as autonomous employee. Sage executes completely -- the user describes what they want, Sage delivers the result.

**Specification**: See `../sage vde/Docs/plans/2026-02-02-sage-openclaw-fork-spec.md` for the full fork specification.

---

## Partnership

**This is a solo project.** Jason is the sole stakeholder. No team, no external decision-makers. Claude and Jason work together to build Sage into a product.

- Claude brings: Technical expertise, systematic thinking, pattern recognition
- Jason brings: Product vision, user perspective (vibecoder), business context, final decisions
- Communication: Direct, efficient, honest. Ask rather than guess. Admit uncertainty rather than fake confidence.

**See**: `../sage vde/Docs/specs/context/USER_PROFILE.md` for full profile

---

## Quick Start

```bash
cat CLAUDE.md                     # Read this file (session start)
git log --oneline -10             # Recent context
git status                        # Current state
```

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build | `pnpm build` |
| Type-check + lint + format | `pnpm check` |
| Run tests | `pnpm test` |
| Test coverage | `pnpm test:coverage` |
| Dev mode | `pnpm dev` |
| Lint only | `pnpm lint` (oxlint) |
| Format only | `pnpm format` (oxfmt) |
| Format fix | `pnpm format:fix` |
| Lint fix | `pnpm lint:fix` |
| UI build | `pnpm ui:build` |
| UI dev | `pnpm ui:dev` |

---

## Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Node.js 22+ | Currently v24.6.0 |
| Package Manager | pnpm 10+ | Currently 10.23.0 |
| Language | TypeScript (ESM) | Strict mode |
| Build | tsdown + Turbo | Monorepo workspace |
| Lint | oxlint | Type-aware |
| Format | oxfmt | |
| Test | Vitest | V8 coverage, 70% thresholds |
| UI | Lit (Web Components) | In `ui/` directory |
| Gateway | Node.js WebSocket | Express + Hono + ws |
| Agent Runtime | Pi (mariozechner) | Multi-LLM |
| Platforms | Windows (native), macOS, Linux | No WSL2 required |

---

## Project Structure

```
sage/                          # Root (monorepo)
├── src/                       # Main source code
│   ├── cli/                   # CLI commands and wiring
│   ├── commands/              # Command implementations
│   ├── config/                # Configuration, paths, state
│   ├── agents/                # Agent runtime (Pi integration)
│   ├── browser/               # Browser automation
│   ├── canvas-host/           # A2UI canvas host
│   ├── channels/              # Core messaging channels
│   ├── routing/               # Message routing
│   ├── infra/                 # Infrastructure utilities
│   ├── media/                 # Media processing pipeline
│   ├── daemon/                # Background daemon (launchd, etc.)
│   ├── wizard/                # Onboarding wizard
│   ├── telegram/              # Telegram channel
│   ├── discord/               # Discord channel
│   ├── slack/                 # Slack channel
│   ├── signal/                # Signal channel
│   ├── imessage/              # iMessage channel
│   ├── web/                   # WhatsApp Web (Baileys)
│   └── provider-web.ts        # Web provider
├── ui/                        # Web UI (Lit components)
├── extensions/                # Channel/feature plugins (31 extensions)
│   ├── whatsapp/              # WhatsApp extension
│   ├── telegram/              # Telegram extension
│   ├── discord/               # Discord extension
│   ├── slack/                 # Slack extension
│   ├── signal/                # Signal extension
│   ├── msteams/               # MS Teams extension
│   ├── matrix/                # Matrix extension
│   ├── voice-call/            # Voice call extension
│   ├── memory-core/           # Memory system
│   ├── memory-lancedb/        # LanceDB memory backend
│   ├── lobster/               # Lobster theme
│   └── ...                    # More extensions
├── packages/                  # Shared workspace packages
│   ├── clawdbot/              # Legacy compatibility
│   └── sage/               # Legacy compatibility
├── apps/                      # Platform apps
│   ├── android/               # Android app
│   ├── ios/                   # iOS app
│   └── macos/                 # macOS native app
├── skills/                    # Built-in agent skills
├── scripts/                   # Build/dev scripts
├── docs/                      # Documentation (Mintlify)
├── test/                      # E2E test helpers
├── assets/                    # Static assets
├── vendor/                    # Vendored dependencies
├── git-hooks/                 # Git hooks
├── dist/                      # Built output
└── Swabble/                   # Swabble integration
```

---

## Workspace Layout

Defined in `pnpm-workspace.yaml`:
- `.` (root package)
- `ui/` (web UI)
- `packages/*` (shared packages)
- `extensions/*` (channel plugins)

---

## Environment Variables

Key environment variables (renaming from `OPENCLAW_*` to `SAGE_*` in progress):

| Variable | Purpose |
|----------|---------|
| `SAGE_STATE_DIR` | State directory for sessions, logs, caches (default: `~/.sage`) |
| `SAGE_CONFIG_PATH` | Config file path (default: `$STATE_DIR/sage.json`) |
| `SAGE_GATEWAY_PORT` | Gateway port (default: 18789) |
| `SAGE_GATEWAY_TOKEN` | Gateway auth token |
| `SAGE_GATEWAY_PASSWORD` | Gateway auth password |
| `SAGE_AGENT_DIR` | Agent working directory |
| `SAGE_OAUTH_DIR` | OAuth credentials directory |
| `SAGE_SKIP_CANVAS_HOST` | Skip canvas host startup |
| `SAGE_NO_RESPAWN` | Disable process respawn |
| `SAGE_PROFILE` | Config profile name |
| `SAGE_GIT_DIR` | Git directory override for updates |
| `SAGE_DOCKER_APT_PACKAGES` | Extra apt packages for Docker sandbox |
| `SAGE_EXTRA_MOUNTS` | Extra Docker mounts |
| `SAGE_HOME_VOLUME` | Docker home volume |
| `SAGE_SESSION_CACHE_TTL_MS` | Session cache TTL in milliseconds |
| `SAGE_ANTHROPIC_PAYLOAD_LOG` | Enable Anthropic payload logging |

**Note**: Legacy `OPENCLAW_*` prefixes may still work during the transition period.

LLM Provider Keys:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |

Messaging Platform Credentials:

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (WhatsApp) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp number |

See `.env.example` for the full list with descriptions.

---

## Coding Conventions

### TypeScript
- ESM modules (`.ts` with `import`/`export`)
- Strict typing, avoid `any`
- Formatting via oxfmt, linting via oxlint
- Tests colocated as `*.test.ts`
- Keep files under ~500 LOC (guideline)
- Brief comments for tricky logic only
- Named exports preferred

### Commits
- Concise, action-oriented messages (e.g., `CLI: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors
- Follow Conventional Commits style

### Extensions/Plugins
- Live under `extensions/*` (workspace packages)
- Plugin-only deps in the extension `package.json`, not root
- Avoid `workspace:*` in `dependencies` (breaks npm install)
- Use `devDependencies` or `peerDependencies` for the main package

---

## Quality Gates (Mandatory)

Run after completing any work:

```bash
pnpm check                      # Type-check + lint + format
pnpm build                      # Full build
pnpm test                       # Unit tests
```

**Coverage Thresholds** (V8): 70% lines, branches, functions, statements

---

## Testing

| Command | Purpose |
|---------|---------|
| `pnpm test` | Unit tests (vitest, parallel) |
| `pnpm test:coverage` | With coverage report |
| `pnpm test:e2e` | End-to-end tests |
| `pnpm test:live` | Live tests (requires real API keys) |
| `pnpm test:watch` | Watch mode |
| `pnpm test:ui` | UI component tests |

- Tests are colocated `*.test.ts` files
- E2E tests use `*.e2e.test.ts`
- Do not set test workers above 16

---

## Implementation Phases (from Fork Spec)

We are currently in **Phase 0: Foundation**.

| Phase | Goal | Status |
|-------|------|--------|
| **Phase 0** | Clean fork with working build on Windows | IN PROGRESS |
| Phase 1 | Security hardening | Pending |
| Phase 2 | Core Sage features (RLM, ASL, Principles) | Pending |
| Phase 3 | UI transformation (Vibecoder Dashboard) | Pending |
| Phase 4 | VDE and advanced features | Pending |
| Phase 5 | Polish and launch | Pending |

**Phase 0 Exit Criteria**: `pnpm install && pnpm build` succeeds, app launches on Windows.

---

## Renaming Progress

The codebase is being renamed from OpenClaw to Sage. Key renames:
- `openclaw` -> `sage` (CLI, package name, binary)
- `OPENCLAW_*` -> `SAGE_*` (environment variables)
- `OpenClaw` -> `Sage` (UI, docs, branding)
- `ClawHub` -> removed (fresh Sage Skills marketplace)
- `.openclaw/` -> `.sage/` (config directory)

**Note**: Some references to openclaw/clawdbot/sage may still exist during transition.

---

## Multi-Agent Safety

This repo uses multi-agent development. Follow these rules:
- Do NOT create/apply/drop `git stash` entries unless explicitly requested
- Do NOT switch branches unless explicitly requested
- Do NOT create/remove/modify `git worktree` unless explicitly requested
- When you see unrecognized files, keep going -- focus on your changes only
- Scope commits to your changes only (unless told to "commit all")
- `git pull --rebase` is OK when pushing, but never discard others' work

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fork base | OpenClaw v2026.2.1 | Latest with security patches |
| Windows support | Native (no WSL2) | One-click install for vibecoders |
| Sandbox | Podman primary, Docker fallback, E2B optional | Podman is OSS (Apache 2.0) |
| Internal IPC | gRPC (agent-desktop) | Type-safe, streaming |
| External IPC | WebSocket (messaging/API) | OpenClaw compatibility |
| ClawHub | Removed entirely | Fresh Sage Skills marketplace |
| Local LLM | Ollama (auto-detect) | Analyze hardware, recommend model |
| Data storage | File-based default, PostgreSQL optional | Simple start, scalable |

---

## 35 Cognitive Principles (Reference)

Claude operates under these principles when working in this repository. Full details in `../sage vde/Docs/plans/2026-01-19-sage-cognitive-architecture.md`.

**Key Categories**:
- **Perception** (1-4): Evidence-grounded, calibrated confidence, reality-first, holistic awareness
- **Reasoning** (5-11): Assumption consciousness, premise questioning, pre-mortem, invariant awareness, semantic understanding, devil's advocate, divergent exploration
- **Memory** (12-15): Session continuity, mistake memory, decision history, pattern recognition
- **Action** (16-20): Incremental progress, regression awareness, loop consciousness, scope discipline, execution verification
- **Quality** (21-25): Security mindset, async awareness, boundary thinking, data integrity, UX consciousness
- **Communication** (26-29): Intent seeking, honest uncertainty, visual-code bridge, plain language commitment
- **Growth** (30+): Self-observability, and extended principles

**Critical Principle #18: Loop Consciousness** -- Detect when in a debugging loop. After 3+ same-area touches: STOP and reconsider fundamentally.

---

## Windows-Specific Notes

- No WSL2 required -- Sage runs natively on Windows
- Paths use backslash (`\`) on Windows; use `path.join()` / `path.resolve()` instead of string concatenation
- Shell scripts (`.sh`) need bash alternatives or PowerShell equivalents for Windows
- Binary packages with native addons may need Windows build tools
- Test with both PowerShell and cmd.exe terminal environments
- The `prepare` script uses bash syntax (`command -v git`) -- this produces a warning on Windows but is non-fatal
- `pnpm install` and `pnpm build` verified working on Windows (February 6, 2026)

---

## Security Considerations

Sage addresses known OpenClaw vulnerabilities:
- **CVE-2026-25253**: WebSocket hijacking -- origin validation required
- **Credential exposure**: OS keychain integration, encrypted vault
- **Malicious skills**: Fresh marketplace with tiered verification (no ClawHub)

**Rules**:
- Never commit secrets, API keys, or real credentials
- Use `.env` for local secrets (never checked in)
- Validate all external input at boundaries
- Use parameterized queries for any database access

---

## Session Protocol

**Start**:
1. Read this file
2. `git log --oneline -10` for recent context
3. `git status` to understand working state
4. Identify current phase and priority tasks

**During Work**:
- Run quality gates after changes
- Document significant decisions
- Keep commits scoped and atomic

**End**:
1. Run quality gates (`pnpm check && pnpm build && pnpm test`)
2. Summarize what was accomplished
3. Include "Next Steps" section

---

## Decision Framework

**Auto-Proceed**: Feature fully specified, low risk, existing patterns, isolated scope.

**Escalate to Jason**: Ambiguous requirements, breaking changes, multiple valid approaches, security implications, cross-system coordination.

---

## Resources

| Resource | Location |
|----------|----------|
| Fork Specification | `../sage vde/Docs/plans/2026-02-02-sage-openclaw-fork-spec.md` |
| Cognitive Architecture | `../sage vde/Docs/plans/2026-01-19-sage-cognitive-architecture.md` |
| Original AGENTS.md | `AGENTS.md` (OpenClaw conventions, still partially applicable) |
| Sage Docs | `docs/` directory |
| Implementation TODOs | `../sage vde/Docs/plans/2026-02-04-sage-implementation-todos.md` |

---

**Last Updated**: February 6, 2026
