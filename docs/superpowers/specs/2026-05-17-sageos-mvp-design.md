# SageOS MVP Design

Date: 2026-05-17

## Goal

Define SageOS as Jason's private, local-first, always-on personal agent operating system: a background Sage service plus a production-usable Windows overlay that watches approved computer use, learns from work patterns, improves memory and the local wiki, creates skills and deterministic workflows, builds apps and widgets, continues coding work while Jason is away, and keeps Jason informed through the overlay, supplemental Command Center surfaces, and Telegram.

The MVP is not a web dashboard. The primary daily interface is a Windows overlay opened and dismissed with a programmable global hotkey, similar in spirit to Xbox Game Bar. Web, TUI, CLI, and Telegram surfaces are supplemental control and admin surfaces backed by the same Command Center contract. The product is an always-active autonomy substrate with trustworthy observation, memory, planning, execution, learning, self-improvement, monitoring, and recovery.

The MVP combines:

1. SageOS Supervisor: an always-on gateway-resident service that owns the background event loop, task scheduler, policy checks, pause/resume state, and autonomous task lifecycle.
2. Windows Overlay Shell: the primary local inspect-and-steer UI for live status, plans, memory, learning, tasks, approvals, automations, diagnostics, audit, app/widget surfaces, and direct interruption.
3. Command Center Contract and Supplemental Surfaces: shared status/control APIs rendered by CLI, TUI, web control UI, and Telegram for admin, debugging, remote review, and fallback use.
4. Ambient Copilot: the observer and recommender layer that watches approved context, recalls memory, proposes or starts work, and records outcomes.
5. Autonomous Workforce: background worker agents that can run coding tasks, workflow implementation, memory/wiki improvements, skill creation, app/widget generation, diagnostics, and maintenance while Jason is away.
6. Continuity and Learning Substrate: Sage Memory, transcript ingest, activity events, queue replay, provenance, skill/workflow library, evaluations, and local wiki rendering.
7. Notification and Control Channel: Telegram updates, digests, approval prompts where needed, pause/stop commands, and task result reports.

SageOS is not a separate public product for this MVP. It is the local daily-use layer that lets Jason delegate broad responsibility to Sage while still being able to see what it is doing, why it is doing it, what it changed, what it learned, and how to stop or roll back.

## Vision Clarification

Jason's clarified vision is stronger than the previous MVP framing:

- SageOS should run all the time as a background service.
- SageOS should actively watch computer use, not only wait for explicit prompts.
- SageOS should learn job and work workflows from observation.
- SageOS should improve Sage Memory and the local wiki automatically.
- SageOS should create new skills, deterministic workflows, and automations from repeated tasks.
- SageOS should build apps and widgets when it observes a need.
- SageOS should continue coding projects while Jason is away or asleep.
- SageOS should be operated primarily through a Windows overlay, not a browser dashboard.
- The overlay should open by programmable global hotkey, default to a full-screen translucent Command Deck, and optionally start as a compact HUD that expands to the full overlay.
- The overlay should support pass-through/pinned widgets so Jason can keep selected SageOS status or controls visible while using the underlying Windows app.
- SageOS should notify Jason via Telegram, but should not require constant input.
- SageOS should have broad delegated autonomy, constrained by explicit policy, observability, verification, and rollback rather than constant permission prompts.

This revision treats the Windows overlay as the primary trust layer and the Command Center contract as the shared control plane behind it. The MVP should ship the smallest complete version of always-on supervised autonomy, then grow toward freer autonomous operation through explicit policy tiers.

## Review of ChatGPT Pro Revision

The ChatGPT Pro revision is useful but too conservative for this clarified vision.

What it gets right:

- The current repo should remain the substrate. Do not restart memory, sessions, channels, CLI/TUI/web, or gateway architecture.
- Sage Memory should remain canonical, with Obsidian as a rendered review surface rather than the write target for normal operation.
- The shared Command Center status contract is the right first control plane.
- The Windows overlay is the right primary user interface for daily operation.
- The shared status contract and CLI status command are the right first implementation brick.
- Approval, provenance, diagnostics, queue replay, and bounded suggestions are necessary for trust.
- Jumping straight to unrestricted Windows automation without observability would be brittle and unsafe.

What it gets wrong or underspecifies:

- It frames the MVP as mostly inspect-and-suggest, while Jason wants an always-on background worker that actually does useful work while unattended.
- It makes autonomy sound like only post-MVP. In this spec, autonomy exists in the MVP, but starts with scoped work classes, policy tiers, dry runs, verification, audit, and rollback.
- It underweights the autonomous workforce: coding tasks, skill creation, workflow compilation, memory/wiki maintenance, and app/widget generation need first-class task models.
- It does not specify a durable supervisor loop, event log, task queue, run budgets, idle/night schedules, or Telegram update protocol.
- It does not distinguish one-time policy delegation from per-action approval. Jason should be able to pre-authorize classes of work and let Sage operate without frequent interruption.

Bottom line: keep ChatGPT Pro's shared Command Center contract, but upgrade the MVP from "bounded local continuity dashboard" to "always-on supervised autonomy kernel with a Windows overlay as the main interface."

## Research Findings

This design is informed by repo audit plus agent and product research.

### Academic and engineering research

- ReAct shows that useful agents interleave reasoning, tool action, and observation: https://arxiv.org/abs/2210.03629
- Toolformer shows models can learn tool-use patterns, but production systems still need explicit typed tools and evaluation: https://arxiv.org/abs/2302.04761
- Reflexion shows durable self-feedback can improve future task attempts without weight updates: https://arxiv.org/abs/2303.11366
- Voyager shows long-running agents can improve through a curriculum plus a reusable executable skill library: https://arxiv.org/abs/2305.16291
- Generative Agents shows long-running behavior needs memory streams, retrieval, reflection, and planning: https://arxiv.org/abs/2304.03442
- MemGPT frames LLM agents as operating-system-like processes that manage limited context plus external memory: https://arxiv.org/abs/2310.08560
- WebArena and OSWorld show web/desktop computer-use agents are promising but brittle in realistic long-horizon tasks: https://arxiv.org/abs/2307.13854 and https://arxiv.org/abs/2404.07972
- SWE-agent shows agent-computer interface design matters greatly for coding agents: https://arxiv.org/abs/2405.15793
- AutoGen, LangGraph, Semantic Kernel, CrewAI, OpenHands, and related systems show production agent workflows need explicit state, roles, tool budgets, termination, observability, and retry logic.
- NIST AI RMF and OWASP LLM Top 10 highlight risks around excessive agency, prompt injection, data leakage, tool misuse, credential misuse, and unclear accountability: https://www.nist.gov/itl/ai-risk-management-framework and https://owasp.org/www-project-top-10-for-large-language-model-applications/

### Product and market research

- Limitless/Rewind, Microsoft Recall, and Apple Intelligence show strong user demand for searchable personal memory and local personal context, but also intense privacy concerns.
- Microsoft Recall's revised design emphasizes opt-in capture, Windows Hello, encryption, pause/delete controls, app/site filters, private browsing exclusions, sensitive-info filtering, and storage thresholds: https://support.microsoft.com/en-us/windows/retrace-your-steps-with-recall-aa03f8a0-a78b-4b3e-b0a1-2eb8ac48701c and https://learn.microsoft.com/en-us/windows/client-management/manage-recall
- Apple Private Cloud Compute emphasizes on-device processing, request-scoped cloud processing, no storage, and verifiability: https://security.apple.com/blog/private-cloud-compute/
- Lindy and Zapier Agents market unattended work across apps, but highlight permissions, logs, approvals, monitoring, and app-scoped integrations: https://www.lindy.ai/ and https://zapier.com/agents
- Adept ACT-1, MultiOn, Rabbit r1, OpenAI Operator, and Anthropic computer-use work point toward cross-app action, but all reveal brittleness and the need for clear user handoff and verification.
- HN, Reddit, The Verge, Ars Technica, and TechRadar discussions around Recall/Rewind show that users fear always-on capture becoming a searchable copy of secrets, a malware target, an employer/legal liability, or a feature re-enabled by updates.

