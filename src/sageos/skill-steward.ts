import type { SageOsSkillRecord, SageOsStatusSnapshot, SageOsWorkflow } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsSkill,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type DraftSageOsSkillOutcome = "drafted" | "existing" | "missing_workflow";

export type DraftSageOsSkillFromWorkflowResult = {
  outcome: DraftSageOsSkillOutcome;
  skill?: SageOsSkillRecord;
  status: SageOsStatusSnapshot;
};

export async function draftSageOsSkillFromWorkflow(params: {
  stateDir?: string;
  workflowId: string;
  now?: () => Date;
}): Promise<DraftSageOsSkillFromWorkflowResult> {
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const workflow = state.workflows.find((item) => item.id === params.workflowId);
  if (!workflow) {
    return finish({ store, stateDir: params.stateDir, outcome: "missing_workflow" });
  }

  const existing = state.skills.find((skill) => skill.workflowId === workflow.id);
  if (existing) {
    return finish({ store, stateDir: params.stateDir, outcome: "existing", skill: existing });
  }

  const skill = skillFromWorkflow(workflow, (params.now ?? (() => new Date()))());
  await upsertSageOsSkill(store, skill);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: "skill_draft_created",
    actor: "sageos.skill_steward",
    summary: `Created SageOS draft skill ${skill.id} from workflow ${workflow.id}: ${skill.name}`,
    sensitivity: "normal",
  });
  return finish({ store, stateDir: params.stateDir, outcome: "drafted", skill });
}

function skillFromWorkflow(workflow: SageOsWorkflow, now: Date): SageOsSkillRecord {
  const timestamp = now.toISOString();
  return {
    id: skillIdForWorkflow(workflow.id),
    name: `Skill: ${workflow.name}`,
    state: "draft",
    workflowId: workflow.id,
    provenance: unique([workflow.id, ...workflow.sourceObservationIds]),
    triggerConditions: [workflow.trigger],
    tests: workflow.evalRefs.length > 0 ? workflow.evalRefs : workflow.sourceObservationIds,
    allowedScopes: workflow.policyScopes,
    rollbackRef: `${workflow.id}@${workflow.state}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function finish(params: {
  store: ReturnType<typeof createSageOsStateStore>;
  stateDir?: string;
  outcome: DraftSageOsSkillOutcome;
  skill?: SageOsSkillRecord;
}): Promise<DraftSageOsSkillFromWorkflowResult> {
  const status = await collectSageOsStatus({ stateDir: params.stateDir });
  await writeSageOsState(params.store, status);
  return {
    outcome: params.outcome,
    ...(params.skill ? { skill: params.skill } : {}),
    status,
  };
}

function skillIdForWorkflow(workflowId: string): string {
  const prefix = "workflow_";
  const stem = workflowId.startsWith(prefix) ? workflowId.slice(prefix.length) : workflowId;
  return `skill_${slugify(stem)}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "workflow";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
