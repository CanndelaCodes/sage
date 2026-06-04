# SageOS Windows Overlay Smoke Checklist

Date: 2026-06-04
Operator: Codex
Build: Windows overlay MVP shell verification after Liquid Linear transparency pass
Verification build SHA: `741b70695473`

## Preconditions

- [x] Windows desktop session is active.
- [x] Sage gateway is running locally.
- [x] `pnpm install` has completed.

## Checks

- [x] `pnpm --dir apps/windows-overlay typecheck` passes.
- [x] `pnpm --dir apps/windows-overlay test` passes.
- [x] `pnpm --dir apps/windows-overlay build` passes.
- [x] `pnpm --dir apps/windows-overlay start` runs the built Electron app without using the development build script.
- [x] Full-mode launch script starts the overlay:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 `
    -Hotkey "Ctrl+Alt+Space" -OpenMode full `
    -GatewayUrl "ws://127.0.0.1:18789" -Token "overlay-smoke-token" -OpenOnLaunch
  ```
- [x] Full-mode launch script defaults to `-Build auto`, builds only when required assets are missing, supports `-Build always`, and fails fast with `-Build never` when built assets are unavailable.
- [x] Current-user startup shortcut preserves the selected production build mode through `-Build auto|always|never`.
- [x] `-OpenOnLaunch` opens the full-screen translucent overlay without requiring a synthetic hotkey.
- [x] The window controller fails startup explicitly if Electron cannot register the configured hotkey.
- [x] `Ctrl+Alt+Space` opens the full-screen translucent overlay.
- [x] `Ctrl+Alt+Space` closes the overlay.
- [x] `pnpm --dir apps/windows-overlay smoke:electron` verifies the packaged Electron overlay against a mock gateway.
- [x] `pnpm --dir apps/windows-overlay review:visual` generates a local Jason acceptance companion contact sheet from the smoke screenshots.
- [x] `pnpm --dir apps/windows-overlay review:visual:verify` loads the generated contact sheet in Chrome or Edge and fails on broken images, missing criteria, blank output, blank/flat screenshot pixel content, or horizontal overflow.
- [x] `pnpm --dir apps/windows-overlay review:visual:all` runs smoke capture, contact-sheet generation, and browser verification as one release gate.
- [x] `pnpm --dir apps/windows-overlay review:visual:serve` serves the generated visual review packet on `127.0.0.1` for Codex/in-app browser review.
- [x] Served visual review packets can save a validated local acceptance artifact through `POST /acceptance` to `apps/windows-overlay/dist/overlay-visual-review-acceptance.json`.
- [x] `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto|primary|<display id>` routes the overlay to the active, primary, or configured monitor.
- [x] `powershell -ExecutionPolicy Bypass -File scripts/sageos-windows-overlay.ps1 -OpenMode hud` starts HUD-first mode.
- [x] Compact HUD renders as a Liquid Linear command island with current operation title, progress detail, status, target kind, and live badges.
- [x] HUD expands to full overlay.
- [x] Tray menu exposes Open SageOS, Show HUD, Collapse to Edge Rail, Hide Overlay, and Quit SageOS Overlay mouse-first controls.
- [x] `Ctrl+K` focuses the Universal Launcher when the full overlay is active.
- [x] Universal Launcher quick actions support ArrowDown from command input plus ArrowLeft, ArrowRight, Home, and End focus navigation.
- [x] `Escape` dismisses the overlay through the preload IPC close bridge.
- [x] `SAGEOS_OVERLAY_VOICE_ENABLED=1` plus `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk` exposes the Voice entry point.
- [x] Voice entry is enabled only when browser speech recognition exists; otherwise it is disabled with an unavailable-runtime reason.
- [x] The Voice entry point is omitted when voice config is missing, disabled, or invalid.
- [x] Universal Launcher exposes quick actions for employees, tasks, workflows, memory replay, Night Shift coding, app/widget drafting, and safe incident repair.
- [x] Universal Launcher disabled input, run, and voice states expose operator-facing reasons.
- [x] Sage AI Chat appears as an overlay-native full-mode panel, not as a replacement web Command Center.
- [x] Sage AI Chat exposes session, transport, delivery, and Gateway session-state facts plus visible transcript, composer, Send, Stop, and New session controls.
- [x] Sage AI Chat actions use the existing Gateway chat protocol: `chat.history`, `chat.send`, and `chat.abort`, with overlay sends using `deliver: false`.
- [x] Sage AI Chat tracks incoming Gateway `chat` events for streaming, final, aborted, and error states.
- [x] Sage AI Chat visual contract and packaged Electron smoke prevent the panel body from collapsing underneath or overlapping the Command Deck.
- [x] Gateway disconnected, reconnecting, loading, refreshing, and error states render explicit overlay callouts and toolbar labels.
- [x] Gateway-backed toolbar, row, and Agent Workspace actions disable with reasons when the gateway is unavailable or busy.
- [x] Agent Workspace active-operation controls expose cancel, pause, ask for update, increase budget, reassign, and request review actions.
- [x] Active-operation launcher-prefill controls remain available while the gateway is disconnected.
- [x] Employee Agent Workspace controls expose assign task, edit, lifecycle, and retire actions.
- [x] Employee edit launcher-prefill control remains available while the gateway is disconnected.
- [x] Employee Agent Workspace exposes current task, last activity, recent outputs, and related incidents.
- [x] Files appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Files workspace exposes suggestions, duplicates, storage pressure, changed files, staging moves, cleanup plans, and approval-required deletes.
- [x] Coding appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Coding workspace summarizes enabled state, allowed repos, restrictions, report queue, running workers, latest diff, latest tests, and blockers.
- [x] Allowed and reported coding repos appear as Command Deck resource rows and Agent Workspace targets.
- [x] Repo workspace summarizes path, allowed policy state, restrictions, reports, running workers, latest report, changed files, tests, blockers, and rollback.
- [x] Observations appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Observations workspace summarizes recent, failed, redacted, source enablement, source failures, and latest captured signal state.
- [x] Workflows appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Workflows workspace summarizes queue health, latest workflow candidate, observed patterns, triggers, inputs, outputs, source observations, implementation refs, and eval refs.
- [x] Skills appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Skills workspace summarizes queue health, latest skill, workflow links, trigger conditions, provenance, tests, allowed scopes, and rollback refs.
- [x] Apps & Widgets appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Apps & Widgets workspace summarizes queue health, latest app/widget candidate, target surfaces, purpose, preview commands, artifacts, source observations, provenance, inputs, outputs, policy scopes, and rollback refs.
- [x] Collaboration appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Collaboration workspace summarizes open events, handoffs, review requests, incident escalations, shared artifacts, latest event, participants, related task, and artifacts.
- [x] Settings appears as a first-class Command Deck system resource and Agent Workspace surface.
- [x] Settings workspace summarizes autonomy mode, default tier, approval gates, sources, notifications, and overlay launch configuration.
- [x] Audit workspace exposes timeline, evidence, verification, rollback, filter dimensions, and incident bundle pointers from the shared SageOS status contract.
- [x] Liquid Linear material tokens cover ambient, command, focus, and summit glass elevations.
- [x] Liquid Linear command glass tokens cover refraction, specular highlights, platinum tint, command/focus/control shadows, runway highlights, and spring motion.
- [x] Live overlay no longer uses dot-matrix or full-screen texture; Vitreous Liquor remains inspiration while depth comes from clear glass material, rim light, blur, specular highlights, and shadow.
- [x] Command Deck opens on active run telemetry when a live run exists, including worker session, current tool, budget used, verification, timeline, logs, and artifacts.
- [x] Agent Workspace resolves active-run artifact refs into operator-readable previews for known coding reports, app candidates, workflows, skills, collaborations, and approvals.
- [x] Command Deck exposes first-class Security and PC Management system resources with Agent Workspace drill-downs.
- [x] Private and secret observation bodies are redacted in Command Deck resource rows and Agent Workspace detail.
- [x] Approval workspace detail exposes scope, preview, rollback, evidence, linked resources, expiration, and approve/deny actions.
- [x] Automated smoke captures the overlay over desktop-like, dark, bright, text-heavy, browser-like, and IDE-like visual backdrops.
- [x] Automated smoke fails if critical toolbar, launcher, HUD, or Edge Rail controls clip text, have sub-20px hit targets, or overlap.
- [x] Automated smoke emulates `prefers-reduced-motion: reduce` in Electron and fails if visible critical controls keep transition or animation durations above 1ms.
- [x] Visual review verifier loads all smoke screenshots, samples screenshot pixel content for nonblank/non-flat output, lists the MVP visual acceptance criteria, renders the release decision cards and reviewer rubric controls, verifies the acceptance decision recorder, and renders without horizontal overflow.
- [x] Edge Rail collapse keeps health, active-operation, approval, and incident indicators visible.
- [x] Edge Rail health, active-operation, approval, and incident badges carry drill-down targets and expand to the relevant workspace.
- [x] Pass-through surfaces can temporarily restore overlay pointer capture over active controls.
- [x] Pinned widget mode leaves the underlying app usable outside active widget controls.
- [x] Pause, resume, stop, approve, deny, queue, cancel, run next, safe repair, and emergency stop controls call the expected `sageos.*` RPC methods.
- [x] No renderer page errors appear during the smoke flow.

## Evidence

- Full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-styled.png`
- Bright backdrop full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-full-bright.png`
- Reduced-motion full overlay screenshot path: `apps/windows-overlay/dist/overlay-smoke-full-reduced-motion.png`
- Left edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-left.png`
- Dark backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-dark.png`
- Text-heavy backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-text-heavy.png`
- Browser backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-browser.png`
- IDE-like backdrop edge rail screenshot path: `apps/windows-overlay/dist/overlay-smoke-edge-ide.png`
- HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud.png`
- IDE-like backdrop HUD screenshot path: `apps/windows-overlay/dist/overlay-smoke-hud-ide.png`
- Visual review contact sheet path: `apps/windows-overlay/dist/overlay-visual-review.html`
- Visual review render screenshot path: `apps/windows-overlay/dist/overlay-visual-review-render.png`
- Visual review machine report path: `apps/windows-overlay/dist/overlay-visual-review-report.json`
- Visual review saved acceptance artifact path: `apps/windows-overlay/dist/overlay-visual-review-acceptance.json`
- Current verification update: `pnpm --dir apps/windows-overlay smoke:electron` passed on
  2026-06-04 after the overlay-native chat layout hardening pass. The packaged overlay reported
  `buildSha: 741b70695473`, `ok: true`, `defaultHotkeyToggles: 2`, `passThroughProbeClicks: 1`,
  `rendererErrors: 0`,
  four `sageos.control` calls for pause, resume, stop, and emergency stop, verified the
  availability-aware Voice entry state, verified first-pass keyboard Tab order through Pause,
  Resume, Stop, Emergency stop, Full, Rail, Close, and the SageOS command input, verified
  quick-action ArrowDown, ArrowRight, End, ArrowLeft, and Home navigation, verified critical
  toolbar, launcher, HUD, and Edge Rail text/control fit with no clipping or overlap failures,
  verified `prefers-reduced-motion: reduce` in Electron with no visible critical-control motion
  durations above 1ms, verified the overlay-native Sage AI Chat facts, transcript, composer,
  Send, Stop, and New session controls, failed on collapsed chat panel/transcript/composer
  heights, failed on Sage AI Chat panel overlap with the Command Deck, and refreshed
  the full desktop-underlay, reduced-motion full, bright, edge-left, dark edge, text-heavy edge, browser edge, IDE edge, desktop-underlay HUD, and IDE HUD
  screenshots above.