### Design implications

- Build an event-driven agent OS, not a monolithic chatbot.
- Separate observation, memory, planning, policy, execution, verification, reflection, and notification.
- Prefer structured APIs and repo-aware tooling over GUI automation when available.
- Use GUI/computer-use automation as a later fallback with sandboxing, screenshot/accessibility logs, and verification.
- Store raw observations separately from OCR, summaries, embeddings, skills, and workflows, each with retention and deletion controls.
- Treat all observed content from web pages, email, docs, screenshots, terminal output, and files as untrusted data that cannot change policies or permissions.
- Give Jason broad one-time delegation controls, but never let Sage silently grant itself new powers, change its own safety policy, expose secrets, or erase audit trails.

## Current Repo Grounding

The Sage repo already contains much of the substrate needed for this MVP.

### Always-on host

Relevant files:

- `src/gateway/server.ts`
- `src/gateway/server-startup.ts`
- `src/gateway/config-reload.ts`
- `src/daemon/service.ts`
- `src/daemon/schtasks.ts`
- `src/cli/daemon-cli.ts`

Implications:

- SageOS should run inside the gateway lifecycle first, not as a separate app family.
- Windows Task Scheduler support can install the gateway/SageOS service for always-on behavior.
- Config reload should hot-restart the SageOS supervisor when `sageos.*` config changes.
- Foreground app observation may require an interactive user session, so the spec must distinguish headless service work from desktop-session observation.

### Scheduled and background work

Relevant files:

- `src/cron/service.ts`
- `src/cron/types.ts`
- `src/cron/isolated-agent/run.ts`
- `src/gateway/server-methods/cron.ts`
- `src/cli/cron-cli.ts`

Implications:

- Cron can support periodic memory consolidation, queue replay, nightly coding, daily digests, and health checks.
- The SageOS Supervisor should combine event-driven triggers with scheduled and idle-window jobs.

### Agent workers and coding

Relevant files:

- `src/agents/tools/sessions-spawn-tool.ts`
- `src/agents/subagent-registry.ts`
- `src/agents/sage-tools.ts`
- `src/agents/tool-policy.ts`
- `src/agents/bash-tools.exec.ts`
- `src/agents/apply-patch.ts`
- `src/agents/cli-backends.ts`
- `src/agents/claude-cli-runner.ts`

Implications:

- SageOS can use subagent/session spawning as its autonomous workforce substrate.
- Coding tasks should run in explicit SageOS task sessions with scoped tool profiles, budgets, and result announcements.
- The code path already has file, terminal, patch, and external coding-agent support that can be wrapped in safer task policies.

### Memory and learning

Relevant files:

- `src/memory/sage-memory-manager.ts`
- `src/memory/sage-memory-auto-capture.ts`
- `src/memory/sage-memory-capture-queue.ts`
- `src/memory/sage-memory-session-capture.ts`
- `src/learning/activity-queue.ts`
- `src/learning/events.ts`
- `src/learning/session-source.ts`
- `src/learning/browser-source.ts`
- `src/learning/app-focus.ts`
- `src/learning/agent-review.ts`
- `src/learning/skill-manager.ts`
- `src/agents/tools/learning-tools.ts`

Implications:

- Sage Memory should remain the canonical memory backend.
- Learning queues, skill management, browser/session learning events, and app-focus capture already exist and should feed SageOS.
- `app-focus.ts` is a seed for Windows foreground app observation but is not full screen capture or desktop control.

### Browser and computer-use substrate

Relevant files:

- `src/agents/tools/browser-tool.ts`
- `src/browser/bridge-server.ts`
- `src/browser/routes/agent.snapshot.ts`
- `src/browser/routes/agent.act.ts`
- `src/browser/routes/agent.debug.ts`
- `src/browser/cdp.ts`
- `src/config/types.browser.ts`

Implications:

- Browser observation and action can be part of MVP, but should be opt-in and policy-scoped.
- Full desktop automation should be a later phase with a dedicated computer-use service.

### Approvals and confirmations

Relevant files:

- `src/gateway/exec-approval-manager.ts`
- `src/gateway/server-methods/exec-approval.ts`
- `src/gateway/server-methods/exec-approvals.ts`
- `src/security/confirmation.ts`
- `src/config/types.approvals.ts`
- `src/config/types.confirmation.ts`
- `src/config/types.guardrails.ts`

Implications:

- SageOS should extend existing approval and confirmation infrastructure rather than invent a parallel system.
- Autonomy should be controlled by policy tiers and pre-authorized scopes, not endless confirmation prompts.

### Telegram and control surfaces

Relevant files:

- `src/telegram/monitor.ts`
- `src/telegram/send.ts`
- `src/telegram/bot.ts`
- `src/telegram/accounts.ts`
- `src/telegram/targets.ts`
- `src/channels/registry.ts`
- `src/gateway/control-ui.ts`
- `src/gateway/server-http.ts`
- `src/gateway/server-chat.ts`

Implications:

- Telegram is suitable for updates, digests, approvals, pause/resume, task summaries, and exception alerts.
- Command Center can start in CLI/TUI, then move into gateway control UI and native app surfaces.

## Product Definition

SageOS MVP is an always-on, private-first, local agent service that can autonomously observe, learn, plan, act, verify, and improve itself within explicit delegated policy.

It should feel like:

- A local chief-of-staff agent watching the workday and keeping momentum.
- A memory steward that improves recall, wiki quality, project continuity, and learning loops.
- A workflow engineer that notices repeated work and converts it into deterministic scripts, skills, cron jobs, or applets.
- A coding coworker that advances projects while Jason is away, using branches, tests, summaries, and rollbacks.
- A personal toolsmith that builds widgets, dashboards, and small apps from observed needs.
- A control tower that makes autonomous work monitorable, interruptible, explainable, and auditable.

## MVP Definition

The MVP is complete when SageOS can run continuously as a local service and answer these questions without repo spelunking:

1. What is SageOS doing right now?
2. What has SageOS observed recently, and what did it learn?
3. What does SageOS know about my current work, and where did that knowledge come from?
4. What changed since I last checked?
5. What work has SageOS started, completed, failed, paused, or queued?
6. What workflows, skills, automations, apps, or widgets has SageOS proposed or created?
7. What coding tasks did SageOS advance while I was away, and what tests prove the work?
8. What memory/wiki improvements did SageOS make or propose?
9. What needs my attention, approval, or policy decision?
10. Is observation, memory, learning, automation, coding, and notification healthy?
11. What exact repair action should happen when something fails?
12. How do I pause, stop, roll back, or narrow SageOS autonomy?

The MVP is not public beta-ready. It is a private operator system for Jason.

## MVP Visual Experience Gate

The Windows overlay is the primary SageOS product surface, so visual polish is not a post-MVP cosmetic task. The MVP is not complete until the overlay UI, UX, frontend implementation quality, and operator experience reach an enterprise-grade standard suitable for daily production use.

