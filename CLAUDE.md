# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 **Next.js 16 (App Router) + TypeScript** 构建的联邦语义层平台。它将大语言模型/Agent 应用通过 Trino 联邦网关连接到物理数据源（PostgreSQL、MySQL），提供统一的语义定义、SQL 生成和查询执行能力。前端使用 React 19 + Tailwind CSS 4，采用赛博朋克工业蓝图风格。

## 常用命令

```bash
npm run dev       # 启动 Next.js 开发服务器 (localhost:3000)
npm run build      # 构建生产版本
npm start          # 运行生产服务器
npm run lint       # 运行 ESLint 检查
```

### Docker 部署
```bash
docker build -t semantic:latest .
docker compose up -d
```

- Trino Coordinator：`localhost:8080`
- 前端控制台：`localhost:3000`
- `docker-compose.yml` 同时编排 Trino 和 Next.js 两个服务

## 架构设计

### 整体数据流

1. **数据源管理** - 物理数据库（PostgreSQL/MySQL）通过 `CREATE CATALOG` SQL 动态挂载到 Trino，无需静态配置文件
2. **场景定义** - 业务场景将多个 Catalog + 表分组，附带全局规则
3. **语义层** - 表级和字段级的业务描述覆盖/增强物理元数据
4. **Prompt 组装** - 将物理 Schema + 语义修正 + 全局规则拼装为 LLM 可用的提示词
5. **SQL 生成** - 两种模式：手动 SQL（沙盒）或 AI 辅助（Agent 从自然语言生成 Trino SQL）
6. **查询执行** - 通过 Trino 的 Statement API 执行查询，带有 DDL 保护自修复报错

### 核心文件一览

| 路径 | 作用 |
|------|------|
| `app/page.tsx` | 单页控制台应用（约 1780 行），包含全部 5 个 Tab：全局规则、表规则、字段规则、语义测试、SQL 沙盒，以及数据源和场景配置的弹窗模态框 |
| `app/layout.tsx` | 根布局。启动时自动调用 `readConfig()` 初始化配置文件 |
| `lib/config.ts` | 配置数据模型（`DataSource`、`Scenario`、`ConfigData`）+ `readConfig()`/`writeConfig()` 读写 `data/semantic_config.json` |
| `lib/trino.ts` | `runTrinoQuery()` - Trino Statement API 客户端（带 `nextUri` 轮询）；`explainQuery()` - 执行前 EXPLAIN 预检语法校验 |
| `app/api/datasource/route.ts` | 数据源 CRUD：GET 同步 Trino catalog 列表，POST 执行 CREATE CATALOG，DELETE 执行 DROP CATALOG |
| `app/api/scenario/route.ts` | 场景 CRUD：增删改业务分析场景到 `semantic_config.json`，保留旧的场景表/字段语义覆盖 |
| `app/api/semantics/route.ts` | 语义覆盖层：GET 获取场景的表和字段级语义修正，POST 增量合并更新 |
| `app/api/semantics/schema/route.ts` | 物理 Schema 浏览器：DESCRIBE 表字段、SHOW TABLES、SHOW SCHEMAS，从 Trino 动态拉取 |
| `app/api/query/execute/route.ts` | SQL 沙盒执行：DDL/DML 拦截防护、EXPLAIN 预检、智能自愈错误建议 |
| `app/api/query/build-prompt/route.ts` | Prompt 组装器：拉取当前场景的 Schema + 语义覆盖 + 全局规则，拼装为 ANSI SQL (Trino 方言) 提示词 |
| `app/api/query/agent-execute/route.ts` | 完整 Agent 流水线：LLM 场景匹配 → 元数据检索 → SQL 生成（Dashscope/qwen-plus，本地降级为预设模板） → Trino 执行。返回 trace 步骤 |
| `app/mcp/route.ts` | MCP 服务器（Model Context Protocol）：对外暴露 3 个工具（`list_scenarios`、`get_scenario_context`、`execute_federated_query`），供 Cursor/Claude Desktop 等 AI 客户端调用。使用 WebStandardStreamableHTTPServerTransport |
| `data/semantic_config.json` | 持久化配置文件，含数据源和场景列表。首次启动时由 `DEFAULT_CONFIG` 自动初始化 |
| `docker-compose.yml` | 编排 Trino + Next.js，Volume 挂载 `data/semantic_config.json` |

### 配置模型（`lib/config.ts`）

```
ConfigData
  datasources: DataSource[]        # name, connector(postgresql|mysql), properties(JDBC URL + 认证信息)
  scenarios: Scenario[]            # code, name, description, global_rules, catalogs[], tables[]
                                     #              table_overrides: { "catalog.schema.table": "业务描述" }
                                     #              field_overrides: { "tableName": { "columnName": { logical_name, description } } }
```

语义修正在编辑场景时不会丢失——仅保留被选中表的覆盖配置，未被选中的表修饰仍保留在配置中。

### Trino 集成（`lib/trino.ts`）

- `runTrinoQuery()` 调用 `/v1/statement` POST 端点，通过 `nextUri` 轮询获取分批结果
- `explainQuery()` 对 SQL 追加 `EXPLAIN` 做预检，捕获语法错误后再执行
- 所有凭据返回前端时通过 `maskProperties()` 脱敏（password/secret/token 字段替换为 `******`）

### Agent 执行流水线（`app/api/query/agent-execute/route.ts`）

四步追踪流水线：
1. **意图匹配** - 使用 LLM（qwen-plus，通过 Dashscope OpenAI 兼容接口）匹配最佳场景；缺失 API Key 时回退到关键词匹配
2. **元数据拉取** - DESCRIBE 场景内所有表，合并字段/表级语义覆盖
3. **SQL 生成** - LLM 在系统提示词（含 Schema + 规则）约束下生成 Trino SELECT；从 markdown 代码块中提取 SQL；本地降级返回硬编码演示 SQL
4. **执行查询** - 将生成的 SQL 提交 Trino，返回列元数据 + 行数据 + 完整 trace

依赖环境变量 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL`（默认指向 Dashscope）。

### MCP 服务器（`app/mcp/route.ts`）

向 AI 客户端暴露三个工具：
- `list_scenarios` - 返回所有场景 code/name/description
- `get_scenario_context` - 返回场景绑定的物理表结构 + 语义覆盖 + 全局规则
- `execute_federated_query` - 只读 SQL 执行，拦截 DDL/DML

会话通过 `mcp-session-id` 头持久化，存储在 `globalThis` 中以应对 Next.js 热重载。

### 前端设计

`app/page.tsx` 是唯一的入口页面，通过 `activeTab` 状态管理 5 个功能标签页。自定义 alert/confirm 弹窗基于 Promise 实现。UI 风格为深色赛博朋克主题，使用等宽字体 (Geist Mono)、Phosphor 图标库、青绿/红色点缀。没有拆分子组件文件，全部集中在一个组件内。

## 开发注意事项

- **路径别名**：`@/*` → `./`（项目根目录）。导入时使用 `@/lib/config`、`@/lib/trino` 等
- **API 路由**：使用 Next.js App Router 的 `route.ts` 文件，无中间件
- **TypeScript**：`tsconfig.json` 启用了 `strict: true`
- **测试**：项目尚未配置测试框架
- **ESLint**：使用 `eslint-config-next`，包含 core-web-vitals 和 TypeScript 规则
- **Tailwind CSS v4**：使用 PostCSS 插件，配置在 `postcss.config.mjs`
