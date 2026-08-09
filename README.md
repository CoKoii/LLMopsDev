# LLMOps

面向 AI 应用开发与运营的一体化平台。通过提示词、模型、知识库和插件完成应用编排，并提供调试、发布、独立对话页与 OpenAPI 接入能力。

![LLMOps 主页](docs/screenshots/home.png)

## 功能

| 模块 | 能力 |
| --- | --- |
| AI 应用 | 可视化编排提示词、模型、知识库和插件；支持实时调试、草稿保存、版本发布/恢复、发布配置和运行统计 |
| 对话 | SSE 流式响应、会话管理、文件附件、知识引用、插件调用、长期记忆、追问建议、语音输入与语音输出 |
| 知识库 | 支持 TXT、Markdown、JSON、CSV、HTML、PDF、Word、Excel 和图片；提供解析、清洗、分块、向量化、混合召回、Rerank、召回测试和片段编辑 |
| 插件 | 导入 OpenAPI Schema，自动生成工具定义并执行接口调用，支持自定义鉴权请求头 |
| 模型 | 统一管理 Chat、Embedding、Rerank、多模态、结构化输出、STT 和 TTS 模型，兼容 OpenAI 风格接口 |
| 开放 API | 管理 API Key，通过流式或非流式接口将已发布应用接入外部系统 |
| 网页剪藏 | 浏览器扩展可选择网页正文、清洗为 Markdown 并上传至知识库 |

## 核心功能展示

### 应用编排

编排页由提示词、应用能力和实时预览三部分组成。可选择模型，关联插件与知识库，配置长期记忆、追问建议、语音输入输出和对话开场白；右侧可直接调试当前草稿，保存后支持版本发布与恢复。

![应用编排](docs/screenshots/orchestration.png)

### 发布配置

保存正式版本后会生成独立对话页。可复制或直接访问页面地址，并控制发布、下线状态；未发布时仅应用创建者可访问。

![发布配置](docs/screenshots/publish.png)

### 统计分析

支持按近 7 天或 30 天查看 Token 消耗、输出速度、新增会话和活跃用户，并展示趋势图与单次回复的场景、输出速度和 Token 明细。

![统计分析](docs/screenshots/stats.png)

## 技术架构

| 层级 | 技术 |
| --- | --- |
| Web | Vue 3、Vite、Pinia、Ant Design X Vue、ECharts |
| API | NestJS、TypeORM、BullMQ、LangChain |
| 数据 | PostgreSQL、Redis、Qdrant |
| 文件 | 本地存储或阿里云 OSS |

```text
apps/
├── frontend           Web 管理端
├── backend            NestJS API 服务
└── browser-extension  网页剪藏浏览器扩展
```

## 本地运行

### 1. 环境要求

- Node.js >= 22.19.0
- pnpm >= 11.7.0
- PostgreSQL
- Redis
- Qdrant：仅知识库向量化与召回需要

使用 Docker 启动本地依赖：

```bash
docker run -d --name llmops-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=llmops -p 5432:5432 -v llmops-pg:/var/lib/postgresql/data postgres:16
docker run -d --name llmops-redis -p 6379:6379 -v llmops-redis:/data redis:7
docker run -d --name llmops-qdrant -p 6333:6333 -v llmops-qdrant:/qdrant/storage qdrant/qdrant
```

### 2. 安装与配置

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

至少修改 `apps/backend/.env` 中的以下配置：

```dotenv
DB_PASSWORD=postgres
JWT_ACCESS_SECRET=replace-with-a-random-secret
JWT_REFRESH_SECRET=replace-with-another-random-secret
```

默认地址如下：

| 服务 | 地址 |
| --- | --- |
| Web | `http://localhost:5173` |
| API | `http://localhost:3000/api` |
| Qdrant | `http://localhost:6333` |

### 3. 启动

分别打开两个终端：

```bash
pnpm --dir apps/backend dev
```

```bash
pnpm --dir apps/frontend dev
```

开发环境默认启用 `DB_SYNC=true`，首次启动会自动创建数据表；生产环境必须改为 `false`。

### 4. 创建登录账号

空数据库首次运行时，通过注册接口创建账号：

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"super_admin","password":"123456","confirmPassword":"123456"}'
```

然后访问 `http://localhost:5173`，使用 `super_admin / 123456` 登录。

![登录页](docs/screenshots/login.png)

## 使用前配置

- 对话应用至少需要一个已启用的 `chat` 模型。
- 知识库处理需要 `embedding` 模型和 Qdrant；`rerank` 模型可选。
- 语音和图片能力分别需要 `speech_to_text`、`text_to_speech` 和 `multimodal` 模型。
- 模型通过 `/api/ai/llms` 接口管理，应用编排页会读取已启用的 Chat 模型。
- `OSS_ENABLED=false` 时文件保存在本地；生产环境可切换到阿里云 OSS。

## 浏览器扩展

```bash
pnpm --dir apps/browser-extension build
```

在 Chromium 浏览器的扩展管理页启用开发者模式，加载 `apps/browser-extension/dist`。扩展使用 Web 端账号登录，可完成网页选区、Markdown 清洗和知识库上传。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm --dir apps/backend test` | 后端单元测试 |
| `pnpm --dir apps/backend typecheck` | 后端类型检查 |
| `pnpm --dir apps/frontend test:unit` | 前端单元测试 |
| `pnpm --dir apps/frontend type-check` | 前端类型检查 |
| `pnpm --dir apps/frontend build` | 构建前端 |
| `pnpm --dir apps/backend build` | 构建后端 |