SageOS should adopt a Sage-specific version of PeakHQ's Vitreus/Vitreous Liquor design language rather than copying PeakHQ branding directly. The authoritative reference is `C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\PEAKHQ_DESIGN_LANGUAGE.md`. Portable design principles include:

- Neutral charcoal and cool platinum surfaces, not a one-note blue/purple/cream theme.
- Layered glass surfaces with restrained transparency, adaptive blur, rim highlights, and clear elevation levels.
- Crisp borders, shadows, and status color accents that preserve contrast over arbitrary desktop backgrounds.
- Desktop-first information density with scan-friendly tables, rows, badges, segmented controls, icon buttons, and predictable navigation.
- A static depth pattern or equivalent texture only where it improves legibility and spatial orientation.
- Spring-calibrated motion for surface transitions, hover/press states, focus changes, and command execution feedback.
- Magnetic or spotlight interactions only where they improve targeting and never where they reduce precision.
- WCAG 2.2 AA contrast, visible focus, complete keyboard paths, reduced-motion support, and no text overlap at supported viewport sizes.
- Verified GUI behavior through screenshots, smoke flows, accessibility checks, and manual Windows overlay checks, not just unit tests.

SageOS-specific adaptation:

- Keep SageOS quieter and more operational than PeakHQ. It should feel like a command surface for active autonomy, not a marketing dashboard.
- Use blue/cyan for normal primary actions, green for completed/safe status, amber for waiting or warning, and red only for urgent, destructive, incident, or stop states.
- Every visible control must map to a real capability or a disabled state with clear reason. No ornamental panels that imply functionality without backing behavior.
- Pinned widgets and HUD surfaces must remain legible above any underlying Windows app and must not block normal app use outside active controls.
- The web Command Center may share tokens and components, but the release gate applies first to the native Windows overlay.

## Non-Goals

- A new standalone OS, window manager, or desktop environment.
- A public automation marketplace.
- A new memory system replacing Sage Memory.
- Direct writes to the Obsidian vault during normal operation. Sage Memory remains canonical; Obsidian is rendered review output.
- Silent permission escalation. SageOS may operate autonomously inside delegated policy, but may not grant itself new categories of access.
- Silent credential, safety, approval, or audit-policy changes.
- Silent external communication to people, production systems, financial systems, legal/medical systems, or public services unless Jason has explicitly pre-authorized that exact workflow class.
- Full OS-wide screen/audio capture by default. Those require explicit source-level enablement.
- Perfect autonomous correctness. The MVP must verify, report, and roll back rather than pretend agents never fail.

## Product Principles

1. Always on, but always inspectable.
2. Broad autonomy through explicit delegation, not invisible power grabs.
3. Evidence over vibes: every memory-backed claim, suggestion, workflow, or task result cites sources.
4. Structured APIs before GUI automation; GUI automation only with sandboxing and verification.
5. Local-first and private-first; external effects are policy-scoped and logged.
6. Skills are code or procedures with provenance, tests, and rollback, not magic prompt residue.
7. Workflows should become deterministic when possible.
8. Every autonomous task needs a plan, budget, scope, logs, verification, and final report.
9. Every watcher needs a pause switch, denylist, retention policy, and redaction path.
10. Memory is an operating system component: typed, scoped, source-aware, and correctable.
11. Learning must improve the system without corrupting it.
12. Telegram updates should be useful, batched, and actionable, not spam.
13. The user can say "free reign" for a scope, but SageOS still cannot self-modify its own safety boundaries or erase accountability.

## Autonomy Model

SageOS should use delegated autonomy tiers. Jason can choose the global mode and per-scope overrides.

| Tier | Name              | SageOS may do                                             | Examples                                                                              | Default for MVP                |
| ---- | ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 0    | Off               | Nothing except serve status                               | Disabled service                                                                      | Allowed                        |
| 1    | Observe           | Watch approved sources and capture memory                 | app focus, Sage sessions, browser observations                                        | Default for new sources        |
| 2    | Suggest           | Create suggestions, plans, drafts, and skill candidates   | propose workflow, draft automation                                                    | Default for risky new domains  |
| 3    | Prepare           | Create local artifacts without enabling them              | scripts, widget drafts, branch changes                                                | Allowed in approved workspaces |
| 4    | Execute scoped    | Run reversible low-risk work inside approved scopes       | queue replay, local wiki export, tests, non-destructive repo edits                    | Target MVP autonomy            |
| 5    | Execute delegated | Run pre-approved playbooks unattended with notification   | nightly coding in allowed repos, memory consolidation, deterministic work automations | Target after trust proof       |
| 6    | Full operator     | Broad autonomy across computer use with active monitoring | cross-app task completion                                                             | Post-MVP, opt-in only          |

Tier 5 and Tier 6 do not mean no safety. They mean Jason has pre-authorized a class of work. SageOS still enforces budgets, deny rules, audit, verification, and stop controls.

## Action Risk Policy

| Risk class                  | Examples                                               | Autonomous behavior                                                                    |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Read local low sensitivity  | status, queue count, git diff, tests                   | Allowed in approved scopes                                                             |
| Read local private context  | memory nodes, session transcript, window titles        | Allowed only for enabled sources and scoped tasks                                      |
| Local reversible write      | draft doc, branch edit, generated widget, local script | Allowed at Tier 3 or higher with audit and diff                                        |
| Local destructive write     | delete files, clear queues, reset sessions             | Requires explicit workflow policy or approval                                          |
| External read               | web docs, GitHub metadata, package docs                | Allowed if task scope permits                                                          |
| External write              | Telegram, email, GitHub issue/PR comment, calendar     | Requires explicit pre-authorized workflow or approval                                  |
| Production effect           | deploy, restart production, mutate cloud resources     | Requires workflow-specific policy, dry run, rollback plan, and notification            |
| Credential or policy change | tokens, allowlists, safety config                      | Approval required; never self-authorized                                               |
| Self-modification           | prompts, skills, workflows, policies                   | Skills/workflows can be drafted and tested; safety policies cannot be silently changed |

## Core Use Cases

### Always-on daily observation

SageOS runs with the gateway. It samples approved sources, records activity events, detects work context, and maintains a fresh current-work model.

Initial approved sources:

- Sage sessions.
- Agent tool use.
- Browser observations made through Sage tools.
- Browser actions through the browser bridge, if enabled.
- Windows active app focus metadata.
- Heartbeat, memory flush, compaction, capture, queue, and learning events.
- Coding workspace state for explicitly allowed repos.

Later sources:

- Screenshots and OCR.
- Accessibility tree.
- Clipboard.
- Audio and meetings.
- Email/calendar/tickets.
- IDE integration.
- Filesystem watchers.

### Memory and wiki improvement

SageOS continuously improves memory quality:

- Capture transcripts and activity events.
- Replay failed capture and learning queues.
- Detect stale, duplicate, or low-quality memories.
- Consolidate episodic logs into semantic project facts.
- Generate wiki summaries through Sage Memory export rather than direct vault writes.
- Create review cards for ambiguous or high-impact memory changes.
- Track memory coverage by project, task, person, decision, and workflow.

### Workflow discovery and automation

SageOS watches repeated work patterns and turns them into automation candidates:

1. Observe repeated task pattern.
2. Cluster similar events by source, app, project, tool sequence, and outcome.
3. Ask whether the task can be deterministic.
4. Draft a workflow spec with inputs, outputs, tools, permissions, tests, and rollback.
5. Build script/skill/cron/job/template in a sandbox.
6. Run evals or dry-run against captured examples.
7. Promote to enabled automation only if policy allows.
8. Monitor future runs and improve from failures.

