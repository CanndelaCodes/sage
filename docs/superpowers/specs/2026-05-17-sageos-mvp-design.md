# SageOS MVP Design

Date: 2026-05-17

## Goal

Define the private-first SageOS MVP as a personal agent operating system for Jason. The MVP combines a local Command Center with an Ambient Copilot, backed by reliable Sage Memory capture, recall, diagnostics, and learning.

SageOS is not a separate public product for this MVP. It is the working local operating layer that lets Jason see, steer, and trust his agents across sessions, apps, browser context, memory, and local automations.

## MVP Definition

The MVP is complete when Sage can run as a daily local control layer that answers four questions without repo spelunking:

1. What is Sage doing right now?
2. What does Sage know about my current work?
3. What should Sage do next, and what needs my approval?
4. Is memory, learning, capture, and automation healthy?

The first version must be useful to Jason even if no other user can install or understand it yet. Public onboarding, marketplace packaging, and polished beta flows are intentionally out of scope.

## Context

The current Sage repo already has the core substrate for this MVP:

- `memory.backend = "sage-memory"` support for remote search, get, capture, full LLM session ingest, and activity event ingest.
- Automatic transcript capture for session lifecycle events, heartbeat, and memory-flush compaction.
- A durable Sage Memory capture queue plus replay and diagnostic commands.
- `sage memory doctor` and `sage doctor memory` for live backend checks.
- An autonomous learning kernel with activity queues, browser/session sources, learning review tools, and skill provenance.
- Existing local surfaces, including CLI, TUI, gateway/web chat, mobile apps, and the macOS menubar app.

The next work should not restart the memory project. It should make the current substrate visible, steerable, and useful in daily operation.

## Scope

The MVP includes two user-facing modes:

1. Command Center: a local control surface for status, sessions, memory, learning, queues, approvals, automations, and diagnostics.
2. Ambient Copilot: a bounded local assistant layer that observes approved context, recalls relevant memory, suggests next actions, and captures outcomes.

Continuity is the substrate, not a separate MVP mode. SageOS must preserve and use context across sessions, but the visible product promise is command and ambient help.

## Non-Goals

- Public beta readiness.
- A new standalone OS, window manager, or desktop environment.
- A new MCP layer before the native capture and command contracts are proven live.
- Unapproved external writes to messaging, email, calendars, files, tickets, or production systems.
- A broad automation marketplace.
- Multi-user, team, or cloud-sync behavior.
- Replacing the existing Sage Memory service or moving personal data out of the local-first boundary.

## Chosen Design

### Command Center

The Command Center is the primary inspect-and-steer surface. It should be reachable from the existing local Sage surfaces rather than introduced as a separate application family.

The initial Command Center should expose:

- System overview: gateway status, active agent sessions, current model/provider, connected channels, and recent failures.
- Memory status: configured backend, capture health, capture queue count, last successful transcript ingest, last successful search/get/export proof, and default namespace.
- Learning status: learning enabled state, queued activity count, recent learning reviews, learned skill count, and auto-apply policy.
- Ambient status: which context sources are enabled, what context was last observed, what suggestions are pending, and which actions require approval.
- Session controls: open, continue, reset, compact, delete, capture, replay failed capture, and inspect transcript-backed memory.
- Diagnostics: one-click or one-command access to memory doctor, gateway health, and relevant queue replay.

The Command Center should favor compact operational information over marketing layout. It should make broken state obvious and give Jason the next repair action.

### Ambient Copilot

The Ambient Copilot watches approved local context and turns it into useful, bounded assistance.

The MVP ambient loop should:

- Observe allowed sources: active Sage sessions, browser observations made through Sage tools, session lifecycle events, heartbeat outcomes, memory-flush events, and learning reviews.
- Normalize observations into durable activity events.
- Capture relevant evidence into Sage Memory when the backend is active.
- Recall memory before answering questions about prior work, decisions, tasks, people, dates, or preferences.
- Produce suggestion cards rather than taking surprising action.
- Require explicit approval for external writes, destructive changes, or production effects.
- Capture the outcome after a suggestion is accepted, rejected, or completed.

Ambient behavior should be useful but quiet. MVP success is not constant notifications; it is the feeling that Sage understands the current work and has the next likely step ready.

### Continuity Substrate

Sage Memory remains canonical. Obsidian remains a rendered review surface. The Sage repo should not write directly into the vault for normal operation.

SageOS continuity depends on:

- Full transcript ingest for Sage sessions, plus recall over externally captured Codex sessions already stored in Sage Memory.
- Activity-event ingest for browser and learning sources.
- Capture queue replay for failed writes.
- Search/get paths that agents already know how to use.
- Doctor checks that prove ingest, search, get, export, and vault rendering.
- Learning reviews that turn repeated activity into reusable skills or durable notes.

If Sage Memory is disabled or unhealthy, SageOS must degrade into a manual Command Center with clear warnings. It must not pretend continuity is working.

## Architecture

SageOS should be implemented as a thin orchestration layer over existing subsystems:

- Status aggregation: a new Command Center status model that reads existing gateway, memory, learning, queue, session, channel, and automation status providers.
- Context observation: existing browser/session/heartbeat/memory-flush hooks produce structured activity events.
- Memory bridge: existing `SageMemoryManager` handles capture, transcript ingest, activity ingest, search, get, and status.
- Suggestion engine: a small policy layer converts recent context plus retrieved memory into pending suggestions.
- Approval gate: existing confirmation and tool-policy infrastructure controls writes and risky actions.
- UI surfaces: CLI/TUI and the local app/web surfaces render the same underlying status and suggestion model.

The implementation should avoid a second parallel memory path or a second parallel session model. New UI should consume shared service functions so CLI and app surfaces stay consistent.

## Data Flow

1. A local event occurs: session update, browser observation, heartbeat, compaction, command, capture failure, learning review, or user request.
2. Sage normalizes the event with source, timestamp, session key, workspace, sensitivity, and action metadata.
3. If memory is active, Sage captures the event or transcript through Sage Memory. Failed writes are queued.
4. The Command Center status model reads current health, queues, sessions, learned skills, pending approvals, and recent events.
5. For ambient help, Sage retrieves relevant memory and builds a suggestion with evidence, confidence, proposed action, and required approval level.
6. Jason accepts, rejects, edits, or ignores the suggestion.
7. Sage captures the outcome and updates learning state.

## Error Handling

- Memory backend disabled: show a clear warning and continue with local status only.
- Memory service unreachable: record failed captures in the queue, surface the backlog, and offer replay.
- Missing token or namespace: fail diagnostics clearly and show the exact config area to fix.
- Stale context: label it with timestamp and source, and avoid using it as current state.
- Suggestion cannot cite memory or live context: lower confidence or suppress the suggestion.
- External write requested: require approval unless an existing explicit policy allows it.
- Capture succeeds but export/vault rendering fails: treat memory as captured but review visibility as degraded.
- Ambient loop failure: never block core session operations; log and surface the failure in Command Center.

## Acceptance Criteria

The MVP is accepted when the following are true:

- Command Center shows gateway, sessions, memory, learning, queues, and pending approvals through one shared status contract rendered in at least one local surface.
- The memory section can prove the current backend, last capture, capture queue, and doctor status.
- The learning section can show queued activity, recent reviews, learned skills, and auto-apply policy.
- Sage can answer "what was I working on?" using captured session memory rather than stale local assumptions.
- Sage can inspect current approved context and propose at least one useful next action with evidence.
- Accepted and rejected suggestions are captured as outcomes.
- Capture failures are visible, durable, and replayable.
- Destructive or external actions remain approval-gated.
- A live proof captures a real session, searches it, expands it, exports it, and verifies the rendered vault note exists.
- Focused tests, type checking, lint, touched-file formatting, and `git diff --check` pass for the implementation slices.

## Testing Strategy

Unit tests should cover:

- Command Center status aggregation from memory, learning, sessions, queues, gateway, and approvals.
- Disabled or unhealthy memory backend states.
- Learning queue and skill provenance summaries.
- Suggestion creation from current context plus retrieved memory.
- Approval-level classification for read, local write, destructive, and external actions.
- Outcome capture after suggestion accept/reject/complete.

Integration tests should cover:

- CLI/TUI and app/web surfaces rendering the same status contract.
- Capture queue replay updating Command Center state.
- Memory doctor output appearing in Command Center.
- Ambient suggestions suppressing themselves when evidence is missing or stale.

Live proof should cover:

- Start or verify the local Sage Memory service.
- Run `sage doctor memory`.
- Capture a real Sage session transcript.
- Search for the captured session through Sage.
- Expand the result through `memory_get`.
- Export the wiki.
- Verify the Obsidian-rendered note exists on disk.

## Implementation Order

1. Define shared SageOS status contracts for memory, learning, sessions, queues, approvals, gateway health, and ambient sources.
2. Add a Command Center read path in CLI/TUI first, because it is easiest to verify deterministically.
3. Render the same status model in the local app/web surface.
4. Add ambient context cards using existing browser, session, heartbeat, memory, and learning event sources.
5. Add suggestion generation with evidence and approval classification.
6. Capture suggestion outcomes into Sage Memory and the learning queue.
7. Run live proof and close gaps until daily use is boringly reliable.

## Open Decisions

- Which existing local surface should become the primary visual Command Center: macOS app window, local web UI, TUI, or a layered combination.
- Whether ambient suggestions should first appear as Command Center cards, macOS notifications, chat messages, or all three.
- How much active-app context is allowed in MVP versus relying first on Sage-observed browser/session events.
- Whether learned skills auto-apply during MVP or remain review-only until the loop has more live mileage.

## Follow-On Work

After the MVP is proven privately:

- Add a public-beta onboarding path.
- Package the Command Center as a coherent product surface.
- Decide whether an MCP adapter adds value over the native CLI and HTTP contracts.
- Add richer app context and OS-level triggers.
- Add long-running proactive automations with stricter approval and audit controls.
