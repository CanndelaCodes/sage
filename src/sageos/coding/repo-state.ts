import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { SageOsCodingDiff, SageOsRepoState } from "../types.js";

const execFileAsync = promisify(execFile);

export type SageOsCommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SageOsCommandRunner = (
  command: string,
  args: string[],
  opts: { cwd: string },
) => Promise<SageOsCommandResult>;

export const execFileCommandRunner: SageOsCommandRunner = async (command, args, opts) => {
  try {
    const result = await execFileAsync(command, args, {
      cwd: opts.cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      command: formatCommand(command, args),
      exitCode: 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (err) {
    const failure = err as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      command: formatCommand(command, args),
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
};

export async function readSageOsRepoState(params: {
  repoPath: string;
  runner?: SageOsCommandRunner;
}): Promise<SageOsRepoState> {
  const runner = params.runner ?? execFileCommandRunner;
  const status = await runner("git", ["status", "--porcelain=v1", "--branch"], {
    cwd: params.repoPath,
  });
  if (status.exitCode !== 0) {
    throw new Error(`git status failed in ${params.repoPath}: ${status.stderr || status.stdout}`);
  }
  return parseGitStatus(status.stdout);
}

export async function captureSageOsRepoDiff(params: {
  repoPath: string;
  changedFiles: string[];
  runner?: SageOsCommandRunner;
}): Promise<SageOsCodingDiff> {
  const runner = params.runner ?? execFileCommandRunner;
  const [stat, preview] = await Promise.all([
    runner("git", ["diff", "--stat", "--"], { cwd: params.repoPath }),
    runner("git", ["diff", "--"], { cwd: params.repoPath }),
  ]);
  if (stat.exitCode !== 0) {
    throw new Error(`git diff --stat failed in ${params.repoPath}: ${stat.stderr || stat.stdout}`);
  }
  if (preview.exitCode !== 0) {
    throw new Error(`git diff failed in ${params.repoPath}: ${preview.stderr || preview.stdout}`);
  }
  return {
    stat: previewText(stat.stdout),
    preview: previewText(preview.stdout),
    changedFiles: params.changedFiles,
  };
}

export function assertRelativeRepoPath(repoPath: string, relativePath: string): string {
  if (!relativePath.trim()) {
    throw new Error("relative file path required");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`file path must be relative to the repo: ${relativePath}`);
  }
  const root = path.resolve(repoPath);
  const target = path.resolve(root, relativePath);
  if (!isPathInside(root, target)) {
    throw new Error(`file path escapes the repo: ${relativePath}`);
  }
  return target;
}

export function isAllowedRepo(repoPath: string, allowedRepos: string[]): boolean {
  const normalizedRepo = normalizePath(repoPath);
  return allowedRepos.some((allowed) => normalizePath(allowed) === normalizedRepo);
}

export function parseCommandLine(commandLine: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < commandLine.length; index += 1) {
    const char = commandLine[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    throw new Error(`unterminated quote in command: ${commandLine}`);
  }
  if (current) {
    parts.push(current);
  }
  const [command, ...args] = parts;
  if (!command) {
    throw new Error("test command required");
  }
  return { command, args };
}

function parseGitStatus(stdout: string): SageOsRepoState {
  let branch: string | undefined;
  const changedFiles: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    if (line.startsWith("## ")) {
      const rawBranch = line.slice(3).split("...")[0]?.trim();
      branch = rawBranch && !rawBranch.startsWith("No commits yet on ") ? rawBranch : undefined;
      continue;
    }
    const file = line.slice(3).trim();
    if (file) {
      changedFiles.push(file);
    }
  }
  return { branch, dirty: changedFiles.length > 0, changedFiles };
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function previewText(value: string, max = 8_000): string {
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}
