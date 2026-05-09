# Phase 1 Security Audit Report

**Date**: 2026-02-06
**Auditor**: Claude (Opus 4.6)
**Scope**: Sage fork of OpenClaw v2026.2.3
**Status**: PASS (no critical unresolved findings)

---

## 1. CVE-2026-25253: URL Parameter Credential Injection

**Original vulnerability**: UI silently accepted `token`, `password`, and `gatewayUrl` from URL query parameters, enabling an attacker to craft a link that connects the victim to an attacker-controlled gateway.

### Mitigations Applied

| Vector | Status | File |
|--------|--------|------|
| `?token=` in UI URL params | **BLOCKED** — stripped and logged, never applied | `ui/src/ui/app-settings.ts` |
| `?password=` in UI URL params | **BLOCKED** — stripped and logged, never applied | `ui/src/ui/app-settings.ts` |
| `?gatewayUrl=` in UI URL params | **BLOCKED** — stripped and logged, never applied | `ui/src/ui/app-settings.ts` |
| WS upgrade with URL credentials | **BLOCKED** — rejected at upgrade with 400 | `src/gateway/ws-security.ts` |
| WS origin mismatch | **BLOCKED** — rejected at upgrade with 403 | `src/gateway/ws-security.ts` |
| CORS on HTTP responses | **APPLIED** — strict origin validation | `src/gateway/server-http.ts` |
| Suspicious connection logging | **ACTIVE** — logs origin mismatches, missing-origin-remote, url-credentials | `src/gateway/ws-security.ts` |

**Verdict**: CVE-2026-25253 is fully mitigated across all identified attack vectors.

---

## 2. Dependency Vulnerabilities (`pnpm audit`)

| Severity | Package | Issue | Path | Remediation |
|----------|---------|-------|------|-------------|
| **HIGH** | `@isaacs/brace-expansion` <=5.0.0 | Uncontrolled Resource Consumption (GHSA-7h2j-956f-4vf2) | `@mariozechner/pi-coding-agent > minimatch` | Upstream fix needed in pi-coding-agent |
| **MODERATE** | `request` <=2.88.2 | SSRF (GHSA-p8p7-x288-28g6) | `extensions__matrix > @vector-im/matrix-bot-sdk` | `request` is deprecated; Matrix extension dependency |

**Risk assessment**: Both are transitive dependencies in optional components (coding agent, Matrix extension). Neither is in the critical request path for Sage VDE's core functionality. The `request` package is deprecated with no patched version available — the Matrix bot SDK would need to migrate away from it.

**Recommendation**: Track upstream updates. Consider disabling the Matrix extension if not needed.

---

## 3. Legacy Environment Variables

### OPENCLAW_* references (should be deprecated)

| File | Variable | Status |
|------|----------|--------|
| `src/commands/doctor-platform-notes.ts:76-77` | `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD` | Deprecated block in doctor command — intentionally retained for migration detection |

**Verdict**: ACCEPTABLE — This is a deprecated-variable diagnostic block in the `doctor` command. It checks if users still have old env vars set and warns them to migrate. Removing it would break the migration path.

### SAGEBOT_* references (legacy aliases)

Found 16 references across `paths.ts`, `auth.ts`, `call.ts`, `bonjour.ts`, `status.scan.ts`, `gateway-daemon.ts`. These are backwards-compatibility aliases (pattern: `SAGE_X || SAGEBOT_X`).

**Verdict**: ACCEPTABLE — These are intentional fallback aliases for the pre-rename `SAGEBOT_` environment variables. Users migrating from OpenClaw will have `SAGEBOT_` vars in their environment.

---

## 4. Electron Security Settings (Sage VDE Shell)

| Setting | Value | Status |
|---------|-------|--------|
| `nodeIntegration` | `false` | SECURE |
| `contextIsolation` | `true` | SECURE |
| `enableRemoteModule` | not set (default `false`) | SECURE |
| `webSecurity` | not set (default `true`) | SECURE |

