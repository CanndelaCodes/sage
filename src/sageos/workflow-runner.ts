import type { SageOsConfig, SageOsStatusSnapshot, SageOsWorkflow } from "./types.js";
import { appendSageOsEvent, createSageOsEventLog } from "./event-log.js";
import {
  createSageOsStateStore,
  readSageOsState,
  upsertSageOsWorkflow,
  writeSageOsState,
} from "./state-store.js";
import { collectSageOsStatus } from "./status.js";

export type SageOsWorkflowDryRunOutcome = "passed" | "failed" | "missing_workflow";

export type SageOsWorkflowDryRunReport = {
  id: string;
  workflowId: string;
  passed: boolean;
  checkedObservationIds: string[];
  missingObservationIds: string[];
  secretObservationIds: string[];
  summary: string;
  createdAt: string;
};

export type DryRunSageOsWorkflowResult = {
  outcome: SageOsWorkflowDryRunOutcome;
  workflow?: SageOsWorkflow;
  report?: SageOsWorkflowDryRunReport;
  status: SageOsStatusSnapshot;
};

export async function dryRunSageOsWorkflow(params: {
  stateDir?: string;
  workflowId: string;
  now?: () => Date;
  cfg?: SageOsConfig;
}): Promise<DryRunSageOsWorkflowResult> {
  const store = createSageOsStateStore({ stateDir: params.stateDir });
  const state = await readSageOsState(store);
  const workflow = state.workflows.find((item) => item.id === params.workflowId);
  if (!workflow) {
    const status = await collectAndPersistStatus(store, params.stateDir, params.cfg);
    return { outcome: "missing_workflow", status };
  }

  const now = (params.now ?? (() => new Date()))().toISOString();
  const report = buildDryRunReport({
    workflow,
    observations: state.observations,
    now,
  });
  const nextWorkflow: SageOsWorkflow = {
    ...workflow,
    state: report.passed ? "dry_run_passed" : "failed",
    evalRefs: unique([...workflow.evalRefs, report.id]),
    updatedAt: now,
  };
  await upsertSageOsWorkflow(store, nextWorkflow);
  await appendSageOsEvent(createSageOsEventLog({ stateDir: params.stateDir }), {
    type: report.passed ? "workflow_dry_run_passed" : "workflow_dry_run_failed",
    actor: "sageos.workflow_runner",
    summary: report.summary,
    sensitivity: "normal",
  });

  const status = await collectAndPersistStatus(store, params.stateDir, params.cfg);
  return {
    outcome: report.passed ? "passed" : "failed",
    workflow: nextWorkflow,
    report,
    status,
  };
}

function buildDryRunReport(params: {
  workflow: SageOsWorkflow;
  observations: Awaited<ReturnType<typeof readSageOsState>>["observations"];
  now: string;
}): SageOsWorkflowDryRunReport {
  const observationById = new Map(
    params.observations.map((observation) => [observation.id, observation]),
  );
  const sourceIds = unique(params.workflow.sourceObservationIds);
  const missingObservationIds = sourceIds.filter((id) => !observationById.has(id));
  const secretObservationIds = sourceIds.filter(
    (id) => observationById.get(id)?.sensitivity === "secret",
  );
  const checkedObservationIds = sourceIds.filter(
    (id) => observationById.has(id) && observationById.get(id)?.sensitivity !== "secret",
  );
  const passed =
    checkedObservationIds.length > 0 &&
    missingObservationIds.length === 0 &&
    secretObservationIds.length === 0;
  return {
    id: `eval_${params.workflow.id}_${compactIso(params.now)}`,
    workflowId: params.workflow.id,
    passed,
    checkedObservationIds,
    missingObservationIds,
    secretObservationIds,
    summary: passed
      ? `Workflow ${params.workflow.id} dry-run passed against ${checkedObservationIds.length} captured example(s).`
      : `Workflow ${params.workflow.id} dry-run failed: ${missingObservationIds.length} missing, ${secretObservationIds.length} secret.`,
    createdAt: params.now,
  };
}

async function collectAndPersistStatus(
  store: ReturnType<typeof createSageOsStateStore>,
  stateDir: string | undefined,
  cfg: SageOsConfig | undefined,
): Promise<SageOsStatusSnapshot> {
  const status = await collectSageOsStatus({ stateDir, cfg });
  await writeSageOsState(store, status);
  return status;
}

function compactIso(value: string): string {
  return value.replace(/[-:.]/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