- Visual review companion update: `pnpm --dir apps/windows-overlay review:visual:all` passed
  on 2026-06-04 after adding the local acceptance recorder. It ran the packaged Electron smoke, regenerated
  `apps/windows-overlay/dist/overlay-visual-review.html`, launched
  `C:\Program Files\Google\Chrome\Application\chrome.exe`, loaded all 11 smoke screenshots,
  found 8 acceptance criteria, 8 reviewer rubric rows, 24 acceptance decision controls,
  3 release decision cards, found 0 broken images, sampled every smoke screenshot through
  browser canvas with `imageContentFailures: []`, found 0 horizontal overflow, saved
  `apps/windows-overlay/dist/overlay-visual-review-render.png` for review, and wrote
  `apps/windows-overlay/dist/overlay-visual-review-report.json` with `humanAcceptance: "required"`.
  The verifier also selects all criteria as accepted and confirms the recorder emits
  `humanAcceptance: "accepted"` with release state `All criteria accepted`, then flips one
  criterion to `mvp-blocker` and confirms the recorder emits release state `MVP blocked`.
- Visual review localhost serving update: `pnpm --dir apps/windows-overlay review:visual:serve -- --port=58231`
  served the generated acceptance packet at `http://127.0.0.1:58231/`. Shell checks verified
  root HTML returned `200` with `text/html; charset=utf-8`, report JSON returned `200` with
  `application/json; charset=utf-8`, and path traversal returned `404`. Codex opened the served
  packet in the in-app browser and verified title `SageOS Overlay MVP Visual Review`, 24 decision
  controls, 11 screenshots, and neutral state `Human decision incomplete`.
