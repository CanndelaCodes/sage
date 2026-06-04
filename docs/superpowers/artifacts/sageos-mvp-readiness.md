# SageOS MVP Readiness Map

Date: 2026-06-02
Operator: Codex
Branch: `codex/activity-events-ingest`
Current evidence baseline entering this slice: `a3908f826a` plus the contrast guard evidence below
Verification sweep: 2026-06-02 to 2026-06-04

## Release Position

SageOS is an MVP candidate with the Windows overlay codified as the primary user interface and the web Command Center, TUI, CLI, and Telegram codified as supplemental surfaces.

The current SageOS and Windows overlay implementation supports an MVP candidate review, with repo-wide static and test gates green in the current working slice. The MVP should not be called final until Jason accepts the overlay visual/product experience. The overlay visual bar is part of MVP acceptance, not a post-release polish task.

## Product Shape

Primary UI:

- Windows overlay opened and dismissed through a programmable global hotkey.
- Full overlay is the default daily control tower.
- HUD-first mode can be configured and expanded into the full overlay.
- Edge Rail and pinned widgets support collapsed and pass-through operation.
- Liquid Linear command glass is the accepted visual direction.

Supplemental surfaces:

- Web Command Center remains useful for admin, browser access, development, and fallback review.
- TUI, CLI, and Telegram render or operate the same SageOS contract where appropriate.
- Web UI must not become the product replacement for the overlay.

Core model:

- SageOS is the local agentic Windows operations layer.
- Sage is the agent and harness.
- Sage Memory is the canonical durable memory substrate; Obsidian is a rendered review surface.

## Evidence Inventory

- High-level MVP spec: `docs/superpowers/specs/2026-05-18-sageos-command-center-design.md`.
- Overlay visual direction: `docs/superpowers/specs/2026-06-01-sageos-liquid-linear-overlay-design.md`.
- Overlay implementation plan and acceptance mapping: `docs/superpowers/plans/2026-06-01-sageos-windows-overlay.md`.
- MVP decision log: the May 18 spec now records implementation-backed MVP decisions for autonomy defaults, canonical spec ownership, event/state storage, Telegram privacy, retention, Night Shift workspace policy, Windows collectors, optional capture sources, app/widget candidates, self-improvement promotion, and pinned widget defaults.
- Overlay smoke and visual evidence: `docs/superpowers/artifacts/sageos-windows-overlay-smoke.md`.
- Shared SageOS status and kernel modules: `src/sageos/`.
- Gateway SageOS contract: `src/gateway/server-methods/sageos.ts`.
- CLI controls: `src/cli/sageos-cli.ts`.
- TUI controls: `src/tui/tui-sageos-command-center.ts` and `src/tui/tui-command-handlers.ts`.
- Web supplemental Command Center: `ui/src/ui/views/sageos.ts` and `ui/src/ui/controllers/sageos.ts`.
- Windows overlay package: `apps/windows-overlay/`.

## Acceptance Matrix

