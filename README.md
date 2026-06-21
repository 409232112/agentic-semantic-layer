# Agentic Semantic Layer Platform

这是一个为大语言模型（LLM）与 Agent 打造的**联邦语义层管理系统**。它连接底层物理数据源，并通过 Trino 联邦网关提供统一的动态 SQL 执行和语义定义配置，为上层 Agent 提供清晰、结构化的统一数据接口与 Prompt 生成机制。

## 🌟 系统核心架构与设计

### 1. 联邦查询网关 (Trino)
* 基于 **Trino Coordinator** 提供分布式 SQL 查询执行。
* 物理数据源通过动态 `CREATE CATALOG` 方式在线热挂载，无需重启，无繁琐的静态配置文件。

### 2. 动态语义配置映射 (Semantic Engine)
* **全局语义规则 (Global Rules)**：配置分析场景的全局约束条件，如统一的业务指标公式、时区规范等。
* **表级语义定义 (Table Metadata)**：为指定的物理表指定别名、业务逻辑说明。
* **字段级语义定义 (Field Metadata)**：对表内字段提供逻辑字段名、业务指标解释说明。

### 3. LLM 场景语义 Prompt 组装生成
* 支持 **Markdown（默认表格结构）** 与 **JSON（原始树状数据）** 双格式输出，默认采用对大模型理解最为友好的 Markdown 表格。
* 将物理表元数据（Schema）、全局/表/字段业务语义与用户问题（Natural Language Question）动态拼装为完整的 **大模型 Prompt**，支持按需控制和复制。

### 4. 国密密码加密安全 (SM2 Encryption)
* 配置文件 `semantic_config.json` 中的数据源密码采用 **国密 SM2 非对称加密** 算法。
* 数据库密码以密文（以 `sm2:` 前缀标识）落盘，系统运行时在内存中自动使用私钥解密并进行动态数据源热挂载，保障凭证存储安全。


---

## 🛠️ 项目结构

```text
├── app/                  # Next.js 页面与接口路由
│   ├── api/              # 后端 API (数据源管理、语义合并、SQL执行、MCP)
│   ├── mcp/              # MCP 标准协议服务端模块
│   └── page.tsx          # 交互式控制台页面
├── data/                 # 物理挂载目录
│   └── semantic_config.json # 业务场景与语义定义的本地配置文件
├── lib/                  # 连接与配置读写封装 (包含 SM2 加解密引擎)
├── Dockerfile            # 容器化多阶段打包定义
└── docker-compose.yml    # 本地双服务 (Trino + Next.js) 启动编排
```

---

## 🚀 快速开始

### 1. 准备本地数据
在根目录的 `data` 文件夹中确保存在 `semantic_config.json`。如不存在，系统在首次启动时会自动初始化生成包含预设场景和数据库连接的配置文件。
*(注意：您可以使用明文密码，平台在保存配置时会自动对其进行国密 SM2 加密)*

---

### 2. 部署与启动 (Trino + Next.js)

通过 Docker Compose 一键启动完整平台：

1. **构建 Next.js 生产镜像**：
   ```bash
   docker build -t semantic:latest .
   ```
2. **一键启动双服务**：
   ```bash
   docker compose up -d
   ```
   启动后：
   * 控制台前端地址：`http://localhost:3000`
   * Trino Coordinator 地址：`http://localhost:8080`

---


## 🔗 接口与协议集成

### 1. 标准 Model Context Protocol (MCP) 集成
本平台内置了标准的 MCP 服务器，其入口为 `POST/GET http://localhost:3000/mcp`。大模型（如 Cursor, Cline, Claude Desktop）可通过该接口直接调取平台定义的语义元数据并执行安全的联邦查询。

#### 提供给 AI 客户端的核心工具 (MCP Tools)
1. **`list_scenarios`**
   * **描述**：获取当前系统内所有已注册分析场景列表。
   * **作用**：帮助 Agent 匹配适合当前提问的特定分析场景。
2. **`get_scenario_context`**
   * **参数**：`scenario` (场景编码，如 `finance`)，`format` (输出格式，可选 `'markdown'` 或 `'json'`)。
   * **描述**：根据场景编码获取对应的表结构（包括物理类型、底层注释）以及本系统内自定义的表级别和字段级别业务语义、全局过滤与计算规则。支持 Markdown 表格和 JSON 两种格式返回，默认返回 Markdown。
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
        "http://localhost:3000/mcp"
      ]
    }
  }
}
```

---

## 🔗 后端主要接口

* **`/api/datasource`**：热挂载与卸载物理 Catalog 数据源。
* **`/api/scenario`**：获取及更新业务场景范围和信息定义。
* **`/api/semantics`**：获取、更新、增量保存全局/表/字段语义.
* **`/api/query/build-prompt`**：在测试沙盒中获取拼装了 Schema 结构及规则描述的 LLM Prompt。
* **`/api/query/execute`**：在沙盒中执行 SQL，获得列元数据及行数据。
* **`/mcp`**：标准的 Model Context Protocol (MCP) 语义层服务入口。
