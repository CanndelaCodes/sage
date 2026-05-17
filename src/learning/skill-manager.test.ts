import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  manageLearnedSkill,
  readLearnedSkill,
  restoreArchivedLearnedSkill,
} from "./skill-manager.js";

describe("learned skill manager", () => {
  it("creates, patches, writes support files, archives, and restores with provenance", async () => {
    const skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sage-learned-skills-"));

    const created = await manageLearnedSkill({
      skillsRoot,
      action: "create",
      name: "browser-workflows",
      content:
        "---\nname: browser-workflows\ndescription: Browser workflow lessons.\n---\n\n# Browser\n",
      evidenceNodeIds: ["node-1"],
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });
    expect(created.status).toBe("created");

    await manageLearnedSkill({
      skillsRoot,
      action: "patch",
      name: "browser-workflows",
      oldString: "# Browser\n",
      newString: "# Browser\n\nUse snapshots before clicking.\n",
      evidenceNodeIds: ["node-2"],
      now: () => new Date("2026-05-16T10:01:00.000Z"),
    });

    await manageLearnedSkill({
      skillsRoot,
      action: "write_file",
      name: "browser-workflows",
      filePath: "references/pricing.md",
      fileContent: "Pricing-page workflow evidence.",
      evidenceNodeIds: ["node-3"],
      now: () => new Date("2026-05-16T10:02:00.000Z"),
    });

    const read = await readLearnedSkill({ skillsRoot, name: "browser-workflows" });
    expect(read.skillMd).toContain("Use snapshots before clicking.");
    expect(read.provenance).toMatchObject({
      agentCreated: true,
      evidenceNodeIds: ["node-1", "node-2", "node-3"],
      patchCount: 2,
      state: "active",
    });

    const archived = await manageLearnedSkill({
      skillsRoot,
      action: "archive",
      name: "browser-workflows",
      absorbedInto: "web-automation",
      now: () => new Date("2026-05-16T10:03:00.000Z"),
    });
    expect(archived.status).toBe("archived");

    await expect(readLearnedSkill({ skillsRoot, name: "browser-workflows" })).rejects.toThrow(
      "not found",
    );

    const restored = await restoreArchivedLearnedSkill({
      skillsRoot,
      name: "browser-workflows",
      now: () => new Date("2026-05-16T10:04:00.000Z"),
    });
    expect(restored.status).toBe("restored");
    const restoredSkill = await readLearnedSkill({ skillsRoot, name: "browser-workflows" });
    expect(restoredSkill.provenance.state).toBe("active");
  });

  it("rejects unsafe skill names and support paths", async () => {
    const skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sage-learned-skills-"));
    await expect(
      manageLearnedSkill({
        skillsRoot,
        action: "create",
        name: "../escape",
        content: "---\nname: escape\ndescription: bad\n---\n",
      }),
    ).rejects.toThrow("Invalid skill name");

    await manageLearnedSkill({
      skillsRoot,
      action: "create",
      name: "safe-skill",
      content: "---\nname: safe-skill\ndescription: safe\n---\n",
    });

    await expect(
      manageLearnedSkill({
        skillsRoot,
        action: "write_file",
        name: "safe-skill",
        filePath: "../escape.md",
        fileContent: "bad",
      }),
    ).rejects.toThrow("support file path");
  });
});
