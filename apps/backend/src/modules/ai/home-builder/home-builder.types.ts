import type { AiAppCategory } from "../app/entities/app-category.entity";
import type { Knowledge } from "../knowledge/entities/knowledge.entity";
import type { Llm } from "../llm/entities/llm.entity";
import type { PluginCategory } from "../plugin/entities/plugin-category.entity";
import type { Plugin } from "../plugin/entities/plugin.entity";

export type HomeBuilderCatalogContext = {
  appCategories: AiAppCategory[];
  pluginCategories: PluginCategory[];
  chatModels: Pick<Llm, "id" | "modelName" | "isDefault">[];
  availablePlugins: Plugin[];
  ownedPlugins: Plugin[];
  ownedKnowledge: Knowledge[];
};

export type HomeBuilderCreatedResource =
  | { type: "app"; id: number; name: string }
  | { type: "plugin"; name: string };

export type HomeBuilderToolResult = {
  kind: "created";
  resource: HomeBuilderCreatedResource;
  reply: string;
};