### Skill creation and self-improvement

SageOS creates skills when it observes repeatable procedures or after successful complex work:

- Draft skill with trigger conditions, steps, commands, pitfalls, verification, and examples.
- Attach provenance to source sessions and tasks.
- Add tests/evals where possible.
- Mark status as draft, active, deprecated, or retired.
- Promote automatically only for scopes where Jason has allowed skill auto-apply.
- Never silently change safety policy, approval thresholds, credential access, or audit behavior.

### App and widget generation

SageOS builds apps/widgets when it observes a recurring need:

- Dashboard for recurring operational state.
- One-click tool for job workflows.
- Local web widget for memory/project summaries.
- CLI/TUI shortcut for repeated commands.
- Canvas/A2UI artifact for richer UI.
- Small scripts or local services for deterministic tasks.

Generated apps/widgets must include:

- Purpose statement.
- Inputs and data sensitivity.
- Required permissions.
- Source provenance.
- Test or manual verification.
- Preview link or command.
- Install/enable policy.
- Rollback/removal command.

### Night Shift coding

SageOS continues coding work while Jason is away or asleep.

Rules:

- Only in allowed repos/workspaces.
- Check git status before work.
- Do not discard unrelated changes.
- Prefer branch or isolated task session; worktree use requires explicit approval in this repo.
- Plan before editing.
- Use patch/file tools and scoped terminal commands.
- Run targeted tests and relevant checks.
- Capture diff, test output, and blockers.
- Notify Telegram at start, major blockers, and completion.
- Never merge, release, publish, deploy, rotate secrets, or modify protected branches unless an explicit workflow allows it.

### Telegram monitoring

Telegram should support:

- Startup and shutdown notices.
- Daily morning briefing.
- Night Shift start and completion reports.
- Urgent incidents.
- Approval prompts for non-delegated actions.
- Pause, resume, stop, status, and task list commands.
- Compact diffs and links/paths to full logs.

Default Telegram policy:

- Batch low-priority observations into digests.
- Send immediate messages for failures, blocked tasks, risk escalation, approvals, and completed unattended work.
- Do not send raw private content unless the Telegram target is explicitly allowed for that sensitivity.

## Chosen Architecture

### High-level components

```txt
Gateway / daemon service
  SageOS Supervisor
    Event bus and durable event log
    Observation manager
    Memory and learning manager
    Task planner
    Policy and capability gate
    Autonomous task queue
    Worker session orchestrator
    Workflow and skill compiler
    App/widget builder
    Verification and evaluation harness
    Notification manager
    Command Center status model
```

### SageOS Supervisor

The supervisor is the gateway-resident always-on coordinator.

Responsibilities:

- Start and stop with gateway lifecycle.
- Maintain enabled, paused, active, idle, and degraded state.
- Poll or subscribe to approved observation sources.
- Normalize observations into events.
- Trigger memory capture and learning queue updates.
- Decide when to spawn autonomous work.
- Enforce policy before tasks and tool calls.
- Track active, queued, completed, failed, blocked, and cancelled tasks.
- Send Telegram updates.
- Expose status through CLI, TUI, gateway RPC, and Command Center.
- Hot-reload config where safe.

### Durable event log

SageOS needs an append-only local event stream separate from memory.

Event types:

- observation
- memory_capture
- learning_event
- recall
- reflection
- suggestion
- task_planned
- task_started
- tool_call
- approval_requested
- approval_resolved
- verification
- task_completed
- task_failed
- workflow_candidate
- skill_mutation
- app_generated
- notification_sent
- incident
- repair
- policy_change

Each event includes:

- ID and correlation ID.
- Timestamp.
- Actor and agent ID.
- Source and workspace.
- Sensitivity.
- Policy scope.
- Redaction state.
- Linked memory/session/queue/task IDs.
- Summary safe for status surfaces.
- Optional local path to full detail.

### Observation manager

Observation sources are pluggable, source-scoped, and denylist-aware.

Source contract:

```ts
type SageOsObservationSource = {
  id: string;
  label: string;
  enabled: boolean;
  sensitivityDefault: "public" | "normal" | "private" | "secret";
  intervalMs?: number;
  lastObservedAt?: string;
  lastError?: string;
  collect(): Promise<SageOsObservation[]>;
};
```

Initial sources:

- Sage sessions.
- Agent tool usage.
- Browser learning events.
- Windows app focus.
- Capture queue changes.
- Learning queue changes.
- Cron/task results.
- Git workspace state for allowed repos.

Privacy rules:

- Source-level opt-in.
- Per-app and per-window denylist.
- Secret patterns discard raw observation.
- Raw screen/audio disabled by default.
- Private/incognito browser windows excluded where detectable.
- Storage quotas and retention by data class.

### Memory OS

SageOS should treat memory as layered:

- Working memory: current task state, active project, recent observations.
- Episodic memory: timestamped events, sessions, tool calls, decisions, outcomes.
- Semantic memory: stable project facts, preferences, people, decisions, conventions.
- Procedural memory: skills, scripts, workflows, playbooks, app/widget templates.
- Archival memory: raw transcripts, logs, screenshots, OCR, exports, and evidence.

Sage Memory remains canonical for durable recall. The local event log remains canonical for execution audit. Obsidian remains a rendered review/wiki surface.

Memory writes require:

- Source.
- Timestamp.
- Sensitivity.
- Confidence.
- Namespace/project.
- Evidence reference.
- Retention class.
- Deletion path.

### Planner and task queue

Task sources:

- User request.
- Schedule.
- Idle/night window.
- Repeated workflow detection.
- Memory health issue.
- Learning review.
- Coding backlog.
- Failed queue replay.
- App/widget opportunity.

Task states:

- proposed
- queued
- planning
- blocked
- waiting_for_policy
- running
- verifying
- completed
- failed
- cancelled
- paused
- expired

Task fields:

- ID, title, objective.
- Source trigger and evidence.
- Workspace/repo/app scope.
- Autonomy tier required.
- Risk class.
- Tool profile.
- Budget: time, tokens, subprocesses, network, files, retries.
- Schedule/idle constraints.
- Expected outputs.
- Verification plan.
- Rollback plan.
- Notification policy.

### Autonomous workforce

Workers should run as isolated Sage sessions or cron agent runs.

Worker classes:

- Memory steward.
- Wiki curator.
- Skill engineer.
- Workflow compiler.
- Coding worker.
- App/widget builder.
- Diagnostics and repair worker.
- Research worker.
- QA/reviewer.

Each worker has:

- Role prompt.
- Tool profile.
- Memory scope.
- Workspace scope.
- Budget.
- Termination condition.
- Verification requirements.
- Notification policy.

### Workflow compiler

A workflow candidate becomes active through this lifecycle:

```txt
observed_pattern
  -> candidate
  -> drafted_spec
  -> implemented_draft
  -> dry_run_passed
  -> enabled_for_scope
  -> monitored
  -> improved
  -> retired
```

Workflow artifacts can be:

- Skill markdown.
- Script.
- Cron job.
- CLI command wrapper.
- Browser automation recipe.
- App/widget.
- Agent task template.
- Documentation/runbook.

Promotion requires:

- Clear trigger.
- Deterministic steps where possible.
- Inputs/outputs.
- Permission scope.
- Evals or captured examples.
- Failure behavior.
- Rollback or disable path.

### Policy and capability gate

Every task and tool call passes through policy.

