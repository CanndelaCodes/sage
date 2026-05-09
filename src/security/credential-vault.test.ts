import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isKeychainAvailable,
  migrateToVault,
  vaultDelete,
  vaultList,
  vaultRead,
  vaultWrite,
  _testing,
  type ExecSyncFn,
  type VaultDeps,
} from "./credential-vault.js";

function makeTempVaultDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sage-vault-test-"));
}

function noopExec(): ExecSyncFn {
  return () => {
    throw new Error("exec not available");
  };
}

function makeDeps(overrides?: Partial<VaultDeps>): VaultDeps {
  return {
    platform: "linux" as NodeJS.Platform,
    execFileSync: noopExec(),
    machineId: () => "test-machine-id",
    vaultDir: makeTempVaultDir(),
    ...overrides,
  };
}

describe("credential-vault encryption", () => {
  it("round-trips encrypt/decrypt", () => {
    const deps: VaultDeps = { machineId: () => "test-id" };
    const plaintext = '{"apiKey":"sk-test-12345","provider":"anthropic"}';

    const encrypted = _testing.encrypt(plaintext, deps);
    expect(encrypted.version).toBe(1);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.kdf).toBe("pbkdf2");
    expect(encrypted.iterations).toBe(_testing.PBKDF2_ITERATIONS);
    expect(encrypted.salt).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();

    const decrypted = _testing.decrypt(encrypted, deps);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong machine id", () => {
    const deps1: VaultDeps = { machineId: () => "machine-a" };
    const deps2: VaultDeps = { machineId: () => "machine-b" };
    const plaintext = "secret-data";

    const encrypted = _testing.encrypt(plaintext, deps1);

    expect(() => _testing.decrypt(encrypted, deps2)).toThrow();
  });

  it("produces unique ciphertext for same plaintext (random salt/iv)", () => {
    const deps: VaultDeps = { machineId: () => "test-id" };
    const plaintext = "same-input";

    const a = _testing.encrypt(plaintext, deps);
    const b = _testing.encrypt(plaintext, deps);

    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("handles empty string", () => {
    const deps: VaultDeps = { machineId: () => "test-id" };
    const encrypted = _testing.encrypt("", deps);
    const decrypted = _testing.decrypt(encrypted, deps);
    expect(decrypted).toBe("");
  });

  it("handles unicode content", () => {
    const deps: VaultDeps = { machineId: () => "test-id" };
    const plaintext = "credential: \u{1F511} key=abc\u00E9\u00F1";
    const encrypted = _testing.encrypt(plaintext, deps);
    const decrypted = _testing.decrypt(encrypted, deps);
    expect(decrypted).toBe(plaintext);
  });
});

describe("credential-vault file store", () => {
  let vaultDir: string;
  let deps: VaultDeps;

  beforeEach(() => {
    vaultDir = makeTempVaultDir();
    deps = makeDeps({ vaultDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it("writes and reads back from encrypted file", () => {
    const result = vaultWrite("sage-auth", "main-profile", "my-secret-key", deps);
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("encrypted-file");

    const read = vaultRead("sage-auth", "main-profile", deps);
    expect(read).not.toBeNull();
    expect(read!.secret).toBe("my-secret-key");
    expect(read!.backend).toBe("encrypted-file");
  });

  it("overwrites existing entry", () => {
    vaultWrite("sage-auth", "profile-1", "first-secret", deps);
    vaultWrite("sage-auth", "profile-1", "second-secret", deps);

    const read = vaultRead("sage-auth", "profile-1", deps);
    expect(read!.secret).toBe("second-secret");
  });

  it("stores multiple entries independently", () => {
    vaultWrite("sage-auth", "profile-a", "secret-a", deps);
    vaultWrite("sage-auth", "profile-b", "secret-b", deps);

    expect(vaultRead("sage-auth", "profile-a", deps)!.secret).toBe("secret-a");
    expect(vaultRead("sage-auth", "profile-b", deps)!.secret).toBe("secret-b");
  });

  it("returns null for missing entry", () => {
    const read = vaultRead("sage-auth", "nonexistent", deps);
    expect(read).toBeNull();
  });

  it("deletes entry from encrypted file", () => {
    vaultWrite("sage-auth", "to-delete", "temp-secret", deps);
    expect(vaultRead("sage-auth", "to-delete", deps)).not.toBeNull();

    const deleted = vaultDelete("sage-auth", "to-delete", deps);
    expect(deleted).toBe(true);
    expect(vaultRead("sage-auth", "to-delete", deps)).toBeNull();
  });

  it("delete returns false for nonexistent entry", () => {
    const deleted = vaultDelete("sage-auth", "nonexistent", deps);
    expect(deleted).toBe(false);
  });

  it("lists entries in the vault", () => {
    vaultWrite("sage-auth", "profile-1", "s1", deps);
    vaultWrite("sage-tokens", "token-a", "s2", deps);

    const entries = vaultList(deps);
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual({ service: "sage-auth", account: "profile-1" });
    expect(entries).toContainEqual({ service: "sage-tokens", account: "token-a" });
  });

  it("handles corrupted vault file gracefully", () => {
    const vaultPath = _testing.resolveVaultPath(deps);
    const dir = path.dirname(vaultPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(vaultPath, "not-json!", "utf8");

    const read = vaultRead("sage-auth", "test", deps);
    expect(read).toBeNull();

    // Should still be able to write after corruption
    const result = vaultWrite("sage-auth", "test", "recovery-secret", deps);
    expect(result.ok).toBe(true);
  });

  it("creates vault directory if missing", () => {
    const nestedDir = path.join(vaultDir, "nested", "deep");
    const nestedDeps = makeDeps({ vaultDir: nestedDir });

    vaultWrite("svc", "acct", "secret", nestedDeps);
    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(vaultRead("svc", "acct", nestedDeps)!.secret).toBe("secret");
  });
});

describe("credential-vault keychain integration", () => {
  it("reads from macOS keychain when available", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("keychain-secret\n");
    const deps = makeDeps({
      platform: "darwin",
      execFileSync: execMock,
    });

    const result = vaultRead("sage-auth", "main", deps);
    expect(result).not.toBeNull();
    expect(result!.secret).toBe("keychain-secret");
    expect(result!.backend).toBe("keychain");
    expect(execMock).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "sage-auth", "-a", "main", "-w"],
      expect.any(Object),
    );
  });

  it("falls back to encrypted file when macOS keychain fails", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockImplementation((cmd, args) => {
      if (Array.isArray(args) && args.includes("find-generic-password")) {
        throw new Error("no keychain entry");
      }
      if (Array.isArray(args) && args.includes("add-generic-password")) {
        throw new Error("keychain write failed");
      }
      return "";
    });

    const deps = makeDeps({
      platform: "darwin",
      execFileSync: execMock,
    });

    // Write should fall back to encrypted file
    const writeResult = vaultWrite("sage-auth", "fallback", "my-secret", deps);
    expect(writeResult.ok).toBe(true);
    expect(writeResult.backend).toBe("encrypted-file");

    // Read should find it in encrypted file
    const readResult = vaultRead("sage-auth", "fallback", deps);
    expect(readResult).not.toBeNull();
    expect(readResult!.secret).toBe("my-secret");
    expect(readResult!.backend).toBe("encrypted-file");
  });

  it("prefers keychain over encrypted file", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes("find-generic-password")) {
        return "keychain-value";
      }
      return "";
    });

    const deps = makeDeps({
      platform: "darwin",
      execFileSync: execMock,
    });

    // Write to encrypted file first
    const fileDeps = makeDeps({ vaultDir: deps.vaultDir });
    vaultWrite("sage-auth", "dual", "file-value", fileDeps);

    // With keychain available, should prefer keychain
    const result = vaultRead("sage-auth", "dual", deps);
    expect(result!.secret).toBe("keychain-value");
    expect(result!.backend).toBe("keychain");
  });

  it("writes to macOS keychain with -U flag", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("");
    const deps = makeDeps({
      platform: "darwin",
      execFileSync: execMock,
    });

    vaultWrite("sage-auth", "test", "my-secret", deps);

    const keychainWriteCall = execMock.mock.calls.find(
      (call) => Array.isArray(call[1]) && call[1].includes("add-generic-password"),
    );
    expect(keychainWriteCall).toBeDefined();
    expect(keychainWriteCall![1]).toContain("-U");
    expect(keychainWriteCall![1]).toContain("-w");
  });

  it("reads from Linux secret-tool", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("linux-secret\n");
    const deps = makeDeps({
      platform: "linux",
      execFileSync: execMock,
    });

    const result = vaultRead("sage-auth", "main", deps);
    expect(result!.secret).toBe("linux-secret");
    expect(result!.backend).toBe("keychain");
    expect(execMock).toHaveBeenCalledWith(
      "secret-tool",
      ["lookup", "service", "sage-auth", "account", "main"],
      expect.any(Object),
    );
  });

  it("reads from Windows PasswordVault", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("windows-secret\n");
    const deps = makeDeps({
      platform: "win32",
      execFileSync: execMock,
    });

    const result = vaultRead("sage-auth", "main", deps);
    expect(result!.secret).toBe("windows-secret");
    expect(result!.backend).toBe("keychain");
    expect(execMock).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
      expect.any(Object),
    );
  });
});

