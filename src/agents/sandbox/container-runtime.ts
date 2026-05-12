/**
 * Container runtime abstraction layer.
 *
 * Supports Podman (preferred) and Docker (fallback) as container runtimes.
 * On Windows, includes Podman Machine management for the required Linux VM.
 *
 * Detection priority:
 *   1. Explicit config (sandbox.docker.runtime)
 *   2. Podman (if available)
 *   3. Docker (fallback)
 */

import { spawn, spawnSync } from "node:child_process";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("sandbox/container-runtime");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerRuntime = "podman" | "docker";

export type RuntimeDetectionResult = {
  runtime: ContainerRuntime;
  command: string;
  version: string;
  available: boolean;
};

export type RuntimeInfo = {
  runtime: ContainerRuntime;
  command: string;
  version: string;
  supportsRootless: boolean;
};

export type PodmanMachineStatus = {
  name: string;
  running: boolean;
  cpus?: number;
  memory?: string;
  diskSize?: string;
};

export type PodmanMachineInitOptions = {
  cpus?: number;
  memory?: number; // MB
  diskSize?: number; // GB
  name?: string;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type ContainerRuntimeDeps = {
  platform?: NodeJS.Platform;
  /** Override for testing: function to check if a command exists. */
  checkCommand?: (command: string, args: string[]) => ExecResult;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DETECT_TIMEOUT_MS = 5_000;
const PODMAN_MACHINE_INIT_TIMEOUT_MS = 120_000;
const PODMAN_MACHINE_START_TIMEOUT_MS = 60_000;
const DEFAULT_PODMAN_MACHINE_NAME = "sage-sandbox";
const DEFAULT_PODMAN_MACHINE_CPUS = 2;
const DEFAULT_PODMAN_MACHINE_MEMORY_MB = 2048;
const DEFAULT_PODMAN_MACHINE_DISK_GB = 20;

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

function execCommandSync(
  command: string,
  args: string[],
  opts?: { timeout?: number; windowsHide?: boolean },
): ExecResult {
  const timeout = opts?.timeout ?? DETECT_TIMEOUT_MS;
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: opts?.windowsHide ?? true,
    });
    return {
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      code: result.status ?? 1,
    };
  } catch {
    return { stdout: "", stderr: "", code: 1 };
  }
}

