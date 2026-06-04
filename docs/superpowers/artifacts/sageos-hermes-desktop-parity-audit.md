# SageOS Hermes Desktop Parity Audit

Date: 2026-06-04
Operator: Codex
Source: `https://github.com/NousResearch/hermes-agent`
Audited source commit: `d1367355d514b5ce3af6056ca660ab28e9d632e4`
Desktop package version observed in source: `0.15.1`

## Purpose

SageOS MVP must be capable of replacing Hermes Agent and Hermes Desktop for Jason's main daily AI-agent loop. This audit translates the current Hermes Desktop source shape into SageOS parity requirements.

This is a benchmark, not an instruction to copy Hermes UI one-to-one. SageOS should exceed Hermes for Jason's Windows workflow by making the primary interface a programmable Windows overlay that preserves the active desktop underneath.

## Hermes Desktop Signals

The audited Hermes source shows these parity-relevant patterns:

- Native app shell: `apps/desktop/package.json` defines an Electron desktop app with macOS, Windows, and Linux build targets.
- Same-agent invariant: `apps/desktop/README.md` describes the desktop app as using the same agent, config, keys, sessions, skills, memory, and gateway as the CLI and gateway surfaces.
- Packaged runtime bootstrap: the packaged app ships an Electron shell, installs or resolves the Hermes runtime in `HERMES_HOME`, and talks to the dashboard backend instead of creating an unrelated agent.
- Full chat surface: desktop README and `apps/desktop/src/components/assistant-ui/` cover streaming responses, live tool activity, structured tool summaries, markdown/code rendering, tool fallbacks, and tool approvals.
- Session continuity: `apps/desktop/src/store/session.ts`, `src/lib/session-search.ts`, and command palette session entries show active, historical, and archived chat navigation.
- Command palette: `apps/desktop/src/app/command-palette/index.tsx` exposes new chat, command center sections, providers, tools, MCP servers, sessions, and archived chats.
- File and preview workflow: desktop README, `src/app/right-sidebar/files/`, and preview-related stores/libs show file browsing and side-by-side previews as first-class daily workflow surfaces.
- Voice: `src/app/chat/composer/hooks/use-voice-recorder`, `use-voice-conversation`, `src/lib/voice-playback.ts`, and desktop permissions indicate voice input and playback are part of the desktop expectation.
- Provider, model, tools, MCP, and settings UX: command palette entries and package/source layout expose providers, models, MCP, tools, credentials, onboarding, and account setup as normal desktop surfaces.
- Agent/activity views: `src/app/agents/`, subagent stores, activity stores, and chat activity components make delegated work visible outside the transcript alone.
- Approval bypass is scoped: `src/lib/yolo-session.ts` documents a per-session approval-bypass toggle rather than a global silent safety downgrade.

## SageOS MVP Parity Targets

For SageOS to replace Hermes for Jason's main daily loop, MVP acceptance should verify:

- Overlay is the daily home: the Windows overlay, not the web Command Center, is the first-class AI-agent UI opened by hotkey.
- Same-agent invariant: overlay, web, TUI, CLI, Telegram, Gateway, Sage Memory, sessions, runs, tasks, policies, and skills all reflect the same underlying Sage state.
- Chat continuity: Sage AI Chat can load recent history, list recent sessions, resume a selected session, send safely with `deliver: false`, stop/abort active chat work, and show streaming/final/aborted/error state.
- Live tool visibility: Agent Workspace exposes current run, current tool, logs, artifacts, verification, approvals, incidents, and safe interruption controls without forcing Jason into a terminal.
- Preview and file/artifact workflow: MVP must at least expose artifact previews and known file/report summaries in the overlay; richer side-by-side file/browser preview rails can be post-MVP only if Hermes is not still required for the daily loop.
- Settings and control: provider/model/tool/MCP/profile-policy equivalents must be visible enough in SageOS surfaces that Jason does not need Hermes Desktop open for routine setup, review, or control.
- Voice-ready path: mouse is priority one, keyboard priority two, voice priority three; voice can remain limited for MVP only if the overlay remains complete by mouse and keyboard.
- Safety UX: approval, policy, audit, rollback/evidence, emergency stop, pause/resume, and scoped capability state stay visible and operator-controllable.
- Memory and skills: Sage Memory remains canonical factual memory; SageOS workflow/skill candidates remain procedural assets with provenance, review, and stale-skill handling.

## Current SageOS Status From This Slice

Covered or strengthened now:

- Transparent overlay root and native transparent/acrylic shell behavior make SageOS feel like an overlay over the active desktop instead of a solid app sheet.
- Click ripples are tokenized as subtle Liquid Linear material feedback for buttons, rows, cards, sessions, panels, workspaces, and pinned widgets.
- Sage AI Chat now loads `chat.history`, lists recent sessions via `sessions.list`, resumes a selected session by key, sends through `chat.send`, and aborts through `chat.abort`.
- Packaged Electron smoke verifies the recent-session resume path, chat layout fit, pass-through click behavior, renderer error count, and visual review screenshot packet.

Still needs Jason parity review:

- Whether Sage AI Chat already feels good enough for Jason's ordinary Hermes Desktop chat loop.
- Whether current overlay artifact previews are enough or a Hermes-like right preview rail is MVP-blocking.
- Whether provider/model/tool/MCP setup is complete enough in SageOS surfaces for daily operation.
- Whether voice parity is acceptable as a lower-priority MVP item behind mouse and keyboard.
- Whether any Hermes workflow Jason depends on daily still lacks a SageOS overlay equivalent.

## Release Rule

Do not mark Hermes replacement green until Jason can complete his normal Hermes-driven daily agent loop in SageOS without keeping Hermes Desktop open as the primary agent UI, or until Jason explicitly marks a specific gap as post-MVP.
