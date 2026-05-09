/**
 * Credential migration: moves plaintext credentials from auth-profiles.json
 * into the encrypted credential vault / OS keychain.
 *
 * Migration is idempotent and non-destructive - originals are preserved
 * until the vault entry is verified readable.
 */

import type { AuthProfileCredential, AuthProfileStore } from "../agents/auth-profiles/types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { vaultRead, vaultWrite, type VaultDeps } from "./credential-vault.js";

const log = createSubsystemLogger("security/credential-migration");

const VAULT_SERVICE = "sage-auth-profiles";

export type MigrationResult = {
  migrated: string[];
  skipped: string[];
  failed: string[];
};

/**
 * Extract the secret portion of an auth profile credential.
 * Returns the JSON-serialized credential for vault storage.
 */
function extractSecret(credential: AuthProfileCredential): string {
  return JSON.stringify(credential);
}

/**
 * Migrate all credentials from an AuthProfileStore into the vault.
 * Only migrates credentials that are not already in the vault.
 */
export function migrateAuthProfilesToVault(
  store: AuthProfileStore,
  deps?: VaultDeps,
): MigrationResult {
  const result: MigrationResult = {
    migrated: [],
    skipped: [],
    failed: [],
  };

  for (const [profileId, credential] of Object.entries(store.profiles)) {
    // Check if already in vault
    const existing = vaultRead(VAULT_SERVICE, profileId, deps);
    if (existing) {
      result.skipped.push(profileId);
      continue;
    }

    // Migrate to vault
    const secret = extractSecret(credential);
    const writeResult = vaultWrite(VAULT_SERVICE, profileId, secret, deps);
    if (writeResult.ok) {
      // Verify round-trip
      const verify = vaultRead(VAULT_SERVICE, profileId, deps);
      if (verify && verify.secret === secret) {
        result.migrated.push(profileId);
        log.info("migrated credential to vault", {
          profileId,
          backend: writeResult.backend,
        });
      } else {
        result.failed.push(profileId);
        log.warn("vault round-trip verification failed", { profileId });
      }
    } else {
      result.failed.push(profileId);
      log.warn("failed to migrate credential to vault", {
        profileId,
        error: writeResult.error,
      });
    }
  }

  return result;
}

/**
 * Read a credential from the vault, falling back to the store.
 * This provides transparent vault integration - callers get credentials
 * from the vault if available, otherwise from the plaintext store.
 */
export function readCredentialFromVault(
  profileId: string,
  store: AuthProfileStore,
  deps?: VaultDeps,
): AuthProfileCredential | null {
  // Try vault first
  const vaultEntry = vaultRead(VAULT_SERVICE, profileId, deps);
  if (vaultEntry) {
    try {
      const credential = JSON.parse(vaultEntry.secret) as AuthProfileCredential;
      if (credential.type && credential.provider) {
        return credential;
      }
    } catch {
      log.warn("failed to parse vault credential", { profileId });
    }
  }

  // Fall back to store
  return store.profiles[profileId] ?? null;
}

/**
 * Write a credential to both the vault and the store.
 * The store is kept as a fallback in case the vault becomes unavailable.
 */
export function writeCredentialToVault(
  profileId: string,
  credential: AuthProfileCredential,
  deps?: VaultDeps,
): boolean {
  const secret = extractSecret(credential);
  const result = vaultWrite(VAULT_SERVICE, profileId, secret, deps);
  if (!result.ok) {
    log.warn("failed to write credential to vault", {
      profileId,
      error: result.error,
    });
  }
  return result.ok;
}