export function execContainerCommand(
  runtime: ContainerRuntime,
  args: string[],
  opts?: { allowFailure?: boolean },
): Promise<ExecResult> {
  const command = runtime === "podman" ? "podman" : "docker";
  return new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !opts?.allowFailure) {
        reject(new Error(stderr.trim() || `${command} ${args.join(" ")} failed`));
        return;
      }
      resolve({ stdout, stderr, code: exitCode });
    });
    child.on("error", (err) => {
      if (opts?.allowFailure) {
        resolve({ stdout, stderr: err.message, code: 1 });
        return;
      }
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

function detectCommand(
  command: string,
  deps?: ContainerRuntimeDeps,
): { available: boolean; version: string } {
  const check = deps?.checkCommand ?? execCommandSync;
  const result = check(command, ["version", "--format", "{{.Version}}"]);

  if (result.code !== 0) {
    // Try simpler version format for Podman which may use different template
    const fallback = check(command, ["--version"]);
    if (fallback.code !== 0) {
      return { available: false, version: "" };
    }
    const versionMatch = fallback.stdout.trim().match(/(\d+\.\d+\.\d+)/);
    return {
      available: true,
      version: versionMatch ? versionMatch[1] : fallback.stdout.trim(),
    };
  }

  return { available: true, version: result.stdout.trim() };
}

/**
 * Detect if Podman is available.
 */
export function detectPodman(deps?: ContainerRuntimeDeps): RuntimeDetectionResult {
  const { available, version } = detectCommand("podman", deps);
  return { runtime: "podman", command: "podman", version, available };
}

/**
 * Detect if Docker is available.
 */
export function detectDocker(deps?: ContainerRuntimeDeps): RuntimeDetectionResult {
  const { available, version } = detectCommand("docker", deps);
  return { runtime: "docker", command: "docker", version, available };
}

/**
 * Detect the best available container runtime.
 * Prefers Podman, falls back to Docker.
 */
export function detectContainerRuntime(
  preferred?: ContainerRuntime,
  deps?: ContainerRuntimeDeps,
): RuntimeDetectionResult | null {
  // If a specific runtime is preferred, try it first
  if (preferred === "podman") {
    const podman = detectPodman(deps);
    if (podman.available) {
      return podman;
    }
    log.warn("preferred runtime podman not available, trying docker");
  }
  if (preferred === "docker") {
    const docker = detectDocker(deps);
    if (docker.available) {
      return docker;
    }
    log.warn("preferred runtime docker not available, trying podman");
  }

  // Auto-detect: prefer Podman
  const podman = detectPodman(deps);
  if (podman.available) {
    log.info("detected container runtime", { runtime: "podman", version: podman.version });
    return podman;
  }

  const docker = detectDocker(deps);
  if (docker.available) {
    log.info("detected container runtime", { runtime: "docker", version: docker.version });
    return docker;
  }

  log.warn("no container runtime available");
  return null;
}

/**
 * Get detailed runtime info including rootless support.
 */
export function getRuntimeInfo(
  runtime: ContainerRuntime,
  deps?: ContainerRuntimeDeps,
): RuntimeInfo | null {
  const detection = runtime === "podman" ? detectPodman(deps) : detectDocker(deps);
  if (!detection.available) {
    return null;
  }

  let supportsRootless = false;
  if (runtime === "podman") {
    // Podman supports rootless by default
    supportsRootless = true;
  } else {
    // Docker rootless check
    const check = deps?.checkCommand ?? execCommandSync;
    const result = check("docker", ["info", "--format", "{{.SecurityOptions}}"]);
    if (result.code === 0) {
      supportsRootless = result.stdout.includes("rootless");
    }
  }

  return {
    runtime,
    command: detection.command,
    version: detection.version,
    supportsRootless,
  };
}

// ---------------------------------------------------------------------------
// Podman Machine management (Windows / macOS)
// ---------------------------------------------------------------------------

/**
 * List Podman machines and their status.
 */
export function listPodmanMachines(deps?: ContainerRuntimeDeps): PodmanMachineStatus[] {
  const check = deps?.checkCommand ?? execCommandSync;
  const result = check("podman", ["machine", "list", "--format", "json"]);
  if (result.code !== 0) {
    return [];
  }

  try {
    const machines = JSON.parse(result.stdout) as Array<{
      Name?: string;
      Running?: boolean;
      CPUs?: number;
      Memory?: string;
      DiskSize?: string;
    }>;
    return machines.map((m) => ({
      name: m.Name ?? "",
      running: m.Running ?? false,
      cpus: m.CPUs,
      memory: m.Memory,
      diskSize: m.DiskSize,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a Podman machine is running.
 */
export function isPodmanMachineRunning(machineName?: string, deps?: ContainerRuntimeDeps): boolean {
  const machines = listPodmanMachines(deps);
  const name = machineName ?? DEFAULT_PODMAN_MACHINE_NAME;
  return machines.some((m) => m.name === name && m.running);
}

/**
 * Initialize a Podman machine for Windows/macOS.
 * Podman on these platforms requires a Linux VM to run containers.
 */
export function initPodmanMachine(
  options?: PodmanMachineInitOptions,
  deps?: ContainerRuntimeDeps,
): ExecResult {
  const check = deps?.checkCommand ?? execCommandSync;
  const name = options?.name ?? DEFAULT_PODMAN_MACHINE_NAME;
  const cpus = options?.cpus ?? DEFAULT_PODMAN_MACHINE_CPUS;
  const memory = options?.memory ?? DEFAULT_PODMAN_MACHINE_MEMORY_MB;
  const diskSize = options?.diskSize ?? DEFAULT_PODMAN_MACHINE_DISK_GB;

  const args = [
    "machine",
    "init",
    name,
    "--cpus",
    String(cpus),
    "--memory",
    String(memory),
    "--disk-size",
    String(diskSize),
    "--rootful=false",
  ];

  log.info("initializing podman machine", { name, cpus, memory, diskSize });
  return check("podman", args, { timeout: PODMAN_MACHINE_INIT_TIMEOUT_MS });
}

/**
 * Start a Podman machine.
 */
export function startPodmanMachine(machineName?: string, deps?: ContainerRuntimeDeps): ExecResult {
  const check = deps?.checkCommand ?? execCommandSync;
  const name = machineName ?? DEFAULT_PODMAN_MACHINE_NAME;

  log.info("starting podman machine", { name });
  return check("podman", ["machine", "start", name], { timeout: PODMAN_MACHINE_START_TIMEOUT_MS });
}

/**
 * Stop a Podman machine.
 */
export function stopPodmanMachine(machineName?: string, deps?: ContainerRuntimeDeps): ExecResult {
  const check = deps?.checkCommand ?? execCommandSync;
  const name = machineName ?? DEFAULT_PODMAN_MACHINE_NAME;

  log.info("stopping podman machine", { name });
  return check("podman", ["machine", "stop", name]);
}

/**
 * Ensure a Podman machine is available and running.
 * Creates one if it doesn't exist, starts it if stopped.
 * Required on Windows and macOS where Podman needs a Linux VM.
 */
export function ensurePodmanMachine(
  options?: PodmanMachineInitOptions,
  deps?: ContainerRuntimeDeps,
): { ok: boolean; machineName: string; error?: string } {
  const platform = deps?.platform ?? process.platform;

  // On Linux, Podman runs natively - no machine needed
  if (platform === "linux") {
    return { ok: true, machineName: "native" };
  }

  const machineName = options?.name ?? DEFAULT_PODMAN_MACHINE_NAME;

  // Check if machine exists and is running
  const machines = listPodmanMachines(deps);
  const existing = machines.find((m) => m.name === machineName);

  if (existing?.running) {
    return { ok: true, machineName };
  }

  if (existing) {
    // Machine exists but not running - start it
    const startResult = startPodmanMachine(machineName, deps);
    if (startResult.code === 0) {
      return { ok: true, machineName };
    }
    return {
      ok: false,
      machineName,
      error: `Failed to start Podman machine: ${startResult.stderr.trim()}`,
    };
  }

  // Machine doesn't exist - create and start it
  const initResult = initPodmanMachine(options, deps);
  if (initResult.code !== 0) {
    return {
      ok: false,
      machineName,
      error: `Failed to initialize Podman machine: ${initResult.stderr.trim()}`,
    };
  }

  const startResult = startPodmanMachine(machineName, deps);
  if (startResult.code !== 0) {
    return {
      ok: false,
      machineName,
      error: `Failed to start Podman machine after init: ${startResult.stderr.trim()}`,
    };
  }

  return { ok: true, machineName };
}

// ---------------------------------------------------------------------------
// Runtime compatibility layer
// ---------------------------------------------------------------------------

/**
 * Check if a runtime needs Podman-specific adjustments.
 * Some Docker CLI args behave differently in Podman.
 */
export function runtimeNeedsAdjustment(
  runtime: ContainerRuntime,
  feature: "security-opt" | "cap-drop" | "network" | "read-only" | "tmpfs",
): boolean {
  // Podman is largely Docker-compatible for these features
  // but some edge cases exist
  if (runtime === "podman") {
    switch (feature) {
      case "security-opt":
        // Podman supports security-opt but apparmor may not be available
        // in rootless mode on all distros
        return false;
      default:
        return false;
    }
  }
  return false;
}

/**
 * Translate Docker-specific args to work with the given runtime.
 * Both Podman and Docker use nearly identical CLI interfaces,
 * but there are some differences.
 */
export function translateContainerArgs(runtime: ContainerRuntime, args: string[]): string[] {
  if (runtime === "docker") {
    return args;
  }

  // Podman-specific translations
  const translated: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Podman doesn't need --security-opt no-new-privileges (it's default in rootless)
    // But we keep it for compatibility - Podman accepts it fine
    translated.push(arg);
  }

  return translated;
}

// ---------------------------------------------------------------------------
// Cached runtime detection
// ---------------------------------------------------------------------------

let cachedRuntime: RuntimeDetectionResult | null | undefined;

/**
 * Get the cached container runtime, detecting on first call.
 * Call resetRuntimeCache() to force re-detection.
 */
export function getCachedContainerRuntime(
  preferred?: ContainerRuntime,
  deps?: ContainerRuntimeDeps,
): RuntimeDetectionResult | null {
  if (cachedRuntime === undefined) {
    cachedRuntime = detectContainerRuntime(preferred, deps);
  }
  return cachedRuntime;
}

/**
 * Reset the cached runtime detection (for testing or re-detection).
 */
export function resetRuntimeCache(): void {
  cachedRuntime = undefined;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export const _testing = {
  execCommandSync,
  detectCommand,
  DEFAULT_PODMAN_MACHINE_NAME,
  DEFAULT_PODMAN_MACHINE_CPUS,
  DEFAULT_PODMAN_MACHINE_MEMORY_MB,
  DEFAULT_PODMAN_MACHINE_DISK_GB,
};
