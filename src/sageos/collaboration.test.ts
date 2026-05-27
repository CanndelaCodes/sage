import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSageOsTaskHandoff, requestSageOsReview } from "./collaboration.js";
import { createSageOsStateStore, readSageOsState } from "./state-store.js";

describe("SageOS collaboration events", () => {
  it("creates a structured handoff event with an assigned proposed task", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-collab-handoff-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-05-27T19:00:00.000Z");

    const result = await createSageOsTaskHandoff({
      stateDir: root,
      stateStore: store,
      fromAgentId: "employee_pc_steward",
      toAgentId: "employee_reviewer",
      title: "Review disk warning",
      objective: "Review disk warning evidence and recommend next step.",
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "created",
      collaboration: {
        kind: "handoff",
        fromAgentId: "employee_pc_steward",
        toAgentId: "employee_reviewer",
        taskId: "task_handoff_employee_pc_steward_employee_reviewer_review_disk_warning",
        state: "open",
      },
      task: {
        id: "task_handoff_employee_pc_steward_employee_reviewer_review_disk_warning",
        ownerAgentId: "employee_reviewer",
        state: "proposed",
        requestedBy: "agent:employee_pc_steward",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      tasks: [
        {
          id: "task_handoff_employee_pc_steward_employee_reviewer_review_disk_warning",
          ownerAgentId: "employee_reviewer",
        },
      ],
      collaborations: [
        {
          kind: "handoff",
          fromAgentId: "employee_pc_steward",
          toAgentId: "employee_reviewer",
        },
      ],
    });
    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("collaboration_handoff");
  });

  it("records review requests with task and artifact links", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-collab-review-"));
    const store = createSageOsStateStore({ stateDir: root });
    const now = new Date("2026-05-27T19:05:00.000Z");

    const result = await requestSageOsReview({
      stateDir: root,
      stateStore: store,
      fromAgentId: "employee_coding",
      reviewerAgentId: "employee_reviewer",
      taskId: "task_coding",
      title: "Review coding report",
      summary: "Check diff and tests before handoff.",
      artifactRefs: ["coding_report_task_coding_1"],
      now: () => now,
    });

    expect(result).toMatchObject({
      outcome: "created",
      collaboration: {
        kind: "review_request",
        fromAgentId: "employee_coding",
        toAgentId: "employee_reviewer",
        taskId: "task_coding",
        title: "Review coding report",
        artifactRefs: ["coding_report_task_coding_1"],
        state: "open",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      collaborations: [
        {
          kind: "review_request",
          fromAgentId: "employee_coding",
          toAgentId: "employee_reviewer",
          taskId: "task_coding",
          artifactRefs: ["coding_report_task_coding_1"],
        },
      ],
    });
    const eventLog = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(eventLog).toContain("collaboration_review_requested");
  });
});