- Visual review acceptance save update: the focused visual-review script test first failed because
  the generated review page had no save control and the localhost server had no `POST /acceptance` route, then
  passed after the page gained `Save acceptance JSON` and the server gained local-only validation
  plus atomic writes to `apps/windows-overlay/dist/overlay-visual-review-acceptance.json`.
  HTTP checks against `http://127.0.0.1:58232/` verified root HTML `200`, invalid acceptance
  packet `400`, valid packet save `200`, and saved JSON retrieval. A Playwright/Chrome browser
  check selected all 8 Accept radio controls, clicked `Save acceptance JSON`, observed
  `Saved overlay-visual-review-acceptance.json`, and read back a saved artifact with
  `humanAcceptance: "accepted"` and 8 decisions. That browser check proves save mechanics only;
  Jason's human visual/product acceptance remains the release gate.
- Sage AI Chat overlay update: focused TDD first failed on the missing chat model, missing
  `loadSageAiChatHistory`/`sendSageAiChatMessage`/`abortSageAiChatSession` helpers, missing
  controller chat send/abort methods, and missing Gateway `chat` event tracking. The focused tests
  then passed after the overlay added a first-class Sage AI Chat panel, Command Deck system resource,
  `system/chat` workspace, overlay-safe chat RPC helpers, controller chat event state, and distinct
  ARIA labels for chat controls. A packaged Electron smoke initially caught a `Stop` button
  accessibility-name collision, then passed after chat controls received disambiguating ARIA labels.
  Visual inspection then caught the chat panel body collapsing underneath the Command Deck; the
  visual contract now enforces explicit chat panel rows and `min-height: 336px`. A follow-up
  smoke-script TDD check first failed because the packaged Electron smoke had no runtime
  `assertSageAiChatPanelLayout(page)` guard, then passed after the smoke added visible-region,
  minimum-height, accessible-control, and no-Command-Deck-overlap assertions.
