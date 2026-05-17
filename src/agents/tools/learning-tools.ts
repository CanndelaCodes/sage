import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { SageConfig } from "../../config/config.js";
import type { LearningEventInput } from "../../learning/types.js";
import type { AnyAgentTool } from "./common.js";
import {
  enqueueLearningEvents,
  listLearningEventQueue,
  replayLearningEventQueue,
  resolveLearningEventQueuePath,
} from "../../learning/activity-queue.js";
import { normalizeLearningEvent, summarizeLearningEvent } from "../../learning/events.js";
import {
  listLearnedSkillNames,
  manageLearnedSkill,
  readLearnedSkill,
  restoreArchivedLearnedSkill,
} from "../../learning/skill-manager.js";
import { resolveMemoryBackendConfig } from "../../memory/backend-config.js";
import { SageMemoryManager } from "../../memory/sage-memory-manager.js";
import { CONFIG_DIR } from "../../utils.js";
import { bumpSkillsSnapshotVersion } from "../skills/refresh.js";
import { loadWorkspaceSkillEntries } from "../skills/workspace.js";
import { jsonResult, readStringArrayParam, readStringParam } from "./common.js";

const SkillsListSchema = Type.Object({});

const SkillViewSchema = Type.Object({
  name: Type.String(),
});

const SkillManageSchema = Type.Object({
  action: Type.String(),
  name: Type.String(),
  content: Type.Optional(Type.String()),
  oldString: Type.Optional(Type.String()),
  newString: Type.Optional(Type.String()),
  filePath: Type.Optional(Type.String()),
  fileContent: Type.Optional(Type.String()),
  absorbedInto: Type.Optional(Type.String()),
  evidenceNodeIds: Type.Optional(Type.Array(Type.String())),
});

const LearningStatusSchema = Type.Object({});

const LearningReviewSchema = Type.Object({
  source: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  text: Type.String(),
  actor: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
  workspace: Type.Optional(Type.String()),
  flush: Type.Optional(Type.Boolean()),
});

export function createLearningTools(options?: {
  config?: SageConfig;
  workspaceDir?: string;
  agentSessionKey?: string;
  agentId?: string;
}): AnyAgentTool[] {
  if (options?.config?.learning?.enabled !== true) {
    return [];
  }
  const skillsRoot = path.join(CONFIG_DIR, "skills");
  const queuePath = resolveLearningEventQueuePath({
    agentId: options?.agentId ?? "main",
  });
  return [
    createSkillsListTool({ ...options, skillsRoot }),
    createSkillViewTool({ ...options, skillsRoot }),
    createSkillManageTool({ ...options, skillsRoot, queuePath }),
    createLearningStatusTool({ ...options, skillsRoot, queuePath }),
    createLearningReviewTool({ ...options, queuePath }),
  ];
}

function createSkillsListTool(options: {
  config?: SageConfig;
  workspaceDir?: string;
  skillsRoot: string;
}): AnyAgentTool {
  return {
    label: "Skills List",
    name: "skills_list",
    description:
      "List Sage skills available for procedural learning. Use before skill_view or skill_manage.",
    parameters: SkillsListSchema,
    execute: async () => {
      const workspaceDir = options.workspaceDir ?? process.cwd();
      const entries = loadWorkspaceSkillEntries(workspaceDir, {
        config: options.config,
        managedSkillsDir: options.skillsRoot,
      });
      const learned = new Set(await listLearnedSkillNames(options.skillsRoot));
      return jsonResult({
        skills: entries.map((entry) => ({
          name: entry.skill.name,
          description: entry.skill.description,
          source: entry.skill.baseDir.includes(options.skillsRoot)
            ? "sage-managed"
            : "workspace-or-bundled",
          learned: learned.has(entry.skill.name),
        })),
      });
    },
  };
}

