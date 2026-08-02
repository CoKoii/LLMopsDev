import { z } from "zod";

export const createAppInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(800).default(""),
  categoryId: z.number().int().describe("资源目录中的应用分类 id"),
  llmId: z.number().int().describe("资源目录中的对话模型 id"),
  prompt: z.string().min(1),
  modelSettings: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
      contextRounds: z.number().int().min(1).max(30).optional(),
    })
    .default({}),
  pluginIds: z
    .array(z.number().int())
    .default([])
    .describe("资源目录中适合当前应用的插件 id；没有则为空数组"),
  knowledgeIds: z
    .array(z.number().int())
    .default([])
    .describe("资源目录中适合当前应用的用户知识库 id；没有则为空数组"),
  toggles: z
    .object({
      longTermMemory: z.boolean().optional(),
      questionSuggestions: z.boolean().optional(),
      voiceInput: z.boolean().optional(),
      voiceOutput: z.boolean().optional(),
    })
    .default({}),
  openingStatement: z
    .object({
      content: z.string().default(""),
      questions: z.array(z.string()).max(4).default([]),
    })
    .default({ content: "", questions: [] }),
  completionMessage: z
    .string()
    .min(1)
    .max(500)
    .describe("应用创建成功后直接回复用户的自然语言消息"),
});

export const createPluginInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(800).default(""),
  categoryId: z.number().int().describe("资源目录中的插件分类 id"),
  openapiSchema: z
    .string()
    .min(1)
    .describe("仅依据用户提供的真实接口信息生成的完整 OpenAPI 文档"),
  headers: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .default([]),
  completionMessage: z
    .string()
    .min(1)
    .max(500)
    .describe("插件创建成功后直接回复用户的自然语言消息"),
});