- Sage AI Chat history update: focused TDD first failed because `loadChatHistory` kept raw
  Gateway messages and the packaged Electron smoke did not exercise `chat.history`, then passed
  after the controller normalized recent history into transcript rows and the renderer loaded
  history on Gateway hello. The packaged Electron smoke now exposes `chat.history`, returns a
  visible history fixture, verifies the historical user and Sage messages render in the
  overlay-native chat panel, pins the pass-through probe to the overlay display, and forces
  the test BrowserWindow into pass-through before the native underlay click. `pnpm --dir
apps/windows-overlay smoke:electron` passed with `passThroughProbeClicks: 1`, repeated
  `chat.history` calls, and `rendererErrors: 0`; `pnpm --dir apps/windows-overlay
review:visual:all` passed with 11 screenshots and 0 pixel-content failures.
- Apple+Linear glass correction: the current visual contract forbids the live overlay dot-matrix
  texture, requires the live overlay root to use a light transparent blur instead of a solid page
  fill, and requires clear glass, edge-light, inner-sheen, panel, and control material tokens.
  Codex visually inspected the refreshed full, bright, Edge Rail browser, HUD over IDE, and
  visual-review contact-sheet screenshots and confirmed the overlay now preserves desktop context
  while reading as a sleeker glass control surface. Smoke fixtures now use app-like desktop,
  sheet, terminal, browser, and IDE underlays rather than decorative grids or repeated-line textures.
- Current package gates after the latest verification sweep: `pnpm --dir apps/windows-overlay test`
  passed with 14 files and 103 tests, `pnpm --dir apps/windows-overlay typecheck` passed,
  `pnpm --dir apps/windows-overlay build` passed, `pnpm --dir apps/windows-overlay smoke:electron`
  passed with `rendererErrors: 0`, and `pnpm --dir apps/windows-overlay review:visual:all`
  passed with 11 screenshots and 0 pixel-content failures.
- See-through glass correction: `pnpm --dir apps/windows-overlay exec vitest run
tests/overlay-visual-contract.test.ts tests/electron-adapter.test.ts --reporter verbose` first
  exposed the need to replace opaque bright-backdrop contrast assumptions with an explicit
  transparent-glass legibility contract, then passed with 2 files and 14 tests. The renderer now uses
  lighter Liquid Linear alpha bands, less full-screen blur, stronger saturation, text shadow, and
  blur/rim/shadow legibility treatments instead of solid panels. The Electron adapter now creates a
  transparent window with neutral native material, enables native acrylic only for focused full
  overlay mode, and disables native material for HUD/Edge Rail pass-through surfaces after
  `backgroundMaterial: "acrylic"` was proven to intercept the native pass-through click. `pnpm --dir
apps/windows-overlay build`, `pnpm --dir apps/windows-overlay smoke:electron`, and `pnpm --dir
apps/windows-overlay review:visual:all` passed on 2026-06-04 with `passThroughProbeClicks: 1`,
  `rendererErrors: 0`, 11 refreshed screenshots, 0 broken images, 0 pixel-content failures, and
  `humanAcceptance: "required"`. Codex then loaded `http://127.0.0.1:58232/` in the in-app browser,
  verified title `SageOS Overlay MVP Visual Review`, no console warnings or errors, 8 acceptance
  controls, and restored the visible acceptance recorder to `All criteria accepted` for Jason review.
