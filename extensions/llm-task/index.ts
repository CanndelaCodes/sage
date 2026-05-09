import type { SagePluginApi } from "../../src/plugins/types.js";
import { createLlmTaskTool } from "./src/llm-task-tool.js";

export default function register(api: SagePluginApi) {
  api.registerTool(createLlmTaskTool(api), { optional: true });
}
