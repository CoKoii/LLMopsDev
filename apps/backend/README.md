# NestJS Template 后端模板说明手册

这是一个基于 NestJS 的通用后端模板，已经内置常见后端基础能力：环境配置、数据库、统一响应、统一异常、请求追踪、JWT 登录、刷新令牌、会话管理、角色权限、权限码守卫、Redis 缓存、登录限流、邮件、日志、OSS 文件直传、AI 可选模块、参数校验和分页查询。

适合用来快速开始一个管理后台、业务 API、课程项目或中小型服务端项目。

## 目录

- [1. 项目能力概览](#1-项目能力概览)
- [2. 快速启动](#2-快速启动)
- [3. 项目结构](#3-项目结构)
- [4. 请求处理流程](#4-请求处理流程)
- [5. 环境配置](#5-环境配置)
- [6. 基础设施模块](#6-基础设施模块)
- [7. IAM 身份与权限模块](#7-iam-身份与权限模块)
- [8. 文件上传模块](#8-文件上传模块)
- [9. 接口清单](#9-接口清单)
- [10. 常见开发示例](#10-常见开发示例)
- [11. 开发命令](#11-开发命令)

## 1. 项目能力概览

| 功能 | 已实现内容 | 常见使用场景 |
| --- | --- | --- |
| 环境配置 | `.env`、`.env.development`、`.env.production`、Joi 校验、真实 env 不入库 | 不同环境使用不同数据库、Redis、JWT 密钥 |
| 启动配置 | 全局前缀、CORS、参数校验、关闭钩子 | 统一 API 入口和请求校验 |
| 数据库 | TypeORM、MySQL、PostgreSQL、实体自动扫描、审计基础实体、数据库错误转换 | 保存用户、角色、权限等业务数据 |
| 统一响应 | 成功响应统一包裹为 `{ code, data, requestId, timestamp }` | 前端统一处理接口返回 |
| 统一异常 | 错误响应统一包裹为 `{ code, message, data, requestId, timestamp }` | 前端统一显示错误并关联日志 |
| 日志 | Winston 控制台日志、按日期滚动文件日志、requestId 追踪 | 线上排查错误、记录异常上下文 |
| Redis | 全局 Redis 客户端、权限缓存、登录限流、启动连接检测、关闭释放连接 | 缓存、限流、验证码、分布式锁 |
| 邮件 | Nodemailer、Handlebars 模板邮件、全局邮件服务 | 注册欢迎邮件、找回密码、通知邮件 |
| 登录认证 | 注册、登录、Access Token、Refresh Token、失败次数锁定 | 用户登录后访问受保护接口 |
| 会话管理 | `auth_sessions` 表、Refresh Token 哈希存储、退出当前/全部会话 | 多设备登录、主动失效登录态 |
| 角色控制 | `@Roles()`、全局角色守卫 | 管理员接口、后台管理权限 |
| 权限码 | 权限表、角色绑定权限、`@Permissions()`、全局权限守卫 | 前端菜单按钮控制、服务端按钮级授权 |
| 用户资料 | 当前用户资料查询、用户资料与账号一对一 | 个人中心、后台用户管理 |
| 文件上传 | OSS 预签名直传、文件元数据、上传完成校验、临时文件清理 | 用户头像、附件、业务文件 |
| AI 模块 | `AI_ENABLED` 控制是否注册 AI 接口 | 学习或按项目启用 AI 能力 |
| 分页查询 | `PageQueryDto`、`PageResult`、页码元信息 | 列表接口统一分页 |

## 2. 快速启动

### 2.1 安装依赖

```bash
pnpm install
```

### 2.2 准备环境变量

这个模板是自用项目，真实 `.env`、`.env.development`、`.env.production` 保留在本地使用，不提交到仓库。开发环境至少需要数据库、Redis、JWT 配置。

```env
PORT=3000
CORS_ORIGINS=

DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=123456
DB_DATABASE=nestjs_demo
DB_SYNC=true

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=nest:

JWT_ACCESS_SECRET=replace-with-access-secret
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_SECRET=replace-with-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

MAIL_ENABLED=false
MAIL_HOST=
MAIL_PORT=587
MAIL_SECURE=false
MAIL_IGNORE_TLS=false
MAIL_USER=
MAIL_PASS=
MAIL_FROM_NAME=NestJS Template
MAIL_FROM_ADDRESS=

AI_ENABLED=false
AI_API_KEY=
AI_BASE_URL=
AI_CHAT_MODEL=
AI_TEMPERATURE=0.7

OSS_ENABLED=false
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_PUBLIC_BASE_URL=
OSS_UPLOAD_EXPIRES_IN=600
OSS_UPLOAD_MAX_SIZE=10485760
OSS_TEMP_EXPIRES_IN_HOURS=24

LOG_ON=true
LOG_LEVEL=info
```

说明：

- 开发时可以设置 `DB_SYNC=true`，让 TypeORM 自动同步表结构。
- 生产环境建议设置 `DB_SYNC=false`，改用迁移或手动 SQL。
- Redis 是必需配置，因为 Redis 模块会在启动时连接 Redis。
- `AI_ENABLED=false` 时不会注册 AI 接口，也不强制要求 AI key。
- 运行配置必须显式写在环境变量中；缺少必填项时项目会在启动阶段报错。

### 2.3 启动开发服务

```bash
pnpm dev
```

默认监听：

```text
http://localhost:3000
```

当前模板没有启用接口版本前缀，因此内置接口路径是：

```text
/api/auth/login
/api/profiles/me
/api/users
```

### 2.4 生产构建

```bash
pnpm build
pnpm prod
```

## 3. 项目结构

```text
src
├── main.ts                         # 应用入口
├── app.module.ts                   # 根模块，注册全局模块、守卫、拦截器、过滤器
├── common
│   ├── auth                        # 登录守卫、角色守卫、权限守卫、装饰器、登录用户类型
│   ├── cache                       # Redis 客户端模块
│   ├── config                      # 环境变量读取、校验、启动配置
│   ├── database                    # TypeORM 配置、基础实体、数据库驱动、数据库错误转换
│   ├── http                        # 统一响应、统一异常、requestId、分页 DTO
│   ├── logging                     # Winston 日志
│   └── mailer                      # 邮件模块、模板邮件服务
└── modules
    ├── ai                          # AI 示例模块，可通过 AI_ENABLED 开关启用
    ├── files                       # OSS 文件直传和文件元数据
    └── iam
        ├── auth                    # 注册、登录、刷新令牌、退出登录、会话清理
        ├── users                   # 用户管理
        ├── profiles                # 用户资料
        ├── roles                   # 角色管理
        └── permissions             # 权限码管理
```

项目按两层组织：

- `common`：通用基础能力。比如数据库、Redis、登录守卫、统一异常。
- `modules`：业务模块。当前内置的是 `iam`，用于身份认证和权限管理。

## 4. 请求处理流程

一次普通请求大致会经过这些步骤：

```text
请求进入
  ↓
全局前缀 /api
  ↓
ValidationPipe 参数校验和类型转换
  ↓
JwtAuthGuard 判断是否登录
  ↓
RolesGuard 判断角色是否满足 @Roles()
  ↓
PermissionsGuard 判断权限码是否满足 @Permissions()
  ↓
Controller 接收请求
  ↓
Service 执行业务逻辑
  ↓
ResponseInterceptor 统一成功响应
  ↓
返回给前端
```

如果中间抛出异常：

```text
异常抛出
  ↓
AllExceptionFilter 统一捕获
  ↓
记录日志并隐藏敏感字段
  ↓
返回统一错误响应
```

## 5. 环境配置

### 5.1 环境文件

支持这些环境文件：

```text
.env
.env.development
.env.production
```

推荐用法：

- `.env`：所有环境共享配置，例如端口、数据库类型、Token 过期时间、邮件、AI 开关、OSS、日志。
- `.env.development`：开发环境覆盖配置，例如本地数据库、Redis、JWT 密钥。
- `.env.production`：生产环境覆盖配置，例如生产数据库、Redis、JWT 密钥、生产 CORS。

最终优先级可以理解为：

```text
系统环境变量 > .env.{NODE_ENV} > .env
```

`NODE_ENV` 不建议写在 `.env` 文件里。它应该由启动命令、Docker、CI 或部署平台提供，用来决定加载 `.env.development` 还是 `.env.production`。

### 5.2 应用配置

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境，可选 `development`、`production`、`test` | 由启动方式提供 |
| `PORT` | HTTP 服务端口，例如 `3000` | 必填 |
| `CORS_ORIGINS` | 生产环境允许跨域的来源，多个用英文逗号分隔 | 必填，可为空字符串 |

生产环境 CORS 规则：

- `CORS_ORIGINS` 有值时，只允许这些来源。
- `CORS_ORIGINS` 为空时，关闭跨域。
- 开发环境默认允许跨域，方便本地前端调试。

示例：

```env
PORT=3000
CORS_ORIGINS=https://admin.example.com,https://www.example.com
```

### 5.3 数据库配置

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `DB_TYPE` | 数据库类型，可选 `mysql`、`postgres` | 必填 |
| `DB_HOST` | 数据库地址 | 必填 |
| `DB_PORT` | 数据库端口，例如 MySQL `3306`、PostgreSQL `5432` | 必填 |
| `DB_USERNAME` | 数据库用户名 | 必填 |
| `DB_PASSWORD` | 数据库密码 | 必填，可为空字符串 |
| `DB_DATABASE` | 数据库名 | 必填 |
| `DB_SYNC` | 是否自动同步表结构 | 必填 |

MySQL 示例：

```env
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=123456
DB_DATABASE=nestjs_demo
DB_SYNC=true
```

PostgreSQL 示例：

```env
DB_TYPE=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=123456
DB_DATABASE=nestjs_demo
DB_SYNC=true
```

### 5.4 Redis 配置

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `REDIS_HOST` | Redis 地址 | 必填 |
| `REDIS_PORT` | Redis 端口，例如 `6379` | 必填 |
| `REDIS_USERNAME` | Redis 用户名 | 必填，可为空字符串 |
| `REDIS_PASSWORD` | Redis 密码 | 必填，可为空字符串 |
| `REDIS_DB` | Redis 逻辑数据库编号，`0` 是默认库 | 必填 |
| `REDIS_KEY_PREFIX` | Redis key 前缀 | 必填，可为空字符串 |

示例：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=nest:
```

### 5.5 JWT 配置

| 变量 | 说明 |
| --- | --- |
| `JWT_ACCESS_SECRET` | Access Token 签名密钥 |
| `JWT_ACCESS_EXPIRES_IN` | Access Token 过期时间，例如 `15m`、`1d` |
| `JWT_REFRESH_SECRET` | Refresh Token 签名密钥 |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 过期时间，例如 `7d` |

示例：

```env
JWT_ACCESS_SECRET=replace-with-access-secret
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_SECRET=replace-with-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d
```

### 5.6 邮件配置

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `MAIL_ENABLED` | 是否启用真实发信 | 必填 |
| `MAIL_HOST` | SMTP 地址 | 启用邮件时必填；关闭邮件时可为空字符串 |
| `MAIL_PORT` | SMTP 端口，例如 `587`、`465` | 必填 |
| `MAIL_SECURE` | 是否使用 SSL/TLS | 必填 |
| `MAIL_IGNORE_TLS` | 是否忽略 TLS | 必填 |
| `MAIL_USER` | SMTP 用户名 | 必填，可为空字符串 |
| `MAIL_PASS` | SMTP 密码 | 必填，可为空字符串 |
| `MAIL_FROM_NAME` | 发件人名称 | 必填 |
| `MAIL_FROM_ADDRESS` | 发件人邮箱 | 启用邮件时必填；关闭邮件时可为空字符串 |

示例：

```env
MAIL_ENABLED=true
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_IGNORE_TLS=false
MAIL_USER=your-account
MAIL_PASS=your-password
MAIL_FROM_NAME=NestJS Template
MAIL_FROM_ADDRESS=no-reply@example.com
```

`MAIL_ENABLED=false` 时，项目可以正常启动，但调用 `AppMailerService.sendMail()` 会抛出 `邮件服务未启用`。

### 5.7 日志配置

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `LOG_ON` | 是否写入日志文件 | 必填 |
| `LOG_LEVEL` | 日志级别 | 必填 |

支持的日志级别：

```text
error, warn, info, http, verbose, debug, silly
```

示例：

```env
LOG_ON=true
LOG_LEVEL=info
```

### 5.8 AI 配置

AI 模块是可选模块，由 `AI_ENABLED` 控制是否注册 `/api/ai/*` 接口。

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `AI_ENABLED` | 是否启用 AI 模块 | 必填 |
| `AI_API_KEY` | AI 服务 API Key | 启用 AI 时必填；关闭 AI 时可为空字符串 |
| `AI_BASE_URL` | AI 服务 Base URL，兼容 OpenAI 协议时可配置 | 必填，可为空字符串 |
| `AI_CHAT_MODEL` | 对话模型名称 | 启用 AI 时必填；关闭 AI 时可为空字符串 |
| `AI_TEMPERATURE` | 模型温度，范围 `0` 到 `2` | 必填 |

示例：

```env
AI_ENABLED=false
AI_API_KEY=
AI_BASE_URL=
AI_CHAT_MODEL=
AI_TEMPERATURE=0.7
```

### 5.9 OSS 配置

OSS 模块用于文件预签名直传。关闭 OSS 时项目可以启动，但调用文件上传意图接口会返回服务不可用。

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `OSS_ENABLED` | 是否启用 OSS | 必填 |
| `OSS_REGION` | OSS region | 必填 |
| `OSS_BUCKET` | OSS bucket | 启用 OSS 时必填；关闭 OSS 时可为空字符串 |
| `OSS_ACCESS_KEY_ID` | 访问密钥 ID | 启用 OSS 时必填；关闭 OSS 时可为空字符串 |
| `OSS_ACCESS_KEY_SECRET` | 访问密钥 Secret | 启用 OSS 时必填；关闭 OSS 时可为空字符串 |
| `OSS_PUBLIC_BASE_URL` | 自定义公开访问域名 | 可选 |
| `OSS_UPLOAD_EXPIRES_IN` | 上传 URL 有效期，单位秒，最小 `60` | 必填 |
| `OSS_UPLOAD_MAX_SIZE` | 最大上传大小，单位字节 | 必填 |
| `OSS_TEMP_EXPIRES_IN_HOURS` | 临时文件过期小时数 | 必填 |

示例：

```env
OSS_ENABLED=false
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_PUBLIC_BASE_URL=
OSS_UPLOAD_EXPIRES_IN=600
OSS_UPLOAD_MAX_SIZE=10485760
OSS_TEMP_EXPIRES_IN_HOURS=24
```

## 6. 基础设施模块

### 6.1 启动配置模块

位置：

```text
src/common/config
```

这个模块负责：

- 读取和校验环境变量。
- 设置全局路由前缀 `/api`。
- 根据环境启用 CORS。
- 启用全局参数校验。
- 启用应用关闭钩子。
- 使用 Winston 作为 Nest 日志器。

参数校验规则：

- 自动把 query、params 中的值转换成 DTO 需要的类型。
- 移除 DTO 中没有声明的字段。
- 遇到第一个校验错误就返回。
- 返回 DTO 中配置的中文错误信息。

示例：

```ts
export class QueryDto {
  @Type(() => Number)
  @IsInt({ message: "id 必须为整数" })
  id!: number;
}
```

请求：

```text
GET /api/example?id=1
```

控制器里拿到的 `id` 会是数字 `1`，不是字符串 `"1"`。

### 6.2 统一响应模块

位置：

```text
src/common/http/response.interceptor.ts
```

所有成功响应会被统一包裹。

业务代码：

```ts
@Get("hello")
hello() {
  return { message: "ok" };
}
```

实际响应：

```json
{
  "code": 0,
  "data": {
    "message": "ok"
  },
  "requestId": "4f4a3f2e-5c8e-4c4f-8a37-3f9a1e8f5c22",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

适合场景：

- 前端统一判断 `code === 0` 表示成功。
- 所有接口返回格式一致，降低联调成本。
- 前端可以把 `requestId` 提供给后端排查日志。

### 6.3 统一异常模块

位置：

```text
src/common/http/exception.filter.ts
src/common/http/exception.util.ts
```

所有异常会被统一处理。

业务代码：

```ts
throw new NotFoundException("用户不存在");
```

实际响应：

```json
{
  "code": 404,
  "message": "用户不存在",
  "data": null,
  "requestId": "4f4a3f2e-5c8e-4c4f-8a37-3f9a1e8f5c22",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

日志会记录：

- 请求方法和路径。
- requestId。
- IP、params、query、body。
- 当前登录用户。
- 异常名和堆栈。

这些敏感字段会自动脱敏：

```text
password, confirmPassword, authorization, token, accessToken, refreshToken
```

适合场景：

- 业务代码只需要抛出 Nest 标准异常。
- 日志保留排查信息，同时避免泄露密码和 token。

### 6.4 分页查询模块

位置：

```text
src/common/http/page-query.dto.ts
```

内置分页参数：

| 参数 | 默认值 | 规则 |
| --- | --- | --- |
| `page` | `1` | 最小 `1` |
| `pageSize` | `10` | 最小 `1`，最大 `100` |

返回结构：

```ts
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
```

使用示例：

```ts
export class QueryArticlesDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  title?: string;
}

async list(query: QueryArticlesDto): Promise<PageResult<Article>> {
  const { page, pageSize, skip } = resolvePageQuery(query);

  const [items, total] = await this.articleRepository.findAndCount({
    skip,
    take: pageSize,
    order: { id: "DESC" },
  });

  return createPageResult(items, total, page, pageSize);
}
```

适合场景：

- 用户列表、角色列表、权限列表、文章列表等所有列表查询。

说明：下面的代码示例主要展示核心写法。实际开发时，请按当前文件位置补齐 `import`，例如 `@Controller`、`@Get` 来自 `@nestjs/common`，`PageQueryDto` 来自 `src/common/http/page-query.dto`。

### 6.5 数据库模块

位置：

```text
src/common/database
```

这个模块负责：

- 使用 TypeORM 连接数据库。
- 支持 MySQL 和 PostgreSQL。
- 根据 `DB_TYPE` 自动选择数据库驱动配置。
- 自动扫描实体文件。
- 提供 TypeORM CLI 使用的 `ormconfig.ts`。
- 把常见数据库错误转换成业务异常。

实体扫描规则：

- TypeScript 开发环境扫描 `src/**/*.entity.ts`。
- 构建后生产环境扫描 `dist/**/*.entity.js`。

数据库错误转换示例：

```ts
constructor(private readonly databaseErrorMapper: DatabaseErrorMapper) {}

try {
  await this.permissionRepository.save(dto);
} catch (error) {
  this.databaseErrorMapper.rethrow(error, {
    unique: `权限码 "${dto.code}" 已存在`,
    foreignKeyConstraint: "关联数据不存在",
  });
}
```

支持转换的错误类型：

| 错误类型 | 返回异常 |
| --- | --- |
| 唯一键冲突 | `409 Conflict` |
| 外键不存在 | `400 Bad Request` |
| 数据仍被引用 | `400 Bad Request` |
| 字段过长 | `400 Bad Request` |
| 非空字段为空 | `400 Bad Request` |
| 没有默认值 | `400 Bad Request` |
| 字段值非法 | `400 Bad Request` |

适合场景：

- 用户名重复时返回“当前用户名已被注册”。
- 绑定不存在的角色时返回“角色不存在”。
- 创建重复权限码时返回“权限码已存在”。

TypeORM CLI 示例：

```bash
pnpm typeorm:dev migration:generate ./src/migrations/Init -d ./ormconfig.ts
pnpm typeorm:dev migration:run -d ./ormconfig.ts
pnpm typeorm:dev migration:revert -d ./ormconfig.ts
```

### 6.6 Redis 模块

位置：

```text
src/common/cache/redis.module.ts
```

这个模块是全局模块，提供 `REDIS` 注入令牌。

启动时会：

- 创建 Redis 客户端。
- 连接 Redis。
- 执行 `ping()` 检查连接。
- 监听 `ready`、`reconnecting`、`error` 事件。
- 应用关闭时自动 `quit()`，失败时 `disconnect()`。

使用示例：

```ts
@Injectable()
export class CaptchaService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async saveCode(phone: string, code: string) {
    await this.redis.set(`captcha:${phone}`, code, "EX", 300);
  }

  async getCode(phone: string) {
    return this.redis.get(`captcha:${phone}`);
  }
}
```

适合场景：

- 验证码。
- 登录限制。
- 分布式锁。
- 临时状态保存。

### 6.7 Redis 数据缓存

Redis 模块不只适合验证码、锁和限流，也可以直接缓存数据库查询结果。

使用示例：

```ts
@Injectable()
export class UserCacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getUser(id: number) {
    const key = `user:${id}`;

    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as { id: number; username: string };
    }

    const user = { id, username: `user-${id}` };
    await this.redis.set(key, JSON.stringify(user), "EX", 60);

    return user;
  }

  async clearUser(id: number) {
    await this.redis.del(`user:${id}`);
  }
}
```

适合场景：

- 缓存用户资料。
- 缓存菜单权限。
- 缓存配置项。
- 缓存读取频繁、变化较少的数据。

建议约定：

```text
user:1
settings:public
permissions:user:1
```

所有 key 会自动带上 `REDIS_KEY_PREFIX`，例如 `nest:user:1`。

### 6.8 邮件模块

位置：

```text
src/common/mailer
```

这个模块是全局模块，提供 `AppMailerService`。

内置模板：

```text
src/common/mailer/templates/welcome.hbs
```

构建时 Nest 会自动复制模板文件，配置在：

```text
nest-cli.json
```

发送模板邮件示例：

```ts
@Injectable()
export class NoticeService {
  constructor(private readonly mailer: AppMailerService) {}

  async sendWelcomeMail(to: string) {
    await this.mailer.sendTemplateMail({
      to,
      subject: "Welcome",
      template: "welcome",
      context: {
        title: "Welcome to NestJS Template",
        message: "Your account is ready.",
        actionUrl: "https://example.com/login",
        actionLabel: "Go to Login",
      },
    });
  }
}
```

普通邮件示例：

```ts
await this.mailer.sendMail({
  to: "user@example.com",
  subject: "通知",
  text: "这是一封普通文本邮件",
});
```

适合场景：

- 注册欢迎邮件。
- 找回密码。
- 登录提醒。
- 系统通知。

### 6.9 日志模块

位置：

```text
src/common/logging
```

这个模块使用 `nest-winston` 和 `winston`。

默认行为：

- 控制台始终输出 Nest 风格日志。
- `LOG_ON=true` 时写入 `logs` 目录。
- 日志文件按天切分。
- 单文件最大 `20m`。
- 最多保留 `7d`。
- 旧日志会压缩。

日志文件：

```text
logs/application-YYYY-MM-DD.log
logs/warning-YYYY-MM-DD.log
```

使用示例：

```ts
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  run() {
    this.logger.log("任务开始");
    this.logger.warn("这是一个警告");
  }
}
```

适合场景：

- 记录定时任务执行结果。
- 排查接口异常。
- 线上问题定位。

## 7. IAM 身份与权限模块

位置：

```text
src/modules/iam
```

IAM 是 Identity and Access Management 的缩写，负责“谁登录了”和“他能访问什么”。

当前 IAM 模块包含：

- `auth`：注册、登录、刷新令牌、退出登录、会话清理。
- `users`：用户列表和用户更新。
- `profiles`：当前用户资料。
- `roles`：角色管理。
- `permissions`：权限码管理。

### 7.1 数据模型

核心关系：

```text
User 1 -- 1 Profile
User N -- N Role
Role N -- N Permission
User 1 -- N AuthSession
User 1 -- N File
```

含义：

- 一个用户有一份资料。
- 一个用户可以有多个角色。
- 一个角色可以有多个权限码。
- 一个用户可以有多个登录会话，比如电脑登录一次、手机登录一次。
- 一个用户可以上传多个文件，文件记录通过 `userId` 关联用户。

核心实体继承统一审计字段：

| 字段 | 说明 |
| --- | --- |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |
| `deletedAt` | 软删除时间 |
| `createdBy` | 创建人 ID |
| `updatedBy` | 更新人 ID |

#### User 用户

表名：

```text
users
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 用户 ID |
| `username` | 用户名，唯一 |
| `password` | 密码哈希，默认查询不返回 |
| `status` | 账号状态，可选 `active`、`disabled`、`locked` |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

#### Profile 用户资料

表名：

```text
profiles
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 资料 ID |
| `nickname` | 昵称 |
| `userId` | 关联用户 |

注册用户时会自动创建 profile，默认昵称等于用户名。

#### Role 角色

表名：

```text
roles
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 角色 ID |
| `roleName` | 角色名称，唯一 |
| `description` | 角色描述 |
| `status` | 角色状态 |

常见角色：

```text
admin
editor
user
```

#### Permission 权限码

表名：

```text
permissions
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 权限 ID |
| `code` | 权限码，唯一 |
| `description` | 权限描述 |
| `status` | 权限状态 |

常见权限码：

```text
user:list
user:update
role:create
permission:update
```

当前项目会把用户拥有的权限码放进 `CurrentUser.permissions`，并提供 `/api/permissions/me` 查询。服务端已经内置 `@Permissions()` 装饰器和全局 `PermissionsGuard`，管理接口按权限码校验；`admin` 角色拥有超级管理员兜底权限。

#### AuthSession 登录会话

表名：

```text
auth_sessions
```

主要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 会话 ID，也就是 JWT 里的 `sid` |
| `userId` | 用户 ID |
| `refreshTokenHash` | Refresh Token 哈希，默认查询不返回 |
| `expiresAt` | 会话过期时间 |
| `lastUsedAt` | 最近使用时间 |
| `ip` | 最近登录 IP |
| `userAgent` | 设备标识 |

安全设计：

- 数据库不保存明文 Refresh Token，只保存 Argon2 哈希。
- Access Token 和 Refresh Token 都带有 `type`，避免互相混用。
- Access Token 校验时会检查会话是否存在、是否过期、用户是否启用。
- Access Token 校验会按 `5` 分钟间隔刷新 `lastUsedAt`，避免每次请求都写数据库。
- Refresh Token 校验时会检查 JWT、会话、过期时间、用户状态和 token 哈希。
- Refresh Token 每次刷新都会原子轮换，旧 token 同时并发刷新时只有一个请求能成功。

### 7.2 注册

接口：

```text
POST /api/auth/register
```

是否公开：

```text
公开接口，不需要 token
```

请求体：

```json
{
  "username": "student001",
  "password": "123456",
  "confirmPassword": "123456"
}
```

规则：

- `username` 长度 `6` 到 `50`。
- `password` 长度 `6` 到 `20`。
- `confirmPassword` 可选，传了就必须和 `password` 一致。
- 用户名不能重复。

响应：

```json
{
  "code": 0,
  "data": {
    "accessToken": "xxx",
    "refreshToken": "yyy"
  },
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

使用场景：

- 新用户创建账号。
- 注册后立即登录。

### 7.3 登录

接口：

```text
POST /api/auth/login
```

是否公开：

```text
公开接口，不需要 token
```

请求体：

```json
{
  "username": "student001",
  "password": "123456"
}
```

规则：

- 用户名和密码必须正确。
- 用户 `status` 为 `disabled` 或 `locked` 时不能登录。

响应：

```json
{
  "code": 0,
  "data": {
    "accessToken": "xxx",
    "refreshToken": "yyy"
  },
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

使用场景：

- 用户登录系统。
- 登录成功后前端保存 `accessToken` 和 `refreshToken`。

前端请求受保护接口时携带：

```http
Authorization: Bearer <accessToken>
```

### 7.4 刷新令牌

接口：

```text
POST /api/auth/refresh
```

是否公开：

```text
公开接口，但必须携带 refreshToken
```

请求头：

```http
Authorization: Bearer <refreshToken>
```

响应：

```json
{
  "code": 0,
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token"
  },
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

使用场景：

- Access Token 过期后，前端用 Refresh Token 换一组新 token。
- 用户无需重新输入用户名密码。

### 7.5 退出登录

退出当前会话：

```text
POST /api/auth/logout
```

请求头：

```http
Authorization: Bearer <accessToken>
```

响应：

```json
{
  "code": 0,
  "data": "退出成功",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

退出全部会话：

```text
POST /api/auth/logout-all
```

使用场景：

- `logout`：退出当前设备。
- `logout-all`：修改密码后踢掉所有设备，或用户手动退出全部登录。

### 7.6 会话清理

位置：

```text
src/modules/iam/auth/auth-session-cleanup.service.ts
```

功能：

- 每小时清理一次过期登录会话。
- 每批最多删除 `500` 条。
- 删除后记录日志。

使用场景：

- 避免 `auth_sessions` 表长期积累过期数据。
- 保持登录会话表体积可控。

### 7.7 登录守卫和装饰器

项目已经在 `AppModule` 注册了三个全局守卫：

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
{ provide: APP_GUARD, useClass: RolesGuard }
{ provide: APP_GUARD, useClass: PermissionsGuard }
```

这意味着：

- 默认所有接口都需要登录。
- 只有加了 `@Public()` 的接口才不需要登录。
- 加了 `@Roles()` 的接口需要登录，并且用户必须拥有指定角色。
- 加了 `@Permissions()` 的接口需要登录，并且用户必须拥有指定权限码。
- `admin` 角色会通过权限码守卫，适合作为超级管理员兜底。

#### `@Public()`

用途：

```text
声明公开接口，跳过登录校验
```

适合场景：

- 登录。
- 注册。
- 刷新令牌。
- 健康检查。
- 公开资源。

示例：

```ts
@Public()
@Post("login")
login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

#### `@Roles()`

用途：

```text
限制接口只能由指定角色访问
```

示例：

```ts
@Roles("admin")
@Controller("users")
export class UsersController {
  @Get()
  list() {
    return this.usersService.list();
  }
}
```

如果用户角色数组里有任意一个匹配，就允许访问。

```ts
@Roles("admin", "editor")
@Post("articles")
create() {
  return this.articlesService.create();
}
```

#### `@Permissions()`

用途：

```text
限制接口只能由拥有指定权限码的用户访问
```

示例：

```ts
@Permissions("user:update")
@Put(":id")
update() {
  return this.usersService.update();
}
```

如果用户拥有 `admin` 角色，会作为超级管理员直接通过权限码校验；否则必须包含接口声明的所有权限码。

#### `@CurrentUser()`

用途：

```text
在控制器方法中获取当前登录用户
```

返回结构：

```ts
export interface AuthUser {
  userId: number;
  sessionId: string;
  username: string;
  roles: string[];
  permissions: string[];
}
```

示例：

```ts
@Get("me")
getMe(@CurrentUser() user: AuthUser) {
  return {
    id: user.userId,
    username: user.username,
    roles: user.roles,
    permissions: user.permissions,
  };
}
```

#### `JwtRefreshGuard`

用途：

```text
专门校验 Refresh Token
```

示例：

```ts
@Public()
@UseGuards(JwtRefreshGuard)
@Post("refresh")
refresh(@CurrentUser() user: RefreshTokenUser) {
  return this.authService.refresh(user);
}
```

注意：

- 普通接口使用 Access Token。
- `/api/auth/refresh` 使用 Refresh Token。
- 两类 token 的密钥、过期时间和 payload type 都不同。

### 7.8 当前用户资料

接口：

```text
GET /api/profiles/me
```

请求头：

```http
Authorization: Bearer <accessToken>
```

响应示例：

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "username": "student001",
    "status": "active",
    "profile": {
      "id": 1,
      "nickname": "student001",
      "createdAt": "2026-06-08T10:00:00.000Z",
      "updatedAt": "2026-06-08T10:00:00.000Z"
    },
    "roles": ["admin"],
    "permissions": ["user:list", "user:update"],
    "createdAt": "2026-06-08T10:00:00.000Z",
    "updatedAt": "2026-06-08T10:00:00.000Z"
  },
  "requestId": "4f4a3f2e-5c8e-4c4f-8a37-3f9a1e8f5c22",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

使用场景：

- 前端进入系统后获取当前用户信息。
- 渲染用户昵称、角色、菜单和按钮权限。

### 7.9 权限码管理

权限码代表一个可控制的功能点。

示例：

```text
user:list
user:update
role:create
permission:update
```

#### 查询当前用户权限码

接口：

```text
GET /api/permissions/me
```

请求头：

```http
Authorization: Bearer <accessToken>
```

响应：

```json
{
  "code": 0,
  "data": ["role:create", "user:list", "user:update"],
  "requestId": "4f4a3f2e-5c8e-4c4f-8a37-3f9a1e8f5c22",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

说明：

- 返回值会去重。
- 返回值会按字母顺序排序。
- 只包含启用状态的角色和权限。

#### 创建权限码

接口：

```text
POST /api/permissions
```

要求：

```text
必须登录，并拥有 permission:create 权限码
```

请求体：

```json
{
  "code": "user:list",
  "description": "查看用户列表",
  "status": true
}
```

规则：

- `code` 不能为空。
- `code` 不能包含空格。
- `code` 长度 `1` 到 `50`。
- `code` 唯一。
- `description` 最长 `255`。

#### 查询权限列表

接口：

```text
GET /api/permissions?page=1&pageSize=10&code=user
```

要求：

```text
必须登录，并拥有 permission:list 权限码
```

说明：

- 支持分页。
- 支持按 `code` 模糊查询。
- 按 `id` 倒序返回。

#### 更新权限码

接口：

```text
PUT /api/permissions/:id
```

要求：

```text
必须登录，并拥有 permission:update 权限码
```

请求体：

```json
{
  "description": "查看用户列表和详情",
  "status": true
}
```

使用场景：

- 后台配置系统权限点。
- 前端根据权限码控制菜单或按钮显示。

### 7.10 角色管理

角色是一组权限码的集合。

示例：

```text
admin  拥有所有后台管理权限
editor 拥有内容编辑权限
user   普通用户
```

#### 创建角色

接口：

```text
POST /api/roles
```

要求：

```text
必须登录，并拥有 role:create 权限码
```

请求体：

```json
{
  "roleName": "admin",
  "description": "系统管理员",
  "status": true,
  "permissions": [1, 2, 3]
}
```

规则：

- `roleName` 不能为空。
- `roleName` 不能包含空格。
- `roleName` 长度 `2` 到 `50`。
- `roleName` 唯一。
- `permissions` 是权限 ID 数组，可选。
- 传入重复权限 ID 会自动去重。

#### 查询角色列表

接口：

```text
GET /api/roles?page=1&pageSize=10&roleName=admin
```

要求：

```text
必须登录，并拥有 role:list 权限码
```

说明：

- 支持分页。
- 支持按 `roleName` 模糊查询。
- 返回角色绑定的权限列表。

#### 更新角色

接口：

```text
PUT /api/roles/:id
```

要求：

```text
必须登录，并拥有 role:update 权限码
```

请求体：

```json
{
  "description": "系统超级管理员",
  "status": true,
  "permissions": [1, 2, 3, 4]
}
```

使用场景：

- 创建管理员、运营、审核员等角色。
- 给角色绑定权限码。
- 禁用某个角色。

### 7.11 用户管理

用户创建由注册接口完成，用户管理模块负责后台查询和更新。

#### 查询用户列表

接口：

```text
GET /api/users?page=1&pageSize=10&nickname=student
```

要求：

```text
必须登录，并拥有 user:list 权限码
```

说明：

- 支持分页。
- 支持按 profile.nickname 模糊查询。
- 返回用户资料和角色列表。
- 按用户 ID 倒序返回。

#### 更新用户

接口：

```text
PUT /api/users/:id
```

要求：

```text
必须登录，并拥有 user:update 权限码
```

请求体：

```json
{
  "profile": {
    "nickname": "新昵称"
  },
  "roles": [1, 2],
  "status": "active"
}
```

规则：

- `profile.nickname` 长度 `1` 到 `20`。
- `roles` 是角色 ID 数组。
- 传入重复角色 ID 会自动去重。
- 绑定不存在的角色会返回 `角色不存在`。
- `status` 可选 `active`、`disabled`、`locked`。
- `disabled` 和 `locked` 状态不能登录或继续鉴权。

使用场景：

- 后台修改用户昵称。
- 给用户分配角色。
- 禁用违规账号。

### 7.12 首次管理员说明

项目内置了管理员接口，但没有内置初始化管理员脚本。

首次使用时，一般流程是：

1. 通过 `/api/auth/register` 注册第一个用户。
2. 在数据库中创建 `admin` 角色。
3. 把第一个用户绑定到 `admin` 角色。
4. 用该用户登录，之后就可以访问角色、权限、用户管理接口。

如果你准备把这个模板用于正式项目，建议补一个 seed 脚本，自动创建：

- 默认管理员用户。
- `admin` 角色。
- 初始权限码。
- 管理员和角色的绑定关系。

## 8. 文件上传模块

位置：

```text
src/modules/files
```

文件模块采用“后端创建上传意图，前端直传 OSS，后端确认完成”的流程。

核心流程：

```text
POST /api/files/upload-intents
  ↓
后端创建 files 记录，状态为 pending
  ↓
返回 OSS PUT 预签名 URL
  ↓
前端直传 OSS
  ↓
POST /api/files/:id/complete
  ↓
后端调用 OSS head 校验对象存在、大小和 Content-Type
  ↓
文件状态变为 uploaded
```

文件状态：

| 状态 | 说明 |
| --- | --- |
| `pending` | 已创建上传意图，等待前端上传 |
| `uploaded` | OSS 对象已校验存在 |
| `used` | 文件已被业务正式使用 |

临时文件清理任务会按批次删除过期的 `pending` 和 `uploaded` 文件，并记录成功和失败数量。

## 9. 接口清单

当前内置接口统一使用 `/api` 前缀。

### 9.1 公开接口

| 方法 | 路径 | 功能 | Token |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | 注册 | 不需要 |
| `POST` | `/api/auth/login` | 登录 | 不需要 |
| `POST` | `/api/auth/refresh` | 刷新 token | 需要 Refresh Token |

### 9.2 登录后可访问

| 方法 | 路径 | 功能 | 角色 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/logout` | 退出当前会话 | 不限制 |
| `POST` | `/api/auth/logout-all` | 退出全部会话 | 不限制 |
| `GET` | `/api/profiles/me` | 当前用户资料 | 不限制 |
| `GET` | `/api/permissions/me` | 当前用户权限码 | 不限制 |
| `POST` | `/api/files/upload-intents` | 创建上传意图 | 不限制 |
| `POST` | `/api/files/:id/complete` | 确认上传完成 | 不限制 |
| `GET` | `/api/files/:id` | 文件详情 | 不限制 |
| `DELETE` | `/api/files/:id` | 删除文件 | 不限制 |

### 9.3 管理员接口

这些接口都需要：

```http
Authorization: Bearer <accessToken>
```

并且当前用户必须拥有对应权限码。拥有 `admin` 角色的用户会作为超级管理员通过权限码校验。

| 方法 | 路径 | 功能 | 权限码 |
| --- | --- | --- | --- |
| `GET` | `/api/users` | 用户列表 | `user:list` |
| `PUT` | `/api/users/:id` | 更新用户 | `user:update` |
| `POST` | `/api/roles` | 创建角色 | `role:create` |
| `GET` | `/api/roles` | 角色列表 | `role:list` |
| `PUT` | `/api/roles/:id` | 更新角色 | `role:update` |
| `POST` | `/api/permissions` | 创建权限码 | `permission:create` |
| `GET` | `/api/permissions` | 权限码列表 | `permission:list` |
| `PUT` | `/api/permissions/:id` | 更新权限码 | `permission:update` |

## 10. 常见开发示例

### 10.1 新增一个公开接口

适合场景：

- 健康检查。
- 公开配置。
- 不需要登录的回调接口。

示例：

```ts
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check() {
    return "ok";
  }
}
```

请求：

```text
GET /api/health
```

响应：

```json
{
  "code": 0,
  "data": "ok",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

### 10.2 新增一个需要登录的接口

默认不加 `@Public()` 就需要登录。

```ts
@Controller("orders")
export class OrdersController {
  @Get("mine")
  listMine(@CurrentUser() user: AuthUser) {
    return this.ordersService.listByUser(user.userId);
  }
}
```

请求：

```http
GET /api/orders/mine
Authorization: Bearer <accessToken>
```

适合场景：

- 我的订单。
- 我的收藏。
- 我的消息。

### 10.3 新增一个管理员接口

```ts
@Roles("admin")
@Controller("admin/reports")
export class AdminReportsController {
  @Get()
  list() {
    return this.reportsService.list();
  }
}
```

适合场景：

- 后台管理。
- 数据统计。
- 用户审核。

### 10.4 新增一个分页列表接口

DTO：

```ts
export class QueryArticlesDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: "标题必须为字符串" })
  title?: string;
}
```

Service：

```ts
async list(query: QueryArticlesDto): Promise<PageResult<Article>> {
  const { page, pageSize, skip } = resolvePageQuery(query);
  const title = query.title?.trim();

  const queryBuilder = this.articleRepository
    .createQueryBuilder("article")
    .orderBy("article.id", "DESC")
    .skip(skip)
    .take(pageSize);

  if (title) {
    queryBuilder.andWhere("article.title LIKE :title", {
      title: `%${title}%`,
    });
  }

  const [items, total] = await queryBuilder.getManyAndCount();
  return createPageResult(items, total, page, pageSize);
}
```

Controller：

```ts
@Get()
list(@Query() query: QueryArticlesDto) {
  return this.articlesService.list(query);
}
```

### 10.5 新增一个实体

```ts
@Entity({ name: "articles", comment: "文章" })
export class Article {
  @PrimaryGeneratedColumn({ comment: "文章ID" })
  id!: number;

  @Column({ length: 100, comment: "标题" })
  title!: string;

  @Column({ type: "text", comment: "内容" })
  content!: string;

  @Column({ default: true, comment: "状态" })
  status!: boolean;

  @CreateDateColumn({ comment: "创建时间" })
  createdAt!: Date;

  @UpdateDateColumn({ comment: "更新时间" })
  updatedAt!: Date;
}
```

然后在模块里注册：

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Article])],
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
```

最后在 `AppModule` 或业务聚合模块中导入 `ArticlesModule`。

### 10.6 在业务中发送邮件

```ts
@Injectable()
export class AccountService {
  constructor(private readonly mailer: AppMailerService) {}

  async sendResetPasswordMail(email: string, resetUrl: string) {
    await this.mailer.sendTemplateMail({
      to: email,
      subject: "重置密码",
      template: "welcome",
      context: {
        title: "重置密码",
        message: "请点击下方按钮重置密码。",
        actionUrl: resetUrl,
        actionLabel: "重置密码",
      },
    });
  }
}
```

适合场景：

- 注册欢迎邮件。
- 找回密码邮件。
- 账号安全提醒。

### 10.7 在业务中使用缓存

```ts
@Injectable()
export class SettingsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getPublicSettings() {
    const key = "settings:public";
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as {
        siteName: string;
        allowRegister: boolean;
      };
    }

    const settings = {
      siteName: "NestJS Template",
      allowRegister: true,
    };

    await this.redis.set(key, JSON.stringify(settings), "EX", 300);
    return settings;
  }
}
```

适合场景：

- 配置项读取。
- 菜单权限读取。
- 字典数据读取。

### 10.8 使用权限码守卫

接口可以通过 `@Permissions()` 声明细粒度权限码。权限码来自用户启用角色绑定的启用权限。

```ts
@Permissions("user:update")
@Put("users/:id")
updateUser() {
  return this.usersService.update();
}
```

适合场景：

- 不只是区分 `admin`，还要细分按钮级权限。
- 前端按钮权限和服务端接口权限保持同一套权限码。

## 11. 开发命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发模式启动，监听文件变化 |
| `pnpm start` | 普通启动 |
| `pnpm build` | 生产构建，输出到 `dist` |
| `pnpm prod` | 运行构建后的生产代码 |
| `pnpm lint` | ESLint 检查并自动修复 |
| `pnpm format` | Prettier 格式化 `src/**/*.ts` |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行单元测试 |
| `pnpm test:watch` | 监听模式运行测试 |
| `pnpm test:cov` | 生成测试覆盖率 |
| `pnpm test:e2e` | 运行 e2e 测试配置 |
| `pnpm typeorm` | 运行 TypeORM CLI，需要外部提供 `NODE_ENV` |
| `pnpm typeorm:dev` | 以 `NODE_ENV=development` 运行 TypeORM CLI |
| `pnpm typeorm:prod` | 以 `NODE_ENV=production` 运行 TypeORM CLI |

推荐提交前执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## 总结

这个模板已经完成了后端项目最常用的骨架：

- 基础设施：配置、数据库、Redis、缓存、邮件、日志、OSS、可选 AI。
- HTTP 规范：统一响应、统一异常、requestId、参数校验、分页。
- 身份权限：注册登录、JWT、Refresh Token、会话、角色、权限码守卫、用户资料。
- 管理接口：用户、角色、权限码和文件的基础管理能力。

开发新业务时，优先复用已有模式：

1. 新建 `module/controller/service/entity/dto`。
2. DTO 中写清楚参数校验。
3. Service 中处理业务和数据库异常。
4. Controller 中用 `@Public()`、`@Roles()`、`@Permissions()`、`@CurrentUser()` 控制访问。
5. 列表接口统一继承 `PageQueryDto`，返回 `{ items, total, page, pageSize, pages }`。
6. 需要性能优化时使用缓存，需要通知时使用邮件，需要排查问题时看日志。