| Criterion                                                                                                                                            | Status | Evidence                                                                                                                                                                                                                            | Remaining release work                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| SageOS runs continuously with gateway or daemon lifecycle                                                                                            | Green  | `src/sageos/supervisor.ts`, gateway methods, supervisor tests                                                                                                                                                                       | Re-run broad gates before final release |
| Pause, resume, stop, and emergency stop                                                                                                              | Green  | CLI, TUI, web, gateway, overlay smoke all exercise controls                                                                                                                                                                         | Re-run broad gates                      |
| `sage os status --json` stable status snapshot                                                                                                       | Green  | Shared types/status renderer and CLI tests                                                                                                                                                                                          | Re-run typecheck and status tests       |
| Windows overlay is primary MVP UI                                                                                                                    | Green  | Spec, overlay plan, overlay package, smoke artifact                                                                                                                                                                                 | Jason product acceptance                |
| Configurable global hotkey opens/closes overlay                                                                                                      | Green  | Electron adapter, window controller, smoke evidence                                                                                                                                                                                 | Re-run overlay smoke                    |
| Command Deck, Universal Launcher, Agent Workspace, HUD, Edge Rail, Pinned Widgets                                                                    | Green  | Overlay renderer tests and smoke screenshots                                                                                                                                                                                        | Jason visual acceptance                 |
| Overlay shows employees, tasks, approvals, security, PC management, memory, workflows, skills, coding, apps, incidents, audit, policy, collaboration | Green  | Overlay renderer model, Memory/SecondBrain detail slice, recent operations/collaboration/status slices, smoke artifact                                                                                                              | Re-run overlay tests                    |
| Pinned widgets can stay visible with pass-through mode                                                                                               | Green  | Window controller, preload pointer bridge, smoke pass-through probe                                                                                                                                                                 | Re-run overlay smoke                    |
| Web, TUI, CLI, and Telegram remain supplemental and shared-contract based                                                                            | Green  | Gateway contract, web controller, TUI command handler, CLI, Telegram tests                                                                                                                                                          | Re-run supplemental gates               |
| Draft AI employee from plain language                                                                                                                | Green  | `employee-builder`, gateway `sageos.agents.draft`, CLI tests                                                                                                                                                                        | Re-run focused SageOS tests             |
| Employee activation shows tools, scopes, autonomy, memory, schedules, risks                                                                          | Green  | `employee-activation` preview and tests                                                                                                                                                                                             | Re-run focused SageOS tests             |
| Durable tasks with budgets, logs, traces, verification, reports                                                                                      | Green  | task creation/queue/runner, Night Shift coding, run model, overlay active-run detail                                                                                                                                                | Re-run focused SageOS tests             |
| Structured collaboration handoffs and review requests                                                                                                | Green  | `src/sageos/collaboration.ts`, status summary, overlay workspace                                                                                                                                                                    | Re-run focused SageOS and overlay tests |
| Required employee templates exist                                                                                                                    | Green  | Security Sentinel, PC Steward, Windows Admin, System Doctor, Memory Steward, Workflow Engineer, Coding Worker, Reviewer in templates/tests                                                                                          | Re-run template tests                   |
| Initial read-only full-PC sources work where available                                                                                               | Green  | system observer, observations, source failure incidents, overlay resource views                                                                                                                                                     | Re-run observation/system tests         |
| Sage Memory canonical, Obsidian rendered                                                                                                             | Green  | status contract, memory steward, memory queue, capture/search usage                                                                                                                                                                 | Re-run memory steward tests             |
| High-risk actions are not silently self-authorized                                                                                                   | Green  | policy, task queue, task runner, approval resolution tests                                                                                                                                                                          | Re-run policy/task tests                |
| Every autonomous action has audit evidence and policy basis                                                                                          | Green  | event log, audit status, policy status, task and approval tests                                                                                                                                                                     | Re-run audit-focused tests              |
| Memory-down/source failure/queue backlog/worker failure/policy block/notification failure/security finding incidents                                 | Green  | generated incidents in `src/sageos/status.ts`; web and overlay repair allowlists                                                                                                                                                    | Re-run incident tests                   |
| Telegram redacted urgent alerts, digests, approvals, task completion reports                                                                         | Green  | notification module, supervisor digest checks, gateway notification methods, Telegram control tests                                                                                                                                 | Re-run Telegram/notification tests      |
| Tests, typecheck, lint, and `git diff --check` pass                                                                                                  | Green  | SageOS, overlay, UI, typecheck, lint, build, smoke, and `git diff --check` passed; root `pnpm test` exits 0 after the root-gate and PTY deadline fixes; fresh `pnpm check` passes typecheck, oxlint, and repo-wide formatter checks | Keep gates in final release checklist   |
| MVP decision log reconciled with implementation                                                                                                      | Green  | May 18 spec `MVP decisions` section now resolves the previous open decisions against current config, state store, event log, policy, notification, observer, app candidate, and overlay defaults                                    | Re-read before final release            |
| Visual review companion for Jason acceptance                                                                                                         | Green  | `pnpm --dir apps/windows-overlay review:visual:all` runs Electron smoke capture, regenerates the local contact sheet, and verifies 10 loaded screenshots, 8 criteria, no broken images, and no horizontal overflow                  | Jason visual acceptance                 |
| Public Windows docs reflect overlay MVP status                                                                                                       | Green  | README and platform docs now describe the SageOS Windows overlay MVP separately from the still-planned general Windows node companion                                                                                               | Re-read before release                  |
| Enterprise-grade Liquid Linear overlay visual gate                                                                                                   | Yellow | Visual contract tests, practical AA text contrast guard, runtime reduced-motion smoke, refreshed smoke screenshots, Liquid Linear spec, smoke artifact, and `review:visual:all` pass                                                | Jason visual acceptance                 |