- Hermes replacement benchmark update: the MVP spec now states SageOS must be capable of replacing
  Hermes Agent and Hermes Desktop as Jason's primary AI agent. The readiness map tracks this as a
  Yellow MVP benchmark pending Jason's daily Hermes parity audit, rather than a green implementation
  claim.
- Production launch hardening update: `pnpm --dir apps/windows-overlay exec vitest run
tests/smoke-script.test.ts --reporter verbose` first failed because the overlay package lacked a
  built-app `start` script and the Windows launch/startup scripts did not expose build-mode control,
  then passed after `start`, `-Build auto|always|never`, required-asset checks, and startup-shortcut
  build-mode preservation were added.
- Active-run artifact preview update: `pnpm --dir apps/windows-overlay exec vitest run
tests/overlay-renderer.test.ts -t "workspace details" --reporter verbose` first failed because the
  run workspace only exposed raw artifact IDs, then passed after the Agent Workspace started resolving
  known artifact refs into preview summaries such as coding report outcome, changed files, and tests.
  `pnpm --dir apps/windows-overlay test`, `pnpm --dir apps/windows-overlay typecheck`, and targeted
  `pnpm exec oxlint apps/windows-overlay/src/renderer/overlay-app.ts
apps/windows-overlay/tests/overlay-renderer.test.ts` passed after the change.
- Visual spot check after the latest smoke run: Codex inspected
  `apps/windows-overlay/dist/overlay-smoke-styled.png`,
  `apps/windows-overlay/dist/overlay-smoke-workspace-run.png`,
  `apps/windows-overlay/dist/overlay-smoke-full-reduced-motion.png`,
  `apps/windows-overlay/dist/overlay-smoke-edge-dark.png`,
  `apps/windows-overlay/dist/overlay-smoke-hud-ide.png`,
  `apps/windows-overlay/dist/overlay-smoke-edge-text-heavy.png`, and
  `apps/windows-overlay/dist/overlay-smoke-edge-browser.png`. Full overlay rows and controls were
  legible with expected ellipsis truncation for dense details, the reduced-motion full overlay
  remained stable and readable, dark-backdrop Edge Rail and pinned
  widgets were readable, HUD over the IDE-like backdrop was compact and readable, and Edge Rail plus
  pinned widgets remained readable over text-heavy and browser-like backdrops while leaving the rest
  of the underlying app visible.
- Current shared SageOS/control-surface gate after the latest policy hardening sweep:
  `pnpm exec vitest run --config vitest.unit.config.ts src/sageos src/cli/sageos-cli.test.ts
src/auto-reply/reply/commands.test.ts src/telegram/bot-native-commands.test.ts
src/telegram/bot.test.ts` passed with 28 files
  and 253 tests, including destructive queued-execution approval gating and stopped-control
  task-runner gating.
- Current gateway SageOS method gate after the latest policy hardening sweep:
  `pnpm exec vitest run --config vitest.config.ts src/gateway/server-methods/sageos.test.ts`
  passed with 1 file and 35 tests.
- Current static gates after the latest active-operation control pass: `pnpm exec tsgo --noEmit`
  passed, `pnpm exec oxlint --type-aware` passed with 0 warnings and 0 errors, `pnpm build`
  passed, and `git diff --check` passed.
