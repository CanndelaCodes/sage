import {
  getSageOsEmployeeTemplate,
  listSageOsEmployeeTemplates,
  type SageOsEmployeeTemplate,
} from "./employee-templates.js";
import {
  normalizeSageOsMode,
  type SageOsAgentSpec,
  type SageOsAutonomyMode,
  type SageOsPolicyScope,
} from "./types.js";

export type SageOsEmployeeDraftInput = {
  description: string;
  name?: string;
  role?: string;
  autonomyTier?: string;
  templateId?: string;
  now?: Date;
};

const DEFAULT_DENIED_SCOPES: SageOsPolicyScope[] = [
  { kind: "system", deny: ["destructive"], risk: "critical" },
  { kind: "network", deny: ["production_write"], risk: "critical" },
  { kind: "tool", deny: ["credential_change"], risk: "critical" },
  { kind: "memory", deny: ["private_data_export"], risk: "critical" },
];

const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  security_sentinel: [
    "security",
    "sentinel",
    "defender",
    "firewall",
    "malware",
    "network posture",
    "security center",
  ],
  pc_steward: ["pc", "disk", "startup", "update", "process", "resource", "cleanup", "hygiene"],
  windows_admin: ["windows admin", "administrator", "powershell", "registry", "service"],
  system_doctor: ["doctor", "diagnose", "diagnostic", "gateway", "logs", "service health"],
  memory_steward: ["memory", "capture", "replay", "obsidian", "consolidate", "export wiki"],
  workflow_engineer: ["workflow", "automation", "repeated", "skill", "deterministic"],
  coding_worker: ["coding", "code", "repo", "test", "build", "pull request", "diff"],
  reviewer: ["review", "reviewer", "verify", "evidence", "block unsafe"],
};

const TEMPLATE_TOOLS: Record<string, string[]> = {
  security_sentinel: ["sageos.system-observer", "windows-security-readonly"],
  pc_steward: ["sageos.system-observer"],
  windows_admin: ["powershell_readonly", "sageos.approvals"],
  system_doctor: ["sage_doctor", "sage_os_doctor"],
  memory_steward: ["sage-memory"],
  workflow_engineer: ["skill_scaffold", "workflow_draft"],
  coding_worker: ["git_read", "test", "build"],
  reviewer: ["diff_read", "test_read", "build_read"],
};

const TEMPLATE_MEMORY_SCOPES: Record<string, string[]> = {
  security_sentinel: ["security_observations", "incidents"],
  pc_steward: ["system_observations", "incidents"],
  windows_admin: ["approval_history", "system_observations"],
  system_doctor: ["diagnostic_history", "incidents"],
  memory_steward: ["capture_queue", "activity_queue", "export_wiki"],
  workflow_engineer: ["workflow_candidates", "skill_history"],
  coding_worker: ["task_history", "coding_reports"],
  reviewer: ["review_history", "coding_reports"],
};

const TEMPLATE_SCHEDULES: Record<string, string[]> = {
  security_sentinel: ["gateway tick"],
  pc_steward: ["gateway tick", "daily hygiene review"],
  windows_admin: ["manual review"],
  system_doctor: ["gateway tick"],
  memory_steward: ["gateway tick"],
  workflow_engineer: ["weekly pattern review"],
  coding_worker: ["manual task assignment"],
  reviewer: ["manual review"],
};

