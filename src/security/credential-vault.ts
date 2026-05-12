/**
 * Cross-platform credential vault with OS keychain integration and encrypted fallback.
 *
 * Priority order:
 *   1. OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service)
 *   2. Encrypted file vault (AES-256-GCM + PBKDF2)
 *
 * The vault stores credentials as opaque JSON blobs keyed by a service+account pair.
 */

import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("security/credential-vault");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultBackend = "keychain" | "encrypted-file" | "none";

export type VaultEntry = {
  service: string;
  account: string;
  secret: string;
};

export type VaultReadResult = {
  secret: string;
  backend: VaultBackend;
};

export type VaultWriteResult = {
  backend: VaultBackend;
  ok: boolean;
  error?: string;
};

export type EncryptedPayload = {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2";
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
};

export type VaultFileStore = {
  version: 1;
  entries: Record<string, EncryptedPayload>;
};

export type ExecSyncFn = (
  command: string,
  args: string[],
  options: {
    encoding: "utf8";
    timeout: number;
    stdio: ("pipe" | "ignore")[];
    windowsHide?: boolean;
  },
) => string;

export type VaultDeps = {
  platform?: NodeJS.Platform;
  execFileSync?: ExecSyncFn;
  machineId?: () => string;
  vaultDir?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT_FILENAME = "credential-vault.enc.json";
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = "sha512";
const AES_IV_LENGTH = 16;
const EXEC_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a machine-bound encryption key using PBKDF2.
 * The "password" is derived from stable machine identifiers so the vault
 * is tied to the current machine — portable credentials should use the
 * OS keychain instead.
 */
function deriveMachineId(deps?: VaultDeps): string {
  if (deps?.machineId) {
    return deps.machineId();
  }
  // Build a stable machine fingerprint from hostname + username + homedir.
  // This is NOT a strong secret — it merely prevents casual file copying.
  // The OS keychain is the recommended backend for real security.
  const parts = [os.hostname(), os.userInfo().username, os.homedir()];
  return parts.join("|");
}

function deriveKey(salt: Buffer, deps?: VaultDeps): Buffer {
  const password = deriveMachineId(deps);
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

// ---------------------------------------------------------------------------
// Encryption / decryption
// ---------------------------------------------------------------------------

function encrypt(plaintext: string, deps?: VaultDeps): EncryptedPayload {
  const salt = randomBytes(32);
  const iv = randomBytes(AES_IV_LENGTH);
  const key = deriveKey(salt, deps);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2",
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

function decrypt(payload: EncryptedPayload, deps?: VaultDeps): string {
  const salt = Buffer.from(payload.salt, "hex");
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");
  const key = deriveKey(salt, deps);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Vault file store
// ---------------------------------------------------------------------------

function resolveVaultPath(deps?: VaultDeps): string {
  const dir = deps?.vaultDir ?? path.join(os.homedir(), ".sage", "security");
  return path.join(dir, VAULT_FILENAME);
}

function loadVaultStore(deps?: VaultDeps): VaultFileStore {
  const vaultPath = resolveVaultPath(deps);
  try {
    if (!fs.existsSync(vaultPath)) {
      return { version: 1, entries: {} };
    }
    const raw = fs.readFileSync(vaultPath, "utf8");
    const parsed = JSON.parse(raw) as VaultFileStore;
    if (parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveVaultStore(store: VaultFileStore, deps?: VaultDeps): void {
  const vaultPath = resolveVaultPath(deps);
  const dir = path.dirname(vaultPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(vaultPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  try {
    fs.chmodSync(vaultPath, 0o600);
  } catch {
    // On Windows, chmod may not work as expected — that's acceptable
  }
}

function vaultStoreKey(service: string, account: string): string {
  return `${service}::${account}`;
}

// ---------------------------------------------------------------------------
// OS Keychain backends
// ---------------------------------------------------------------------------

function readKeychainDarwin(service: string, account: string, deps?: VaultDeps): string | null {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  try {
    const result = exec(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", timeout: EXEC_TIMEOUT_MS, stdio: ["pipe", "pipe", "pipe"] },
    );
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function writeKeychainDarwin(
  service: string,
  account: string,
  secret: string,
  deps?: VaultDeps,
): boolean {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  try {
    // -U flag updates if exists, creates if not
    exec(
      "/usr/bin/security",
      ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret],
      { encoding: "utf8", timeout: EXEC_TIMEOUT_MS, stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

function deleteKeychainDarwin(service: string, account: string, deps?: VaultDeps): boolean {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  try {
    exec("/usr/bin/security", ["delete-generic-password", "-s", service, "-a", account], {
      encoding: "utf8",
      timeout: EXEC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function readKeychainLinux(service: string, account: string, deps?: VaultDeps): string | null {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  try {
    const result = exec("secret-tool", ["lookup", "service", service, "account", account], {
      encoding: "utf8",
      timeout: EXEC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function writeKeychainLinux(
  service: string,
  account: string,
  secret: string,
  _deps?: VaultDeps,
): boolean {
  try {
    // secret-tool store reads the secret from stdin.
    // Use spawnSync to safely pass the secret via stdin without shell injection.
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const result = spawnSync(
      "secret-tool",
      ["store", "--label", `${service} - ${account}`, "service", service, "account", account],
      {
        input: secret,
        encoding: "utf8",
        timeout: EXEC_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function deleteKeychainLinux(service: string, account: string, deps?: VaultDeps): boolean {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  try {
    exec("secret-tool", ["clear", "service", service, "account", account], {
      encoding: "utf8",
      timeout: EXEC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function readKeychainWindows(service: string, account: string, deps?: VaultDeps): string | null {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  const target = `${service}/${account}`;
  try {
    // Use PowerShell CredentialManager to read from Windows Credential Manager.
    const result = exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference='SilentlyContinue'; ` +
          `[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]; ` +
          `$vault = New-Object Windows.Security.Credentials.PasswordVault; ` +
          `$cred = $vault.Retrieve('${target.replace(/'/g, "''")}', '${account.replace(/'/g, "''")}'); ` +
          `$cred.RetrievePassword(); ` +
          `$cred.Password`,
      ],
      {
        encoding: "utf8",
        timeout: EXEC_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function writeKeychainWindows(
  service: string,
  account: string,
  secret: string,
  deps?: VaultDeps,
): boolean {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  const target = `${service}/${account}`;
  try {
    exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]; ` +
          `$vault = New-Object Windows.Security.Credentials.PasswordVault; ` +
          `try { $old = $vault.Retrieve('${target.replace(/'/g, "''")}', '${account.replace(/'/g, "''")}'); $vault.Remove($old) } catch {}; ` +
          `$cred = New-Object Windows.Security.Credentials.PasswordCredential('${target.replace(/'/g, "''")}', '${account.replace(/'/g, "''")}', '${secret.replace(/'/g, "''")}'); ` +
          `$vault.Add($cred)`,
      ],
      {
        encoding: "utf8",
        timeout: EXEC_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return false;
  }
}

function deleteKeychainWindows(service: string, account: string, deps?: VaultDeps): boolean {
  const exec = deps?.execFileSync ?? defaultExecFileSync;
  const target = `${service}/${account}`;
  try {
    exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]; ` +
          `$vault = New-Object Windows.Security.Credentials.PasswordVault; ` +
          `$cred = $vault.Retrieve('${target.replace(/'/g, "''")}', '${account.replace(/'/g, "''")}'); ` +
          `$vault.Remove($cred)`,
      ],
      {
        encoding: "utf8",
        timeout: EXEC_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Default execFileSync wrapper
// ---------------------------------------------------------------------------

function defaultExecFileSync(
  command: string,
  args: string[],
  options: {
    encoding: "utf8";
    timeout: number;
    stdio: ("pipe" | "ignore")[];
    windowsHide?: boolean;
  },
): string {
  return execFileSync(command, args, {
    encoding: options.encoding,
    timeout: options.timeout,
    stdio: options.stdio,
    windowsHide: options.windowsHide,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a credential from the vault.
 * Tries OS keychain first, then encrypted file fallback.
 */
export function vaultRead(
  service: string,
  account: string,
  deps?: VaultDeps,
): VaultReadResult | null {
  const platform = deps?.platform ?? process.platform;

  // Try OS keychain first
  const keychainSecret = readKeychain(platform, service, account, deps);
  if (keychainSecret !== null) {
    return { secret: keychainSecret, backend: "keychain" };
  }

  // Fall back to encrypted file
  const store = loadVaultStore(deps);
  const key = vaultStoreKey(service, account);
  const entry = store.entries[key];
  if (!entry) {
    return null;
  }

  try {
    const secret = decrypt(entry, deps);
    return { secret, backend: "encrypted-file" };
  } catch (err) {
    log.warn("failed to decrypt vault entry", {
      service,
      account,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Write a credential to the vault.
 * Tries OS keychain first, always writes to encrypted file as backup.
 */
export function vaultWrite(
  service: string,
  account: string,
  secret: string,
  deps?: VaultDeps,
): VaultWriteResult {
  const platform = deps?.platform ?? process.platform;

  // Try OS keychain
  const keychainOk = writeKeychain(platform, service, account, secret, deps);
  if (keychainOk) {
    log.info("wrote credential to OS keychain", { service, account });
  }

  // Always write encrypted file as backup
  try {
    const store = loadVaultStore(deps);
    const key = vaultStoreKey(service, account);
    store.entries[key] = encrypt(secret, deps);
    saveVaultStore(store, deps);
    log.info("wrote credential to encrypted vault", { service, account });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (!keychainOk) {
      return { backend: "none", ok: false, error };
    }
    log.warn("failed to write encrypted vault backup", { service, account, error });
  }

  return {
    backend: keychainOk ? "keychain" : "encrypted-file",
    ok: true,
  };
}

/**
 * Delete a credential from the vault.
 * Removes from both OS keychain and encrypted file.
 */
export function vaultDelete(service: string, account: string, deps?: VaultDeps): boolean {
  const platform = deps?.platform ?? process.platform;
  let deleted = false;

  // Delete from OS keychain
  const keychainDeleted = deleteKeychain(platform, service, account, deps);
  if (keychainDeleted) {
    deleted = true;
  }

  // Delete from encrypted file
  const store = loadVaultStore(deps);
  const key = vaultStoreKey(service, account);
  if (store.entries[key]) {
    delete store.entries[key];
    saveVaultStore(store, deps);
    deleted = true;
  }

  return deleted;
}

/**
 * List all credentials in the encrypted vault file.
 * Does NOT list OS keychain entries (no cross-platform API for enumeration).
 */
export function vaultList(deps?: VaultDeps): Array<{ service: string; account: string }> {
  const store = loadVaultStore(deps);
  return Object.keys(store.entries).map((key) => {
    const [service, account] = key.split("::");
    return { service: service ?? "", account: account ?? "" };
  });
}

/**
 * Check if the OS keychain is available on the current platform.
 */
export function isKeychainAvailable(deps?: VaultDeps): boolean {
  const platform = deps?.platform ?? process.platform;
  switch (platform) {
    case "darwin":
      try {
        const exec = deps?.execFileSync ?? defaultExecFileSync;
        exec("/usr/bin/security", ["list-keychains"], {
          encoding: "utf8",
          timeout: EXEC_TIMEOUT_MS,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return true;
      } catch {
        return false;
      }
    case "linux":
      try {
        const exec = deps?.execFileSync ?? defaultExecFileSync;
        exec("secret-tool", ["--version"], {
          encoding: "utf8",
          timeout: EXEC_TIMEOUT_MS,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return true;
      } catch {
        return false;
      }
    case "win32":
      // PasswordVault is always available on Windows 8+
      return true;
    default:
      return false;
  }
}

/**
 * Migrate a plaintext secret into the vault.
 * Returns the backend it was stored in, or null if migration failed.
 */
export function migrateToVault(
  service: string,
  account: string,
  plaintextSecret: string,
  deps?: VaultDeps,
): VaultWriteResult {
  return vaultWrite(service, account, plaintextSecret, deps);
}

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

function readKeychain(
  platform: NodeJS.Platform,
  service: string,
  account: string,
  deps?: VaultDeps,
): string | null {
  switch (platform) {
    case "darwin":
      return readKeychainDarwin(service, account, deps);
    case "linux":
      return readKeychainLinux(service, account, deps);
    case "win32":
      return readKeychainWindows(service, account, deps);
    default:
      return null;
  }
}

function writeKeychain(
  platform: NodeJS.Platform,
  service: string,
  account: string,
  secret: string,
  deps?: VaultDeps,
): boolean {
  switch (platform) {
    case "darwin":
      return writeKeychainDarwin(service, account, secret, deps);
    case "linux":
      return writeKeychainLinux(service, account, secret, deps);
    case "win32":
      return writeKeychainWindows(service, account, secret, deps);
    default:
      return false;
  }
}

function deleteKeychain(
  platform: NodeJS.Platform,
  service: string,
  account: string,
  deps?: VaultDeps,
): boolean {
  switch (platform) {
    case "darwin":
      return deleteKeychainDarwin(service, account, deps);
    case "linux":
      return deleteKeychainLinux(service, account, deps);
    case "win32":
      return deleteKeychainWindows(service, account, deps);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export const _testing = {
  encrypt,
  decrypt,
  deriveMachineId,
  deriveKey,
  loadVaultStore,
  saveVaultStore,
  vaultStoreKey,
  resolveVaultPath,
  PBKDF2_ITERATIONS,
  readKeychainDarwin,
  writeKeychainDarwin,
  readKeychainLinux,
  writeKeychainLinux,
  readKeychainWindows,
  writeKeychainWindows,
};
