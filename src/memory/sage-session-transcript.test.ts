import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSageSessionTranscriptForMemory } from "./sage-session-transcript.js";

describe("loadSageSessionTranscriptForMemory", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sage-session-transcript-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("maps Sage JSONL session transcripts to Sage Memory LLM session ingest payloads", async () => {
    const sessionFile = path.join(tempDir, "sage-session-1.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          id: "sage-session-1",
          timestamp: "2026-05-12T12:00:00.000Z",
          cwd: String.raw`C:\Users\jason\Desktop\sage`,
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "user",
            content: "Please capture this session.",
            timestamp: 1_778_588_401_000,
          },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            model: "gpt-5",
            content: [{ type: "text", text: "I will preserve the transcript." }],
            timestamp: 1_778_588_410_000,
          },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "tool",
            toolName: "exec_command",
            content: [{ type: "text", text: "3 tests passed" }],
            timestamp: 1_778_588_420_000,
          },
        }),
        "{broken json",
      ].join("\n"),
      "utf-8",
    );

    const payload = await loadSageSessionTranscriptForMemory({
      sessionFile,
      sessionId: "sage-session-1",
      sessionKey: "agent:main:main",
      namespace: "jason.sage.sessions",
      markdownPath: "~/workspace/memory/2026-05-12-session.md",
    });

    expect(payload).toEqual({
      namespace: "jason.sage.sessions",
      source: "sage",
      session_id: "sage-session-1",
      title: "Sage Session sage-session-1",
      source_uri: "sage://session/sage-session-1",
      started_at: "2026-05-12T12:00:00.000Z",
      ended_at: "2026-05-12T12:20:20.000Z",
      workspace: {
        cwd: String.raw`C:\Users\jason\Desktop\sage`,
        session_key: "agent:main:main",
        session_file: sessionFile,
      },
      messages: [
        {
          role: "user",
          content: "Please capture this session.",
          timestamp: "2026-05-12T12:20:01.000Z",
          metadata: { sage_entry_type: "message" },
        },
        {
          role: "assistant",
          content: "I will preserve the transcript.",
          timestamp: "2026-05-12T12:20:10.000Z",
          model: "gpt-5",
          metadata: { sage_entry_type: "message" },
        },
        {
          role: "tool",
          content: "3 tests passed",
          timestamp: "2026-05-12T12:20:20.000Z",
          tool_name: "exec_command",
          metadata: { sage_entry_type: "message" },
        },
      ],
      metadata: {
        capture_method: "sage-session-memory-hook",
        sessionKey: "agent:main:main",
        sessionId: "sage-session-1",
        sessionFile,
        markdownPath: "~/workspace/memory/2026-05-12-session.md",
      },
      sensitivity: "private",
    });
  });

  it("returns null when the transcript has no useful messages", async () => {
    const sessionFile = path.join(tempDir, "empty.jsonl");
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        type: "session",
        id: "empty",
        timestamp: "2026-05-12T12:00:00.000Z",
      }),
      "utf-8",
    );

    await expect(
      loadSageSessionTranscriptForMemory({
        sessionFile,
        sessionId: "empty",
        sessionKey: "agent:main:main",
      }),
    ).resolves.toBeNull();
  });
});
