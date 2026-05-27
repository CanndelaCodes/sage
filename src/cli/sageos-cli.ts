import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { runSageOsAmbientCopilotOnce } from "../sageos/ambient-copilot.js";
import { discoverSageOsAppCandidates } from "../sageos/app-candidates.js";
import {
  getSageOsEmployeeTemplate,
  listSageOsEmployeeTemplates,
} from "../sageos/employee-templates.js";
import { appendSageOsEvent, createSageOsEventLog, readSageOsEvents } from "../sageos/event-log.js";
import { runSageOsMemoryStewardOnce } from "../sageos/memory-steward.js";
import {
  buildSageOsDigestNotification,
  sendSageOsTelegramDigestOnce,
} from "../sageos/notifications.js";
import { observeAppFocusOnce } from "../sageos/observations.js";
import { draftSageOsSkillFromWorkflow } from "../sageos/skill-steward.js";
import {
  createSageOsControlStore,
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsApproval,
  upsertSageOsAgent,
  upsertSageOsTask,
  writeSageOsControl,
  writeSageOsState,
} from "../sageos/state-store.js";
import { renderSageOsStatus } from "../sageos/status-renderer.js";
import { collectSageOsStatus } from "../sageos/status.js";
import { queueSageOsTask } from "../sageos/task-queue.js";
import { runNextSageOsTaskOnce } from "../sageos/task-runner.js";
import {
  createSageOsStatusSnapshot,
  normalizeSageOsMode,
  type SageOsApproval,
  type SageOsAgentSpec,
  type SageOsAppCandidate,
  type SageOsObservation,
  type SageOsSkillRecord,
  type SageOsTaskSpec,
  type SageOsWorkflow,
} from "../sageos/types.js";
import { discoverSageOsWorkflowCandidates } from "../sageos/workflow-compiler.js";

export type SageOsCliDeps = {
  observeAppFocusOnce?: typeof observeAppFocusOnce;
  runMemoryStewardOnce?: typeof runSageOsMemoryStewardOnce;
  runAmbientCopilotOnce?: typeof runSageOsAmbientCopilotOnce;
  runNextTaskOnce?: typeof runNextSageOsTaskOnce;
  sendTelegramDigestOnce?: typeof sendSageOsTelegramDigestOnce;
  discoverWorkflowCandidates?: typeof discoverSageOsWorkflowCandidates;
  draftSkillFromWorkflow?: typeof draftSageOsSkillFromWorkflow;
  discoverAppCandidates?: typeof discoverSageOsAppCandidates;
  loadConfig?: typeof loadConfig;
};

async function loadSnapshot() {
  return await collectSageOsStatus();
}

async function updateSupervisorState(
  state: "paused" | "running" | "stopped",
  opts: { reason?: string; emergency?: boolean } = {},
) {
  const store = createSageOsStateStore();
  const controlStore = createSageOsControlStore();
  const eventLog = createSageOsEventLog();
  const current = await readSageOsState(store);
  const now = new Date();
  const isStopped = state === "stopped";
  const nextTickAt =
    state === "running" ? new Date(now.getTime() + 30_000).toISOString() : undefined;
  const supervisor = {
    ...current.status.supervisor,
    enabled: opts.emergency ? false : !isStopped,
    paused: state === "paused" || Boolean(opts.emergency),
    state,
    lastTickAt: state === "running" ? now.toISOString() : current.status.supervisor.lastTickAt,
    stoppedAt: isStopped ? now.toISOString() : undefined,
    nextTickAt,
  };
  const status = createSageOsStatusSnapshot({
    ...current.status,
    supervisor,
    audit: { ...current.status.audit, eventLogPath: eventLog.path },
  });
  const eventType = opts.emergency
    ? "emergency_stop"
    : state === "running"
      ? "supervisor_resumed"
      : state === "paused"
        ? "supervisor_paused"
        : "supervisor_stopped";
  await appendSageOsEvent(eventLog, {
    type: eventType,
    actor: "sageos.cli",
    summary: `SageOS ${opts.emergency ? "emergency stop" : state}: ${opts.reason ?? "manual"}`,
  });
  await writeSageOsState(store, status);
  await writeSageOsControl(controlStore, { state, reason: opts.reason, emergency: opts.emergency });
  return status;
}