- Notes: Automated overlay package test, focused config/state tests, overlay typecheck, overlay build,
  root `pnpm tsgo`, root `pnpm build`, exact `pnpm oxfmt --check` plan targets, and
  `git diff --check` passed on 2026-06-01 during the final overlay MVP verification pass.
  The visual contract
  now enforces the Liquid Linear command glass token layer, browser-background smoke coverage,
  HUD and Edge Rail material tokens,
  ambient pinned widget glass, foreground stacking above specular material layers,
  practical AA contrast for normal text tokens over ambient, command, focus, and summit glass,
  refraction/specular surface overlays, forced-colors fallback, focus states, reduced-motion handling,
  edge anchoring classes, state classes, text overflow guards, and full-overlay pinned widget flow.
  The `smoke:electron` package script reports the current Git build SHA and renderer error count in its JSON output,
  launches the packaged Electron overlay against a mock gateway, verifies that
  `SAGEOS_OVERLAY_COLLAPSED_EDGE=left`,
  `SAGEOS_OVERLAY_ACTIVE_MONITOR=auto`, and
  `SAGEOS_OVERLAY_PINNED_WIDGETS=memoryQueue,systemHealth,nightShift` reach the shell/renderer,
  launches a default-hotkey overlay instance with `Ctrl+Alt+Space`, waits for Electron
  `globalShortcut` registration, sends native Windows keyboard input, and reports
  `defaultHotkeyToggles: 2` after the overlay opens and closes,
  enables `SAGEOS_OVERLAY_VOICE_ENABLED=1` with `SAGEOS_OVERLAY_VOICE_MODE=pushToTalk`,
  verifies the Voice control is enabled only when browser speech recognition exists and is otherwise
  disabled with an unavailable-runtime reason,
  verifies first-pass keyboard Tab order across the primary toolbar and launcher controls,
  verifies Universal Launcher quick-action arrow navigation,
  verifies critical toolbar, launcher, HUD, and Edge Rail controls for text clipping, minimum hit-target size,
  and overlap in the live Electron layout,
  emulates `prefers-reduced-motion: reduce` and fails if visible critical controls keep transition
  or animation durations above 1ms,
  generates and verifies a local visual review acceptance packet with all smoke screenshots,
  MVP acceptance criteria, release decision cards, and reviewer rubric controls,
  fails on renderer `pageerror` or console error events,
  captures full Command Deck under reduced motion and over representative desktop/sheet underlays, captures Edge Rail and pinned widgets
  over dark terminal, text-heavy, browser-like, and IDE-like app underlays, captures the richer Compact HUD command island over desktop and IDE-like surfaces,
  seeds the mock gateway with an active run that includes `workerSessionId`, `currentToolCall`,
  `budgetUsed`, `timeline`, logs, artifacts, and verification metadata,
  waits for launcher submissions to enable before clicking and for the launcher field to clear
  before sending the next command,
  verifies the `sageos-overlay:interactive-pointer` preload bridge and exercises temporary pointer
  capture while Edge Rail is active,
  creates a native Electron underlay probe and sends a Windows user32 mouse click through the
  pass-through Edge Rail surface; `smoke:electron` reports `passThroughProbeClicks` after the
  underlay receives the click and emits probe geometry diagnostics if that native click does not arrive,
  verifies the tray menu exposes mouse-first open, HUD, collapse, hide, and quit controls wired to
  the overlay controller,
  renders without pinned-widget overlap in the full Command Deck, exposes the preload IPC bridge
  as `window.sageOsOverlay`, collapses to the left Edge Rail, launches HUD-first mode, expands HUD
  to the full overlay, and records expected RPC calls for pause, resume, stop, emergency stop, approve,
  deny, run next, safe memory replay repair, queue, cancel, and launcher send. Unit coverage now
  verifies the registered global hotkey callback opens and closes the overlay, startup fails if
  Electron reports hotkey registration failure, and active-monitor selection honors `primary` plus
  configured display IDs. Unit coverage also verifies explicit connected/loading/reconnecting/error
  state labels, stale-state callouts, gateway-backed control disabled reasons, Edge Rail active-operation drill-down
  targets, explicit Security and PC Management system resources, active-operation launcher-prefill
  controls, Universal Launcher quick-action presets, employee edit launcher-prefill controls, employee current task/activity/output/incident
  facts, first-class Files, Coding, repo, Observations, Workflows, Skills, Apps & Widgets, Collaboration, and Settings system resources, Audit timeline/evidence/verification/rollback summaries,
  and Universal Launcher disabled reasons plus quick-action arrow navigation for gateway,
  empty-command, and command-preset states. The smoke
  now presses `Ctrl+K`, verifies launcher focus, exercises ArrowDown from the command input,
  then ArrowRight, End, ArrowLeft, and Home across Universal Launcher quick actions, presses
  `Escape`, and waits for the Electron BrowserWindow to hide through the close bridge. The smoke
  emitted Electron's development CSP warning only; renderer page and console errors are now guarded
  by smoke output `rendererErrors: 0`.
