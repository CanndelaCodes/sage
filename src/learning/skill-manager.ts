import fs from "node:fs/promises";
import path from "node:path";

export type LearnedSkillAction = "create" | "edit" | "patch" | "write_file" | "archive";

export type LearnedSkillProvenance = {
  version: 1;
  agentCreated: boolean;
  evidenceNodeIds: string[];
  patchCount: number;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string;
  state: "active" | "archived";
  absorbedInto?: string;
  lastAppliedDiff?: string;
};

export type LearnedSkillManageParams = {
  skillsRoot: string;
  action: LearnedSkillAction;
  name: string;
  content?: string;
  oldString?: string;
  newString?: string;
  filePath?: string;
  fileContent?: string;
  absorbedInto?: string;
  evidenceNodeIds?: string[];
  now?: () => Date;
};

export type LearnedSkillManageResult = {
  status: "created" | "updated" | "archived";
  skillPath: string;
  provenance: LearnedSkillProvenance;
};

export type LearnedSkillReadResult = {
  name: string;
  skillPath: string;
  skillMd: string;
  provenance: LearnedSkillProvenance;
};

const PROVENANCE_FILE = ".sage-learning.json";
const ALLOWED_SUPPORT_DIRS = new Set(["references", "templates", "scripts", "assets"]);

export async function manageLearnedSkill(
  params: LearnedSkillManageParams,
): Promise<LearnedSkillManageResult> {
  const now = (params.now?.() ?? new Date()).toISOString();
  const skillPath = resolveSkillPath(params.skillsRoot, params.name);
  if (params.action === "create") {
    const content = requireString(params.content, "content");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), content, "utf-8");
    const provenance = buildProvenance({
      now,
      evidenceNodeIds: params.evidenceNodeIds,
      lastAppliedDiff: "created SKILL.md",
    });
    await writeProvenance(skillPath, provenance);
    return { status: "created", skillPath, provenance };
  }

  if (params.action === "archive") {
    const provenance = await readProvenance(skillPath);
    const archived = {
      ...provenance,
      state: "archived" as const,
      updatedAt: now,
      lastReviewedAt: now,
    };
    if (params.absorbedInto !== undefined) {
      archived.absorbedInto = params.absorbedInto;
    }
    await writeProvenance(skillPath, archived);
    const archivePath = resolveArchivePath(params.skillsRoot, params.name);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.rm(archivePath, { recursive: true, force: true });
    await fs.rename(skillPath, archivePath);
    return { status: "archived", skillPath: archivePath, provenance: archived };
  }

  const provenance = await readProvenance(skillPath);
  let lastAppliedDiff = "";
  if (params.action === "edit") {
    const content = requireString(params.content, "content");
    await fs.writeFile(path.join(skillPath, "SKILL.md"), content, "utf-8");
    lastAppliedDiff = "replaced SKILL.md";
  } else if (params.action === "patch") {
    const oldString = requireString(params.oldString, "oldString");
    const newString = params.newString ?? "";
    const target = path.join(skillPath, "SKILL.md");
    const current = await fs.readFile(target, "utf-8");
    const count = current.split(oldString).length - 1;
    if (count !== 1) {
      throw new Error(`patch target must appear exactly once; found ${count}`);
    }
    await fs.writeFile(target, current.replace(oldString, newString), "utf-8");
    lastAppliedDiff = `patched SKILL.md (${oldString.length} chars -> ${newString.length} chars)`;
  } else if (params.action === "write_file") {
    const supportPath = resolveSupportFilePath(skillPath, params.filePath);
    const content = params.fileContent ?? "";
    await fs.mkdir(path.dirname(supportPath), { recursive: true });
    await fs.writeFile(supportPath, content, "utf-8");
    lastAppliedDiff = `wrote ${path.relative(skillPath, supportPath).replaceAll("\\", "/")}`;
  }
  const updated = updateProvenance(provenance, {
    now,
    evidenceNodeIds: params.evidenceNodeIds,
    lastAppliedDiff,
  });
  await writeProvenance(skillPath, updated);
  return { status: "updated", skillPath, provenance: updated };
}

