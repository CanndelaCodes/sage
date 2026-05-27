import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SageMemoryDoctorReport } from "../memory/sage-memory-doctor.js";
import { enqueueLearningEvents, listLearningEventQueue } from "../learning/activity-queue.js";
import { normalizeLearningEvent } from "../learning/events.js";
import { runSageOsMemoryDoctorOnce, runSageOsMemoryStewardOnce } from "./memory-steward.js";
import { createSageOsStateStore, readSageOsState } from "./state-store.js";

const cfg = {
  memory: {
    backend: "sage-memory",
    remote: {
      baseUrl: "http://127.0.0.1:18790",
      tokenEnv: "SAGE_MEMORY_TOKEN",
      defaultNamespace: "sage.activity",
    },
  },
  sageos: { memory: { replayQueues: true } },
} as const;

describe("SageOS memory steward", () => {
  it("replays learning queue events and refreshes status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-steward-ok-"));
    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");
    const event = normalizeLearningEvent(
      {
        source: "app_focus",
        actor: "local-user",
        title: "Code: SageOS",
        text: "Observed approved app focus.",
      },
      {
        now: () => new Date("2026-05-27T17:00:00.000Z"),
        idFactory: () => "learning_focus",
      },
    );
    await enqueueLearningEvents({ queuePath: learningQueuePath, events: [event] });

    const result = await runSageOsMemoryStewardOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: path.join(
        root,
        "agents",
        "main",
        "sage-memory",
        "capture-queue.json",
      ),
      learningActivityQueuePath: learningQueuePath,
      replayMemoryCaptureQueue: async () => ({
        attempted: 0,
        captured: 0,
        failed: 0,
        remaining: 0,
        results: [],
      }),
      ingestActivityEvents: async (events, namespace) => ({
        namespace: namespace ?? "sage.activity",
        accepted: events.length,
        evidenceIds: ["evidence_activity"],
        activityNodeIds: ["activity_node"],
        deduplicated: false,
        eventIds: events.map((entry) => entry.id),
      }),
      now: () => new Date("2026-05-27T17:01:00.000Z"),
    });

    expect(result.memory).toMatchObject({ attempted: 0, captured: 0, failed: 0 });
    expect(result.learning).toMatchObject({
      attempted: 1,
      accepted: 1,
      failed: 0,
      remaining: 0,
    });
    await expect(listLearningEventQueue({ queuePath: learningQueuePath })).resolves.toMatchObject({
      counts: { total: 0, pending: 0, failed: 0 },
    });
    expect(result.status.learning.activityQueue).toMatchObject({ total: 0, failed: 0 });
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_steward_replayed");
  });

  it("keeps failed replay visible in status and audit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-steward-fail-"));
    const learningQueuePath = path.join(root, "agents", "main", "learning", "activity-queue.json");
    const event = normalizeLearningEvent(
      {
        source: "tool_usage",
        actor: "agent:main",
        title: "Useful command",
        text: "A useful command should be retained.",
      },
      {
        now: () => new Date("2026-05-27T17:05:00.000Z"),
        idFactory: () => "learning_tool",
      },
    );
    await enqueueLearningEvents({ queuePath: learningQueuePath, events: [event] });

    const result = await runSageOsMemoryStewardOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      memoryCaptureQueuePath: path.join(
        root,
        "agents",
        "main",
        "sage-memory",
        "capture-queue.json",
      ),
      learningActivityQueuePath: learningQueuePath,
      replayMemoryCaptureQueue: async () => ({
        attempted: 1,
        captured: 0,
        failed: 1,
        remaining: 1,
        results: [{ id: "capture_1", status: "failed", error: "memory offline" }],
      }),
      ingestActivityEvents: async () => {
        throw new Error("activity ingest offline");
      },
      now: () => new Date("2026-05-27T17:06:00.000Z"),
    });

    expect(result.memory).toMatchObject({ attempted: 1, captured: 0, failed: 1, remaining: 1 });
    expect(result.learning).toMatchObject({
      attempted: 1,
      accepted: 0,
      failed: 1,
      remaining: 1,
    });
    expect(result.status.learning.activityQueue).toMatchObject({ total: 1, failed: 1 });
    expect(result.status.incidents.map((incident) => incident.category)).toContain("learning");
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_steward_replay_failed");
  });

  it("runs the Sage Memory doctor and persists wiki export proof", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-doctor-ok-"));
    const calls: unknown[] = [];

    const result = await runSageOsMemoryDoctorOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      namespace: "sage.sessions.diagnostics",
      runMemoryDoctor: async (params) => {
        calls.push(params);
        return doctorReport();
      },
      now: () => new Date("2026-05-27T17:30:00.000Z"),
    });

    expect(result.doctor.ok).toBe(true);
    expect(result.status.memory).toMatchObject({
      status: "ok",
      doctor: {
        ok: true,
        checkedAt: "2026-05-27T17:30:00.000Z",
        checks: 2,
        failures: 0,
        warnings: 0,
        exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
        diagnosticNamespace: "sage.sessions.diagnostics",
        sessionNodePath: "sage-memory/node_doctor",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      cfg,
      agentId: "main",
      namespace: "sage.sessions.diagnostics",
      queuePath: path.join(root, "agents", "main", "sage-memory", "capture-queue.json"),
    });

    const persisted = await readSageOsState(createSageOsStateStore({ stateDir: root }));
    expect(persisted.status.memory.doctor).toMatchObject({
      ok: true,
      exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
    });
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_doctor_passed");
  });

  it("degrades memory status and audits failed doctor reports", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sageos-memory-doctor-fail-"));

    const result = await runSageOsMemoryDoctorOnce({
      cfg,
      stateDir: root,
      agentId: "main",
      runMemoryDoctor: async () =>
        doctorReport({
          ok: false,
          checks: [{ name: "health", status: "fail", message: "/health failed: offline" }],
          warnings: ["Capture queue has 1 pending item"],
          failures: ["/health failed: offline"],
          exportedFiles: [],
        }),
      now: () => new Date("2026-05-27T17:31:00.000Z"),
    });

    expect(result.status.memory.status).toBe("degraded");
    expect(result.status.memory.doctor).toMatchObject({
      ok: false,
      checkedAt: "2026-05-27T17:31:00.000Z",
      failures: 1,
      warnings: 1,
      exportedFiles: [],
    });
    expect(result.status.incidents.map((incident) => incident.id)).toContain(
      "incident_memory_doctor_failed",
    );
    const events = await readFile(path.join(root, "sageos", "events.jsonl"), "utf8");
    expect(events).toContain("memory_doctor_failed");
  });
});

function doctorReport(overrides: Partial<SageMemoryDoctorReport> = {}): SageMemoryDoctorReport {
  return {
    ok: true,
    agentId: "main",
    baseUrl: "http://127.0.0.1:18790",
    namespace: "sage.sessions",
    diagnosticNamespace: "sage.sessions.diagnostics",
    marker: "sage-memory-doctor-2026-05-27T17-30-00-000Z-fixed",
    nodeId: "node_doctor",
    sessionNodePath: "sage-memory/node_doctor",
    exportedFiles: ["C:/Users/jason/SecondBrain/vault/Sage Memory Doctor.md"],
    checks: [
      { name: "ingest", status: "pass", message: "Diagnostic LLM session ingested" },
      { name: "export", status: "pass", message: "Diagnostic namespace exported" },
    ],
    warnings: [],
    failures: [],
    suggestions: [],
    ...overrides,
  };
}