describe("isKeychainAvailable", () => {
  it("returns true on darwin when security command works", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("keychain-list\n");
    expect(isKeychainAvailable({ platform: "darwin", execFileSync: execMock })).toBe(true);
  });

  it("returns false on darwin when security command fails", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockImplementation(() => {
      throw new Error("not available");
    });
    expect(isKeychainAvailable({ platform: "darwin", execFileSync: execMock })).toBe(false);
  });

  it("returns true on linux when secret-tool is available", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockReturnValue("0.20.0\n");
    expect(isKeychainAvailable({ platform: "linux", execFileSync: execMock })).toBe(true);
  });

  it("returns false on linux when secret-tool is missing", () => {
    const execMock = vi.fn<Parameters<ExecSyncFn>, string>().mockImplementation(() => {
      throw new Error("command not found");
    });
    expect(isKeychainAvailable({ platform: "linux", execFileSync: execMock })).toBe(false);
  });

  it("returns true on win32 (always available)", () => {
    expect(isKeychainAvailable({ platform: "win32" })).toBe(true);
  });

  it("returns false on unsupported platforms", () => {
    expect(isKeychainAvailable({ platform: "freebsd" as NodeJS.Platform })).toBe(false);
  });
});

describe("migrateToVault", () => {
  it("migrates a plaintext secret into the vault", () => {
    const deps = makeDeps();
    const result = migrateToVault("sage-auth", "migrated-profile", "plaintext-api-key", deps);
    expect(result.ok).toBe(true);

    const read = vaultRead("sage-auth", "migrated-profile", deps);
    expect(read!.secret).toBe("plaintext-api-key");
  });
});