function outputJsonOrText(opts: { json?: boolean }, payload: unknown, render: () => string) {
  defaultRuntime.log(opts.json ? JSON.stringify(payload, null, 2) : render());
}

function commandOptions<T extends Record<string, unknown>>(input: T | { opts: () => T }): T {
  if (typeof (input as { opts?: unknown }).opts !== "function") {
    return input as T;
  }
  const command = input as { opts: () => T; parent?: { opts?: () => Record<string, unknown> } };
  const local = command.opts();
  const parent = command.parent?.opts?.() ?? {};
  const merged = { ...parent, ...local } as Record<string, unknown>;
  if ("json" in parent || "json" in local) {
    merged.json = Boolean(parent.json || local.json);
  }
  return merged as T;
}

function fail(message: string): never {
  defaultRuntime.error(message);
  defaultRuntime.exit(1);
  throw new Error(message);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "employee";
}

function inferEmployeeName(description: string): string {
  const words = description.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (words.length === 0) {
    return "Draft Employee";
  }
  return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ");
}

function renderEmployees(agents: SageOsAgentSpec[]): string {
  if (agents.length === 0) {
    return "No SageOS employees.";
  }
  return agents
    .map((agent) => `${agent.id}\t${agent.status}\t${agent.name}\t${agent.role}`)
    .join("\n");
}

function renderTasks(tasks: SageOsTaskSpec[]): string {
  if (tasks.length === 0) {
    return "No SageOS tasks.";
  }
  return tasks.map((task) => `${task.id}\t${task.state}\t${task.title}`).join("\n");
}

function renderWorkflows(workflows: SageOsWorkflow[]): string {
  if (workflows.length === 0) {
    return "No SageOS workflows.";
  }
  return workflows
    .map((workflow) => `${workflow.id}\t${workflow.state}\t${workflow.name}`)
    .join("\n");
}

function renderSkills(skills: SageOsSkillRecord[]): string {
  if (skills.length === 0) {
    return "No SageOS skills.";
  }
  return skills.map((skill) => `${skill.id}\t${skill.state}\t${skill.name}`).join("\n");
}

function renderApps(apps: SageOsAppCandidate[]): string {
  if (apps.length === 0) {
    return "No SageOS app candidates.";
  }
  return apps.map((app) => `${app.id}\t${app.state}\t${app.name}`).join("\n");
}

function renderApprovals(approvals: SageOsApproval[]): string {
  if (approvals.length === 0) {
    return "No SageOS approvals.";
  }
  return approvals
    .map(
      (approval) => `${approval.id}\t${approval.state}\t${approval.riskClass}\t${approval.title}`,
    )
    .join("\n");
}

function renderObservations(observations: SageOsObservation[]): string {
  if (observations.length === 0) {
    return "No SageOS observations.";
  }
  return observations
    .map(
      (observation) =>
        `${observation.observedAt}\t${observation.source}\t${observation.state}\t${observation.title}`,
    )
    .join("\n");
}

