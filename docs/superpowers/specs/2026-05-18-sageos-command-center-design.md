# SageOS Command Center Design

Date: 2026-05-18
Status: revised private product spec
Supersedes: `docs/superpowers/specs/2026-05-17-sageos-mvp-design.md` as the highest-level product direction

## Goal

Define SageOS as Jason's local-first AI operations layer for his Windows computer: a continuously running Windows overlay, command center, and autonomy kernel where Sage can create, supervise, coordinate, and improve a team of AI agent employees that work across the machine while the computer is on.

SageOS is not a browser dashboard. The Windows overlay is the primary control tower, opened and dismissed with a programmable global hotkey. The web Command Center, TUI, CLI, and Telegram are supplemental admin, debug, remote, and fallback surfaces. The product is a local operating layer for autonomous work, full-PC stewardship, memory, security, workflow automation, coding, and self-improvement.

The design target is:

- Sage is the AI agent and harness.
- SageOS is the agentic Windows overlay and command center contract for full-PC management.
- Sage Memory is the separate local-first memory and SecondBrain substrate.

SageOS should let Jason express intent in plain language, create durable agent employees from that intent, monitor what they are doing, interrupt or redirect them, delegate broad scopes of autonomy, and let agents collaborate with each other when useful.

## Product thesis

SageOS should be a private local AI command center for a personal autonomous workforce.

The closest analogy is a hybrid of:

- Kubernetes for inspectable resources and control loops.
- Temporal for durable task execution, retries, timers, cancellation, and signals.
- n8n and Zapier for triggers, workflow history, reruns, and automation visibility.
- LangGraph for stateful agent workflows with checkpoints and human interruption.
- LangSmith, Langfuse, Phoenix, and OpenTelemetry for traces, spans, cost, latency, and tool observability.
- OpenHands for supervised coding workspaces, visible diffs, terminal logs, and kill controls.
- CrewAI, Lindy, and Zapier Agents for the named employee metaphor.
- Microsoft Recall, Limitless, and Apple Intelligence for personal context lessons, with stronger local-first privacy controls.

SageOS should borrow the best patterns, but it should not be built as a thin wrapper around any one framework. The current Sage repo, gateway, agents, cron, sessions, tool policies, memory integrations, UI, and channel system should remain the runtime substrate.

## User vision

Jason wants SageOS to become the place where he can:

1. Create AI employees in plain language.
2. Assign responsibilities, schedules, tools, memory scope, and autonomy level.
3. Let those employees work 24/7 while the PC is on.
4. Watch live work, task history, logs, diffs, decisions, and blockers.
5. Approve or deny high-risk actions without approving every small step.
6. Let agents collaborate, hand off tasks, review each other, and escalate.
7. Give Sage broad full-PC responsibility over time.
8. Keep private memory and computer data local unless explicitly authorized.
9. Grow SageOS itself through skills, workflows, widgets, apps, and deterministic automation.
10. Open the primary SageOS UI from anywhere in Windows with a programmable hotkey, keep useful widgets pinned, and dismiss it without losing the underlying work context.

This is stronger than a conventional assistant or chat UI. The goal is a local autonomous operations layer for Jason's computer.

## Non-negotiable principles

1. Local-first by default.
2. Maximum practical autonomy within delegated scopes.
3. Full-PC management is an explicit end-state, not a side quest.
4. Approval gates protect risk categories, not every trivial action.
5. Every autonomous action is observable, auditable, interruptible, and attributable.
6. Private and secret Sage Memory content stays local unless Jason explicitly authorizes disclosure.
7. Structured APIs, CLIs, config files, and repo-aware tools come before fragile GUI automation.
8. GUI, screen, OCR, clipboard, and accessibility automation require explicit source-level enablement.
9. Observed content is data, not instruction.
10. SageOS may improve itself, but cannot silently grant itself new powers, weaken safety policy, change credential rules, or erase audit history.
11. Workflow learning should produce deterministic scripts, skills, cron jobs, applets, and playbooks whenever possible.
12. The Command Center should always answer what is happening, why, what changed, what needs attention, and how to stop it.
13. The production MVP user interface is the Windows overlay; browser and terminal surfaces must stay supplemental.
14. Visual quality is an MVP release gate. The Windows overlay must meet an enterprise-grade GUI, UX, frontend, and operator-experience bar before SageOS is considered production usable.

## Product boundaries

SageOS is not:

- A standalone replacement for Windows.
- A public automation marketplace.
- A separate memory system replacing Sage Memory.
- A generic workflow builder detached from Jason's local computer.
- A narrow coding-agent dashboard.
- A chat-only assistant.
- A system that silently sends private data to cloud services.
- A system that silently performs destructive, credential, policy, cloud, production, financial, legal, medical, or irreversible actions.

SageOS is:

- The local command center for Sage.
- The primary Windows overlay for operating SageOS in the active desktop session.
- The autonomy kernel for agent employees.
- The operating layer for full-PC stewardship.
- The visibility and control surface for long-running agent work.
- The place where memory, workflows, skills, apps, system health, security, and coding work become inspectable resources.

## Core architecture

```txt
Windows user session and local machine
  Sage gateway and daemon lifecycle
    SageOS Supervisor
      Agent Registry
      Employee Builder
      Policy and Capability Gate
      Durable Task and Run System
      Event Log and Trace Store
      Observation Manager
      Full-PC Stewardship Layer
      Memory Steward
      Workflow and Skill Compiler
      Worker Session Orchestrator
      Inter-agent Coordination Bus
      Verification and Evaluation Harness
      Notification Manager
      Command Center API
        Windows overlay shell
        CLI
        TUI
        Gateway web control UI
        Telegram control channel
```

