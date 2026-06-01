import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SageOsAgentSpec } from "./types.js";
import { updateSageOsEmployeeLifecycle } from "./employee-lifecycle.js";
import { createSageOsStateStore, readSageOsState, upsertSageOsAgent } from "./state-store.js";

describe("SageOS employee lifecycle", () => {
  it("pauses, resumes, and retires employees with audit events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-employee-lifecycle-"));
    const store = createSageOsStateStore({ stateDir: root });
    await upsertSageOsAgent(store, employeeFixture({ status: "active" }));

    const paused = await updateSageOsEmployeeLifecycle({
      employeeId: "employee_memory",
      action: "pause",
      stateStore: store,
      stateDir: root,
      requestedBy: "test",
      reason: "maintenance",
      now: () => new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(paused).toMatchObject({
      outcome: "updated",
      employee: {
        id: "employee_memory",
        status: "paused",
        updatedAt: "2026-06-01T12:00:00.000Z",
      },
    });

    const resumed = await updateSageOsEmployeeLifecycle({
      employeeId: "employee_memory",
      action: "resume",
      stateStore: store,
      stateDir: root,
      requestedBy: "test",
      reason: "ready",
      now: () => new Date("2026-06-01T12:05:00.000Z"),
    });
    expect(resumed).toMatchObject({
      outcome: "updated",
      employee: {
        id: "employee_memory",
        status: "active",
        updatedAt: "2026-06-01T12:05:00.000Z",
      },
    });

    const retired = await updateSageOsEmployeeLifecycle({
      employeeId: "employee_memory",
      action: "retire",
      stateStore: store,
      stateDir: root,
      requestedBy: "test",
      reason: "replaced",
      now: () => new Date("2026-06-01T12:10:00.000Z"),
    });
    expect(retired).toMatchObject({
      outcome: "updated",
      employee: {
        id: "employee_memory",
        status: "retired",
        updatedAt: "2026-06-01T12:10:00.000Z",
      },
    });
    await expect(readSageOsState(store)).resolves.toMatchObject({
      agents: [{ id: "employee_memory", status: "retired" }],
    });
    const rawEvents = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(rawEvents).toContain("employee_paused");
    expect(rawEvents).toContain("employee_resumed");
    expect(rawEvents).toContain("employee_retired");
  });

  it("blocks unsafe lifecycle transitions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-employee-lifecycle-block-"));
    const store = createSageOsStateStore({ stateDir: root });
    await upsertSageOsAgent(store, employeeFixture({ status: "draft" }));

    const pauseDraft = await updateSageOsEmployeeLifecycle({
      employeeId: "employee_memory",
      action: "pause",
      stateStore: store,
      stateDir: root,
    });
    expect(pauseDraft).toMatchObject({
      outcome: "invalid_transition",
      employee: { id: "employee_memory", status: "draft" },
    });

    const resumeDraft = await updateSageOsEmployeeLifecycle({
      employeeId: "employee_memory",
      action: "resume",
      stateStore: store,
      stateDir: root,
    });
    expect(resumeDraft).toMatchObject({
      outcome: "invalid_transition",
      employee: { id: "employee_memory", status: "draft" },
    });

    const missing = await updateSageOsEmployeeLifecycle({
      employeeId: "missing",
      action: "pause",
      stateStore: store,
      stateDir: root,
    });
    expect(missing).toEqual({ outcome: "not_found", employeeId: "missing" });
  });
});

function employeeFixture(overrides: Partial<SageOsAgentSpec> = {}): SageOsAgentSpec {
  const now = "2026-06-01T11:00:00.000Z";
  return {
    id: "employee_memory",
    name: "Memory Steward",
    role: "memory",
    mission: "Keep memory healthy.",
    status: "active",
    autonomyTier: "execute_scoped",
    responsibilities: ["replay queues"],
    allowedScopes: [{ kind: "tool", allow: ["sage-memory"], risk: "medium" }],
    deniedScopes: [{ kind: "memory", deny: ["private_data_export"], risk: "critical" }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
