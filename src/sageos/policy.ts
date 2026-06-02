import {
  SAGEOS_AUTONOMY_TIERS,
  normalizeSageOsMode,
  type SageOsApprovalRiskClass,
  type SageOsAutonomyMode,
  type SageOsConfig,
  type SageOsPolicyScope,
} from "./types.js";

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

export type SageOsAutonomyPolicyDecision =
  | {
      allowed: true;
      currentMode: SageOsAutonomyMode;
      requiredMode: SageOsAutonomyMode;
    }
  | {
      allowed: false;
      currentMode: SageOsAutonomyMode;
      requiredMode: SageOsAutonomyMode;
      riskClass: "policy_change";
      reason: string;
    };

export function evaluateSageOsAutonomyTier(
  requiredMode: SageOsAutonomyMode | undefined,
  cfg?: SageOsConfig,
): SageOsAutonomyPolicyDecision {
  const currentMode = normalizeSageOsMode(cfg?.policy?.defaultTier ?? cfg?.mode);
  const normalizedRequiredMode = normalizeSageOsMode(requiredMode);
  if (autonomyRank(normalizedRequiredMode) <= autonomyRank(currentMode)) {
    return { allowed: true, currentMode, requiredMode: normalizedRequiredMode };
  }
  return {
    allowed: false,
    currentMode,
    requiredMode: normalizedRequiredMode,
    riskClass: "policy_change",
    reason: `requires ${normalizedRequiredMode} autonomy while current policy allows ${currentMode}`,
  };
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

function autonomyRank(mode: SageOsAutonomyMode): number {
  return SAGEOS_AUTONOMY_TIERS.find((tier) => tier.mode === mode)?.tier ?? 0;
}

function riskClassForScope(scope: SageOsPolicyScope): SageOsApprovalRiskClass | undefined {
  if (scope.kind === "channel") {
    return "external_write";
  }
  if (scope.kind === "network") {
    return "production";
  }
  if (scope.kind === "system") {
    return systemScopeChangesWindowsSettings(scope) ? "windows_setting" : undefined;
  }
  if (scope.kind === "memory") {
    return memoryScopeExportsPrivateData(scope) ? "private_data_export" : undefined;
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

function memoryScopeExportsPrivateData(scope: SageOsPolicyScope): boolean {
  return [...(scope.allow ?? []), ...(scope.deny ?? [])].some((value) =>
    /export|upload|external|private|share|send|publish|telegram|slack|discord/i.test(value),
  );
}

function systemScopeChangesWindowsSettings(scope: SageOsPolicyScope): boolean {
  return [...(scope.allow ?? []), ...(scope.deny ?? [])].some((value) =>
    /admin|setting|registry|firewall|restart|install|uninstall|write|mutate|destructive|windows_system/i.test(
      value,
    ),
  );
}