The first implementation should create the spine that every surface consumes, then ship the Windows overlay as the primary MVP UI:

1. Shared SageOS types and status contract.
2. `sageos` config namespace.
3. Gateway-resident supervisor skeleton.
4. Durable state store.
5. Append-only event log.
6. Task and run model.
7. Policy tier model.
8. `sage os status --json`.
9. Pause, resume, stop, and emergency stop.
10. Minimal Command Center overview.
11. Production Windows overlay shell.
12. Supplemental web/TUI views that render the same contract.

## Resource model

SageOS should model important things as inspectable local resources.

Core resources:

- `AgentSpec`: desired definition of an AI employee.
- `AgentInstance`: current runtime state of an employee.
- `TaskSpec`: a unit of work to run or propose.
- `Run`: one execution attempt for a task or workflow.
- `WorkflowSpec`: deterministic or semi-agentic automation definition.
- `Approval`: a decision request or delegated policy grant.
- `PolicyScope`: allowed tools, data, folders, repos, apps, channels, and risk classes.
- `ObservationSource`: a configured source of local or external context.
- `Event`: append-only audit event.
- `Trace`: causally linked spans for model/tool/system activity.
- `Incident`: health, security, policy, memory, queue, or worker problem.
- `Artifact`: file, diff, report, app, widget, skill, workflow, or generated output.
- `MemoryRef`: link to Sage Memory evidence or node.

These resources should be queryable by CLI, UI, and agents.

## Agent employee model

An AI employee is a durable role with state, responsibilities, policies, tools, and history. It is not just a prompt.

### AgentSpec

```ts
type SageOsAgentSpec = {
  id: string;
  name: string;
  role: string;
  mission: string;
  description: string;
  status: "draft" | "active" | "paused" | "disabled" | "retired";
  autonomyTier: SageOsAutonomyTier;
  responsibilities: string[];
  schedules: SageOsSchedule[];
  triggers: SageOsTrigger[];
  allowedScopes: SageOsPolicyScope[];
  deniedScopes: SageOsPolicyScope[];
  toolProfile: string;
  memoryScopes: SageOsMemoryScope[];
  collaboration: SageOsCollaborationPolicy;
  budgets: SageOsBudgetPolicy;
  reporting: SageOsReportingPolicy;
  verification: SageOsVerificationPolicy;
  createdFrom: SageOsEvidenceRef[];
  createdAt: string;
  updatedAt: string;
};
```

### Employee lifecycle

```txt
draft
  -> simulated
  -> active
  -> paused
  -> active
  -> disabled
  -> retired
```

Lifecycle rules:

- New employees start as drafts.
- The builder must show the proposed role, tools, memory scope, autonomy tier, schedule, and risks before activation.
- Activation can be one-click when the requested scope is low risk and inside existing policy.
- High-risk scopes require explicit approval.
- Every employee needs a pause button and a kill switch.
- Retired employees keep history and artifacts.

### Plain-language employee builder

Jason should be able to say:

```txt
Create a Security Sentinel that watches my PC for suspicious processes, startup items, Defender status, and strange network behavior. It should report urgent issues immediately, summarize normal status daily, and ask before changing firewall or deleting anything.
```

SageOS should compile this into:

- Agent name and mission.
- Responsibilities.
- Observation sources.
- Tool profile.
- Memory scopes.
- Autonomy tier.
- Schedules and triggers.
- Risk and approval policy.
- Reporting policy.
- Verification requirements.
- Draft AgentSpec.

The builder should always display a structured preview:

```txt
Employee: Security Sentinel
Autonomy: Execute scoped for read-only monitoring, approval for remediation
Sources: Defender status, process list, startup entries, firewall state, scheduled tasks
Tools: system status, terminal read-only commands, event log readers, incident creator
Memory: security incidents and system health summaries only
Reports: urgent alerts immediately, daily digest at 8 AM
Will not: delete files, change firewall, kill processes, quarantine files, send private logs externally without approval
```

## Default employee roster

SageOS should eventually ship with draft templates for these employee classes.

### Chief of Staff

Purpose: coordinate the employee team, keep priorities aligned, synthesize daily plans, route tasks, and escalate blockers.

Default autonomy: suggest and prepare; execute scoped coordination actions when policy permits.

### Security Sentinel

Purpose: monitor PC security posture.

Responsibilities:

- Windows Defender and Security Center status.
- Suspicious processes.
- Startup entries.
- Scheduled tasks.
- Firewall state.
- Downloads and new executables.
- Browser extensions where integrations permit.
- Unusual network listeners or outbound patterns.
- Security incidents and remediation proposals.

Default autonomy: read-only monitoring and incident creation. Approval or explicit playbook required for killing processes, deleting/quarantining files, firewall changes, credential changes, or security setting changes.

### PC Steward

Purpose: organize local files and keep the machine clean.

Responsibilities:

- Downloads, Desktop, Documents, projects, archives, duplicates, temp files.
- File naming and folder organization suggestions.
- Reversible moves into staging folders.
- Cleanup plans with previews.
- Storage pressure reports.

Default autonomy: propose and prepare. Reversible moves allowed only in approved folders. Deletion and bulk rewrites require approval.

### Windows Admin

Purpose: maintain Windows configuration and local services.

Responsibilities:

- Services.
- Startup apps.
- Scheduled tasks.
- Power and sleep settings.
- Storage settings.
- Updates.
- Environment and path health.
- Local app health where safe.

Default autonomy: read-only diagnostics and safe repair playbooks. Approval for settings changes unless pre-authorized.

### System Doctor