function renderJsonResource(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function resolveApprovalFromCli(
  id: string,
  decision: "approved" | "denied",
  opts: { reason?: string },
): Promise<SageOsApproval> {
  const store = createSageOsStateStore();
  const state = await readSageOsState(store);
  const approval = state.approvals.find((entry) => entry.id === id);
  if (!approval) {
    fail(`SageOS approval not found: ${id}`);
  }
  if (approval.state !== "pending") {
    fail(`SageOS approval is not pending: ${id}`);
  }

  const now = new Date().toISOString();
  const nextApproval: SageOsApproval = {
    ...approval,
    state: decision,
    resolvedAt: now,
    resolvedBy: "sageos.cli",
    resolutionReason: opts.reason?.trim() || "manual",
    updatedAt: now,
  };
  await upsertSageOsApproval(store, nextApproval);
  await appendSageOsEvent(createSageOsEventLog(), {
    type: "approval_resolved",
    actor: "sageos.cli",
    summary: `Resolved SageOS approval ${id} as ${decision}: ${nextApproval.resolutionReason}`,
    taskId: nextApproval.taskId,
    runId: nextApproval.runId,
  });
  return nextApproval;
}

export function registerSageOsCli(program: Command, deps: SageOsCliDeps = {}) {
  const observeAppFocus = deps.observeAppFocusOnce ?? observeAppFocusOnce;
  const runMemorySteward = deps.runMemoryStewardOnce ?? runSageOsMemoryStewardOnce;
  const runAmbientCopilot = deps.runAmbientCopilotOnce ?? runSageOsAmbientCopilotOnce;
  const runNextTask = deps.runNextTaskOnce ?? runNextSageOsTaskOnce;
  const sendTelegramDigest = deps.sendTelegramDigestOnce ?? sendSageOsTelegramDigestOnce;
  const discoverWorkflowCandidates =
    deps.discoverWorkflowCandidates ?? discoverSageOsWorkflowCandidates;
  const draftSkillFromWorkflow = deps.draftSkillFromWorkflow ?? draftSageOsSkillFromWorkflow;
  const discoverAppCandidates = deps.discoverAppCandidates ?? discoverSageOsAppCandidates;
  const loadSageConfig = deps.loadConfig ?? loadConfig;
  const os = program.command("os").description("SageOS command center controls");

  os.command("status")
    .description("Show SageOS Command Center status")
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const snapshot = await loadSnapshot();
      defaultRuntime.log(
        opts.json ? JSON.stringify(snapshot, null, 2) : renderSageOsStatus(snapshot),
      );
    });

  os.command("pause")
    .description("Pause SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("paused", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS paused");
    });

  os.command("resume")
    .description("Resume SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("running", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS resumed");
    });

  os.command("stop")
    .description("Stop SageOS autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("stopped", { reason: opts.reason });
      defaultRuntime.log(opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS stopped");
    });

  os.command("emergency-stop")
    .description("Immediately stop SageOS and disable autonomous work")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (opts: { reason?: string; json?: boolean }) => {
      const snapshot = await updateSupervisorState("stopped", {
        reason: opts.reason,
        emergency: true,
      });
      defaultRuntime.log(
        opts.json ? JSON.stringify(snapshot, null, 2) : "SageOS emergency stop engaged",
      );
    });

  const employees = os.command("employees").description("List SageOS employees");
  employees.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { employees: state.agents }, () => renderEmployees(state.agents));
  });

  const employeeTemplates = employees
    .command("templates")
    .description("List default SageOS employee templates");
  employeeTemplates
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const templates = listSageOsEmployeeTemplates();
      outputJsonOrText(opts, { templates }, () => renderJsonResource({ templates }));
    });

  employeeTemplates
    .command("inspect <id>")
    .description("Inspect a SageOS employee template")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const template = getSageOsEmployeeTemplate(id);
      if (!template) {
        fail(`SageOS employee template not found: ${id}`);
      }
      outputJsonOrText(cliOpts, { template }, () => renderJsonResource({ template }));
    });

  employees
    .command("inspect <id>")
    .description("Inspect a SageOS employee")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const state = await readSageOsState(createSageOsStateStore());
      const employee = state.agents.find((agent) => agent.id === id);
      if (!employee) {
        fail(`SageOS employee not found: ${id}`);
      }
      outputJsonOrText(cliOpts, { employee }, () => renderJsonResource({ employee }));
    });

  employees
    .command("create <description>")
    .description("Create a draft SageOS employee from plain language")
    .option("--name <name>", "Employee display name")
    .option("--role <role>", "Employee role")
    .option("--tier <mode>", "Autonomy tier")
    .option("--json", "Output JSON", false)
    .action(
      async (
        descriptionInput: string,
        opts: { name?: string; role?: string; tier?: string; json?: boolean },
      ) => {
        const cliOpts = commandOptions(opts);
        const description = descriptionInput.trim();
        if (!description) {
          fail("Employee description required.");
        }
        const now = new Date().toISOString();
        const name = cliOpts.name?.trim() || inferEmployeeName(description);
        const employee: SageOsAgentSpec = {
          id: `employee_${slugify(name)}`,
          name,
          role: cliOpts.role?.trim() || "generalist",
          mission: description,
          status: "draft",
          autonomyTier: normalizeSageOsMode(cliOpts.tier ?? "suggest"),
          responsibilities: [description],
          allowedScopes: [],
          deniedScopes: [],
          createdAt: now,
          updatedAt: now,
        };
        const store = createSageOsStateStore();
        await upsertSageOsAgent(store, employee);
        await appendSageOsEvent(createSageOsEventLog(), {
          type: "employee_drafted",
          actor: "sageos.cli",
          summary: `Drafted SageOS employee ${employee.name}`,
          sensitivity: "normal",
        });
        outputJsonOrText(cliOpts, { employee }, () => renderJsonResource({ employee }));
      },
    );

  const tasks = os.command("tasks").description("List SageOS tasks");
  tasks.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { tasks: state.tasks }, () => renderTasks(state.tasks));
  });

  tasks
    .command("inspect <id>")
    .description("Inspect a SageOS task")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const state = await readSageOsState(createSageOsStateStore());
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task) {
        fail(`SageOS task not found: ${id}`);
      }
      outputJsonOrText(cliOpts, { task }, () => renderJsonResource({ task }));
    });

  tasks
    .command("queue <id>")
    .description("Queue a proposed SageOS task through policy gates")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { reason?: string; json?: boolean }, command?: Command) => {
      const cliOpts = commandOptions(command ?? opts);
      const result = await queueSageOsTask({
        taskId: id,
        requestedBy: "sageos.cli",
        reason: cliOpts.reason,
      });
      outputJsonOrText(cliOpts, { result }, () =>
        result.approval
          ? `Approval required: ${result.approval.id}\t${result.task.id}\t${result.task.title}`
          : `Queued: ${result.task.id}\t${result.task.title}`,
      );
    });

  tasks
    .command("run-next")
    .description("Run the next queued SageOS task with the dry-run worker")
    .option("--notify", "Send a Telegram task result notification", false)
    .option("--json", "Output JSON", false)
    .action(async (opts: { notify?: boolean; json?: boolean }, command?: Command) => {
      const cliOpts = commandOptions(command ?? opts);
      const result = await runNextTask({
        requestedBy: "sageos.cli",
        notify: Boolean(cliOpts.notify),
        cfg: cliOpts.notify ? loadSageConfig().sageos : undefined,
      });
      outputJsonOrText(cliOpts, { result }, () =>
        result.outcome === "idle"
          ? "No queued SageOS tasks."
          : `${result.outcome}: ${result.task.id}\t${result.run.id}`,
      );
    });

  tasks
    .command("cancel <id>")
    .description("Cancel a SageOS task")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { reason?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const store = createSageOsStateStore();
      const state = await readSageOsState(store);
      const task = state.tasks.find((entry) => entry.id === id);
      if (!task) {
        fail(`SageOS task not found: ${id}`);
      }
      const nextTask: SageOsTaskSpec = {
        ...task,
        state: "cancelled",
        updatedAt: new Date().toISOString(),
      };
      await upsertSageOsTask(store, nextTask);
      await appendSageOsEvent(createSageOsEventLog(), {
        type: "task_cancelled",
        actor: "sageos.cli",
        summary: `Cancelled SageOS task ${id}: ${cliOpts.reason ?? "manual"}`,
        taskId: id,
      });
      outputJsonOrText(cliOpts, { task: nextTask }, () => renderJsonResource({ task: nextTask }));
    });

  const workflows = os.command("workflows").description("List SageOS workflow candidates");
  workflows.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { workflows: state.workflows }, () => renderWorkflows(state.workflows));
  });

  workflows
    .command("discover")
    .description("Discover workflow candidates from repeated observations")
    .option("--min <count>", "Minimum repeated observations", "2")
    .option("--json", "Output JSON", false)
    .action(async (opts: { min?: string; json?: boolean }, command?: Command) => {
      const cliOpts = commandOptions(command ?? opts);
      const result = await discoverWorkflowCandidates({
        minOccurrences: parseLimit(cliOpts.min, 2),
      });
      outputJsonOrText(cliOpts, { result }, () =>
        [
          `Workflow candidates: ${result.created}/${result.observed} created, ${result.skipped} skipped`,
          ...result.candidates.map((workflow) => `${workflow.id}\t${workflow.name}`),
        ].join("\n"),
      );
    });

  const skills = os.command("skills").description("List SageOS draft skills");
  skills.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { skills: state.skills }, () => renderSkills(state.skills));
  });

  skills
    .command("draft <workflowId>")
    .description("Create a draft skill from a SageOS workflow candidate")
    .option("--json", "Output JSON", false)
    .action(async (workflowIdInput: string, opts: { json?: boolean }, command?: Command) => {
      const cliOpts = commandOptions(command ?? opts);
      const workflowId = workflowIdInput.trim();
      if (!workflowId) {
        fail("Workflow id required.");
      }
      const result = await draftSkillFromWorkflow({ workflowId });
      outputJsonOrText(cliOpts, { result }, () =>
        result.skill
          ? `${result.outcome}: ${result.skill.id}\t${result.skill.name}`
          : `${result.outcome}: ${workflowId}`,
      );
    });

  const apps = os.command("apps").description("List SageOS app candidates");
  apps.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { apps: state.apps }, () => renderApps(state.apps));
  });

  apps
    .command("discover")
    .description("Discover app/widget candidates from repeated observations")
    .option("--min <count>", "Minimum repeated observations", "2")
    .option("--json", "Output JSON", false)
    .action(async (opts: { min?: string; json?: boolean }, command?: Command) => {
      const cliOpts = commandOptions(command ?? opts);
      const result = await discoverAppCandidates({
        minOccurrences: parseLimit(cliOpts.min, 2),
      });
      outputJsonOrText(cliOpts, { result }, () =>
        [
          `App candidates: ${result.created}/${result.observed} created, ${result.skipped} skipped`,
          ...result.candidates.map((app) => `${app.id}\t${app.name}`),
        ].join("\n"),
      );
    });

  const approvals = os.command("approvals").description("List SageOS approvals");
  approvals.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { approvals: state.approvals }, () => renderApprovals(state.approvals));
  });

  approvals
    .command("approve <id>")
    .description("Approve a pending SageOS approval")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { reason?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const approval = await resolveApprovalFromCli(id, "approved", { reason: cliOpts.reason });
      outputJsonOrText(cliOpts, { approval }, () => renderJsonResource({ approval }));
    });

  approvals
    .command("deny <id>")
    .description("Deny a pending SageOS approval")
    .option("--reason <reason>", "Reason for audit log")
    .option("--json", "Output JSON", false)
    .action(async (id: string, opts: { reason?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const approval = await resolveApprovalFromCli(id, "denied", { reason: cliOpts.reason });
      outputJsonOrText(cliOpts, { approval }, () => renderJsonResource({ approval }));
    });

  const observations = os.command("observations").description("List SageOS observations");
  observations.option("--json", "Output JSON", false).action(async (opts: { json?: boolean }) => {
    const state = await readSageOsState(createSageOsStateStore());
    outputJsonOrText(opts, { observations: state.observations }, () =>
      renderObservations(state.observations),
    );
  });

  const observe = os.command("observe").description("Record one approved SageOS observation");
  observe
    .command("app-focus")
    .description("Record one approved app-focus observation")
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const result = await observeAppFocus({ cfg: { sources: { appFocus: true } } });
      outputJsonOrText(cliOpts, { result }, () => renderJsonResource({ result }));
    });

  const memory = os.command("memory").description("Run SageOS memory steward controls");
  memory
    .command("replay")
    .description("Replay Sage Memory capture and learning queues")
    .option("--agent <id>", "Agent id", "main")
    .option("--json", "Output JSON", false)
    .action(async (opts: { agent?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const result = await runMemorySteward({
        cfg: loadSageConfig(),
        agentId: cliOpts.agent?.trim() || "main",
      });
      outputJsonOrText(cliOpts, { result }, () =>
        [
          `Memory replay: ${result.memory.captured}/${result.memory.attempted} captured, ${result.memory.failed} failed`,
          `Learning replay: ${result.learning.accepted}/${result.learning.attempted} accepted, ${result.learning.failed} failed`,
        ].join("\n"),
      );
    });

  const copilot = os.command("copilot").description("Run SageOS Ambient Copilot controls");
  copilot
    .command("suggest")
    .description("Propose tasks from approved observations")
    .option("--max <count>", "Maximum suggestions to create", "5")
    .option("--json", "Output JSON", false)
    .action(async (opts: { max?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const result = await runAmbientCopilot({
        cfg: loadSageConfig().sageos,
        maxSuggestions: parseLimit(cliOpts.max, 5),
      });
      outputJsonOrText(cliOpts, { result }, () =>
        [
          `Ambient suggestions: ${result.proposed}/${result.observed} proposed, ${result.skipped} skipped`,
          ...result.tasks.map((task) => `${task.id}\t${task.title}`),
        ].join("\n"),
      );
    });

  const notifications = os.command("notifications").description("Run SageOS notification controls");
  notifications
    .command("digest")
    .description("Preview or send a redacted SageOS Telegram digest")
    .option("--send", "Send the digest to Telegram", false)
    .option("--target <target>", "Telegram target override")
    .option("--json", "Output JSON", false)
    .action(async (opts: { send?: boolean; target?: string; json?: boolean }) => {
      const cliOpts = commandOptions(opts);
      const cfg = loadSageConfig().sageos;
      if (cliOpts.send) {
        const result = await sendTelegramDigest({
          cfg,
          target: cliOpts.target?.trim() || undefined,
        });
        outputJsonOrText(cliOpts, { result }, () =>
          result.outcome === "sent"
            ? `Sent Telegram digest: ${result.target}`
            : `${result.outcome}: ${"reason" in result ? result.reason : result.target}`,
        );
        return;
      }

      const status = await collectSageOsStatus({ cfg });
      const state = await readSageOsState(createSageOsStateStore());
      const notification = buildSageOsDigestNotification({
        state: { ...state, status },
        status,
        cfg,
        target: cliOpts.target?.trim() || undefined,
      });
      outputJsonOrText(cliOpts, { notification, status }, () => notification.text);
    });

  os.command("incidents")
    .description("List SageOS incidents")
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const status = await collectSageOsStatus();
      outputJsonOrText(opts, { incidents: status.incidents }, () =>
        status.incidents.length === 0
          ? "No SageOS incidents."
          : status.incidents
              .map((incident) => `${incident.severity}\t${incident.category}\t${incident.title}`)
              .join("\n"),
      );
    });

  os.command("audit")
    .description("Show SageOS audit events")
    .option("--limit <count>", "Maximum events to show", "20")
    .option("--json", "Output JSON", false)
    .action(async (opts: { limit?: string; json?: boolean }) => {
      const events = await readSageOsEvents(createSageOsEventLog(), {
        limit: parseLimit(opts.limit, 20),
      });
      outputJsonOrText(opts, { events }, () =>
        events.length === 0
          ? "No SageOS audit events."
          : events.map((event) => `${event.ts}\t${event.type}\t${event.summary}`).join("\n"),
      );
    });

  os.command("doctor")
    .description("Check SageOS health")
    .option("--json", "Output JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const status = await collectSageOsStatus();
      const ok = status.incidents.length === 0 && status.supervisor.state !== "degraded";
      outputJsonOrText(opts, { ok, status }, () =>
        ok ? "SageOS doctor: ok" : `SageOS doctor: ${status.incidents.length} incident(s)`,
      );
    });
}
