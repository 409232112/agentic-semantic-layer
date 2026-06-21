# Agentic Semantic Layer Platform

这是一个为大语言模型（LLM）与 Agent 打造的**联邦语义层管理系统**。它连接底层物理数据源（支持 PostgreSQL、MySQL），并通过 Trino 联邦网关提供统一的动态 SQL 执行和语义定义配置，为上层 Agent 提供清晰、结构化的统一数据接口与 Prompt 生成机制。

## 🌟 系统核心架构与设计

### 1. 联邦查询网关 (Trino)
* 基于 **Trino Coordinator** 提供分布式 SQL 查询执行。
* 物理数据源（PostgreSQL / MySQL）通过动态 `CREATE CATALOG` 方式在线热挂载，无需重启，无繁琐的静态配置文件。

### 2. 动态语义配置映射 (Semantic Engine)
* **全局语义规则 (Global Rules)**：配置分析场景的全局约束条件，如统一的业务指标公式、时区规范等。
* **表级语义定义 (Table Metadata)**：为指定的物理表指定别名、业务逻辑说明。
* **字段级语义定义 (Field Metadata)**：对表内字段提供逻辑字段名、业务指标解释说明。

### 3. LLM 语义生成测试 (Prompt Test)
* 将物理表元数据（Schema）、全局/表/字段业务语义与用户问题（Natural Language Question）动态拼装为完整的 **大模型 Prompt**。
* 组装好的 Prompt 支持一键复制，直接输入给大模型，即可生成完全符合 Trino 语法的跨库联邦 SQL。

### 4. 交互式 SQL 沙盒 (SQL Sandbox)
* 内置 Navicat 风格的轻量化开发终端。
* 支持多行编辑、**SQL 自动缩进美化**（基于 `sql-formatter`）。
* 自动安全限制（不含 `LIMIT` 的查询默认追加 `LIMIT 10`），结果集通过响应式网格完美呈现。

### 5. 极客工业蓝图风 UI (Cyberpunk Industrial Theme)
* 采用深色极客 CRT 蓝图美学，全响应式网格与动效设计。

---

## 🛠️ 项目结构

```text
├── app/                  # Next.js 页面与接口路由
│   ├── api/              # 后端 API (数据源管理、语义合并、SQL执行、MCP)
│   └── page.tsx          # 交互式前端控制台
├── data/                 # 物理挂载目录
│   └── semantic_config.json # 业务场景与语义定义的本地配置文件 (热挂载)
├── lib/                  # Trino 连接与本地配置读写封装
├── Dockerfile            # 容器化多阶段打包定义
└── docker-compose.yml    # 本地双服务 (Trino + Next.js) 启动编排
```

---

## 🚀 快速开始

### 1. 准备本地数据
在根目录的 `data` 文件夹中确保存在 `semantic_config.json`，若无，系统在首次启动时会自动初始化预设结构。

### 2. 构建 Next.js 生产镜像
```bash
docker build -t semantic:latest .
```

### 3. 一键部署 (Trino + Next.js)
```bash
docker compose up -d
```
启动后：
* 访问控制台前端: `http://localhost:3000`
* Trino Coordinator 地址: `http://localhost:8080` (由 `nodejs` 容器内网通信，外网暴露以供临时查验)

---

## 🔗 接口与协议集成

### 1. 标准 Model Context Protocol (MCP) 集成
本平台内置了标准的 MCP 服务器，其入口为 `POST/GET http://localhost:3000/api/mcp`。大模型（如 Cursor, Cline, Claude Desktop）可通过该接口直接调取平台定义的语义元数据并执行安全的联邦查询。

#### 提供给 AI 客户端的核心工具 (MCP Tools)
1. **`list_scenarios`**
   * **描述**：获取当前系统内所有已注册分析场景列表。
   * **作用**：帮助 Agent 匹配适合当前提问的特定分析场景。
2. **`get_scenario_context`**
   * **参数**：`scenario` (场景编码，如 `finance`)
   * **描述**：根据场景编码获取对应的表结构（包括物理类型、底层注释）以及本系统内自定义的表级别和字段级别业务语义、全局过滤与计算规则。这是 Agent 理解业务以实现高精度 SQL 组装的**最关键数据**。
3. **`execute_federated_query`**
   * **参数**：`sql` (Trino SQL Select 语句), `scenario` (场景编码)
   * **描述**：通过 Trino 联邦执行只读查询并返回数据。内部包含 DDL/DML 拦截的安全权限审计逻辑（只读权限，阻断 `UPDATE`/`DROP`/`INSERT`/`DELETE` 等操作）。

#### 客户端配置示例 (Claude Desktop / Cursor)
您可以将以下配置写入 Claude 的配置文件（如 `config.json`），或接入 Cursor MCP：
```json
{
  "mcpServers": {
    "agentic-semantic-layer": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "http://localhost:3000/api/mcp"
      ]
    }
  }
}
```

---

## 🔗 后端主要接口

* **`/api/datasource`**：热挂载与卸载物理 Catalog 数据源。
* **`/api/semantics`**：获取、更新、增量保存全局/表/字段语义。
* **`/api/query/execute`**：在沙盒中执行 SQL，获得列元数据及行数据。
* **`/api/mcp`**：标准的 Model Context Protocol (MCP) 语义层服务入口。