## Verification Results

Passed in the 2026-06-02 sweep:

- `pnpm build`.
- `pnpm exec tsgo --noEmit --pretty false`.
- `pnpm exec oxlint --type-aware` with 0 warnings and 0 errors.
- `git diff --check`.
- `pnpm exec oxfmt --check docs/superpowers/artifacts/sageos-mvp-readiness.md`.
- `pnpm --dir apps/windows-overlay test`: 13 files, 84 tests.
- `pnpm --dir apps/windows-overlay typecheck`.
- `pnpm --dir apps/windows-overlay build`.
- `pnpm --dir apps/windows-overlay smoke:electron`: `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and refreshed full, bright, Edge Rail, text-heavy, HUD, and IDE HUD screenshots.
- `pnpm --dir ui test`: 20 files, 162 tests.
- Focused SageOS contract suite: 30 files, 262 tests.
- `pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts`: 1 file, 35 tests.

Repo-wide blockers found in the 2026-06-02 sweep:

- `pnpm check` failed in repo-wide `oxfmt --check`. The new readiness artifact was then formatted and passes targeted `oxfmt`; the remaining formatter failures require a separate repository formatting decision.
- `pnpm test` failed with 6 failed files, 7 failed tests, and 1 worker error:
  - `src/cli/program.smoke.test.ts`: `runs message with required options` timed out.
  - `src/agents/bash-tools.exec.pty-fallback.test.ts`: PowerShell did not recognize `printf`.
  - `src/agents/pi-tools.workspace-paths.test.ts`: one timeout and one `chdir` failure.
  - `src/agents/sage-gateway-tool.test.ts`: expected SIGUSR1 restart was not scheduled.
  - `src/docs/slash-commands-doc.test.ts`: a built-in chat command alias is not documented.
  - `src/telegram/bot.test.ts`: `allows direct messages with telegram:-prefixed allowFrom entries` did not call the reply spy.

Root-gate fix slice verified after the blockers above:

- `pnpm exec vitest run --config vitest.config.ts src/docs/slash-commands-doc.test.ts`: 1 file and 1 test passed.
- `pnpm exec vitest run --config vitest.config.ts src/agents/sage-gateway-tool.test.ts -t "schedules SIGUSR1 restart"` passed on Windows with the expected platform-specific restart behavior.
- `pnpm exec vitest run --config vitest.config.ts src/agents/bash-tools.exec.pty-fallback.test.ts`: 1 file and 1 test passed.
- `pnpm exec vitest run --config vitest.config.ts src/cli/program.smoke.test.ts -t "runs message with required options"` passed with the plugin registry mocked.
- `pnpm exec vitest run --config vitest.config.ts src/agents/pi-tools.workspace-paths.test.ts`: 1 file and 6 tests passed.
- `pnpm exec vitest run --config vitest.gateway.config.ts --reporter verbose --testTimeout 30000`: 41 files and 303 tests passed.
- `pnpm exec vitest run --config vitest.config.ts src/agents/bash-tools.test.ts --reporter verbose --testTimeout 30000`: 1 file and 17 tests passed.
- `pnpm test` exited 0. The main root shard reported 873 passed files, 1 skipped file, 5526 passed tests, and 3 skipped tests; on Windows Vitest also emitted one worker-fork unhandled error after assertions completed, which is tolerated by the test wrapper for local Windows runs. The gateway shard then reported 41 files and 303 tests passed.
- Fresh static gate closeout on 2026-06-03 and 2026-06-04:
  - `pnpm check` ran `pnpm tsgo`, `pnpm lint`, and `pnpm format`; typecheck completed, oxlint reported 0 warnings and 0 errors, and repo-wide `oxfmt --check` passed after applying the formatter baseline.
  - `pnpm exec oxfmt --check docs/tools/slash-commands.md docs/superpowers/artifacts/sageos-mvp-readiness.md scripts/test-parallel.mjs src/agents/bash-tools.exec.pty-fallback.test.ts src/agents/bash-tools.test.ts src/agents/pi-tools.workspace-paths.test.ts src/agents/sage-gateway-tool.test.ts src/cli/program.smoke.test.ts src/gateway/server.impl.ts src/gateway/test-helpers.mocks.ts src/gateway/test-helpers.server.ts` passed after targeted formatting.
  - `git diff --check` passed.
- Formatter and PTY stabilization closeout on 2026-06-04:
  - `pnpm exec oxfmt` applied the repo-wide formatter baseline.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check` passed.
  - `pnpm exec vitest run --config vitest.config.ts src/agents/bash-tools.process.send-keys.test.ts --reporter verbose --testTimeout 30000` passed after increasing the Windows PTY exit deadline.
  - `pnpm test` exited 0. The main root shard reported 873 passed files, 1 skipped file, 5526 passed tests, and 3 skipped tests; on Windows Vitest also emitted one worker-fork unhandled error after assertions completed, which is tolerated by the test wrapper for local Windows runs. The gateway shard then reported 41 files and 303 tests passed.
