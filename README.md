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

## 📸 系统功能截图与操作说明

以下是联邦语义层管理系统的核心功能模块截图与配置指引：

### 1. 物理数据源热挂载
在控制台的“物理数据源挂载控制台”中，支持热挂载 PostgreSQL 和 MySQL，并自动验证物理连接状态。
![添加数据源](images/%E6%B7%BB%E5%8A%A0%E6%95%B0%E6%8D%AE%E6%BA%90.png)

### 2. 业务场景定义与数据范围授权
配置特定分析场景（如财务分析、设备运维等）的表级别访问控制范围与可用 catalogs 授权。
![业务场景定义](images/%E4%B8%9A%E5%8A%A1%E5%9C%BA%E6%99%AF%E5%AE%9A%E4%B9%89.png)

### 3. 三级语义化配置映射

#### ① 全局场景语义规则 (Global Prompt Rules)
定义当前分析场景全局需要遵循的大模型推理逻辑、核心业务公式、时区规范等。
![场景全局语义设定](images/%E5%9C%BA%E6%99%AF%E5%85%A8%E5%B1%80%E8%AF%AD%E4%B9%89%E8%AE%BE%E5%AE%9A.png)

#### ② 表级别别名与描述语义修正 (Table Meta)
对复杂的物理表名指定对 LLM 友好的业务别名与详细描述，修正大模型的检索意图。
![场景表级别语义设定](images/%E5%9C%BA%E6%99%AF%E8%A1%A8%E7%BA%A7%E5%88%AB%E8%AF%AD%E4%B9%89%E8%AE%BE%E5%AE%9A.png)

#### ③ 字段级别逻辑名与指标定义语义修正 (Field Meta)
对底层物理字段配置易读的逻辑名称及业务指标计算说明，提高 Agent 的 SQL 生成精度。
![场景字段级别语义设定](images/%E5%9C%BA%E6%99%AF%E5%AD%97%E6%AE%B5%E7%BA%A7%E5%88%AB%E8%AF%AD%E4%B9%89%E8%AE%BE%E5%AE%9A.png)

### 4. 场景语义生成与 Prompt 测试
控制台自动将物理 Schema 元数据与您配置的三级语义合并，拼装为对大模型极度友好的 **Markdown 结构化 Prompt**，支持复制并测试意图生成。
![场景语义生成](images/%E5%9C%BA%E6%99%AF%E8%AF%AD%E4%B9%89%E7%94%9F%E6%88%90.png)

### 5. 交互式 SQL 查询测试与安全分析
内置 SQL 查询测试工具，可实时调试 Trino 联邦 SQL。系统会在应用层严密拦截一切 DDL/DML 写操作指令，防范物理库修改风险。
![SQL沙盒测试](images/SQL%E6%B2%99%E7%9B%92%E6%B5%8B%E8%AF%95.png)

### 6. 标准 Model Context Protocol (MCP) 服务暴露
内置标准的 MCP 协议协议端，向 Cursor、Claude Desktop 等 AI 客户端暴露三个标准的元数据工具与 SQL 执行接口。
![MCP工具列表](images/MCP%E5%B7%A5%E5%85%B7%E5%88%97%E8%A1%A8.png)

### 7. AI Agent 跨库智能数据问答实测
AI 客户端（如 Cursor Agent）通过连接本平台的 MCP 协议入口，能够一键获取语义修正定义并精准生成、执行跨数据源（MySQL + PostgreSQL）联邦 SQL 来回答复杂业务问题。
![Agent场景问答](images/Agent%E5%9C%BA%E6%99%AF%E9%97%AE%E7%AD%94.png)

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
* **`/api/query/build-prompt`**：在测试工具中获取拼装了 Schema 结构及规则描述的 LLM Prompt。
* **`/api/query/execute`**：在查询测试中执行 SQL，获得列元数据及行数据。
* **`/mcp`**：标准的 Model Context Protocol (MCP) 语义层服务入口。