Purpose: monitor SageOS, Sage, Sage Memory, gateway, cron, queues, CPU, memory, disk, logs, and local dependencies.

Default autonomy: read-only diagnostics, queue replay, safe restarts for explicitly approved local services, incident creation, repair suggestions.

### Memory Steward

Purpose: keep Sage Memory and the SecondBrain healthy.

Responsibilities:

- Telegram and session ingestion health.
- Capture queue replay.
- Memory doctor.
- Wiki export proof.
- Duplicate and stale memory detection.
- Review cards.
- Project summaries.
- Graph hygiene.

Default autonomy: local non-destructive maintenance. Bulk deletes, canonical rewrites, sensitivity changes, and destructive SecondBrain operations require approval.

### Workflow Engineer

Purpose: turn repeated work into deterministic automations.

Responsibilities:

- Detect repeated patterns.
- Draft workflow specs.
- Build scripts, templates, cron jobs, and skills.
- Dry-run workflows against captured examples.
- Monitor failures and improve workflows.

Default autonomy: draft and dry-run. Enablement requires policy match or approval.

### Coding Worker

Purpose: progress approved coding tasks.

Responsibilities:

- Implement planned tasks.
- Fix failing tests.
- Add tests and docs.
- Run checks.
- Produce diffs and reports.
- Avoid unrelated worktree changes.

Default autonomy: allowed repos and local edits under policy. Approval for dependencies, releases, publishing, deployments, protected branches, and broad refactors.

### Night Shift

Purpose: run Coding Worker style tasks during idle or overnight windows.

Default autonomy: execute scoped tasks in allowed repos, with budget, test, and reporting requirements.

### App and Widget Builder

Purpose: create local SageOS widgets and tools from recurring needs.

Default autonomy: draft, preview, and test. Enablement requires policy or approval.

### Research Analyst

Purpose: do research, monitoring, summaries, and decision briefs.

Default autonomy: external reads when allowed. External writes or private data disclosure require approval.

### Reviewer and Auditor

Purpose: review other agents' work, policy compliance, diffs, tests, incidents, and memory changes.

Default autonomy: read-only review and recommendations.

## Inter-agent collaboration

SageOS should support collaboration without becoming opaque chat soup.

Collaboration primitives:

- Task handoff: one employee creates a task for another.
- Review request: one employee asks Reviewer for critique.
- Incident escalation: any employee creates an incident.
- Shared artifact: employees link to the same file, diff, trace, or memory reference.
- Coordination note: Chief of Staff summarizes team state.
- Debate or vote: bounded multi-agent comparison for high-impact decisions.

Rules:

- Collaboration must create structured events.
- Agents may not silently expand another agent's permissions.
- Agents may not approve each other's high-risk actions unless Jason has explicitly delegated that role.
- Multi-agent loops need budgets and termination conditions.
- The UI should show who requested what from whom and why.

## Autonomy model

SageOS should use delegated autonomy tiers.

| Tier | Name              | Meaning                                                     | Default use                |
| ---- | ----------------- | ----------------------------------------------------------- | -------------------------- |
| 0    | Off               | No autonomous work, status only                             | disabled service           |
| 1    | Observe           | Collect approved observations and health                    | new sources                |
| 2    | Suggest           | Create suggestions, plans, drafts, incidents                | risky domains              |
| 3    | Prepare           | Create local drafts, branches, scripts, previews            | workflow and app drafts    |
| 4    | Execute scoped    | Run reversible low-risk work in approved scopes             | MVP target                 |
| 5    | Execute delegated | Run pre-approved playbooks unattended                       | trusted employee workflows |
| 6    | Full operator     | Broad cross-app and full-PC autonomy with active monitoring | opt-in later               |

Tier 5 and Tier 6 do not remove safety. They mean Jason has delegated a class of work. SageOS still enforces budgets, deny rules, audit, verification, data boundaries, and stop controls.

## Risk policy

| Risk class                 | Examples                                                | Default behavior                               |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Read local low sensitivity | status, logs, git diff, test output                     | allowed in approved scopes                     |
| Read local private context | memory, transcripts, window titles, file metadata       | allowed only for enabled sources and tasks     |
| Local reversible write     | draft file, generated report, branch edit, staging move | allowed at Tier 3 or higher with audit         |
| Local destructive write    | delete, overwrite, truncate, reset, bulk move           | approval or explicit playbook required         |
| Security remediation       | kill process, quarantine file, firewall change          | approval or explicit playbook required         |
| Windows setting change     | service/startup/task/config change                      | approval or explicit playbook required         |
| External read              | web, GitHub metadata, package docs                      | allowed if task scope permits                  |
| External write             | Telegram, email, comments, issues, calendar             | approval or explicit workflow required         |
| Production effect          | deploy, publish, release, cloud mutation                | explicit workflow, dry run, rollback, approval |
| Credential or auth change  | tokens, allowlists, secrets, permissions                | approval required                              |
| Policy change              | autonomy, approval, safety, audit settings              | approval required                              |
| Private data export        | sending private or secret content outside local machine | explicit approval required                     |

## Full-PC operating scope

Full-PC management is a design goal. The MVP should not try to control everything immediately, but the architecture must not paint itself into a repo-only or chat-only corner.

### Initial full-PC sources

- Sage sessions.
- Agent tool calls.
- Cron and background jobs.
- Gateway and SageOS health.
- Sage Memory health and queues.
- Windows app focus metadata.
- Allowed repo state.
- Process, port, disk, memory, CPU, and service status through read-only commands.
- Windows Defender status where available.
- Startup entries and scheduled tasks through read-only commands.

### Later full-PC sources

