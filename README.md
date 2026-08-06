# LLMOps

AI 应用编排与运营平台：可视化编排 AI 应用（提示词、模型、知识库、插件工具），提供独立对话页与 OpenAPI 接入能力，内置知识库 RAG（解析 → 清洗 → 分块 → 向量化 → 混合召回 → Rerank）、插件工具调用、长期记忆、语音输入输出等能力。

## 技术架构

```
apps/
├── backend    NestJS API 服务（TypeScript，TypeORM）
└── frontend   Vue 3 + Vite 管理端
```

| 组件 | 用途 |
| --- | --- |
| PostgreSQL | 业务数据（应用、知识库、会话、消息、用户等） |
| Redis | 缓存、会话令牌等 |
| Qdrant | 知识库向量检索（collection 默认 `ai_knowledge_chunks`） |
| 阿里云 OSS（可选） | 文件存储，`OSS_ENABLED=false` 时走本地存储 |
| SMTP（可选） | 邮件发送 |

### 后端模块

- `modules/ai/app` — AI 应用：草稿/发布/回滚、独立对话页配置、应用统计
- `modules/ai/chat` — 对话：SSE 流式（状态/知识引用/插件调用/音频/追问建议）、会话管理、历史消息、附件解析与召回
- `modules/ai/knowledge` — 知识库 RAG：文档解析/清洗/增强/分块 → 向量化（Embedding）→ Qdrant 写入；混合检索（向量 + FTS/子串加权）→ Rerank 二次排序 → 章节上下文扩展
- `modules/ai/llm` — 模型管理：chat / embedding / rerank / TTS / STT / multimodal / structured / built_in_large
- `modules/ai/plugin` — OpenAPI 插件：schema 解析、工具定义生成、鉴权头注入、工具调用执行
- `modules/ai/home-builder` — 对话式应用生成（HomeBuilder）
- `modules/ai/open-api` — OpenAPI 密钥与对外对话接入
- `modules/files` — 文件上传/OSS/本地存储
- `modules/iam` — 用户、认证（JWT）、权限

### 知识库 RAG 流水线

1. 文件上传 → 解析（文本 / PDF / Office / 多模态提取）
2. 清洗（去广告/页眉页脚，`cleanedBy: ai`）→ 增强 → 分块（按标题层级切分，生成 `searchText`、关键词、章节路径；文本做 NFKC + CJK 部首补充区归一化，兼容 PDF 抽取的兼容字形）
3. Embedding 向量化 → 批量写入 Qdrant（失败自动回滚分片索引状态，队列重试）
4. 检索：向量召回 + 文本召回（FTS + 子串加权，含邮箱词元、中文二元组）混合打分
5. Rerank（qwen3-rerank）对候选二次排序，按 `rerank * 0.75 + score * 0.25` 混合排序
6. 章节兄弟块上下文扩展 + 按章节去重 → 拼装上下文与引用

### 对话链路（SSE）

`session → status(完善问题/检索知识库/解析附件/调用插件/生成回复) → knowledge(引用) / attachments(附件引用) / audio(语音) / content(流式正文) → suggestions(追问建议) → meta(tokens/耗时) → [DONE]`

## 快速开始

### 前置依赖

- Node.js >= 22、pnpm >= 11
- PostgreSQL、Redis、Qdrant（本地或远程均可）

### 后端

```bash
cd apps/backend
cp .env.example .env          # 按需修改数据库/Redis/JWT 等
cp .env.example .env.development
pnpm install
pnpm dev                       # 监听 3000 端口，代码变更自动重编译
```

> 环境变量采用 `loadEnvironmentFiles()` 分层加载：`.env`（共享）→ `.env.development` / `.env.production`（按 `NODE_ENV` 覆盖）。生产环境必须设置 `DB_SYNC=false`。

### 前端

```bash
cd apps/frontend
cp .env.example .env.development   # VITE_API_BASE_URL 指向后端 /api
pnpm install
pnpm dev
```

### 常用脚本（apps/backend）

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发模式（watch） |
| `pnpm build` | 生产构建到 `dist/` |
| `pnpm prod` | 运行生产构建产物 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 修复 |
| `pnpm test` | Jest 单测 |

## 说明

- 登录账号需先在数据库中初始化用户（开发环境可手工插入 `super_admin` 账号，密码使用 JWT 同款 bcrypt 规则）。
- LLM/Embedding/Rerank/TTS/STT 等模型在「模型管理」中配置，API Key 仅存后端，前端展示脱敏。
- 插件 OpenAPI 鉴权头在前端以 `******` 脱敏展示，提交占位符时后端保留原密钥。
