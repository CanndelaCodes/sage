import { describe, expect, it, beforeEach } from "vitest";
import {
  detectContainerRuntime,
  detectDocker,
  detectPodman,
  ensurePodmanMachine,
  getCachedContainerRuntime,
  getRuntimeInfo,
  isPodmanMachineRunning,
  listPodmanMachines,
  resetRuntimeCache,
  translateContainerArgs,
  _testing,
  type ContainerRuntimeDeps,
  type ExecResult,
} from "./container-runtime.js";

type CheckFn = (command: string, args: string[]) => ExecResult;

function makeCheckCommand(responses: Record<string, ExecResult>): CheckFn {
  return (command: string, args: string[]) => {
    const key = `${command} ${args.join(" ")}`;
    for (const [pattern, result] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        return result;
      }
    }
    return { stdout: "", stderr: "command not found", code: 1 };
  };
}

function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", code: 0 };
}

function fail(stderr: string): ExecResult {
  return { stdout: "", stderr, code: 1 };
}

describe("container runtime detection", () => {
  beforeEach(() => {
    resetRuntimeCache();
  });

  it("detects podman when available", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman version": ok("4.9.3"),
      }),
    };
    const result = detectPodman(deps);
    expect(result.available).toBe(true);
    expect(result.runtime).toBe("podman");
    expect(result.version).toBe("4.9.3");
  });

  it("detects docker when available", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "docker version": ok("24.0.7"),
      }),
    };
    const result = detectDocker(deps);
    expect(result.available).toBe(true);
    expect(result.runtime).toBe("docker");
    expect(result.version).toBe("24.0.7");
  });

  it("returns unavailable when command not found", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: () => fail("command not found"),
    };
    expect(detectPodman(deps).available).toBe(false);
    expect(detectDocker(deps).available).toBe(false);
  });

  it("falls back to --version when template format fails", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman version --format": fail("bad flag"),
        "podman --version": ok("podman version 4.9.3"),
      }),
    };
    const result = detectPodman(deps);
    expect(result.available).toBe(true);
    expect(result.version).toBe("4.9.3");
  });

  it("prefers podman over docker in auto-detect", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman version": ok("4.9.3"),
        "podman --version": ok("podman version 4.9.3"),
        "docker version": ok("24.0.7"),
      }),
    };
    const result = detectContainerRuntime(undefined, deps);
    expect(result).not.toBeNull();
    expect(result!.runtime).toBe("podman");
  });

  it("falls back to docker when podman unavailable", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "docker version": ok("24.0.7"),
      }),
    };
    const result = detectContainerRuntime(undefined, deps);
    expect(result).not.toBeNull();
    expect(result!.runtime).toBe("docker");
  });

  it("returns null when no runtime available", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: () => fail("not found"),
    };
    const result = detectContainerRuntime(undefined, deps);
    expect(result).toBeNull();
  });

  it("respects preferred runtime", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman version": ok("4.9.3"),
        "podman --version": ok("podman version 4.9.3"),
        "docker version": ok("24.0.7"),
      }),
    };

    const dockerPreferred = detectContainerRuntime("docker", deps);
    expect(dockerPreferred!.runtime).toBe("docker");

    const podmanPreferred = detectContainerRuntime("podman", deps);
    expect(podmanPreferred!.runtime).toBe("podman");
  });

  it("falls back when preferred runtime unavailable", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "docker version": ok("24.0.7"),
      }),
    };
    const result = detectContainerRuntime("podman", deps);
    expect(result).not.toBeNull();
    expect(result!.runtime).toBe("docker");
  });
});

describe("cached runtime detection", () => {
  beforeEach(() => {
    resetRuntimeCache();
  });

  it("caches the detection result", () => {
    let callCount = 0;
    const deps: ContainerRuntimeDeps = {
      checkCommand: (cmd, _args) => {
        callCount++;
        if (cmd === "podman") {
          return ok("4.9.3");
        }
        return fail("not found");
      },
    };

    const first = getCachedContainerRuntime(undefined, deps);
    const second = getCachedContainerRuntime(undefined, deps);

    expect(first).toBe(second);
    // Only called for the first detection (podman version + potentially --version)
    expect(callCount).toBeLessThanOrEqual(2);
  });

  it("re-detects after cache reset", () => {
    let callCount = 0;
    const deps: ContainerRuntimeDeps = {
      checkCommand: () => {
        callCount++;
        return ok("4.9.3");
      },
    };

    getCachedContainerRuntime(undefined, deps);
    resetRuntimeCache();
    getCachedContainerRuntime(undefined, deps);

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

describe("getRuntimeInfo", () => {
  it("reports podman as rootless-capable", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman version": ok("4.9.3"),
      }),
    };
    const info = getRuntimeInfo("podman", deps);
    expect(info).not.toBeNull();
    expect(info!.supportsRootless).toBe(true);
  });

  it("checks docker rootless via info command", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "docker version": ok("24.0.7"),
        "docker info": ok("[name=rootless]"),
      }),
    };
    const info = getRuntimeInfo("docker", deps);
    expect(info).not.toBeNull();
    expect(info!.supportsRootless).toBe(true);
  });

  it("returns null when runtime unavailable", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: () => fail("not found"),
    };
    expect(getRuntimeInfo("podman", deps)).toBeNull();
    expect(getRuntimeInfo("docker", deps)).toBeNull();
  });
});