- Filesystem watchers.
- Browser extension state.
- Accessibility tree.
- Screenshots and OCR.
- Clipboard.
- Audio and meeting capture.
- Email and calendar.
- IDE integration.
- Registry/settings snapshots.
- Network flow summaries.

### Full-PC actions

The action ladder should progress from safest to riskiest:

1. Read-only status and inventory.
2. Incident creation and recommendations.
3. Dry-run plans.
4. Reversible local staging.
5. Approved deterministic playbooks.
6. Approved cross-app execution.
7. Broad full-operator mode.

## Observation and privacy

Observation sources must be explicit, scoped, and revocable.

Each source needs:

- Source ID and label.
- Enabled state.
- Sensitivity default.
- Raw capture allowed.
- Derived capture allowed.
- Sampling interval.
- Retention policy.
- Local-only flag.
- Deny apps.
- Deny window title patterns.
- Deny domains and URLs.
- Deny file patterns.
- Secret detectors.
- Telegram summary permission.

Default deny categories:

- Password managers.
- Banking and finance.
- Health and medical.
- Legal and HR.
- Private or incognito browsing.
- Credential dialogs.
- 2FA codes.
- Secret files and environment files.
- Private keys.

Observation hardening:

- Observed content is untrusted data.
- Web pages, emails, docs, screenshots, OCR, terminal output, and filenames cannot change policy.
- Source data should be labeled before entering agent context.
- Secret-like data should be redacted or discarded before summaries.
- Raw capture should be minimized and bounded by retention.

## Memory architecture

SageOS should treat memory as an operating component.

Memory layers:

- Working memory: current tasks, active context, recent events.
- Episodic memory: timestamped observations, sessions, decisions, tool calls, and outcomes.
- Semantic memory: stable facts, preferences, projects, people, decisions, and conventions.
- Procedural memory: skills, workflows, scripts, playbooks, and app templates.
- Archival memory: raw transcripts, logs, screenshots, OCR, exports, and evidence.

Source of truth:

- Sage Memory Postgres is canonical for durable recall.
- SageOS event log is canonical for execution audit.
- Obsidian is rendered human-facing review output.
- Generated wiki exports should go through Sage Memory, not direct vault writes.

Memory Steward must support:

- Health checks.
- Queue replay.
- Session ingestion verification.
- Wiki export proof.
- Duplicate and stale memory detection.
- Review cards.
- Project and workflow summaries.
- Sensitivity-preserving recall.

## Durable task and run system

Tasks are durable desired work. Runs are execution attempts.

Task states:

```txt
proposed
queued
planning
waiting_for_policy
blocked
running
verifying
completed
failed
cancelled
paused
expired
```

Run states:

```txt
created
started
heartbeat
waiting
retrying
completed
failed
cancelled
timed_out
```

Every task needs:

- ID and title.
- Objective.
- Requester or trigger.
- Evidence references.
- Assigned employee.
- Workspace, app, repo, folder, or system scope.
- Autonomy tier.
- Risk class.
- Tool profile.
- Budget.
- Expected output.
- Verification plan.
- Rollback plan or explicit non-rollback note.
- Notification policy.
- Retention and sensitivity.

Every run needs:

- Run ID.
- Task ID.
- Attempt number.
- Worker session ID.
- Trace ID.
- Start and end time.
- Tool calls.
- Logs.
- Artifacts.
- Verification result.
- Final report.

## Event log and tracing

SageOS needs a local append-only event log plus trace spans.

Event types:

- supervisor_started
- supervisor_stopped
- policy_changed
- employee_created
- employee_updated
- observation_collected
- observation_redacted
- task_proposed
- task_queued
- task_started
- tool_call_started
- tool_call_completed
- approval_requested
- approval_resolved
- artifact_created
- verification_started
- verification_completed
- task_completed
- task_failed
- workflow_candidate_created
- skill_candidate_created
- memory_capture_completed
- notification_sent
- incident_created
- repair_attempted

Each event should include:

- Event ID.
- Trace ID.
- Timestamp.
- Actor and employee ID.
- Source.
- Scope.
- Sensitivity.
- Policy basis.
- Summary safe for status surfaces.
- Local detail path when needed.
- Linked task, run, artifact, memory, or approval IDs.

Trace spans should cover:

- Model calls.
- Tool calls.
- File operations.
- Terminal commands.
- Browser actions.
- Memory reads and writes.
- Approval waits.
- Verification checks.
- Notifications.

## Visual Design Language

SageOS should use Liquid Linear command glass as the MVP overlay visual target: Apple-like liquid glass material physics plus Linear-like command hierarchy, density, restraint, and operational precision. This direction was selected through the visual companion as Option B and is specified in `docs/superpowers/specs/2026-06-01-sageos-liquid-linear-overlay-design.md`.

The foundation remains a Sage-native adaptation of PeakHQ's Vitreus/Vitreous Liquor design language. The PeakHQ reference is `C:\Users\jason\Desktop\PeakIQ-AI-Assistant\apps\intranet\src\PEAKHQ_DESIGN_LANGUAGE.md`; SageOS should borrow the design physics and material logic, not the PeakHQ brand identity.

### Material System

The overlay should feel like a precise liquid glass command surface over Windows:

- Neutral charcoal dark surfaces and cool platinum light surfaces.
- Layered Liquid Linear glass elevation: ambient, command, focus, and summit.
- Backdrop blur only where it improves separation; opacity floors must preserve text contrast over bright and dark desktop content.
- Thin rim highlights, crisp borders, soft internal shadows, and subtle glows for state.
- Static dot-matrix or topographic texture as background depth only when it does not compete with operational data.
- 8px default card radius unless a specific surface needs a tighter system control or a larger modal container.
- Apple-like liquid glass effects must never undermine Linear-like scan density, command hierarchy, or legibility.

