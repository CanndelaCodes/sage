import type { SageOsApprovalRiskClass, SageOsConfig, SageOsPolicyScope } from "./types.js";

type SageOsPolicyConfig = NonNullable<SageOsConfig["policy"]>;

export function requiredSageOsApprovalRisk(
  scopes: SageOsPolicyScope[],
  cfg?: SageOsConfig,
): SageOsApprovalRiskClass | undefined {
  for (const scope of scopes) {
    const riskClass = riskClassForScope(scope);
    if (scope.risk === "high" || scope.risk === "critical") {
      return riskClass ?? "policy_change";
    }
    if (scope.risk === "medium" && ["channel", "network", "system"].includes(scope.kind)) {
      return riskClass ?? "policy_change";
    }
    if (riskClass && policyRequiresApproval(riskClass, cfg?.policy)) {
      return riskClass;
    }
  }
  return undefined;
}

function policyRequiresApproval(
  riskClass: SageOsApprovalRiskClass,
  policy: SageOsPolicyConfig | undefined,
): boolean {
  switch (riskClass) {
    case "destructive":
      return policy?.requireApprovalForDestructive !== false;
    case "external_write":
      return policy?.requireApprovalForExternalWrites !== false;
    case "production":
      return policy?.requireApprovalForProduction !== false;
    case "credentials":
      return policy?.requireApprovalForCredentials !== false;
    case "policy_change":
      return policy?.requireApprovalForPolicyChanges !== false;
    case "private_data_export":
      return policy?.requireApprovalForPrivateDataExport !== false;
    case "windows_setting":
      return true;
  }
  return false;
}

function riskClassForScope(scope: SageOsPolicyScope): SageOsApprovalRiskClass | undefined {
  if (scope.kind === "channel") {
    return "external_write";
  }
  if (scope.kind === "network") {
    return "production";
  }
  if (scope.kind === "system") {
    return "windows_setting";
  }
  if (scope.kind === "memory") {
    return "private_data_export";
  }
  if (scope.kind === "file" || scope.kind === "repo") {
    return "destructive";
  }
  if (scope.kind !== "tool") {
    return undefined;
  }
  const labels = [...(scope.allow ?? []), ...(scope.deny ?? [])];
  if (labels.some(hasCredentialText)) {
    return "credentials";
  }
  if (labels.some(hasPolicyText)) {
    return "policy_change";
  }
  return undefined;
}

function hasCredentialText(value: string): boolean {
  return /credential|secret|token|auth|password/i.test(value);
}

function hasPolicyText(value: string): boolean {
  return /policy|approval|guardrail|autonomy|permission|allowlist|denylist|safety/i.test(value);
}
