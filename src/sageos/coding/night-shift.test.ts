import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createSageOsEventLog, readSageOsEvents } from "../event-log.js";
import { createSageOsStateStore, readSageOsState, upsertSageOsTask } from "../state-store.js";
import { runSageOsNightShiftTask } from "./night-shift.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function createFixtureRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFile(path.join(repo, "README.md"), "# Fixture\n", "utf8");
  await writeFile(
    path.join(repo, "test.js"),
    [
      "const { readFileSync } = require('node:fs');",
      "const text = readFileSync('README.md', 'utf8');",
      "if (!text.includes('night shift')) {",
      "  console.error('marker missing');",
      "  process.exit(1);",
      "}",
      "console.log('ok');",
      "",
    ].join("\n"),
    "utf8",
  );
  await git(repo, ["init"]);
  await git(repo, ["add", "README.md", "test.js"]);
  await git(repo, [
    "-c",
    "user.email=sageos@example.test",
    "-c",
    "user.name=SageOS Test",
    "commit",
    "-m",
    "init",
  ]);
  return repo;
}

describe("SageOS Night Shift coding runner", () => {
  it("runs an allowed repo task, appends a scoped file change, runs tests, and stores a diff report", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "sageos-night-shift-"));
    const repo = await createFixtureRepo("sageos-night-shift-repo-");
    const store = createSageOsStateStore({ stateDir });
    const now = "2026-05-27T23:45:00.000Z";
    await upsertSageOsTask(store, {
      id: "task_fixture_fix",
      title: "Fix fixture test",
      objective: "Append the Night Shift marker and run the fixture test.",
      state: "queued",
      requestedBy: "jason",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: [repo], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await runSageOsNightShiftTask({
      stateDir,
      taskId: "task_fixture_fix",
      cfg: {
        coding: { enabled: true, allowedRepos: [repo], requireCleanGit: true },
      },
      append: { relativePath: "README.md", text: "\nnight shift\n" },
      testCommand: "node test.js",
      requestedBy: "sageos.test",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "succeeded",
      task: { id: "task_fixture_fix", state: "completed" },
      run: {
        id: "run_task_fixture_fix_1",
        state: "succeeded",
        workerSessionId: "worker_task_fixture_fix_1",
        budgetUsed: { elapsedMinutes: 0, toolCalls: 2 },
        timeline: [
          { label: "Started SageOS coding task task_fixture_fix", state: "running" },
          { label: "Completed SageOS coding task task_fixture_fix", state: "succeeded" },
        ],
      },
      report: {
        taskId: "task_fixture_fix",
        repoPath: repo,
        outcome: "succeeded",
        diff: { changedFiles: ["README.md"] },
        tests: [{ command: "node test.js", exitCode: 0 }],
        blockers: [],
        verificationRefs: ["test:node test.js"],
      },
    });
    expect(result.report.diff.preview).toContain("+night shift");
    expect(result.report.tests[0]?.stdoutPreview).toContain("ok");
    await expect(readFile(path.join(repo, "README.md"), "utf8")).resolves.toContain("night shift");

    const state = await readSageOsState(store);
    expect(state.codingReports).toEqual([
      expect.objectContaining({
        id: "coding_report_task_fixture_fix_1",
        outcome: "succeeded",
      }),
    ]);
    const events = await readSageOsEvents(createSageOsEventLog({ stateDir }));
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["coding_task_started", "coding_task_completed"]),
    );
  });

  it("blocks dirty repos when clean git is required", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "sageos-night-shift-block-"));
    const repo = await createFixtureRepo("sageos-night-shift-dirty-repo-");
    const store = createSageOsStateStore({ stateDir });
    const now = "2026-05-27T23:50:00.000Z";
    await writeFile(path.join(repo, "README.md"), "# Fixture\nexisting dirty change\n", "utf8");
    await upsertSageOsTask(store, {
      id: "task_dirty_repo",
      title: "Do not overwrite dirty repo",
      objective: "Append a marker only if the repo is clean.",
      state: "queued",
      requestedBy: "jason",
      autonomyTier: "execute_scoped",
      policyScopes: [{ kind: "repo", allow: [repo], risk: "low" }],
      createdAt: now,
      updatedAt: now,
    });

    const result = await runSageOsNightShiftTask({
      stateDir,
      taskId: "task_dirty_repo",
      cfg: {
        coding: { enabled: true, allowedRepos: [repo], requireCleanGit: true },
      },
      append: { relativePath: "README.md", text: "\nnight shift\n" },
      testCommand: "node test.js",
      requestedBy: "sageos.test",
      now: () => new Date(now),
    });

    expect(result).toMatchObject({
      outcome: "blocked",
      task: { id: "task_dirty_repo", state: "blocked" },
      run: {
        id: "run_task_dirty_repo_1",
        state: "failed",
        error: expect.stringContaining("dirty"),
        workerSessionId: "worker_task_dirty_repo_1",
        budgetUsed: { elapsedMinutes: 0, toolCalls: 0 },
        timeline: [
          { label: "Started SageOS coding task task_dirty_repo", state: "running" },
          { label: "Blocked SageOS coding task task_dirty_repo", state: "failed" },
        ],
      },
      report: {
        outcome: "blocked",
        diff: { changedFiles: ["README.md"] },
        tests: [],
        blockers: [expect.stringContaining("dirty")],
      },
    });
    await expect(readFile(path.join(repo, "README.md"), "utf8")).resolves.not.toContain(
      "night shift",
    );
  });
});