### Color And State

SageOS should be operational and restrained:

- Blue/cyan: primary commands, focus, active system paths.
- Green: completed, healthy, safe, verified.
- Amber: waiting, needs review soon, degraded but contained.
- Red: urgent incidents, destructive actions, emergency stop, failed verification.
- Purple/violet may be used sparingly for AI synthesis or special analysis, but must never dominate the interface.

### Interaction Quality

The overlay must be mouse-first, keyboard-complete, and voice-ready:

- All MVP actions have visible controls with hover, focus, pressed, disabled, loading, success, and error states.
- Keyboard paths cover the global hotkey, launcher focus, tab order, escape-to-dismiss, command execution, approvals, pause/resume, and close/collapse/expand.
- Motion uses transform and opacity, respects reduced-motion, and limits active animation channels so the overlay feels alive without getting noisy.
- Magnetic, spotlight, or crystallization effects may be used on high-value controls, but only if they preserve precision and pass screenshot/manual review.

### Release Gate

The MVP cannot close with "functionally present but visually rough" overlay UI. A final visual polish pass must:

- Audit every overlay surface: Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, Pinned Widgets, dialogs, loading, empty, error, disabled, and degraded states.
- Verify the overlay matches the Liquid Linear command glass target from `docs/superpowers/specs/2026-06-01-sageos-liquid-linear-overlay-design.md`.
- Verify desktop and narrow viewport layouts with screenshots.
- Check that text never overlaps or clips inside cards, rows, badges, or buttons.
- Check that pinned widgets remain legible over representative dark, light, text-heavy, and browser/IDE backgrounds.
- Check accessibility basics: contrast, visible focus, semantic labels, keyboard order, and reduced motion.
- Check frontend maintainability: shared tokens, reusable classes/components, no one-off visual constants scattered through the renderer, and no dead decorative UI.
- Record evidence in the Windows overlay smoke artifact before final MVP handoff.

## Windows Overlay UX

The Windows overlay is the main SageOS MVP interface. It should feel like a system dashboard layered over the active desktop, not like opening a site in a browser.

### Launch and shell behavior

The overlay shell must support:

- Programmable global Windows hotkey to open, close, and toggle SageOS.
- Full-screen translucent overlay as the default open state.
- Configurable compact HUD-first mode that expands into the full overlay.
- Always-on-top window behavior while the overlay is open.
- Tray status affordance for health and settings.
- Startup in the active Windows user session so foreground app observation and user interaction continue to work.
- Multi-monitor behavior that opens on the active monitor by default and can be pinned to a configured monitor.

### Interaction priority

MVP interaction priority is:

1. Mouse-first: all core flows work through visible controls, cards, menus, buttons, and drag/pin actions.
2. Keyboard-second: global hotkey, search focus, command palette navigation, escape-to-dismiss, tab order, and arrow navigation.
3. Voice-third: voice command entry can attach to the launcher, but voice must not block the mouse and keyboard MVP.

### Overlay surfaces

The overlay should ship these concrete surfaces:

- Command Deck: the default full overlay home with supervisor state, active operations, approvals, urgent incidents, next scheduled work, and pause/stop controls.
- Universal Launcher: plain-language command input and quick actions for employees, tasks, workflows, memory, coding, apps, policy, and repairs.
- Agent Workspace: focused drill-down for one employee, task, run, approval, incident, repo, workflow, skill, or app/widget.
- Compact HUD: small always-on-top status surface with active task count, pending approvals, urgent incident count, and expand/pause controls.
- Edge Rail: collapsed persistent strip showing health, approval badge, incident badge, and active-operation indicator.
- Pinned Widgets: pass-through-capable widgets for active operations, approvals, memory queue, Night Shift report, system health, and app/widget previews.

### Pass-through and pinned behavior

The overlay must support both focused and pass-through use:

- Focused mode captures pointer and keyboard input for review, approvals, editing, launcher commands, and workspace inspection.
- Pinned widget mode lets selected widgets stay visible while pointer input passes through to the underlying Windows app outside active widget controls.
- Edge Rail remains available as the collapsed state so SageOS is visible without occupying the whole screen.
- Approval, incident, and active-operation badges must remain visible in collapsed or HUD modes unless disabled by config.

### Relationship to web Command Center

The gateway web Command Center is supplemental. It is useful for development, debugging, remote browser access, and admin fallback, but it is not the primary product experience for MVP. Both overlay and web UI must consume the same SageOS status and control contract so work on one surface does not fork product behavior.

## Command Center UX

Command Center is the control-plane model. The Windows overlay is the daily control tower for MVP, while web/TUI/CLI/Telegram render the same model where those surfaces are useful.

Top-level sections:

- Overview.
- Employees.
- Active Operations.
- Approvals.
- Security.
- PC Management.
- Files.
- Memory and SecondBrain.
- Workflows.
- Skills.
- Coding and Night Shift.
- Apps and Widgets.
- Incidents.
- Audit and Timeline.
- Policy and Autonomy.
- Settings.

### Overview

Must answer:

- Is SageOS running?
- What mode is it in?
- What are agents doing now?
- What changed recently?
- What needs attention?
- What is blocked?
- What is unhealthy?
- What is the next scheduled work?
- How do I pause, stop, or narrow autonomy?

### Employees

Must show:

- Employee roster.
- Status: active, paused, disabled, running task, blocked.
- Mission and responsibilities.
- Autonomy tier.
- Allowed scopes.
- Last activity.
- Current task.
- Recent outputs.
- Incidents.
- Controls: pause, resume, edit, inspect, assign task, retire.

