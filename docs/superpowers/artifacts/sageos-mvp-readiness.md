# SageOS MVP Readiness Map

Date: 2026-06-02
Operator: Codex
Branch: `codex/activity-events-ingest`
Current evidence commit: `b6e6e30` plus pending formatter/test stabilization slice
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
| Overlay shows employees, tasks, approvals, security, PC management, memory, workflows, skills, coding, apps, incidents, audit, policy, collaboration | Green  | Overlay renderer model, recent operations/collaboration/status slices, smoke artifact                                                                                                                                               | Re-run overlay tests                    |
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
| Enterprise-grade Liquid Linear overlay visual gate                                                                                                   | Yellow | Visual contract tests, smoke screenshots, Liquid Linear spec, smoke artifact, `smoke:electron` pass                                                                                                                                 | Jason visual acceptance                 |

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

## Current Green Areas

- Overlay-first product direction is now explicit and repeatedly encoded in spec, plan, smoke evidence, and this readiness map.
- The Windows overlay has a real Electron shell, global hotkey, tray controls, startup shortcut management, HUD-first configuration, Edge Rail, pinned widgets, pass-through behavior, gateway client, and renderer model.
- The overlay no longer exposes only a narrow dashboard; it covers operations, employees, tasks, approvals, security, PC management, files, memory, observations, workflows, skills, apps/widgets, coding, repositories, policy, audit, incidents, collaboration, settings, and active runs.
- Liquid Linear command glass is tokenized and test-covered in the overlay visual contract.
- Incidents now cover source failure, queue backlog, policy block, memory doctor failure, notification failure, worker failure, budget exhaustion, and security findings.
- Web supplemental incident repair now uses the same safe repair method allowlist as the overlay for the generated safe incident classes.

## Current Yellow Areas

- Final human product acceptance is still required for the Windows overlay visual and interaction quality.
- The overlay is production-usable as an MVP candidate, but the final release should still include Jason's visual pass against representative Windows desktop backgrounds after the current smoke screenshots are refreshed.
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
