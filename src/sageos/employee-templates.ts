import type { SageOsAutonomyMode, SageOsPolicyScope } from "./types.js";

export type SageOsEmployeeTemplate = {
  id: string;
  name: string;
  role: string;
  mission: string;
  autonomyTier: SageOsAutonomyMode;
  responsibilities: string[];
  allowedScopes: SageOsPolicyScope[];
  deniedScopes: SageOsPolicyScope[];
  risks: string[];
};

const denyHighRiskScopes: SageOsPolicyScope[] = [
  { kind: "system", deny: ["destructive"], risk: "critical" },
  { kind: "network", deny: ["production_write"], risk: "critical" },
  { kind: "tool", deny: ["credential_change"], risk: "critical" },
  { kind: "memory", deny: ["private_data_export"], risk: "critical" },
];

const employeeTemplates: SageOsEmployeeTemplate[] = [
  {
    id: "security_sentinel",
    name: "Security Sentinel",
    role: "security",
    mission:
      "Monitor local security posture and surface findings without taking destructive action.",
    autonomyTier: "observe",
    responsibilities: ["watch security signals", "open incidents", "request remediation review"],
    allowedScopes: [
      { kind: "system", allow: ["security_status", "defender_status"], risk: "low" },
      { kind: "app", allow: ["security_center"], risk: "low" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["false positives", "sensitive security context in summaries"],
  },
  {
    id: "pc_steward",
    name: "PC Steward",
    role: "pc-management",
    mission:
      "Keep local PC hygiene visible, including disk, startup, update, and resource posture.",
    autonomyTier: "suggest",
    responsibilities: [
      "summarize system hygiene",
      "recommend cleanup",
      "track recurring PC issues",
    ],
    allowedScopes: [
      { kind: "system", allow: ["disk_status", "startup_status", "process_status"], risk: "low" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["overbroad cleanup suggestions", "private app names in reports"],
  },
  {
    id: "windows_admin",
    name: "Windows Admin",
    role: "windows-admin",
    mission: "Prepare reviewed Windows administration actions for explicit approval.",
    autonomyTier: "prepare",
    responsibilities: ["draft admin commands", "explain risk", "wait for approval"],
    allowedScopes: [
      { kind: "system", allow: ["windows_status", "service_status"], risk: "medium" },
      { kind: "tool", allow: ["powershell_readonly"], risk: "medium" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["admin command mistakes", "requires strict approval before writes"],
  },
  {
    id: "system_doctor",
    name: "System Doctor",
    role: "diagnostics",
    mission: "Diagnose SageOS, gateway, memory, queue, and local service health problems.",
    autonomyTier: "suggest",
    responsibilities: ["run read-only diagnostics", "create incidents", "recommend repair steps"],
    allowedScopes: [
      { kind: "system", allow: ["logs_read", "service_status"], risk: "low" },
      { kind: "tool", allow: ["sage_doctor", "sage_os_doctor"], risk: "low" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["diagnostic noise", "log privacy exposure"],
  },
  {
    id: "memory_steward",
    name: "Memory Steward",
    role: "memory",
    mission: "Keep Sage Memory capture, replay, consolidation, and Obsidian export healthy.",
    autonomyTier: "execute_scoped",
    responsibilities: ["watch capture queues", "replay safe queues", "surface memory incidents"],
    allowedScopes: [
      { kind: "memory", allow: ["capture_queue", "activity_queue", "export_wiki"], risk: "medium" },
      { kind: "tool", allow: ["sage-memory"], risk: "medium" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["capturing sensitive text", "incorrect memory consolidation"],
  },
  {
    id: "workflow_engineer",
    name: "Workflow Engineer",
    role: "workflow",
    mission: "Turn repeated work patterns into reviewed deterministic workflows and skills.",
    autonomyTier: "prepare",
    responsibilities: ["identify repeatable workflows", "draft automations", "request review"],
    allowedScopes: [
      { kind: "tool", allow: ["skill_scaffold", "workflow_draft"], risk: "medium" },
      { kind: "repo", allow: ["local_sage_repo"], risk: "medium" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["automating the wrong pattern", "scope creep without review"],
  },
  {
    id: "coding_worker",
    name: "Coding Worker",
    role: "coding",
    mission: "Implement scoped coding tasks with tests, verification, and review handoff.",
    autonomyTier: "execute_scoped",
    responsibilities: ["make scoped code changes", "run tests", "produce audit evidence"],
    allowedScopes: [
      { kind: "repo", allow: ["approved_repos"], risk: "medium" },
      { kind: "tool", allow: ["git_read", "test", "build"], risk: "medium" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["unintended code changes", "dependency or release actions require approval"],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    role: "review",
    mission: "Review employee work, validate evidence, and block unsafe or incomplete changes.",
    autonomyTier: "suggest",
    responsibilities: ["review plans", "check diffs", "verify evidence", "raise blockers"],
    allowedScopes: [
      { kind: "repo", allow: ["diff_read"], risk: "low" },
      { kind: "tool", allow: ["test_read", "build_read"], risk: "low" },
    ],
    deniedScopes: denyHighRiskScopes,
    risks: ["missed defects", "overblocking safe work"],
  },
];

export function listSageOsEmployeeTemplates(): SageOsEmployeeTemplate[] {
  return employeeTemplates.map(cloneTemplate);
}

export function getSageOsEmployeeTemplate(id: string): SageOsEmployeeTemplate | undefined {
  const normalized = id.trim().toLowerCase();
  const template = employeeTemplates.find((entry) => entry.id === normalized);
  return template ? cloneTemplate(template) : undefined;
}

function cloneTemplate(template: SageOsEmployeeTemplate): SageOsEmployeeTemplate {
  return {
    ...template,
    responsibilities: [...template.responsibilities],
    allowedScopes: template.allowedScopes.map((scope) => ({ ...scope })),
    deniedScopes: template.deniedScopes.map((scope) => ({ ...scope })),
    risks: [...template.risks],
  };
}