### Active Operations

Must show:

- Running tasks and runs.
- Worker session logs.
- Current tool call.
- Budget used.
- Trace timeline.
- Artifacts produced.
- Verification status.
- Controls: cancel, pause, ask for update, increase budget, reassign, request review.

### Approvals

Must show:

- Approval requests.
- Risk class.
- Proposed action.
- Evidence.
- Preview or diff.
- Rollback plan.
- Scope of approval: one-time, for this task, for this workflow, for this employee, for this domain.
- Expiration.

### Security

Must show:

- Defender/Security status.
- Suspicious process incidents.
- Startup and scheduled task changes.
- Firewall and network listener summary.
- Recent downloaded executables or installers where available.
- Security Sentinel activity.
- Pending remediation approvals.

### PC Management

Must show:

- Disk, CPU, RAM, battery/power, updates, services.
- Startup apps.
- Scheduled tasks.
- Cleanup opportunities.
- Broken local services.
- Safe repair actions.

### Files

Must show:

- Recent file organization suggestions.
- Duplicate candidates.
- Large files and storage pressure.
- Staging moves.
- Cleanup plans.
- Approval-required deletes.

### Memory and SecondBrain

Must show:

- Sage Memory health.
- Capture queue.
- Telegram ingestion health.
- Wiki export proof.
- Recent memories captured.
- Review cards.
- Duplicate/stale memory candidates.
- Graph health.

### Workflows and Skills

Must show:

- Repeated patterns detected.
- Workflow candidates.
- Draft workflows.
- Dry-run results.
- Enabled workflows and recent runs.
- Skill candidates.
- Skill changes and provenance.

### Coding and Night Shift

Must show:

- Allowed repos.
- Running coding tasks.
- Diffs.
- Tests.
- Blockers.
- Branch/workspace state.
- Night Shift schedule.
- Reports.

### Audit and Timeline

Must show:

- Append-only timeline.
- Filter by employee, task, run, policy scope, app, repo, folder, source, incident, or risk.
- Links to local detailed logs and artifacts.
- Exportable incident bundle.

## CLI contract

Initial commands:

```bash
sage os status
sage os status --json
sage os pause
sage os resume
sage os stop
sage os emergency-stop
sage os employees
sage os employees inspect <id>
sage os employees create
sage os tasks
sage os tasks inspect <id>
sage os tasks cancel <id>
sage os approvals
sage os approvals approve <id>
sage os approvals deny <id>
sage os incidents
sage os audit
sage os doctor
```

The JSON status contract should be stable enough for UI and agents to consume.

## Configuration model

Suggested initial config shape:

```yaml
sageos:
  enabled: true
  mode: execute_scoped
  supervisor:
    intervalSeconds: 30
    maxConcurrentTasks: 3
    idleAfterSeconds: 300
    nightShiftEnabled: true
    nightShiftWindow: "23:00-06:00"
  commandCenter:
    enabled: true
  overlay:
    enabled: true
    hotkey: "Ctrl+Alt+Space"
    openMode: full
    hudExpandsToFull: true
    passThroughDefault: false
    collapsedEdge: right
    activeMonitor: auto
    showApprovalBadge: true
    showIncidentBadge: true
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
    cron: true
    gatewayHealth: true
    sageMemory: true
    appFocus: true
    browser: false
    filesystem: false
    screen: false
    audio: false
    clipboard: false
    accessibility: false
    defender: true
    processes: true
    services: true
    scheduledTasks: true
    startupItems: true
    network: false
  privacy:
    localOnlyDefault: true
    storeRawScreenshots: false
    storeRawAudio: false
    telegramPrivateContent: false
    secretRedaction: true
    denyApps: ["1Password", "Bitwarden"]
    denyWindowTitlePatterns: ["password", "2FA", "bank", "private key"]
    denyFilePatterns: ["*.pem", "*.key", ".env", "credentials.json"]
  employees:
    templatesEnabled: true
    maxActiveEmployees: 10
  policy:
    defaultTier: execute_scoped
    requireApprovalForDestructive: true
    requireApprovalForExternalWrites: true
    requireApprovalForProduction: true
    requireApprovalForCredentials: true
    requireApprovalForPolicyChanges: true
    requireApprovalForPrivateDataExport: true
  memory:
    autoCapture: true
    replayQueues: true
    consolidate: true
    exportWiki: true
  coding:
    enabled: true
    allowedRepos:
      - "C:\\Users\\jason\\Desktop\\sage"
      - "C:\\Users\\jason\\Desktop\\sage-memory"
    allowDependencyChanges: false
    allowRelease: false
    allowDeploy: false
  notifications:
    telegram:
      enabled: true
      target: "telegram"
      digestSchedule: "0 8 * * *"
      urgentOnlyDuringFocus: true
```

## Implementation phases

### Phase 0: Canonical spec and resource spine

Goal: align the product direction around full-PC local autonomous workforce management.

Deliverables:

- This spec.
- Updated implementation tracker if needed.
- Agreed first resource model.
- Decision that current Sage runtime is the substrate.
- Decision that the Windows overlay is the primary MVP interface and web Command Center is supplemental.

Acceptance:

- Spec distinguishes Sage, SageOS, and Sage Memory.
- Spec includes full-PC management and agent employee model.
- Spec makes the overlay-first MVP requirement explicit.
- Spec keeps local-first and approval boundaries.

### Phase 1: Shared types and config

Goal: define stable contracts before UI or worker code depends on them.

Files likely involved:

- `src/sageos/types.ts`
- `src/config/types.ts`
- `src/config/zod-schema.ts`

Deliverables:

- Status snapshot type.
- AgentSpec type.
- TaskSpec and Run types.
- Event and Incident types.
- PolicyScope and autonomy tier types.
- Config schema and defaults.

Verification:

- Config parsing tests.
- Typecheck.
- `pnpm build`.

### Phase 2: Supervisor, state store, and event log

Goal: create the always-on local kernel.

Files likely involved:

- `src/sageos/supervisor.ts`
- `src/sageos/state-store.ts`
- `src/sageos/event-log.ts`
- gateway lifecycle files

Deliverables:

- Start, stop, pause, resume.
- Durable supervisor state.
- Append-only event log.
- Basic incident creation.
- No orphan timers on shutdown.

Verification:

- Supervisor lifecycle tests.
- Event persistence tests.
- Gateway start and stop test.

### Phase 3: CLI status and Command Center overview

Goal: make SageOS visible immediately through the shared contract that the overlay, web, TUI, CLI, and Telegram consume.

Deliverables:

- `sage os status`.
- `sage os status --json`.
- `sage os pause`.
- `sage os resume`.
- `sage os emergency-stop`.
- Compact status renderer.
- JSON contract consumed by future UI.
- Overlay-ready control/status shape for Command Deck, Launcher, Agent Workspace, HUD, Edge Rail, and pinned widgets.

Verification:

- Parseable JSON.
- Healthy, paused, degraded, and memory-down fixtures.

### Phase 4: Agent Registry and Employee Builder

Goal: create and manage employees as durable specs.

Deliverables:

- AgentSpec store.
- Employee templates.
- Plain-language builder that produces draft specs.
- Preview and activation flow.
- Employee list and inspect commands.

Verification:

- Builder turns prompt into draft spec.
- High-risk tools trigger approval.
- Paused employee does not receive tasks.

### Phase 5: Policy and capability gate

Goal: enforce delegated autonomy in code.

Deliverables:

- Risk classification.
- Autonomy tier checks.
- Tool profile enforcement.
- Scope matching.
- Existing approval manager integration.
- Policy event logging.

Verification:

- External write blocked without approval.
- Destructive write blocked without approval.
- Scoped reversible action allowed without repeated prompts.
- Policy changes cannot be self-approved.

### Phase 6: Durable tasks, runs, and worker sessions

Goal: run background work safely and visibly.

Deliverables:

- Task queue.
- Run store.
- Worker orchestrator using existing Sage sessions/subagents/cron as substrate.
- Budgets, retries, cancellation, and verification.
- Trace linkage.

Verification:

- Fake worker can complete, fail, retry, cancel, and time out.
- Budget exhaustion creates incident.
- Pause stops new work and lets safe cancellation proceed.

### Phase 7: Observation MVP

Goal: safely collect approved context.

Deliverables:

- Observation source registry.
- Adapters for Sage sessions, tool usage, cron, gateway health, Sage Memory, app focus, process status, service status, scheduled tasks, startup items, and Defender status.
- Denylist and redaction.
- Event normalization.

Verification:

- Disabled source emits no raw data.
- Denylisted app/window is redacted.
- Defender/process/service status appears in status without secrets.

### Phase 8: Memory Steward and SecondBrain integration

Goal: make memory health and improvement first class.

Deliverables:

- Sage Memory health card.
- Capture queue replay task.
- Telegram ingestion status.
- Wiki export proof.
- Memory review card model.
- Planning notes captured back to Sage Memory.

Verification:

- Memory-down creates incident and queues work.
- Successful capture can be found by Sage Memory search.
- Wiki export proof appears in status.

### Phase 9: Full-PC stewardship employees

Goal: add Security Sentinel, PC Steward, Windows Admin, and System Doctor as usable draft employees.

Deliverables:

- Employee templates.
- Read-only collectors.
- Incident cards.
- Dry-run repair plans.
- Approval flow for remediation.

Verification:

- Security Sentinel reports Defender and startup status.
- PC Steward creates cleanup plan without deleting files.
- Windows Admin reports services and scheduled tasks.
- System Doctor reports resource health and SageOS health.

### Phase 10: Workflow, skill, and app compiler

Goal: turn repeated work into reusable assets.

Deliverables:

- Repeated pattern detection.
- Workflow candidates.
- Skill candidates.
- App/widget candidates.
- Dry-run and promotion lifecycle.
- Provenance and rollback.

Verification:

- Repeated fake events produce a workflow candidate.
- Candidate becomes draft skill with source refs.
- Generated widget has preview and disable path.

### Phase 11: Night Shift coding

Goal: allow unattended coding work in approved repos.

Deliverables:

- Allowed repo inventory.
- Night Shift schedule.
- Coding task worker.
- Diff and test report.
- Telegram summary.

Verification:

- Fixture repo task edits file, runs test, reports diff.
- Dirty repo policy preserves unrelated changes.
- Dependency/release/deploy attempts require approval.

### Phase 12: Production Windows overlay shell

Goal: ship the production-usable Windows overlay as the primary MVP interface.

Deliverables:

- `apps/windows-overlay/` workspace package.
- Overlay config for enabled state, hotkey, open mode, HUD behavior, edge rail, active monitor, pass-through default, and pinned widgets.
- Transparent always-on-top Windows shell with global hotkey toggle and tray status.
- Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, and Pinned Widgets.
- Mouse-first controls for pause, resume, stop, emergency stop, approvals, task queue/run/cancel, incident repair, and employee/task inspection.
- Keyboard navigation for hotkey, focus, command palette, escape dismissal, and tab order.
- Voice command entry point behind config after mouse and keyboard flows are stable.
- Tests around overlay state, config, window controller abstraction, gateway client, and rendered surfaces.