- Liquid Linear material and contrast closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-visual-contract.test.ts --reporter verbose` passed with 1 file and 6 tests, including HUD, Edge Rail, ambient pinned-widget, foreground-stacking material contracts, and practical AA contrast for normal text tokens over ambient, command, focus, and summit glass on dark, bright, browser-like, and IDE-like backdrops.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: 636fa258c347`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, `rendererErrors: 0`, first-pass keyboard Tab order through the primary toolbar and launcher controls, and refreshed full, bright, Edge Rail, text-heavy Edge Rail, browser Edge Rail, IDE Edge Rail, HUD, and IDE HUD screenshots.
- Memory/SecondBrain overlay closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` passed with 1 file and 28 tests, including the Memory workspace facts for memory health, capture queue, Telegram ingestion, wiki export proof, recent captures, review cards, duplicate/stale candidates, graph health, and doctor status.
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/status.test.ts -t "preserves memory doctor export proof" --reporter verbose` passed and verifies memory doctor output is normalized into `memory.wikiExport`.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/status.test.ts src/sageos/status-renderer.test.ts src/tui/tui-sageos-command-center.test.ts src/tui/tui-command-handlers.test.ts --reporter verbose` passed with 4 files and 16 tests.
  - `pnpm check`, `pnpm build`, and `git diff --check` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: b6e187ae86ce`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Overview autonomy-control closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed on the missing Operations overview autonomy-control row, then passed with 1 file and 28 tests after the row was added.
  - The Operations overview now directly answers how to intervene in autonomy with a visible `Autonomy` row: `Pause/Stop` and `Narrow via Policy`.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: 56a61b710959`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
  - `apps/windows-overlay/dist/overlay-smoke-styled.png` was visually inspected after the shorter copy change and showed the `Autonomy`, `Pause/Stop`, and `Narrow via Policy` row fitting without text overlap.
- Security workspace closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed on the missing Security workspace must-show rows, then passed with 1 file and 28 tests after the renderer started deriving Security facts from the latest `system` observation checks.
  - The Security workspace now surfaces Defender/Security status, suspicious process incident count, startup and scheduled task visibility, firewall and listener visibility, downloaded executable visibility, Security Sentinel activity, and pending remediation approvals.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: 2eb7543b5227`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- PC Management workspace closeout on 2026-06-04:
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/system-observer.test.ts --reporter verbose` first failed on missing scheduled-task, power, update, and broken-service checks, then passed with 1 file and 6 tests after the read-only Windows collector added those checks and fixed the `C::` disk summary.
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed on the missing PC Management must-show rows, then passed with 1 file and 28 tests after the renderer mapped system checks into PC Management facts.
  - The PC Management workspace now surfaces disk, CPU/RAM, battery/power, updates, services, startup apps, scheduled tasks, cleanup opportunities, broken local services, and safe repair actions.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/system-observer.test.ts src/sageos/status.test.ts --reporter verbose` passed with 2 files and 13 tests.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- src/sageos/system-observer.ts src/sageos/system-observer.test.ts apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: 98d2cd4c1933`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Coding, Workflow, and Skills workspace closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed on missing Coding/Night Shift branch-workspace and schedule rows, then on missing Workflows and Skills must-show rows, then passed with 1 file and 28 tests.
  - The Coding workspace now surfaces branch/workspace state and Night Shift schedule state in addition to allowed repos, running workers, diffs, tests, blockers, and reports.
  - The Workflows workspace now surfaces repeated patterns, workflow candidates, draft workflows, dry-run results, enabled workflow count, and recent workflow-run availability.
  - The Skills workspace now surfaces skill candidates and skill changes/provenance in addition to workflow links, triggers, tests, allowed scopes, and rollback refs.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 87 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: fa2e44460f7f`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Files workspace closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed on placeholder duplicate-candidate and storage-pressure rows, then passed with 1 file and 29 tests after the renderer derived duplicate file candidates from file cleanup tasks and storage pressure from the latest system disk check.
  - The Files workspace now surfaces recent file organization suggestions, duplicate candidates, large files/storage pressure, changed files, staging moves, cleanup plans, and approval-required deletes.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 88 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: 5e085254f756`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Night Shift schedule closeout on 2026-06-04:
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/status.test.ts -t "Night Shift schedule" --reporter verbose` first failed because supervisor status did not expose the configured Night Shift schedule, then passed after the shared status contract surfaced `nightShiftEnabled` and `nightShiftWindow`.
  - `pnpm --dir apps/windows-overlay exec vitest run tests/overlay-renderer.test.ts --reporter verbose` first failed because the Coding workspace still showed `Manual / no schedule reported`, then passed with 1 file and 29 tests after the overlay rendered the configured schedule and kept employee-schedule/manual fallbacks.
  - `pnpm exec vitest run --config vitest.config.ts src/sageos/status.test.ts src/sageos/types.test.ts src/sageos/status-renderer.test.ts --reporter verbose` passed with 3 files and 17 tests.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 88 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm check` passed with `pnpm tsgo`, oxlint 0 warnings and 0 errors, and repo-wide `oxfmt --check`.
  - `git diff --check -- src/sageos/types.ts src/sageos/status.ts src/sageos/status.test.ts apps/windows-overlay/src/renderer/overlay-app.ts apps/windows-overlay/tests/overlay-renderer.test.ts` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed post-commit with `buildSha: fe3797b09444`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Current pause gate on 2026-06-04:
  - `pnpm build` passed after the latest overlay evidence commits.
  - `pnpm --dir ui test` passed with 20 files and 162 tests.
  - `pnpm test` exited 0. The main root shard reported 873 passed files, 1 skipped file, 5527 passed tests, and 3 skipped tests; Vitest still emitted one Windows worker-fork unhandled error after assertions completed. The gateway shard then reported 41 files and 303 tests passed.
  - No new implementation gap was opened by this pause gate. The remaining MVP release gate is Jason's visual/product acceptance of the Windows overlay.
- Universal Launcher keyboard closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/universal-launcher.test.ts --reporter verbose` first failed on the missing quick-action focus navigation helper, then passed with 1 file and 5 tests after ArrowDown from the command input plus ArrowLeft, ArrowRight, Home, and End navigation was added.
  - `pnpm --dir apps/windows-overlay exec vitest run tests/smoke-script.test.ts --reporter verbose` first failed because the Electron smoke runner did not exercise quick-action arrow navigation, then passed with 1 file and 4 tests after the smoke added a runtime keyboard probe.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 89 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: 4ec60b04cd21`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Runtime text/control fit closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/smoke-script.test.ts --reporter verbose` first failed because the Electron smoke runner did not enforce critical text/control fit, then passed with 1 file and 4 tests after the smoke added checks for clipped toolbar, launcher, HUD, and Edge Rail controls, sub-20px hit targets, and overlapping critical controls.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 89 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: 23dbe0068226`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
- Dark-backdrop visual coverage closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/smoke-script.test.ts --reporter verbose` first failed because the Electron smoke runner did not capture a dark synthetic backdrop, then passed with 1 file and 4 tests after `overlay-smoke-edge-dark.png` was added.
  - `pnpm --dir apps/windows-overlay test` passed with 13 files and 89 tests.
  - `pnpm --dir apps/windows-overlay typecheck` passed.
  - `pnpm --dir apps/windows-overlay build` passed.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: 82b329a738d1`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, and `rendererErrors: 0`.
  - `apps/windows-overlay/dist/overlay-smoke-edge-dark.png` was visually inspected and showed readable Edge Rail controls and pinned widgets over the dark synthetic backdrop.
- Reduced-motion runtime closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/smoke-script.test.ts --reporter verbose` first failed because the Electron smoke runner did not enforce reduced-motion behavior, then passed with 1 file and 4 tests after the smoke emulated `prefers-reduced-motion: reduce` and rejected visible critical controls with transition or animation durations above 1ms.
  - `pnpm --dir apps/windows-overlay smoke:electron` passed with `buildSha: 26a023428698`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`, `rendererErrors: 0`, and refreshed `overlay-smoke-full-reduced-motion.png`.
  - `apps/windows-overlay/dist/overlay-smoke-full-reduced-motion.png` was visually inspected and showed the full Command Deck remained stable and readable under the reduced-motion media setting.
- Visual review companion closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/visual-review-script.test.ts --reporter verbose` first failed because `review:visual:verify` and `scripts/verify-visual-review.mjs` did not exist, then passed with 1 file and 3 tests after the verifier was added.
  - `pnpm --dir apps/windows-overlay review:visual` generated `apps/windows-overlay/dist/overlay-visual-review.html` with `buildSha: 92282200a1c8`.
  - `pnpm --dir apps/windows-overlay review:visual:verify` launched `C:\Program Files\Google\Chrome\Application\chrome.exe`, loaded the generated file, verified 10 loaded screenshots, 8 acceptance criteria, 0 broken images, 0 horizontal overflow, and saved `apps/windows-overlay/dist/overlay-visual-review-render.png`.
  - `apps/windows-overlay/dist/overlay-visual-review-render.png` was visually inspected and showed a readable contact sheet with acceptance criteria plus dark, bright, reduced-motion, Edge Rail, browser, IDE, and HUD smoke screenshots.
