import { describe, expect, it } from "vitest";
import type { RememberedChoice } from "../config/types.confirmation.js";
import {
  checkBrowserConfirmation,
  checkFileDeleteConfirmation,
  checkNetworkConfirmation,
  checkPaymentConfirmation,
  checkShellCommandConfirmation,
  clearRememberedChoices,
  isExpired,
  markRememberedChoiceApplied,
  processConfirmationResponse,
  removeRememberedChoice,
  resolveExpired,
} from "./confirmation.js";
import { createTrustProfile } from "./guardrails.js";

// ---------------------------------------------------------------------------
// checkShellCommandConfirmation
// ---------------------------------------------------------------------------

describe("checkShellCommandConfirmation", () => {
  it("returns needsConfirmation for rm under balanced preset", () => {
    const profile = createTrustProfile();
    const result = checkShellCommandConfirmation("rm ./temp.txt", undefined, profile, []);
    expect(result.needsConfirmation).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.request).toBeDefined();
    expect(result.request!.context.kind).toBe("shell_command");
  });

  it("blocks hard-blocked commands", () => {
    const profile = createTrustProfile();
    const result = checkShellCommandConfirmation("sudo rm -rf /etc", undefined, profile, []);
    expect(result.blocked).toBe(true);
    expect(result.needsConfirmation).toBe(false);
  });

  it("detects pipes in shell commands", () => {
    const profile = createTrustProfile();
    const result = checkShellCommandConfirmation("ls | grep foo", undefined, profile, []);
    expect(result.request?.context.kind).toBe("shell_command");
    if (result.request?.context.kind === "shell_command") {
      expect(result.request.context.hasPipes).toBe(true);
      expect(result.request.context.hasChains).toBe(false);
    }
  });

  it("detects chain operators in shell commands", () => {
    const profile = createTrustProfile();
    const result = checkShellCommandConfirmation("mkdir foo && cd foo", undefined, profile, []);
    if (result.request?.context.kind === "shell_command") {
      expect(result.request.context.hasChains).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// checkFileDeleteConfirmation
// ---------------------------------------------------------------------------

describe("checkFileDeleteConfirmation", () => {
  it("creates file_destruction confirmation for file deletion", () => {
    const profile = createTrustProfile();
    const result = checkFileDeleteConfirmation(["./temp.txt"], false, undefined, profile, []);
    expect(result.needsConfirmation).toBe(true);
    expect(result.request?.context.kind).toBe("file_destruction");
    if (result.request?.context.kind === "file_destruction") {
      expect(result.request.context.paths).toEqual(["./temp.txt"]);
      expect(result.request.context.recursive).toBe(false);
    }
  });

  it("reports recursive deletion", () => {
    const profile = createTrustProfile();
    const result = checkFileDeleteConfirmation(
      ["./dist", "./node_modules"],
      true,
      undefined,
      profile,
      [],
    );
    if (result.request?.context.kind === "file_destruction") {
      expect(result.request.context.recursive).toBe(true);
      expect(result.request.context.paths).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// checkNetworkConfirmation
// ---------------------------------------------------------------------------

describe("checkNetworkConfirmation", () => {
  it("creates network_exposure confirmation", () => {
    const profile = createTrustProfile();
    const result = checkNetworkConfirmation(
      "https://api.example.com/data",
      "GET",
      false,
      undefined,
      profile,
      [],
    );
    expect(result.needsConfirmation).toBe(true);
    expect(result.request?.context.kind).toBe("network_exposure");
    if (result.request?.context.kind === "network_exposure") {
      expect(result.request.context.external).toBe(true);
      expect(result.request.context.sendsData).toBe(false);
    }
  });

  it("detects localhost as non-external", () => {
    const profile = createTrustProfile();
    const result = checkNetworkConfirmation(
      "http://localhost:3000/api",
      "POST",
      true,
      undefined,
      profile,
      [],
    );
    if (result.request?.context.kind === "network_exposure") {
      expect(result.request.context.external).toBe(false);
      expect(result.request.context.sendsData).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// checkBrowserConfirmation
// ---------------------------------------------------------------------------

describe("checkBrowserConfirmation", () => {
  it("creates browser_automation confirmation", () => {
    const profile = createTrustProfile();
    const result = checkBrowserConfirmation(
      "https://example.com",
      "click button#submit",
      undefined,
      profile,
      [],
    );
    expect(result.needsConfirmation).toBe(true);
    if (result.request?.context.kind === "browser_automation") {
      expect(result.request.context.interactsWithForms).toBe(true);
    }
  });

  it("detects navigation actions", () => {
    const profile = createTrustProfile();
    const result = checkBrowserConfirmation(
      "https://example.com",
      "navigate to /login",
      undefined,
      profile,
      [],
    );
    if (result.request?.context.kind === "browser_automation") {
      expect(result.request.context.triggersNavigation).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// checkPaymentConfirmation
// ---------------------------------------------------------------------------

describe("checkPaymentConfirmation", () => {
  it("always requires confirmation for payments", () => {
    const profile = createTrustProfile();
    // Even with max_autonomy preset
    const result = checkPaymentConfirmation(
      99.99,
      "USD",
      "Acme Corp",
      "Monthly subscription",
      { preset: "max_autonomy" },
      profile,
      [],
    );
    expect(result.needsConfirmation).toBe(true);
    expect(result.request?.context.kind).toBe("payment");
    if (result.request?.context.kind === "payment") {
      expect(result.request.context.amount).toBe(99.99);
      expect(result.request.context.currency).toBe("USD");
      expect(result.request.context.merchant).toBe("Acme Corp");
    }
  });

  it("ignores remembered choices for payments", () => {
    const profile = createTrustProfile();
    const remembered: RememberedChoice[] = [
      {
        pattern: "payment: usd 99.99 to acme corp",
        decision: "allow-always",
        category: "credential_access",
        rememberedAt: new Date().toISOString(),
        appliedCount: 5,
      },
    ];
    const result = checkPaymentConfirmation(
      99.99,
      "USD",
      "Acme Corp",
      "Monthly subscription",
      undefined,
      profile,
      remembered,
    );
    // Payment always needs confirmation regardless of remembered choices
    expect(result.needsConfirmation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Remembered choices
// ---------------------------------------------------------------------------

describe("remembered choices", () => {
  it("auto-allows when remembered as allow-always", () => {
    const profile = createTrustProfile();
    const remembered: RememberedChoice[] = [
      {
        pattern: "rm ./temp.txt",
        decision: "allow-always",
        category: "file_destruction",
        rememberedAt: new Date().toISOString(),
        appliedCount: 0,
      },
    ];
    const result = checkShellCommandConfirmation("rm ./temp.txt", undefined, profile, remembered);
    expect(result.autoAllowed).toBe(true);
    expect(result.needsConfirmation).toBe(false);
    expect(result.rememberedChoice).toBeDefined();
  });

  it("auto-denies when remembered as deny-always", () => {
    const profile = createTrustProfile();
    const remembered: RememberedChoice[] = [
      {
        pattern: "rm ./temp.txt",
        decision: "deny-always",
        category: "file_destruction",
        rememberedAt: new Date().toISOString(),
        appliedCount: 0,
      },
    ];
    const result = checkShellCommandConfirmation("rm ./temp.txt", undefined, profile, remembered);
    expect(result.blocked).toBe(true);
    expect(result.needsConfirmation).toBe(false);
    expect(result.rememberedChoice).toBeDefined();
  });

  it("processConfirmationResponse adds remembered choice when remember=true", () => {
    const request = {
      id: "test-id",
      operation: "rm ./temp.txt",
      behavior: "confirm_brief" as const,
      context: {
        kind: "shell_command" as const,
        command: "rm ./temp.txt",
        hasPipes: false,
        hasChains: false,
      },
      category: "file_destruction" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 15000,
    };
    const response = {
      requestId: "test-id",
      decision: "allow-always" as const,
      remember: true,
      decidedAtMs: Date.now(),
    };
    const choices = processConfirmationResponse(response, request, []);
    expect(choices).toHaveLength(1);
    expect(choices[0].decision).toBe("allow-always");
    expect(choices[0].pattern).toBe("rm ./temp.txt");
  });

  it("processConfirmationResponse does not add when remember=false", () => {
    const request = {
      id: "test-id",
      operation: "rm ./temp.txt",
      behavior: "confirm_brief" as const,
      context: {
        kind: "shell_command" as const,
        command: "rm ./temp.txt",
        hasPipes: false,
        hasChains: false,
      },
      category: "file_destruction" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 15000,
    };
    const response = {
      requestId: "test-id",
      decision: "allow-once" as const,
      remember: false,
      decidedAtMs: Date.now(),
    };
    const choices = processConfirmationResponse(response, request, []);
    expect(choices).toHaveLength(0);
  });

  it("removeRememberedChoice removes matching entry", () => {
    const choices: RememberedChoice[] = [
      {
        pattern: "rm ./temp.txt",
        decision: "allow-always",
        category: "file_destruction",
        rememberedAt: new Date().toISOString(),
        appliedCount: 0,
      },
      {
        pattern: "curl https://example.com",
        decision: "deny-always",
        category: "network_exposure",
        rememberedAt: new Date().toISOString(),
        appliedCount: 0,
      },
    ];
    const result = removeRememberedChoice(choices, "rm ./temp.txt", "file_destruction");
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe("curl https://example.com");
  });

  it("clearRememberedChoices returns empty array", () => {
    expect(clearRememberedChoices()).toEqual([]);
  });

  it("markRememberedChoiceApplied increments count", () => {
    const choices: RememberedChoice[] = [
      {
        pattern: "rm ./temp.txt",
        decision: "allow-always",
        category: "file_destruction",
        rememberedAt: new Date().toISOString(),
        appliedCount: 3,
      },
    ];
    const result = markRememberedChoiceApplied(choices, "rm ./temp.txt", "file_destruction");
    expect(result[0].appliedCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Timeout handling
// ---------------------------------------------------------------------------

describe("timeout handling", () => {
  it("isExpired returns true for past expiry", () => {
    const request = {
      id: "test",
      operation: "test",
      behavior: "warn" as const,
      context: {
        kind: "generic" as const,
        category: "system_modification" as const,
        description: "test",
      },
      category: "system_modification" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now() - 20000,
      expiresAtMs: Date.now() - 5000,
    };
    expect(isExpired(request)).toBe(true);
  });

  it("isExpired returns false for future expiry", () => {
    const request = {
      id: "test",
      operation: "test",
      behavior: "warn" as const,
      context: {
        kind: "generic" as const,
        category: "system_modification" as const,
        description: "test",
      },
      category: "system_modification" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 10000,
    };
    expect(isExpired(request)).toBe(false);
  });

  it("resolveExpired auto-approves warn behavior", () => {
    const request = {
      id: "test",
      operation: "test",
      behavior: "warn" as const,
      context: {
        kind: "generic" as const,
        category: "system_modification" as const,
        description: "test",
      },
      category: "system_modification" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now(),
      expiresAtMs: Date.now(),
    };
    expect(resolveExpired(request)).toBe("allow-once");
  });

  it("resolveExpired denies confirm behaviors", () => {
    const request = {
      id: "test",
      operation: "test",
      behavior: "confirm_brief" as const,
      context: {
        kind: "generic" as const,
        category: "system_modification" as const,
        description: "test",
      },
      category: "system_modification" as const,
      severity: 2,
      trustScore: 0.5,
      reason: "test",
      createdAtMs: Date.now(),
      expiresAtMs: Date.now(),
    };
    expect(resolveExpired(request)).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// Payment timeout
// ---------------------------------------------------------------------------

describe("payment timeout", () => {
  it("payment confirmations get 60s timeout", () => {
    const profile = createTrustProfile();
    const result = checkPaymentConfirmation(
      50,
      "USD",
      "TestCo",
      "Test purchase",
      undefined,
      profile,
      [],
    );
    expect(result.request).toBeDefined();
    const duration = result.request!.expiresAtMs - result.request!.createdAtMs;
    expect(duration).toBe(60_000);
  });
});