Verified in:
- `apps/desktop/src/main/window.ts:97-98`
- `apps/desktop/src/main/orb-window.ts:96-97`
- `apps/desktop/src/main/oauth.ts:313-314`

**Verdict**: PASS — All Electron windows follow security best practices.

---

## 5. Credential Vault

| Check | Result |
|-------|--------|
| Encryption algorithm | AES-256-GCM (industry standard) |
| Key derivation | PBKDF2 (salt + iterations) |
| OS keychain integration | macOS Keychain, Windows Credential Manager |
| Fallback | Encrypted file vault when keychain unavailable |
| Test coverage | Unit tests verify encrypt/decrypt round-trip, wrong-key rejection |

**Verdict**: PASS — Credential vault uses strong, standard cryptographic primitives.

---

## 6. Gateway Authentication

| Check | Result |
|-------|--------|
| Token auth | Active (`src/gateway/auth.ts`) |
| Password auth | Active (bcrypt-hashed) |
| Device token auth | Active (Tailscale integration) |
| Origin checking | Active (`src/gateway/ws-security.ts`, `src/gateway/origin-check.test.ts`) |
| Exec approvals | Active (allowlist-based, `src/infra/exec-approvals.ts`) |

**Verdict**: PASS — Multiple auth layers are in place.

---

## 7. Rate Limiting (New)

| Check | Result |
|-------|--------|
| WebSocket connections | Rate limited per IP (sliding window) |
| HTTP endpoints | Rate limited per IP (429 + Retry-After) |
| Loopback exemption | Higher limits for localhost (tools make many connections) |
| Concurrent connections | Tracked and limited per IP |

**Verdict**: PASS — Rate limiting added in Phase 1.

---

## 8. Guardrails System

| Check | Result |
|-------|--------|
| Hard-block patterns | Active (rm -rf /, sudo rm, curl|bash, fork bombs, etc.) |
| Adaptive trust | Active (per-category scoring with decay) |
| Presets | 4 levels (conservative, balanced, max_autonomy, custom) |
| Audit logging | Active (last 500 entries per profile) |
| Confirmation data contract | Added (`ConfirmationRequest` type for Electron IPC) |

**Verdict**: PASS — Comprehensive guardrails system with confirmation dialog groundwork.

---

## 9. Container Sandboxing

| Check | Result |
|-------|--------|
| Runtime abstraction | Podman/Docker (`src/agents/sandbox/container-runtime.ts`) |
| E2B integration | Active (`src/agents/sandbox/e2b-sandbox.ts`) |
| Workspace isolation | Volume mount controls |

**Verdict**: PASS — Container sandboxing infrastructure exists from OpenClaw.

---

## 10. Hardcoded URLs

No references to `openclaw.com`, `openclaw.org`, `openclaw.io`, `openclaw.dev`, or `openclaw.app` found in `src/`.

**Verdict**: PASS — No hardcoded OpenClaw infrastructure URLs remain.

---

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| CVE-2026-25253 | **MITIGATED** | All vectors blocked + suspicious connection logging |
| Dependencies | **2 issues** | Both transitive, in optional components, tracked |
| Electron security | **PASS** | nodeIntegration=false, contextIsolation=true |
| Credential vault | **PASS** | AES-256-GCM + PBKDF2 + OS keychain |
| Gateway auth | **PASS** | Token + password + device + origin checks |
| Rate limiting | **PASS** | New — per-IP sliding window |
| Guardrails | **PASS** | Hard blocks + adaptive trust + audit log |
| Container sandbox | **PASS** | Podman/Docker + E2B |
| Legacy references | **ACCEPTABLE** | Deprecated env var detection + backwards-compat aliases |

**Overall Assessment**: The Sage fork has a strong security posture. All Phase 1 security hardening objectives are met. The two dependency vulnerabilities are in optional transitive paths and should be tracked for upstream fixes.