- Full visual review gate closeout on 2026-06-04:
  - `pnpm --dir apps/windows-overlay exec vitest run tests/visual-review-script.test.ts --reporter verbose` first failed because `review:visual:all` and `scripts/run-visual-review.mjs` were missing, then passed with 1 file and 4 tests after the gate runner was added.
  - `pnpm --dir apps/windows-overlay review:visual:all` ran `smoke:electron`, `review:visual`, and `review:visual:verify` in order, launched `C:\Program Files\Google\Chrome\Application\chrome.exe`, loaded the generated review sheet, verified 10 loaded screenshots, 8 acceptance criteria, 0 broken images, 0 horizontal overflow, and saved `apps/windows-overlay/dist/overlay-visual-review-render.png`.
- Public Windows docs closeout on 2026-06-04:
  - The Windows platform docs and README no longer say there is no Windows desktop app. They now document the SageOS Windows overlay MVP shell, its PowerShell launch path, startup shortcut helper, smoke/review commands, and the distinction from the still-planned general Windows node companion.
  - `pnpm exec oxfmt --check README.md docs/platforms/windows.md docs/platforms/index.md docs/superpowers/artifacts/sageos-mvp-readiness.md` passed.
  - `git diff --check -- README.md docs/platforms/windows.md docs/platforms/index.md docs/superpowers/artifacts/sageos-mvp-readiness.md` passed.
  - `pnpm exec vitest run --config vitest.config.ts src/docs/slash-commands-doc.test.ts --reporter verbose` passed with 1 file and 1 test.

