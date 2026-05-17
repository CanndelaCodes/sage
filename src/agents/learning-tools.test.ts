import { describe, expect, it } from "vitest";
import { TOOL_GROUPS } from "./tool-policy.js";
import { createLearningTools } from "./tools/learning-tools.js";

describe("learning tools", () => {
  it("adds skills and learning tool groups", () => {
    expect(TOOL_GROUPS["group:skills"]).toEqual(["skills_list", "skill_view", "skill_manage"]);
    expect(TOOL_GROUPS["group:learning"]).toEqual(["learning_status", "learning_review"]);
  });

  it("exposes autonomous skill and learning tools when learning is enabled", () => {
    const tools = createLearningTools({
      config: {
        learning: {
          enabled: true,
          skills: { autoApply: true },
        },
      },
      workspaceDir: "C:/repo",
    });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("skills_list");
    expect(names).toContain("skill_view");
    expect(names).toContain("skill_manage");
    expect(names).toContain("learning_status");
    expect(names).toContain("learning_review");
  });
});