export async function readLearnedSkill(params: {
  skillsRoot: string;
  name: string;
}): Promise<LearnedSkillReadResult> {
  const skillPath = resolveSkillPath(params.skillsRoot, params.name);
  const skillMdPath = path.join(skillPath, "SKILL.md");
  try {
    const [skillMd, provenance] = await Promise.all([
      fs.readFile(skillMdPath, "utf-8"),
      readProvenance(skillPath),
    ]);
    return { name: params.name, skillPath, skillMd, provenance };
  } catch (err) {
    throw new Error(
      `learned skill '${params.name}' not found: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

export async function restoreArchivedLearnedSkill(params: {
  skillsRoot: string;
  name: string;
  now?: () => Date;
}): Promise<{ status: "restored"; skillPath: string; provenance: LearnedSkillProvenance }> {
  const archivePath = resolveArchivePath(params.skillsRoot, params.name);
  const skillPath = resolveSkillPath(params.skillsRoot, params.name);
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.rename(archivePath, skillPath);
  const now = (params.now?.() ?? new Date()).toISOString();
  const provenance = await readProvenance(skillPath);
  const restored = { ...provenance, state: "active" as const, updatedAt: now, lastReviewedAt: now };
  await writeProvenance(skillPath, restored);
  return { status: "restored", skillPath, provenance: restored };
}

export async function listLearnedSkillNames(skillsRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .toSorted((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function resolveSkillPath(skillsRoot: string, name: string): string {
  const safeName = normalizeSkillName(name);
  const root = path.resolve(skillsRoot);
  const resolved = path.resolve(root, safeName);
  assertInside(root, resolved, "skill path");
  return resolved;
}

function resolveArchivePath(skillsRoot: string, name: string): string {
  const safeName = normalizeSkillName(name);
  const root = path.resolve(skillsRoot);
  const resolved = path.resolve(root, ".archive", safeName);
  assertInside(root, resolved, "archive path");
  return resolved;
}

function resolveSupportFilePath(skillPath: string, rawPath?: string): string {
  const rel = requireString(rawPath, "filePath").replaceAll("\\", "/");
  const parts = rel.split("/").filter(Boolean);
  if (
    parts.length < 2 ||
    !ALLOWED_SUPPORT_DIRS.has(parts[0]) ||
    parts.some((part) => part === "..")
  ) {
    throw new Error(
      "support file path must stay under references/, templates/, scripts/, or assets/",
    );
  }
  const resolved = path.resolve(skillPath, ...parts);
  assertInside(path.resolve(skillPath), resolved, "support file path");
  return resolved;
}

function normalizeSkillName(name: string): string {
  const normalized = name.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error("Invalid skill name");
  }
  return normalized;
}

function assertInside(root: string, target: string, label: string) {
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`${label} escapes skills root`);
  }
}

function requireString(input: string | undefined, label: string): string {
  if (typeof input !== "string" || !input.length) {
    throw new Error(`${label} required`);
  }
  return input;
}

async function readProvenance(skillPath: string): Promise<LearnedSkillProvenance> {
  const raw = await fs.readFile(path.join(skillPath, PROVENANCE_FILE), "utf-8");
  const parsed = JSON.parse(raw) as Partial<LearnedSkillProvenance>;
  return {
    version: 1,
    agentCreated: Boolean(parsed.agentCreated),
    evidenceNodeIds: Array.isArray(parsed.evidenceNodeIds) ? parsed.evidenceNodeIds : [],
    patchCount: typeof parsed.patchCount === "number" ? parsed.patchCount : 0,
    createdAt: normalizeTimestamp(parsed.createdAt),
    updatedAt: normalizeTimestamp(parsed.updatedAt),
    lastReviewedAt: normalizeTimestamp(parsed.lastReviewedAt),
    state: parsed.state === "archived" ? "archived" : "active",
    ...(parsed.absorbedInto ? { absorbedInto: parsed.absorbedInto } : {}),
    ...(parsed.lastAppliedDiff ? { lastAppliedDiff: parsed.lastAppliedDiff } : {}),
  };
}

async function writeProvenance(skillPath: string, provenance: LearnedSkillProvenance) {
  await fs.writeFile(
    path.join(skillPath, PROVENANCE_FILE),
    `${JSON.stringify(provenance, null, 2)}\n`,
    "utf-8",
  );
}

function normalizeTimestamp(input: unknown): string {
  return typeof input === "string" && input.trim() ? input : new Date(0).toISOString();
}

function buildProvenance(params: {
  now: string;
  evidenceNodeIds?: string[];
  lastAppliedDiff?: string;
}): LearnedSkillProvenance {
  return {
    version: 1,
    agentCreated: true,
    evidenceNodeIds: unique(params.evidenceNodeIds ?? []),
    patchCount: 0,
    createdAt: params.now,
    updatedAt: params.now,
    lastReviewedAt: params.now,
    state: "active",
    ...(params.lastAppliedDiff ? { lastAppliedDiff: params.lastAppliedDiff } : {}),
  };
}

function updateProvenance(
  provenance: LearnedSkillProvenance,
  params: {
    now: string;
    evidenceNodeIds?: string[];
    lastAppliedDiff?: string;
  },
): LearnedSkillProvenance {
  return {
    ...provenance,
    evidenceNodeIds: unique([...provenance.evidenceNodeIds, ...(params.evidenceNodeIds ?? [])]),
    patchCount: provenance.patchCount + 1,
    updatedAt: params.now,
    lastReviewedAt: params.now,
    state: "active",
    ...(params.lastAppliedDiff ? { lastAppliedDiff: params.lastAppliedDiff } : {}),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