## Current Green Areas

- Overlay-first product direction is now explicit and repeatedly encoded in spec, plan, smoke evidence, and this readiness map.
- The Windows overlay has a real Electron shell, global hotkey, tray controls, startup shortcut management, HUD-first configuration, Edge Rail, pinned widgets, pass-through behavior, gateway client, and renderer model.
- The overlay no longer exposes only a narrow dashboard; it covers operations, employees, tasks, approvals, security, PC management, files, memory, observations, workflows, skills, apps/widgets, coding, repositories, policy, audit, incidents, collaboration, settings, and active runs.
- The Overview now explicitly shows autonomy intervention controls, including pause/stop and the path to narrow autonomy through Policy, so the default overlay answers how to interrupt autonomous work without first drilling into another workspace.
- The Security workspace now maps read-only system checks into operator-facing posture rows for Defender, startup/tasks, firewall/listeners, downloads, Security Sentinel activity, and pending remediation approvals.
- The PC Management workspace now maps read-only system checks into operator-facing rows for disk, CPU/RAM, power, updates, services, startup apps, scheduled tasks, cleanup opportunities, broken services, and safe repair actions.
- The Files workspace now maps existing file-scoped tasks, coding diffs, deletion approvals, and system disk checks into file organization suggestions, duplicate candidates, storage pressure, staging moves, cleanup plans, and approval-required deletes.
- The Coding, Workflows, and Skills workspaces now expose the explicit MVP rows for branch/workspace state, configured Night Shift schedule, repeated patterns, workflow candidates, dry-runs, enabled workflows, skill candidates, and skill provenance.
- The Memory workspace now exposes the full MVP Memory/SecondBrain surface: health, capture queue, Telegram ingestion, wiki export proof, recent captures, review cards, duplicate/stale candidates, graph health, and doctor status.
- Universal Launcher quick actions now support keyboard arrow navigation from the command input with disabled-action skipping, and the Electron smoke exercises the quick-action keyboard path in the built overlay.
- Electron smoke now fails on clipped or overlapping critical toolbar, launcher, HUD, and Edge Rail controls, adding runtime proof behind the visual text-fit requirement.
- Overlay visual smoke now explicitly covers dark, bright, text-heavy, browser-like, and IDE-like representative backdrops.
- Electron smoke now emulates `prefers-reduced-motion: reduce`, fails if visible critical controls keep transition or animation durations above 1ms, and captures a reduced-motion full-overlay screenshot.
- A local visual review companion now turns the smoke screenshot set into one Jason acceptance contact sheet and has a one-command gate that runs smoke capture, contact-sheet generation, and browser verification.
- Public Windows docs now match the overlay-first MVP status instead of describing Windows desktop support as absent.
- Liquid Linear command glass is tokenized and test-covered in the overlay visual contract, including HUD, Edge Rail, ambient pinned widgets, foreground stacking above specular material layers, and practical AA normal-text contrast over representative Windows app backdrops.
- Incidents now cover source failure, queue backlog, policy block, memory doctor failure, notification failure, worker failure, budget exhaustion, and security findings.
- Web supplemental incident repair now uses the same safe repair method allowlist as the overlay for the generated safe incident classes.

## Current Yellow Areas

- Final human product acceptance is still required for the Windows overlay visual and interaction quality.
- The overlay is production-usable as an MVP candidate, but the final release should still include Jason's visual pass against the current visual review contact sheet and representative Windows desktop backgrounds.
- The web Command Center is intentionally supplemental. Any remaining web polish should not displace overlay work from the MVP priority.

## Release Recommendation

Keep the release decision tied to the overlay, not the web Command Center. The SageOS overlay MVP slice is ready for Jason product review, and the repo-wide static/test gates are green in the current working slice. SageOS should not be tagged as MVP-release ready until Jason accepts the Liquid Linear overlay experience.

Do not mark the MVP complete if:

- The overlay smoke script fails.
- Text clips or overlaps in overlay screenshots.
- Pass-through mode blocks normal Windows app use outside active widget controls.
- Any high-risk action bypasses approval.
- Generated incidents fail to surface in shared status.
- Web/TUI/CLI/Telegram diverge from the shared SageOS contract.
