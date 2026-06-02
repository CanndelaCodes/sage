import { describe, expect, it } from "vitest";
import type { SageOsApprovalRiskClass, SageOsConfig, SageOsPolicyScope } from "./types.js";
import { requiredSageOsApprovalRisk } from "./policy.js";

describe("SageOS policy evaluation", () => {
  it.each<
    [
      label: string,
      scope: SageOsPolicyScope,
      policy: NonNullable<SageOsConfig["policy"]>,
      riskClass: SageOsApprovalRiskClass,
    ]
  >([
    [
      "destructive local file work",
      { kind: "file", allow: ["local_files"], risk: "low" },
      { requireApprovalForDestructive: true },
      "destructive",
    ],
    [
      "external channel writes",
      { kind: "channel", allow: ["telegram"], risk: "low" },
      { requireApprovalForExternalWrites: true },
      "external_write",
    ],
    [
      "production network effects",
      { kind: "network", allow: ["production_api"], risk: "low" },
      { requireApprovalForProduction: true },
      "production",
    ],
    [
      "credential tool changes",
      { kind: "tool", allow: ["credential_rotation"], risk: "low" },
      { requireApprovalForCredentials: true },
      "credentials",
    ],
    [
      "policy changes",
      { kind: "tool", allow: ["autonomy_policy_update"], risk: "low" },
      { requireApprovalForPolicyChanges: true },
      "policy_change",
    ],
    [
      "private memory export",
      { kind: "memory", allow: ["sage_memory_export"], risk: "low" },
      { requireApprovalForPrivateDataExport: true },
      "private_data_export",
    ],
  ])("requires approval for %s when configured", (_label, scope, policy, riskClass) => {
    expect(requiredSageOsApprovalRisk([scope], { policy })).toBe(riskClass);
  });

  it("does not escalate low-risk app observations into policy-change approvals", () => {
    expect(
      requiredSageOsApprovalRisk([{ kind: "app", allow: ["Code"], risk: "low" }], {
        policy: { requireApprovalForPolicyChanges: true },
      }),
    ).toBeUndefined();
  });
});