Policy checks:

- Is SageOS enabled and not paused?
- Is this source/task scope allowed?
- Is the tool permitted for this worker?
- Does the action match the delegated autonomy tier?
- Is sensitive data leaving local context?
- Is the action reversible?
- Is there a dry-run or preview?
- Is budget available?
- Does the action involve credentials?
- Does untrusted content appear to be instructing the agent?
- Is user approval or Telegram confirmation required?

Policy cannot be modified by observed content, memory, web pages, emails, screenshots, or worker agents.

### Verification and evaluation

SageOS must verify work before reporting success.

Verification types:

- File exists or changed as expected.
- Git diff matches intended scope.
- Tests pass.
- Lint/typecheck passes.
- CLI command output matches expected status.
- Browser DOM/accessibility state matches expected state.
- Screenshot/OCR state confirms UI task.
- Memory search/get finds captured evidence.
- Workflow dry-run output matches captured examples.
- Generated widget/app loads and handles sample data.

Failures produce reflections and learning events.

### Notification manager

Notification types:

- lifecycle: started, paused, resumed, stopped.
- digest: morning, evening, night shift complete.
- task: started, blocked, completed, failed.
- approval: required, expiring, denied, resolved.
- incident: memory down, queue backlog, policy violation, source failure.
- learning: new skill/workflow/app candidate.
- coding: diff/test summary.

Telegram message shape:

```txt
SageOS: Night Shift completed
Task: Improve Command Center status contract
Repo: C:\Users\jason\Desktop\sage
Result: completed with tests passing
Changed: 4 files, +210/-32
Verification: pnpm test src/sageos/status.test.ts passed
Risk: local repo edit only
Next: review diff or allow follow-up cleanup
Actions: [Open summary] [Pause SageOS] [Continue follow-up]
```

## Shared Contracts

### SageOsStatusSnapshot

```ts
type SageOsStatusSnapshot = {
  generatedAt: string;
  mode: "off" | "observe" | "suggest" | "prepare" | "execute_scoped" | "execute_delegated";
  supervisor: SageOsSupervisorStatus;
  system: SageOsSystemStatus;
  observations: SageOsObservationStatus;
  memory: SageOsMemoryStatus;
  learning: SageOsLearningStatus;
  tasks: SageOsTaskStatus;
  workflows: SageOsWorkflowStatus;
  skills: SageOsSkillStatus;
  apps: SageOsAppWidgetStatus;
  coding: SageOsCodingStatus;
  approvals: SageOsApprovalStatus;
  notifications: SageOsNotificationStatus;
  incidents: SageOsIncident[];
  audit: SageOsAuditSummary;
};
```

### SageOsTask

```ts
type SageOsTask = {
  id: string;
  title: string;
  objective: string;
  state:
    | "proposed"
    | "queued"
    | "planning"
    | "blocked"
    | "waiting_for_policy"
    | "running"
    | "verifying"
    | "completed"
    | "failed"
    | "cancelled"
    | "paused"
    | "expired";
  createdAt: string;
  updatedAt: string;
  trigger: SageOsEvidenceRef;
  workspace?: string;
  repo?: string;
  autonomyTier: number;
  riskClass: string;
  toolProfile: string;
  budget: SageOsTaskBudget;
  plan?: string;
  verification?: SageOsVerificationPlan;
  rollback?: SageOsRollbackPlan;
  evidenceRefs: SageOsEvidenceRef[];
  result?: SageOsTaskResult;
};
```

### SageOsWorkflow

```ts
type SageOsWorkflow = {
  id: string;
  name: string;
  state:
    | "candidate"
    | "drafted_spec"
    | "implemented_draft"
    | "dry_run_passed"
    | "enabled"
    | "paused"
    | "failed"
    | "retired";
  observedPattern: string;
  sourceEvents: SageOsEvidenceRef[];
  inputs: SageOsWorkflowInput[];
  outputs: SageOsWorkflowOutput[];
  permissions: SageOsPermissionScope[];
  implementationRefs: SageOsEvidenceRef[];
  evalRefs: SageOsEvidenceRef[];
  lastRun?: SageOsWorkflowRunSummary;
};
```

### SageOsSkillRecord

```ts
type SageOsSkillRecord = {
  name: string;
  state: "draft" | "active" | "deprecated" | "retired";
  createdAt: string;
  updatedAt: string;
  provenance: SageOsEvidenceRef[];
  triggerConditions: string[];
  tests: SageOsVerificationRef[];
  allowedScopes: SageOsPermissionScope[];
  rollbackRef?: SageOsEvidenceRef;
};
```

### SageOsIncident

```ts
type SageOsIncident = {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  affectedCapability: string;
  title: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastError?: string;
  repairAction?: SageOsRepairAction;
  autoRepairSafe: boolean;
  verification: string;
};
```

## Primary Windows Overlay And Command Center

SageOS's primary MVP surface is the Windows overlay shell. Command Center is the control-plane contract rendered through that shell and through supplemental CLI, TUI, web, Telegram, and future native surfaces.

The overlay should feel closer to Xbox Game Bar than to a browser dashboard: it appears over the current Windows context, can be dismissed quickly, and can leave pinned status or controls visible while Jason continues working.

Overlay launch and windowing:

1. A programmable global Windows hotkey opens and closes SageOS.
2. The default open state is a full-screen translucent overlay.
3. A configurable compact HUD mode can open first and expand to the full overlay.
4. The overlay must work in the active Windows user session so it can coexist with foreground app observation.
5. The overlay should expose a tray affordance for status and settings, but the tray is not the primary UI.

Overlay interaction model:

1. Mouse-first operation for the MVP.
2. Keyboard navigation and shortcuts as the second-priority interaction layer.
3. Voice entry and voice commands as a third-priority layer once the mouse and keyboard flows are stable.
4. Modal mode for focused review, approvals, and editing.
5. Pass-through mode for pinned widgets and status surfaces so underlying apps remain usable.

Overlay core modes:

1. Command Deck: the home view with supervisor state, current operations, approvals, incidents, next scheduled work, and pause/stop controls.
2. Universal Launcher: plain-language command input plus quick actions for employees, tasks, workflows, memory, coding, apps, and repair actions.
3. Agent Workspace: inspect one employee, task, run, approval, incident, repo, workflow, skill, or app/widget with logs, traces, artifacts, diffs, and controls.
4. Compact HUD: small always-on-top status view with running task count, pending approvals, urgent incidents, and quick expand/pause controls.
5. Edge Rail: collapsed persistent strip with SageOS health, approval badge, incident badge, and active-operation indicator.
6. Pinned Widgets: small pass-through-capable widgets for active operations, approvals, memory queue, Night Shift report, system health, and app/widget previews.

Supplemental surfaces:

1. CLI status and JSON contract.
2. TUI view.
3. Gateway web control UI panel.
4. Telegram control channel.
5. macOS and mobile panels where they fit the same contract.

CLI commands:

```bash
sage os status
sage os status --json
sage os pause
sage os resume
sage os tasks
sage os tasks inspect <id>
sage os tasks cancel <id>
sage os memory
sage os learning
sage os workflows
sage os skills
sage os apps
sage os coding
sage os approvals
sage os queues
sage os doctor
```

Command Center sections, rendered first in the overlay and reused by supplemental surfaces:

- Supervisor: enabled, paused, mode, uptime, loop health, last tick, next tick.
- Current activity: active tasks, current observations, running workers.
- Memory: backend, namespace, health, capture queue, learning queue, search/get/export/vault proof.
- Learning: queued events, reviews, skill mutations, workflow candidates.
- Workflows: candidates, drafts, dry runs, enabled automations, recent runs.
- Coding: allowed repos, running coding workers, diffs, tests, blockers.
- Apps/widgets: generated drafts, previews, active widgets, failures.
- Notifications: Telegram target, last sent, failures, digest schedule.
- Policy: current autonomy mode, allowed scopes, blocked actions.
- Incidents: severity, cause, repair action.
- Audit: recent events and full log paths.

Overlay MVP acceptance:

- Jason can open and close SageOS with a configurable global Windows hotkey.
- The default full overlay shows Command Deck, Universal Launcher, and Agent Workspace entry points without requiring a browser.
- Compact HUD mode can be configured as the first open state and can expand to full overlay.
- Edge Rail persists as the collapsed state with health, approval, incident, and active-operation indicators.
- Pinned widgets can stay visible while pass-through mode lets Jason use the app underneath.
- Pause, resume, stop, emergency stop, approval, task, incident, and repair controls are available from the overlay.
- The overlay consumes the same SageOS status/control contract as CLI, TUI, web, and Telegram.

## Ambient Copilot

Ambient Copilot is the observation and synthesis layer.

Loop:

1. Collect observations from enabled sources.
2. Redact or discard sensitive observations.
3. Normalize to activity events.
4. Update working memory.
5. Capture durable evidence to Sage Memory when healthy.
6. Recall relevant memory when context changes.
7. Detect suggestions, workflows, skills, app/widget opportunities, and coding tasks.
8. Either queue work autonomously or create a review card depending on policy.
9. Capture outcome and reflection.

Ambient output types:

- context update
- suggestion
- workflow candidate
- skill candidate
- app/widget idea
- coding task candidate
- memory repair
- incident
- digest item

## Autonomous Task Classes

### Memory steward tasks

Examples:

- Replay failed captures.
- Run memory doctor.
- Consolidate session into project summary.
- Detect stale or duplicate memory.
- Create wiki export.
- Verify rendered vault note exists.
- Create memory quality report.

Autonomy: Tier 4 by default for non-destructive local work.

### Workflow engineer tasks

Examples:

- Convert repeated Zendesk response drafting into a template workflow.
- Create a CLI helper for repeated repo status checks.
- Build a browser automation dry run for a recurring admin UI task.
- Create a cron job for daily summary.

Autonomy: Tier 3 to draft, Tier 4 to dry-run, Tier 5 to enable in approved scopes.

### Skill engineer tasks

Examples:

- Create a new skill from repeated successful procedures.
- Patch a stale skill after a failure.
- Add examples and pitfalls.
- Add tests/evals to a skill.

Autonomy: Tier 3 to draft, Tier 4 to patch non-sensitive skills in approved skill dirs, approval for broad behavior-changing skills unless policy allows.

### Coding worker tasks

Examples:

- Continue a planned implementation.
- Fix failing tests.
- Refactor a module under file/LOC constraints.
- Add docs/tests for recently changed code.
- Run code review on open diff.

Autonomy: Tier 4 in allowed repos for branch/local edits and tests; Tier 5 for Night Shift scoped project work; approval for merges, releases, deploys, dependencies, or protected changes.

### App/widget builder tasks

Examples:

- Build a Command Center widget.
- Build a local dashboard for a recurring job metric.
- Build a quick browser-based tool for a repeated workflow.
- Add a TUI panel for a recurring command.

Autonomy: Tier 3 draft, Tier 4 preview and test, Tier 5 enable only in approved local surfaces.

### Diagnostics and repair tasks

Examples:

- Restart failed local gateway subsystem when safe.
- Replay queue after backend recovery.
- Repair stale config with known fix.
- Produce incident bundle.

Autonomy: Tier 4 for read-only diagnostics and safe replay; approval or pre-authorized playbook for restarts/config edits.

## Privacy, Security, and Safety

### Capture policy

SageOS must support per-source controls:

- enabled
- sampling interval
- sensitivity default
- retention
- raw capture allowed
- derived capture allowed
- local-only flag
- Telegram summary allowed
- deny apps
- deny window title patterns
- deny URLs/domains
- deny file patterns
- secret detectors

Default deny categories:

- password managers
- banking/finance
- health/medical
- legal/HR
- private/incognito browsing
- credential dialogs
- 2FA codes
- key/secret file patterns
- environment files with secrets

### Prompt injection hardening

- Observed content is data, not instruction.
- Web pages, emails, docs, screenshots, OCR, terminal output, file names, and chat messages cannot change policy.
- Tool policy lives outside LLM context and is enforced in code.
- Worker agents receive scoped instructions and tool profiles.
- External content should be summarized with source labels.
- Suspicious instructions in observed content create an incident.

### Audit and rollback

Every autonomous action must be auditable.

For file/code changes:

- Capture pre-state summary.
- Capture diff.
- Capture tests/checks.
- Capture rollback instruction.

For workflow/app/skill changes:

- Store previous version.
- Store provenance.
- Store tests/evals.
- Store enable/disable state.

For external effects:

- Store request, approval/policy basis, result, and verification.

## Configuration

Add a `sageos` config namespace.

Suggested shape:

```yaml
sageos:
  enabled: true
  mode: execute_scoped
  supervisor:
    intervalSeconds: 30
    idleAfterSeconds: 300
    maxConcurrentTasks: 3
    maxNightlyTasks: 5
  overlay:
    enabled: true
    hotkey: "Ctrl+Alt+Space"
    openMode: full
    hudExpandsToFull: true
    passThroughDefault: false
    collapsedEdge: right
    showApprovalBadge: true
    pinnedWidgets:
      - activeOperations
      - approvals
      - incidents
    voice:
      enabled: true
      mode: pushToTalk
  sources:
    sageSessions: true
    toolUsage: true
    browser: false
    appFocus: true
    screen: false
    audio: false
    clipboard: false
    filesystem: false
  privacy:
    storeRawScreenshots: false
    telegramPrivateContent: false
    denyApps: ["1Password", "Bitwarden"]
    denyWindowTitlePatterns: ["password", "2FA", "bank"]
    secretRedaction: true
  memory:
    autoCapture: true
    replayQueues: true
    consolidate: true
    exportWiki: true
  learning:
    enabled: true
    skillAutoApply: draft-only
    workflowAutoEnable: false
  coding:
    enabled: true
    allowedRepos:
      - "C:\\Users\\jason\\Desktop\\sage"
    requireCleanGit: false
    allowDependencyChanges: false
    allowRelease: false
  notifications:
    telegram:
      enabled: true
      target: "telegram"
      digestSchedule: "0 8 * * *"
      urgentOnlyDuringFocus: true
  policy:
    defaultTier: 4
    requireApprovalForExternalWrites: true
    requireApprovalForProduction: true
    requireApprovalForCredentials: true
    requireApprovalForPolicyChanges: true
```

## Implementation Plan

### Phase 0: Spec and first-brick alignment

Goal: make the repo converge on this always-on SageOS direction without losing the shared Command Center contract or the overlay-first product shape.

Tasks:

1. Keep this file as canonical private MVP design.
2. Add a short implementation tracker under `docs/superpowers/specs/` or `.hermes/plans/` if desired.
3. Use the Command Center status contract as the first implementation brick.
4. Treat the Windows overlay as the primary MVP UI and the web Command Center as supplemental.
5. Avoid new memory backends, direct vault writes, or MCP-first rewrites.

Acceptance:

- Spec clearly represents always-on autonomous SageOS.
- Spec clearly represents the production Windows overlay as the primary MVP interface.
- The first brick remains concrete and repo-compatible.

### Phase 1: Shared contracts and config

Goal: define typed SageOS state before UI or agents depend on it.

Files:

- Create `src/sageos/types.ts`.
- Create `src/sageos/config.ts` or `src/config/types.sageos.ts`.
- Modify `src/config/types.ts`.
- Modify `src/config/zod-schema.ts`.
- Modify `src/gateway/config-reload.ts`.

Tasks:

1. Add `SageOsStatusSnapshot`, `SageOsTask`, `SageOsIncident`, `SageOsWorkflow`, `SageOsSkillRecord`, `SageOsObservation`, and policy types.
2. Add `sageos` config schema with defaults.
3. Add config reload classification for SageOS supervisor hot restart.
4. Add unit tests for config parsing and defaults.

Verification:

- `pnpm test src/config/*sageos*`
- `pnpm build`

### Phase 2: Supervisor skeleton

Goal: start a gateway-resident always-on SageOS loop.

Files:

- Create `src/sageos/supervisor.ts`.
- Create `src/sageos/state-store.ts`.
- Create `src/sageos/event-log.ts`.
- Modify `src/gateway/server-startup.ts` or appropriate gateway lifecycle file.
- Modify `src/gateway/server-close.ts`.

Tasks:

1. Implement start/stop/pause/resume.
2. Persist supervisor state and append-only event log under the Sage state dir.
3. Track loop ticks, errors, active tasks, and incidents.
4. Expose in-memory status collector.
5. Add tests for start, stop, pause, resume, and event persistence.

Verification:

- Unit tests for supervisor lifecycle.
- Gateway starts and stops without orphan timers.

### Phase 3: Command Center CLI and JSON status

Goal: make SageOS visible immediately.

Files:

- Create `src/sageos/status/collect.ts`.
- Create `src/sageos/status/render.ts`.
- Create `src/cli/sageos-cli.ts` or integrate into existing CLI program registration.
- Add tests beside the new modules.

Commands:

```bash
sage os status
sage os status --json
sage os pause
sage os resume
sage os tasks
sage os doctor
```

Tasks:

1. Aggregate gateway, sessions, memory, learning, queues, approvals, cron, notifications, and supervisor status.
2. Render compact human status.
3. Render stable JSON.
4. Include incidents and top repair actions.
5. Add tests for healthy, degraded, paused, and memory-down states.

Verification:

- `sage os status --json` prints parseable JSON.
- Broken memory state still renders useful status.

### Phase 4: Observation MVP

Goal: collect approved local context safely.

Files:

- Create `src/sageos/observations/manager.ts`.
- Create adapters for sessions, tool usage, app focus, browser, queues, and coding workspace state.
- Reuse `src/learning/app-focus.ts`, `src/learning/browser-source.ts`, and `src/learning/session-source.ts`.

Tasks:

1. Implement source registry.
2. Implement source-level config and deny rules.
3. Normalize observations into SageOS events and learning events.
4. Add redaction and secret-skipping.
5. Add tests for denylisted app/window/source.

Verification:

- App focus events appear only when enabled.
- Denylisted sources create redacted skip events.

### Phase 5: Memory and learning steward

Goal: make SageOS improve memory and wiki quality autonomously.

Files:

- Create `src/sageos/memory/steward.ts`.
- Create `src/sageos/learning/steward.ts`.
- Reuse memory and learning queue modules.

Tasks:

1. Replay capture and learning queues when healthy.
2. Run memory doctor on schedule.
3. Capture SageOS events/outcomes to Sage Memory.
4. Generate memory quality incidents.
5. Export wiki on schedule if configured.
6. Create consolidation tasks for sessions/projects.

Verification:

- Queue replay updates status.
- Memory-down state queues work and creates incident.
- Export proof appears in status.

### Phase 6: Autonomous task queue and workers

Goal: let SageOS start and manage scoped background work.

Files:

- Create `src/sageos/tasks/queue.ts`.
- Create `src/sageos/tasks/orchestrator.ts`.
- Create `src/sageos/workers/*.ts`.
- Integrate with `sessions_spawn` or gateway agent methods.

Tasks:

1. Implement durable task queue.
2. Implement task budgets and concurrency limits.
3. Spawn worker sessions with scoped prompts and tool profiles.
4. Capture worker output, logs, result, verification, and reflection.
5. Add cancellation and pause behavior.
6. Add tests for queue state transitions.

Verification:

- A fake worker can run, complete, fail, and be cancelled.
- Budget exhaustion stops task and creates incident.

### Phase 7: Policy and approval integration

Goal: enforce delegated autonomy tiers in code.

Files:

- Create `src/sageos/policy.ts`.
- Integrate with `src/security/confirmation.ts` and `src/agents/tool-policy.ts`.
- Add gateway methods for SageOS approvals if needed.

Tasks:

1. Implement risk classification.
2. Implement autonomy tier checks.
3. Implement pre-authorized scopes.
4. Block self-policy changes without approval.
5. Add tests for external write, production, credential, destructive, and policy-change cases.

Verification:

- Disallowed tool calls are blocked before execution.
- Approved scoped actions run without repeated prompts.

### Phase 8: Telegram notifications and controls

Goal: let Jason monitor and control SageOS remotely.

Files:

- Create `src/sageos/notifications/telegram.ts` or channel-generic notifier.
- Integrate with `src/telegram/send.ts` and channel registry.
- Add command handlers for status/pause/resume/tasks/approve/deny.

Tasks:

1. Send startup, shutdown, task, incident, approval, and digest messages.
2. Implement batching and quiet hours.
3. Add inline actions where channel supports them.
4. Ensure private content redaction by target sensitivity policy.
5. Add tests for notification formatting and redaction.

Verification:

- Telegram receives a redacted task completion report.
- Pause/resume command updates supervisor state.

### Phase 9: Workflow and skill compiler

Goal: turn repeated work into durable automations and skills.

Files:

- Create `src/sageos/workflows/detector.ts`.
- Create `src/sageos/workflows/compiler.ts`.
- Create `src/sageos/skills/steward.ts`.
- Reuse `src/learning/skill-manager.ts`.

Tasks:

1. Cluster repeated observations.
2. Generate workflow candidates with evidence.
3. Draft skill/workflow artifacts.
4. Run dry-runs/evals where possible.
5. Promote or hold based on policy.
6. Capture provenance and rollback.

Verification:

- Repeated fake events produce one workflow candidate.
- Candidate can become a draft skill with provenance.

### Phase 10: Night Shift coding

Goal: autonomously continue coding work in approved repos.

Files:

- Create `src/sageos/coding/night-shift.ts`.
- Create `src/sageos/coding/repo-state.ts`.
- Create `src/sageos/coding/report.ts`.

Tasks:

1. Detect allowed repos and project tasks.
2. Check git status and branch rules.
3. Spawn coding worker sessions with project context.
4. Run tests/checks.
5. Produce diff/test/blocker report.
6. Notify Telegram.

Verification:

- In a fixture repo, Night Shift can make a safe local edit, run test, report diff, and stop.
- Dirty repo policy protects unrelated changes.

### Phase 11: App and widget builder

Goal: build local tools from observed needs.

Files:

- Create `src/sageos/apps/candidates.ts`.
- Create `src/sageos/apps/builder.ts`.
- Integrate with canvas/control UI where appropriate.

Tasks:

1. Detect widget/app opportunities.
2. Draft app spec.
3. Generate local artifact.
4. Run preview/test.
5. Add Command Center card for review/enable.

Verification:

- Fake recurring need creates an app candidate.
- Generated artifact has preview and rollback path.

### Phase 12: Windows overlay, Control UI, and TUI

Goal: make daily monitoring and steering production-usable through the Windows overlay, with web/TUI/CLI as supplemental surfaces.

Files:

- Create `apps/windows-overlay/`.
- Create `src/sageos/overlay-state.ts`.
- Modify `src/sageos/types.ts`.
- Modify `src/config/zod-schema.ts`.
- Modify TUI command registry and screens.
- Modify gateway control UI.
- Add SageOS RPC methods.

Tasks:

1. Add overlay config, hotkey, open mode, compact HUD, collapsed edge, pass-through, and pinned widget state.
2. Add the Windows overlay host with transparent always-on-top windowing, global hotkey toggle, tray affordance, and user-session startup.
3. Add Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, and Pinned Widget surfaces.
4. Add pause/resume/stop/emergency-stop controls.
5. Add task, approval, incident, repair, memory, workflow, skill, coding, app/widget, policy, and audit drill-down.
6. Keep gateway web control UI and TUI rendering the same contract for admin/debug and fallback use.

Verification:

- Overlay opens/closes through the configured Windows hotkey.
- Overlay renders the same JSON status contract as CLI, TUI, and web.
- Pass-through pinned widgets leave the underlying app usable.
- Web and TUI remain useful supplemental surfaces.

## Acceptance Criteria

The MVP is accepted when:

- SageOS runs as an always-on gateway service with pause/resume/stop.
- SageOS can install/run in the Windows user environment without losing interactive observation capability.
- SageOS has a production-usable Windows overlay app as the primary MVP UI, opened and closed by a configurable global hotkey.
- The Windows overlay shows supervisor, observations, memory, learning, tasks, workflows, skills, coding, apps, notifications, policy, incidents, audit, approvals, and collaboration.
- The overlay supports full-screen translucent Command Deck, Universal Launcher, Agent Workspace, configurable compact HUD, Edge Rail collapsed state, and pinned pass-through widgets.
- CLI, TUI, web Command Center, Telegram, and future panels remain supplemental surfaces backed by the same shared contract.
- `sage os status --json` exposes the shared contract.
- Approved observation sources create redacted, source-labeled events.
- SageOS improves memory by capturing sessions/events, replaying queues, running doctor, and exporting wiki review output.
- SageOS can create a skill candidate from observed repeated work with provenance.
- SageOS can create a workflow candidate and dry-run it against captured examples.
- SageOS can run a scoped autonomous coding task in an allowed repo and report diff plus tests.
- SageOS can draft an app/widget candidate from an observed need.
- Telegram receives startup, digest, task, incident, and completion updates.
- Jason can pause, resume, stop, and inspect tasks from CLI and Telegram.
- External writes, production effects, credential changes, and policy changes are not silently self-authorized.
- Every autonomous action has audit, evidence, verification, and rollback or explicit non-rollback note.
- Secret/private content is redacted according to target and source policy.
- Memory-down, queue-backlog, notification-failure, worker-failure, and policy-blocked states surface as incidents with repair actions.
- Tests, typecheck, lint, and `git diff --check` pass for implementation slices.

## Testing Strategy

Unit tests:

- Config parsing and defaults.
- Supervisor lifecycle.
- Event log append/read/redaction.
- Observation source allow/deny behavior.
- Policy tier decisions.
- Task queue transitions.
- Incident generation.
- Notification formatting and redaction.
- Memory/learning steward state.
- Workflow candidate clustering.
- Skill draft provenance.
- Coding repo policy.

Integration tests:

- Gateway starts SageOS supervisor.
- `sage os status --json` returns valid status.
- Queue replay changes status.
- Memory-down creates incident and queues work.
- Fake Telegram target receives redacted digest.
- Fake worker task completes and emits audit events.
- Policy blocks external write without scope.
- Coding fixture produces diff/test report.

Live proof:

1. Start gateway with SageOS enabled.
2. Start the Windows overlay and verify the configured hotkey toggles it.
3. Verify Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, and pinned widgets render live state.
4. Verify pass-through pinned widget mode leaves the underlying app usable.
5. Verify `sage os status --json`.
6. Observe app focus or Sage session event.
7. Capture session to Sage Memory.
8. Replay a queued learning event.
9. Run memory doctor and export proof.
10. Generate a workflow or skill candidate from repeated events.
11. Run a scoped coding task in a fixture or allowed repo.
12. Send Telegram digest.
13. Pause and resume SageOS from the overlay and CLI.
14. Verify audit trail contains every step.

## Open Decisions

- Exact default autonomy tier for Jason's private environment.
- Whether Telegram should receive full private summaries or only redacted summaries.
- Where to store the event log and how long to retain each data class.
- Whether Night Shift coding should use branches in the existing repo, separate clones, or an approved worktree policy.
- Whether generated apps/widgets should live in `extensions/`, `apps/`, `docs/superpowers/artifacts/`, or a separate local workspace.
- Whether screen/OCR/audio capture should be in MVP or explicitly post-MVP.
- Which job/work apps get first deterministic workflow builders.
- Which self-improvement changes can be auto-promoted without review.

## Recommended First Brick

Despite the broader autonomous vision, the first coding task should still be narrow:

Implement the SageOS shared status contract, config namespace, supervisor skeleton, and `sage os status --json`.

This creates the spine for everything else:

- Always-on service state.
- Overlay and supplemental Command Center visibility.
- Policy and autonomy mode visibility.
- Memory/learning/queue health.
- Task and notification slots.
- Incidents and audit hooks.

After that, build observation, memory steward, Telegram notifications, autonomous task queue, and the Windows overlay shell in that order. The web Command Center can continue to evolve, but it must not replace the overlay as the MVP's primary interface.

## Research Source List

- ReAct: https://arxiv.org/abs/2210.03629
- Toolformer: https://arxiv.org/abs/2302.04761
- Reflexion: https://arxiv.org/abs/2303.11366
- Voyager: https://arxiv.org/abs/2305.16291
- Generative Agents: https://arxiv.org/abs/2304.03442
- MemGPT: https://arxiv.org/abs/2310.08560
- Long-term memory for LMs: https://arxiv.org/abs/2306.07174
- WebArena: https://arxiv.org/abs/2307.13854
- OSWorld: https://arxiv.org/abs/2404.07972
- SWE-agent: https://arxiv.org/abs/2405.15793
- AutoGen: https://arxiv.org/abs/2308.08155
- MetaGPT: https://arxiv.org/abs/2308.00352
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Anthropic computer use: https://www.anthropic.com/news/3-5-models-and-computer-use
- OpenAI Operator: https://openai.com/index/introducing-operator/
- Microsoft Recall: https://support.microsoft.com/en-us/windows/retrace-your-steps-with-recall-aa03f8a0-a78b-4b3e-b0a1-2eb8ac48701c
- Microsoft Recall admin: https://learn.microsoft.com/en-us/windows/client-management/manage-recall
- Apple Intelligence: https://www.apple.com/apple-intelligence/
- Apple Private Cloud Compute: https://security.apple.com/blog/private-cloud-compute/
- Limitless: https://www.limitless.ai/
- Lindy: https://www.lindy.ai/
- Zapier Agents: https://zapier.com/agents
- Adept ACT-1: https://www.adept.ai/blog/act-1
- MultiOn: https://www.multion.ai/