function createSkillViewTool(options: {
  config?: SageConfig;
  workspaceDir?: string;
  skillsRoot: string;
}): AnyAgentTool {
  return {
    label: "Skill View",
    name: "skill_view",
    description: "Read a skill's SKILL.md and provenance when available.",
    parameters: SkillViewSchema,
    execute: async (_toolCallId, params) => {
      const name = readStringParam(params, "name", { required: true });
      try {
        const learned = await readLearnedSkill({ skillsRoot: options.skillsRoot, name });
        return jsonResult({
          name,
          path: learned.skillPath,
          skillMd: learned.skillMd,
          provenance: learned.provenance,
        });
      } catch {
        const workspaceDir = options.workspaceDir ?? process.cwd();
        const entries = loadWorkspaceSkillEntries(workspaceDir, {
          config: options.config,
          managedSkillsDir: options.skillsRoot,
        });
        const entry = entries.find((candidate) => candidate.skill.name === name);
        if (!entry) {
          throw new Error(`skill '${name}' not found`);
        }
        return jsonResult({
          name,
          path: entry.skill.baseDir,
          skillMd: await fs.readFile(entry.skill.filePath, "utf-8"),
        });
      }
    },
  };
}

function createSkillManageTool(options: {
  config?: SageConfig;
  workspaceDir?: string;
  agentSessionKey?: string;
  skillsRoot: string;
  queuePath: string;
}): AnyAgentTool {
  return {
    label: "Skill Manage",
    name: "skill_manage",
    description:
      "Autonomously create, patch, edit, archive, restore, and add support files for learned Sage skills.",
    parameters: SkillManageSchema,
    execute: async (_toolCallId, params) => {
      if (options.config?.learning?.skills?.autoApply === false) {
        throw new Error("learning.skills.autoApply is false; skill_manage is read-only");
      }
      const action = readStringParam(params, "action", { required: true });
      const name = readStringParam(params, "name", { required: true });
      const evidenceNodeIds = readStringArrayParam(params, "evidenceNodeIds") ?? [];
      const result =
        action === "restore"
          ? await restoreArchivedLearnedSkill({ skillsRoot: options.skillsRoot, name })
          : await manageLearnedSkill({
              skillsRoot: options.skillsRoot,
              action: normalizeSkillAction(action),
              name,
              content: readStringParam(params, "content", { allowEmpty: true }),
              oldString: readStringParam(params, "oldString", { allowEmpty: true }),
              newString: readStringParam(params, "newString", { allowEmpty: true }),
              filePath: readStringParam(params, "filePath"),
              fileContent: readStringParam(params, "fileContent", { allowEmpty: true }),
              absorbedInto: readStringParam(params, "absorbedInto", { allowEmpty: true }),
              evidenceNodeIds,
            });
      bumpSkillsSnapshotVersion({
        workspaceDir: options.workspaceDir,
        reason: "manual",
        changedPath: result.skillPath,
      });
      await enqueueLearningEvents({
        queuePath: options.queuePath,
        events: [
          normalizeLearningEvent({
            source: "skill_mutation",
            actor: "agent:learning",
            sessionKey: options.agentSessionKey,
            workspace: options.workspaceDir,
            title: `skill_manage ${action} ${name}`,
            text: result.provenance.lastAppliedDiff ?? `skill_manage ${action} ${name}`,
            payload: {
              action,
              name,
              skillPath: result.skillPath,
              evidenceNodeIds,
            },
            provenance: {
              toolName: "skill_manage",
            },
          }),
        ],
      });
      return jsonResult(result);
    },
  };
}

function createLearningStatusTool(options: {
  config?: SageConfig;
  skillsRoot: string;
  queuePath: string;
}): AnyAgentTool {
  return {
    label: "Learning Status",
    name: "learning_status",
    description: "Show autonomous learning configuration, queue status, and learned skill count.",
    parameters: LearningStatusSchema,
    execute: async () => {
      const [queue, skillNames] = await Promise.all([
        listLearningEventQueue({ queuePath: options.queuePath }),
        listLearnedSkillNames(options.skillsRoot),
      ]);
      return jsonResult({
        enabled: options.config?.learning?.enabled === true,
        review: {
          timing: options.config?.learning?.review?.timing ?? "after-task",
          modelPolicy: options.config?.learning?.review?.modelPolicy ?? "hybrid-local-first",
        },
        sources: options.config?.learning?.sources ?? {},
        skills: {
          autoApply: options.config?.learning?.skills?.autoApply !== false,
          learnedCount: skillNames.length,
          learned: skillNames,
        },
        queue: queue.counts,
        queuePath: queue.path,
      });
    },
  };
}

