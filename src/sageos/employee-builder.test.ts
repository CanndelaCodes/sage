import { describe, expect, it } from "vitest";
import { buildSageOsEmployeeActivationPreview } from "./employee-activation.js";
import { draftSageOsEmployeeFromIntent } from "./employee-builder.js";

describe("draftSageOsEmployeeFromIntent", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("matches a default employee template from plain language and fills activation inputs", () => {
    const employee = draftSageOsEmployeeFromIntent({
      description:
        "Create a Security Sentinel that watches Defender, startup apps, and network posture, reports urgent issues immediately, summarizes daily, and asks before changing firewall settings.",
      now,
    });

    expect(employee).toMatchObject({
      id: "employee_security_sentinel",
      name: "Security Sentinel",
      role: "security",
      mission:
        "Create a Security Sentinel that watches Defender, startup apps, and network posture, reports urgent issues immediately, summarizes daily, and asks before changing firewall settings.",
      status: "draft",
      autonomyTier: "observe",
      responsibilities: expect.arrayContaining([
        "watch security signals",
        "open incidents",
        "request remediation review",
      ]),
      tools: expect.arrayContaining(["sageos.system-observer", "windows-security-readonly"]),
      memoryScopes: expect.arrayContaining(["security_observations", "incidents"]),
      schedules: expect.arrayContaining([
        "gateway tick",
        "daily digest",
        "urgent incident trigger",
      ]),
      risks: expect.arrayContaining(["false positives", "sensitive security context in summaries"]),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(employee.allowedScopes).toEqual(
      expect.arrayContaining([
        { kind: "system", allow: ["security_status", "defender_status"], risk: "low" },
      ]),
    );
    expect(employee.deniedScopes).toEqual(
      expect.arrayContaining([{ kind: "system", deny: ["destructive"], risk: "critical" }]),
    );

    const preview = buildSageOsEmployeeActivationPreview(employee);
    expect(preview).toMatchObject({
      employeeId: "employee_security_sentinel",
      tools: expect.arrayContaining(["sageos.system-observer", "windows-security-readonly"]),
      memoryAccess: expect.arrayContaining(["security_observations", "incidents"]),
      schedules: expect.arrayContaining(["daily digest", "urgent incident trigger"]),
      approvalRequired: false,
    });
  });

  it("honors explicit template and user overrides while preserving template guardrails", () => {
    const employee = draftSageOsEmployeeFromIntent({
      description: "Keep capture replay healthy and export the local wiki every morning.",
      templateId: "memory_steward",
      name: "Memory Reliability Steward",
      autonomyTier: "suggest",
      now,
    });

    expect(employee).toMatchObject({
      id: "employee_memory_reliability_steward",
      name: "Memory Reliability Steward",
      role: "memory",
      autonomyTier: "suggest",
      allowedScopes: expect.arrayContaining([
        {
          kind: "memory",
          allow: ["capture_queue", "activity_queue", "export_wiki"],
          risk: "medium",
        },
        { kind: "tool", allow: ["sage-memory"], risk: "medium" },
      ]),
      deniedScopes: expect.arrayContaining([
        { kind: "memory", deny: ["private_data_export"], risk: "critical" },
      ]),
      tools: expect.arrayContaining(["sage-memory"]),
      memoryScopes: expect.arrayContaining(["capture_queue", "activity_queue", "export_wiki"]),
      schedules: expect.arrayContaining(["gateway tick", "daily digest"]),
    });
  });

  it("falls back to a conservative generalist draft when no template matches", () => {
    const employee = draftSageOsEmployeeFromIntent({
      description: "Track new ideas I mention and propose a weekly summary.",
      now,
    });

    expect(employee).toMatchObject({
      id: "employee_track_new_ideas",
      name: "Track New Ideas",
      role: "generalist",
      autonomyTier: "suggest",
      allowedScopes: [],
      tools: ["sage"],
      memoryScopes: ["local task and audit metadata"],
      schedules: ["manual review", "weekly summary"],
      risks: ["scope drift without review"],
    });
    expect(employee.deniedScopes).toEqual(
      expect.arrayContaining([
        { kind: "system", deny: ["destructive"], risk: "critical" },
        { kind: "memory", deny: ["private_data_export"], risk: "critical" },
      ]),
    );
  });
});
