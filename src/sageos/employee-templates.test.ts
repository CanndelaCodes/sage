import { describe, expect, it } from "vitest";
import { getSageOsEmployeeTemplate, listSageOsEmployeeTemplates } from "./employee-templates.js";

describe("SageOS employee templates", () => {
  it("defines the default MVP employee templates with policy and risk metadata", () => {
    const templates = listSageOsEmployeeTemplates();

    expect(templates.map((template) => template.name)).toEqual([
      "Security Sentinel",
      "PC Steward",
      "Windows Admin",
      "System Doctor",
      "Memory Steward",
      "Workflow Engineer",
      "Coding Worker",
      "Reviewer",
    ]);
    for (const template of templates) {
      expect(template.id).toMatch(/^[a-z0-9_]+$/);
      expect(template.role).toBeTruthy();
      expect(template.mission).toBeTruthy();
      expect(template.autonomyTier).toBeTruthy();
      expect(template.responsibilities.length).toBeGreaterThan(0);
      expect(template.allowedScopes.length).toBeGreaterThan(0);
      expect(template.deniedScopes.length).toBeGreaterThan(0);
      expect(template.risks.length).toBeGreaterThan(0);
    }
  });

  it("looks up a template by id", () => {
    expect(getSageOsEmployeeTemplate("memory_steward")).toMatchObject({
      id: "memory_steward",
      name: "Memory Steward",
      role: "memory",
    });
    expect(getSageOsEmployeeTemplate("missing")).toBeUndefined();
  });
});