function createLearningReviewTool(options: {
  config?: SageConfig;
  workspaceDir?: string;
  agentSessionKey?: string;
  queuePath: string;
}): AnyAgentTool {
  return {
    label: "Learning Review",
    name: "learning_review",
    description:
      "Record a compact learning review event and optionally flush queued learning activity to Sage Memory.",
    parameters: LearningReviewSchema,
    execute: async (_toolCallId, params) => {
      const text = readStringParam(params, "text", { required: true });
      const source = normalizeLearningSource(readStringParam(params, "source"));
      const input: LearningEventInput = {
        source,
        actor: readStringParam(params, "actor") ?? "agent:learning",
        sessionKey: readStringParam(params, "sessionKey") ?? options.agentSessionKey,
        workspace: readStringParam(params, "workspace") ?? options.workspaceDir,
        title: readStringParam(params, "title"),
        text,
        payload: {
          candidateTypes: inferCandidateTypes(text),
        },
        provenance: {
          toolName: "learning_review",
        },
      };
      const event = normalizeLearningEvent(input);
      await enqueueLearningEvents({ queuePath: options.queuePath, events: [event] });
      let flushResult: unknown = null;
      if (params.flush === true && options.config) {
        flushResult = await flushLearningQueue({
          cfg: options.config,
          queuePath: options.queuePath,
        });
      }
      return jsonResult({
        event: summarizeLearningEvent(event),
        candidates: inferCandidateTypes(text),
        flush: flushResult,
      });
    },
  };
}

async function flushLearningQueue(params: { cfg: SageConfig; queuePath: string }) {
  const resolved = resolveMemoryBackendConfig({ cfg: params.cfg, agentId: "main" });
  if (resolved.backend !== "sage-memory" || !resolved.remote) {
    return { status: "skipped", reason: "backend-disabled" };
  }
  const manager = new SageMemoryManager({ config: resolved.remote });
  return await replayLearningEventQueue({
    queuePath: params.queuePath,
    namespace: resolved.remote.defaultNamespace ?? "sage.learning",
    ingest: async (events, namespace) =>
      await manager.ingestActivityEvents({
        namespace,
        events,
      }),
  });
}

function normalizeSkillAction(
  action: string,
): "create" | "edit" | "patch" | "write_file" | "archive" {
  if (
    action === "create" ||
    action === "edit" ||
    action === "patch" ||
    action === "write_file" ||
    action === "archive"
  ) {
    return action;
  }
  throw new Error("Unknown skill_manage action");
}

function normalizeLearningSource(input: string | undefined) {
  if (
    input === "sage_session" ||
    input === "browser" ||
    input === "app_focus" ||
    input === "tool_usage" ||
    input === "review_decision" ||
    input === "skill_mutation"
  ) {
    return input;
  }
  return "review_decision";
}

function inferCandidateTypes(text: string): string[] {
  const lower = text.toLowerCase();
  const types = new Set<string>();
  if (lower.includes("prefer") || lower.includes("remember") || lower.includes("always")) {
    types.add("preference");
  }
  if (lower.includes("workflow") || lower.includes("steps") || lower.includes("process")) {
    types.add("workflow");
  }
  if (lower.includes("skill") || lower.includes("next time")) {
    types.add("skill_gap");
  }
  if (lower.includes("browser") || lower.includes("tab") || lower.includes("click")) {
    types.add("browser_pattern");
  }
  if (lower.includes("tool") || lower.includes("error") || lower.includes("failed")) {
    types.add("tool_fix");
  }
  return [...types];
}
