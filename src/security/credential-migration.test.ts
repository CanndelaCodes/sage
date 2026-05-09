import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles/types.js";
import {
  migrateAuthProfilesToVault,
  readCredentialFromVault,
  writeCredentialToVault,
} from "./credential-migration.js";
import { vaultRead, type VaultDeps, type ExecSyncFn } from "./credential-vault.js";

function noopExec(): ExecSyncFn {
  return () => {
    throw new Error("exec not available");
  };
}

function makeDeps(): VaultDeps {
  return {
    platform: "linux" as NodeJS.Platform,
    execFileSync: noopExec(),
    machineId: () => "migration-test-machine",
    vaultDir: fs.mkdtempSync(path.join(os.tmpdir(), "sage-migration-test-")),
  };
}

describe("migrateAuthProfilesToVault", () => {
  let deps: VaultDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  afterEach(() => {
    try {
      fs.rmSync(deps.vaultDir!, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("migrates all profiles from the store", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "sk-ant-test-key",
        },
        "openai-codex:codex-cli": {
          type: "oauth",
          provider: "openai-codex",
          access: "access-token",
          refresh: "refresh-token",
          expires: Date.now() + 3600000,
        },
      },
    };

    const result = migrateAuthProfilesToVault(store, deps);
    expect(result.migrated).toEqual(["anthropic:default", "openai-codex:codex-cli"]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);

    // Verify they're in the vault
    const entry1 = vaultRead("sage-auth-profiles", "anthropic:default", deps);
    expect(entry1).not.toBeNull();
    const parsed1 = JSON.parse(entry1!.secret);
    expect(parsed1.key).toBe("sk-ant-test-key");

    const entry2 = vaultRead("sage-auth-profiles", "openai-codex:codex-cli", deps);
    expect(entry2).not.toBeNull();
    const parsed2 = JSON.parse(entry2!.secret);
    expect(parsed2.access).toBe("access-token");
  });

  it("skips already-migrated profiles", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "sk-ant-test-key",
        },
      },
    };

    // First migration
    migrateAuthProfilesToVault(store, deps);

    // Second migration should skip
    const result = migrateAuthProfilesToVault(store, deps);
    expect(result.migrated).toEqual([]);
    expect(result.skipped).toEqual(["anthropic:default"]);
  });

  it("handles empty store", () => {
    const store: AuthProfileStore = { version: 1, profiles: {} };
    const result = migrateAuthProfilesToVault(store, deps);
    expect(result.migrated).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});

describe("readCredentialFromVault", () => {
  let deps: VaultDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  afterEach(() => {
    try {
      fs.rmSync(deps.vaultDir!, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("reads from vault when available", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "old-key-in-store",
        },
      },
    };

    // Write newer credential to vault
    writeCredentialToVault(
      "anthropic:default",
      { type: "api_key", provider: "anthropic", key: "new-key-in-vault" },
      deps,
    );

    const result = readCredentialFromVault("anthropic:default", store, deps);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("api_key");
    if (result!.type === "api_key") {
      expect(result!.key).toBe("new-key-in-vault");
    }
  });

  it("falls back to store when vault has no entry", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "store-key",
        },
      },
    };

    const result = readCredentialFromVault("anthropic:default", store, deps);
    expect(result).not.toBeNull();
    if (result!.type === "api_key") {
      expect(result!.key).toBe("store-key");
    }
  });

  it("returns null when neither vault nor store has the entry", () => {
    const store: AuthProfileStore = { version: 1, profiles: {} };
    const result = readCredentialFromVault("nonexistent", store, deps);
    expect(result).toBeNull();
  });
});

describe("writeCredentialToVault", () => {
  let deps: VaultDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  afterEach(() => {
    try {
      fs.rmSync(deps.vaultDir!, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it("writes and round-trips credential", () => {
    const ok = writeCredentialToVault(
      "test-profile",
      {
        type: "token",
        provider: "custom",
        token: "bearer-token-12345",
        expires: Date.now() + 3600000,
      },
      deps,
    );
    expect(ok).toBe(true);

    const read = readCredentialFromVault(
      "test-profile",
      { version: 1, profiles: {} },
      deps,
    );
    expect(read).not.toBeNull();
    expect(read!.type).toBe("token");
    if (read!.type === "token") {
      expect(read!.token).toBe("bearer-token-12345");
    }
  });

  it("handles oauth credentials with all fields", () => {
    const ok = writeCredentialToVault(
      "oauth-profile",
      {
        type: "oauth",
        provider: "anthropic",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 3600000,
        email: "user@example.com",
      },
      deps,
    );
    expect(ok).toBe(true);

    const read = readCredentialFromVault(
      "oauth-profile",
      { version: 1, profiles: {} },
      deps,
    );
    expect(read!.type).toBe("oauth");
    if (read!.type === "oauth") {
      expect(read!.access).toBe("access-token");
      expect(read!.refresh).toBe("refresh-token");
      expect(read!.email).toBe("user@example.com");
    }
  });
});