describe("podman machine management", () => {
  it("lists machines from JSON output", () => {
    const machines = [
      { Name: "sage-sandbox", Running: true, CPUs: 2, Memory: "2048MB" },
      { Name: "default", Running: false, CPUs: 1, Memory: "1024MB" },
    ];
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman machine list": ok(JSON.stringify(machines)),
      }),
    };

    const result = listPodmanMachines(deps);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("sage-sandbox");
    expect(result[0].running).toBe(true);
    expect(result[1].running).toBe(false);
  });

  it("returns empty list on failure", () => {
    const deps: ContainerRuntimeDeps = {
      checkCommand: () => fail("no machines"),
    };
    expect(listPodmanMachines(deps)).toEqual([]);
  });

  it("detects running machine", () => {
    const machines = [{ Name: "sage-sandbox", Running: true }];
    const deps: ContainerRuntimeDeps = {
      checkCommand: makeCheckCommand({
        "podman machine list": ok(JSON.stringify(machines)),
      }),
    };
    expect(isPodmanMachineRunning("sage-sandbox", deps)).toBe(true);
    expect(isPodmanMachineRunning("nonexistent", deps)).toBe(false);
  });

  it("skips machine setup on Linux", () => {
    const deps: ContainerRuntimeDeps = {
      platform: "linux",
      checkCommand: () => fail("should not be called"),
    };
    const result = ensurePodmanMachine(undefined, deps);
    expect(result.ok).toBe(true);
    expect(result.machineName).toBe("native");
  });

  it("starts existing stopped machine on Windows", () => {
    const machines = [{ Name: "sage-sandbox", Running: false }];
    const deps: ContainerRuntimeDeps = {
      platform: "win32",
      checkCommand: makeCheckCommand({
        "podman machine list": ok(JSON.stringify(machines)),
        "podman machine start": ok("Machine started"),
      }),
    };

    const result = ensurePodmanMachine(undefined, deps);
    expect(result.ok).toBe(true);
    expect(result.machineName).toBe("sage-sandbox");
  });

  it("creates and starts new machine on Windows when none exists", () => {
    const calls: string[] = [];
    const deps: ContainerRuntimeDeps = {
      platform: "win32",
      checkCommand: (cmd, args) => {
        const key = `${cmd} ${args.join(" ")}`;
        calls.push(key);
        if (key.includes("machine list")) {
          return ok("[]");
        }
        if (key.includes("machine init")) {
          return ok("Machine initialized");
        }
        if (key.includes("machine start")) {
          return ok("Machine started");
        }
        return fail("unknown");
      },
    };

    const result = ensurePodmanMachine(undefined, deps);
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.includes("machine init"))).toBe(true);
    expect(calls.some((c) => c.includes("machine start"))).toBe(true);
  });

  it("reports init failure", () => {
    const deps: ContainerRuntimeDeps = {
      platform: "win32",
      checkCommand: makeCheckCommand({
        "podman machine list": ok("[]"),
        "podman machine init": fail("init failed: disk full"),
      }),
    };
    const result = ensurePodmanMachine(undefined, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("init failed");
  });

  it("uses custom machine options", () => {
    const calls: string[] = [];
    const deps: ContainerRuntimeDeps = {
      platform: "darwin",
      checkCommand: (cmd, args) => {
        calls.push(`${cmd} ${args.join(" ")}`);
        if (args.includes("list")) {
          return ok("[]");
        }
        return ok("OK");
      },
    };

    ensurePodmanMachine({ name: "custom-vm", cpus: 4, memory: 4096, diskSize: 50 }, deps);

    const initCall = calls.find((c) => c.includes("machine init"));
    expect(initCall).toContain("custom-vm");
    expect(initCall).toContain("--cpus 4");
    expect(initCall).toContain("--memory 4096");
    expect(initCall).toContain("--disk-size 50");
  });
});

describe("translateContainerArgs", () => {
  it("passes docker args through unchanged", () => {
    const args = ["create", "--name", "test", "--read-only", "--network", "none"];
    expect(translateContainerArgs("docker", args)).toEqual(args);
  });

  it("handles podman args (mostly compatible)", () => {
    const args = [
      "create",
      "--name",
      "test",
      "--read-only",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
    ];
    const translated = translateContainerArgs("podman", args);
    // Podman accepts the same flags
    expect(translated).toContain("--read-only");
    expect(translated).toContain("--cap-drop");
  });
});

describe("sandbox security defaults", () => {
  it("defaults constants are secure", () => {
    expect(_testing.DEFAULT_PODMAN_MACHINE_CPUS).toBeGreaterThan(0);
    expect(_testing.DEFAULT_PODMAN_MACHINE_MEMORY_MB).toBeGreaterThanOrEqual(1024);
    expect(_testing.DEFAULT_PODMAN_MACHINE_DISK_GB).toBeGreaterThanOrEqual(10);
  });
});