describe("credential-vault key derivation", () => {
  it("derives consistent keys for same machine id and salt", () => {
    const deps: VaultDeps = { machineId: () => "stable-id" };
    const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");

    const key1 = _testing.deriveKey(salt, deps);
    const key2 = _testing.deriveKey(salt, deps);
    expect(key1.equals(key2)).toBe(true);
  });

  it("derives different keys for different machine ids", () => {
    const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");

    const key1 = _testing.deriveKey(salt, { machineId: () => "machine-a" });
    const key2 = _testing.deriveKey(salt, { machineId: () => "machine-b" });
    expect(key1.equals(key2)).toBe(false);
  });

  it("derives different keys for different salts", () => {
    const deps: VaultDeps = { machineId: () => "same-machine" };
    const salt1 = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");
    const salt2 = Buffer.from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "hex");

    const key1 = _testing.deriveKey(salt1, deps);
    const key2 = _testing.deriveKey(salt2, deps);
    expect(key1.equals(key2)).toBe(false);
  });
});

describe("credential-vault JSON secret storage", () => {
  it("stores and retrieves complex JSON credential objects", () => {
    const deps = makeDeps();
    const credential = JSON.stringify({
      type: "oauth",
      provider: "anthropic",
      access: "sk-ant-access-token-12345",
      refresh: "sk-ant-refresh-token-67890",
      expires: Date.now() + 3600000,
      email: "user@example.com",
    });

    vaultWrite("sage-auth-profiles", "anthropic:default", credential, deps);

    const read = vaultRead("sage-auth-profiles", "anthropic:default", deps);
    expect(read).not.toBeNull();

    const parsed = JSON.parse(read!.secret);
    expect(parsed.type).toBe("oauth");
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.access).toBe("sk-ant-access-token-12345");
  });
});