export function draftSageOsEmployeeFromIntent(input: SageOsEmployeeDraftInput): SageOsAgentSpec {
  const description = input.description.trim();
  if (!description) {
    throw new Error("Employee description required.");
  }

  const template = resolveEmployeeTemplate(input);
  const now = input.now ?? new Date();
  const name = input.name?.trim() || template?.name || inferEmployeeName(description);
  const role = input.role?.trim() || template?.role || "generalist";
  const autonomyTier = resolveAutonomyTier(input.autonomyTier, template);
  const allowedScopes = cloneScopes(template?.allowedScopes ?? []);
  const deniedScopes = cloneScopes(
    template?.deniedScopes?.length ? template.deniedScopes : DEFAULT_DENIED_SCOPES,
  );
  const templateId = template?.id;

  return {
    id: `employee_${slugify(name)}`,
    name,
    role,
    mission: description,
    description: template?.mission,
    status: "draft",
    autonomyTier,
    responsibilities: uniqueStrings([...(template?.responsibilities ?? []), description]),
    allowedScopes,
    deniedScopes,
    tools: resolveTools(templateId, allowedScopes),
    memoryScopes: resolveMemoryScopes(templateId, allowedScopes),
    schedules: resolveSchedules(description, templateId),
    risks: uniqueStrings([...(template?.risks ?? []), ...risksFromIntent(description)]),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function resolveEmployeeTemplate(
  input: SageOsEmployeeDraftInput,
): SageOsEmployeeTemplate | undefined {
  if (input.templateId?.trim()) {
    const template = getSageOsEmployeeTemplate(input.templateId);
    if (!template) {
      throw new Error(`SageOS employee template not found: ${input.templateId}`);
    }
    return template;
  }

  const haystack = [input.name, input.role, input.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return listSageOsEmployeeTemplates()
    .map((template) => ({ template, score: scoreTemplate(template, haystack) }))
    .filter((entry) => entry.score > 0)
    .toSorted((left, right) => right.score - left.score)[0]?.template;
}

function scoreTemplate(template: SageOsEmployeeTemplate, haystack: string): number {
  let score = 0;
  if (haystack.includes(template.id.replaceAll("_", " "))) {
    score += 20;
  }
  if (haystack.includes(template.name.toLowerCase())) {
    score += 20;
  }
  if (haystack.includes(template.role.toLowerCase())) {
    score += 8;
  }
  for (const keyword of TEMPLATE_KEYWORDS[template.id] ?? []) {
    if (haystack.includes(keyword)) {
      score += 2;
    }
  }
  return score;
}

function resolveAutonomyTier(
  value: string | undefined,
  template: SageOsEmployeeTemplate | undefined,
): SageOsAutonomyMode {
  return value?.trim() ? normalizeSageOsMode(value) : (template?.autonomyTier ?? "suggest");
}

function resolveTools(templateId: string | undefined, scopes: SageOsPolicyScope[]): string[] {
  const scopedTools = scopes
    .filter((scope) => scope.kind === "tool")
    .flatMap((scope) => scope.allow ?? []);
  return uniqueStrings([
    ...(templateId ? (TEMPLATE_TOOLS[templateId] ?? []) : []),
    ...scopedTools,
    "sage",
  ]);
}

function resolveMemoryScopes(
  templateId: string | undefined,
  scopes: SageOsPolicyScope[],
): string[] {
  const scopedMemory = scopes
    .filter((scope) => scope.kind === "memory")
    .flatMap((scope) => scope.allow ?? []);
  const resolved = uniqueStrings([
    ...(templateId ? (TEMPLATE_MEMORY_SCOPES[templateId] ?? []) : []),
    ...scopedMemory,
  ]);
  return resolved.length > 0 ? resolved : ["local task and audit metadata"];
}

function resolveSchedules(description: string, templateId: string | undefined): string[] {
  const text = description.toLowerCase();
  const schedules = [...(templateId ? (TEMPLATE_SCHEDULES[templateId] ?? []) : ["manual review"])];
  if (/\bdaily\b|every morning|summari[sz]es daily/.test(text)) {
    schedules.push("daily digest");
  }
  if (/\bweekly\b|every week/.test(text)) {
    schedules.push("weekly summary");
  }
  if (/\bhourly\b|every hour/.test(text)) {
    schedules.push("hourly check");
  }
  if (/\burgent\b|immediate|as soon as/.test(text)) {
    schedules.push("urgent incident trigger");
  }
  if (/\bstartup\b/.test(text)) {
    schedules.push("startup review");
  }
  return uniqueStrings(schedules);
}

function risksFromIntent(description: string): string[] {
  const text = description.toLowerCase();
  const risks: string[] = [];
  if (/\bdelete\b|\bremove\b|firewall|registry|setting/.test(text)) {
    risks.push("privileged changes require approval");
  }
  if (/\bsend\b|\bpost\b|email|telegram|slack|discord/.test(text)) {
    risks.push("external communication requires approval");
  }
  return risks.length > 0 ? risks : ["scope drift without review"];
}

function cloneScopes(scopes: SageOsPolicyScope[]): SageOsPolicyScope[] {
  return scopes.map((scope) => ({ ...scope }));
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))];
}
