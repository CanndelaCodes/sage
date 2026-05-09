import type { SagePluginApi } from "sage/plugin-sdk";
import { emptyPluginConfigSchema } from "sage/plugin-sdk";
import { feishuPlugin } from "./src/channel.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Feishu (Lark) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: SagePluginApi) {
    api.registerChannel({ plugin: feishuPlugin });
  },
};

export default plugin;