Verification:

- Hotkey opens and closes overlay.
- Full overlay opens by default.
- HUD-first mode expands to full overlay.
- Edge Rail remains visible in collapsed state.
- Pinned widgets support pass-through mode.
- Pause, resume, cancel, approve, deny, run repair, and inspect actions work from overlay.
- Overlay consumes the same JSON contract as CLI, TUI, and web.

### Phase 13: Supplemental web and TUI Command Center

Goal: keep browser and terminal views useful for admin, development, debugging, remote review, and fallback access.

Deliverables:

- Web Command Center sections listed above.
- TUI Command Center overview and drill-downs.
- Task drill-down.
- Trace timeline.
- Approval cards.
- Employee editor.
- Incident repair actions.
- Audit filters.

Verification:

- Web and TUI consume the same JSON contract as the overlay.
- Pause, resume, cancel, approve, deny, and safe repair actions work from supplemental surfaces.

## Acceptance criteria

The revised SageOS design is implemented when:

- SageOS runs continuously with gateway or daemon lifecycle.
- Jason can pause, resume, stop, and emergency-stop SageOS.
- `sage os status --json` returns a stable full status snapshot.
- The Windows overlay is production-usable as the primary MVP interface and opens/closes with a configurable global hotkey.
- The overlay shows Command Deck, Universal Launcher, Agent Workspace, Compact HUD, Edge Rail, and Pinned Widgets.
- The overlay shows employees, tasks, approvals, security, PC management, memory, workflows, skills, coding, apps, incidents, audit, policy, and collaboration.
- Pinned widgets can stay visible while pass-through mode leaves the underlying app usable.
- Web Command Center, TUI, CLI, Telegram, and future panels remain supplemental surfaces backed by the same contract.
- Jason can create a draft AI employee from plain language.
- Employee activation shows tools, scopes, autonomy, memory access, schedules, and risks.
- Employees can run durable tasks with budgets, logs, traces, verification, and reports.
- Agents can hand off work and request reviews through structured collaboration events.
- Security Sentinel, PC Steward, Windows Admin, System Doctor, Memory Steward, Workflow Engineer, Coding Worker, and Reviewer exist at least as templates.
- Initial read-only full-PC sources work where available.
- Sage Memory remains canonical for durable memory and Obsidian remains a rendered review surface.
- External writes, destructive actions, credential changes, policy changes, private data export, production effects, releases, and irreversible actions are not silently self-authorized.
- Every autonomous action has audit evidence and a policy basis.
- Memory-down, source failure, queue backlog, worker failure, policy block, notification failure, and security finding states surface as incidents.
- Telegram can send redacted urgent alerts, digests, approval prompts, and task completion reports.
- Tests, typecheck, lint, and `git diff --check` pass for implementation slices.

## Open decisions

- Exact initial default autonomy tier for Jason's private environment.
- Whether the canonical file should remain this spec or replace the 2026-05-17 MVP spec after implementation begins.
- Event log storage backend: JSONL, SQLite, existing state DB, or a dedicated local store.
- Whether AgentSpec should be stored in config, state dir, Sage Memory, or a hybrid.
- How much Telegram is allowed to receive private summaries.
- Retention policy for raw observations, derived observations, traces, and screenshots if enabled.
- Whether Night Shift uses existing repo branches, temp clones, or explicitly approved worktrees.
- Which full-PC read-only collectors should be first on Windows.
- Whether screen, OCR, audio, clipboard, and accessibility belong in MVP or post-MVP.
- Where generated apps/widgets should live.
- Which self-improvement actions can be auto-promoted without Jason review.
- Final visual density and default pinned widget order for the overlay.

## Recommended first implementation brick

Start with the kernel spine:

1. `src/sageos/types.ts` with status, employee, task, run, event, policy, and incident types.
2. `src/config/zod-schema.ts` and config defaults.
3. `src/sageos/supervisor.ts` with start, stop, pause, resume, and tick status.
4. `src/sageos/state-store.ts` and `src/sageos/event-log.ts`.
5. `sage os status --json` plus human rendering.
6. Tests for lifecycle, config, status, and event logging.
7. Windows overlay shell consuming the same contract.

This enables all later work without creating a throwaway UI or brittle automation.

## Research and design references

- ReAct: https://arxiv.org/abs/2210.03629
- Toolformer: https://arxiv.org/abs/2302.04761
- Reflexion: https://arxiv.org/abs/2303.11366
- Voyager: https://arxiv.org/abs/2305.16291
- Generative Agents: https://arxiv.org/abs/2304.03442
- MemGPT: https://arxiv.org/abs/2310.08560
- WebArena: https://arxiv.org/abs/2307.13854
- OSWorld: https://arxiv.org/abs/2404.07972
- SWE-agent: https://arxiv.org/abs/2405.15793
- AutoGen: https://arxiv.org/abs/2308.08155
- MetaGPT: https://arxiv.org/abs/2308.00352
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Microsoft Recall: https://support.microsoft.com/en-us/windows/retrace-your-steps-with-recall-aa03f8a0-a78b-4b3e-b0a1-2eb8ac48701c
- Microsoft Recall admin: https://learn.microsoft.com/en-us/windows/client-management/manage-recall
- Apple Private Cloud Compute: https://security.apple.com/blog/private-cloud-compute/
- Lindy: https://www.lindy.ai/
- Zapier Agents: https://zapier.com/agents
- OpenHands: https://github.com/All-Hands-AI/OpenHands
- LangGraph: https://langchain-ai.github.io/langgraph/
- Langfuse: https://langfuse.com/
- Phoenix: https://phoenix.arize.com/
