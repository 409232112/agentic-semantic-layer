import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { runTrinoQuery } from "@/lib/trino";
import { readConfig } from "@/lib/config";

// Persist active sessions across Next.js hot-reloads
const globalForMcp = globalThis as unknown as {
  activeSessions?: Map<string, WebStandardStreamableHTTPServerTransport>;
};

const activeSessions = globalForMcp.activeSessions ?? new Map<string, WebStandardStreamableHTTPServerTransport>();
if (process.env.NODE_ENV !== "production") {
  globalForMcp.activeSessions = activeSessions;
}

// Helper: Check if body contains initialize request
function isInitRequest(body: any): boolean {
  if (!body) return false;
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((msg: any) => msg && msg.method === "initialize");
}

async function checkQueryPermissions(sql: string, scenario: string): Promise<{ authorized: boolean; error?: string }> {
  const ddlKeywords = /\b(drop|delete|update|insert|create|alter|truncate|grant|revoke)\b/i;
  if (ddlKeywords.test(sql)) {
    return { authorized: false, error: 'Access denied: Write/modification operations are strictly prohibited.' };
  }
  return { authorized: true };
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "federated-semantic-gateway",
    version: "1.0.0"
  });

  // 1. 注册工具：list_scenarios
  server.tool(
    "list_scenarios",
    "获取系统内所有已注册的分析场景列表，包含其场景编码、中文名称及描述信息。大模型可基于此判断匹配到哪一个或多个场景进行提问。",
    {},
    async () => {
      try {
        const config = readConfig();
        const scList = config.scenarios.map(s => ({
          code: s.code,
          name: s.name,
          description: s.description
        }));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(scList, null, 2)
          }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err.message }]
        };
      }
    }
  );

  // 2. 注册工具：get_scenario_context
  server.tool(
    "get_scenario_context",
    "根据场景编码获取该分析场景下所有已选定表（如 MySQL、PG 等）的物理结构、物理注释、自定义语义注释、以及该场景的全局规则和提示事项。支持 markdown (默认) 或 json 结构返回。",
    {
      scenario: z.string().describe("分析场景编码，例如：finance"),
      format: z.enum(["markdown", "json"]).optional().default("markdown").describe("输出格式，可选 'markdown' (默认，带表头的结构化说明) 或 'json'")
    },
    async ({ scenario, format = "markdown" }) => {
      try {
        const config = readConfig();
        const sc = config.scenarios.find(s => s.code === scenario);
        if (!sc) {
          return {
            isError: true,
            content: [{ type: "text", text: `Scenario '${scenario}' not found` }]
          };
        }

        const contextTables = [];

        for (const tableName of sc.tables) {
          const parts = tableName.split('.');
          if (parts.length < 3) continue;
          const [catalog, schema, table] = parts;

          let columns: any[] = [];
          try {
            const describeRes = await runTrinoQuery(`DESCRIBE ${catalog}.${schema}.${table}`);
            columns = describeRes.data.map(row => {
              const colName = row[0] as string;
              const customField = sc.field_overrides?.[tableName]?.[colName];
              const col: Record<string, string> = {
                name: colName,
                type: row[1] as string,
              };
              const comment = (row[3] as string) || '';
              if (comment) col.comment = comment;
              const customLogicalName = customField?.logical_name || '';
              if (customLogicalName) col.custom_logical_name = customLogicalName;
              const customDesc = customField?.description || '';
              if (customDesc) col.custom_description = customDesc;
              return col;
            });
          } catch (describeErr) {
            console.error(`Failed to describe table ${tableName}:`, describeErr);
          }

          const customTableDesc = (sc.table_overrides?.[tableName] || '').trim();
          const tableEntry: Record<string, any> = {
            table_name: tableName,
            columns
          };
          if (customTableDesc) tableEntry.custom_description = customTableDesc;
          contextTables.push(tableEntry);
        }

        let outputText = '';
        if (format === 'markdown') {
          // 过滤可能破坏 Markdown 表格的特殊字符如 '|'
          const escapeMdCell = (val: string) => {
            if (!val) return '';
            return val.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
          };

          outputText += `# 场景语义上下文: ${sc.name} (${sc.code})\n\n`;
          outputText += `## 业务规则 / Scenario Global Rules\n${sc.global_rules ? sc.global_rules.trim() : '无全局场景规则说明'}\n\n`;
          outputText += `## 关联物理数据表元数据及语义描述 / Tables & Columns Schema\n`;
          
          contextTables.forEach(t => {
            outputText += `### 物理表: ${t.table_name}\n`;
            const tableDesc = t.custom_description ? t.custom_description.trim() : '无';
            outputText += `*表业务描述:* ${escapeMdCell(tableDesc)}\n\n`;
            
            if (!t.columns || t.columns.length === 0) {
              outputText += `*(暂无可用字段结构或连接超时)*\n\n`;
              return;
            }

            outputText += `| 物理字段名 (Column) | 字段类型 (Type) | 物理注释 (Physical Comment) | 自定义描述修正 (Custom Description) |\n`;
            outputText += `|---|---|---|---|\n`;
            t.columns.forEach((c: any) => {
              const phyComment = c.comment ? c.comment.trim() : '无';
              const customDescParts = [];
              if (c.custom_logical_name) customDescParts.push(c.custom_logical_name.trim());
              if (c.custom_description) customDescParts.push(c.custom_description.trim());
              const custDesc = customDescParts.length > 0 ? customDescParts.join(': ') : '无';

              outputText += `| ${escapeMdCell(c.name)} | ${escapeMdCell(c.type)} | ${escapeMdCell(phyComment)} | ${escapeMdCell(custDesc)} |\n`;
            });
            outputText += `\n`;
          });
        } else {
          const payload = {
            scenario_code: scenario,
            scenario_name: sc.name,
            scenario_description: sc.description,
            global_rules: sc.global_rules || '',
            tables: contextTables
          };
          outputText = JSON.stringify(payload, null, 2);
        }

        return {
          content: [{
            type: "text",
            text: outputText
          }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err.message }]
        };
      }
    }
  );

  // 3. 注册工具：execute_federated_query
  server.tool(
    "execute_federated_query",
    "执行直生 Trino SQL 查询。需包含完整的 catalog.schema.table。",
    {
      sql: z.string().describe("符合 Trino 标准的 SELECT 查询 SQL"),
      scenario: z.string().describe("分析场景代码，例如：finance")
    },
    async ({ sql, scenario }) => {
      try {
        const audit = await checkQueryPermissions(sql, scenario);
        if (!audit.authorized) {
          return {
            isError: true,
            content: [{ type: "text", text: audit.error || "Permission Denied" }]
          };
        }
        const queryRes = await runTrinoQuery(sql);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ columns: queryRes.columns, data: queryRes.data }, null, 2)
          }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err.message || "Query Execution Failed" }]
        };
      }
    }
  );

  return server;
}

// Route handlers mapping standard HTTP requests to their respective active sessions
export async function POST(request: Request) {
  let parsedBody: any = null;
  try {
    parsedBody = await request.json();
  } catch (err) {
    // Pass along to let the transport handle empty/invalid JSON parsing errors
  }

  const isInit = isInitRequest(parsedBody);
  let transport: WebStandardStreamableHTTPServerTransport;

  if (isInit) {
    const sessionId = Math.random().toString(36).substring(2, 15);
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessionclosed: async (id) => {
        activeSessions.delete(id);
      }
    });

    const server = createMcpServer();
    await server.connect(transport);
    activeSessions.set(sessionId, transport);
  } else {
    const sessionId = request.headers.get("mcp-session-id");
    const existingTransport = sessionId ? activeSessions.get(sessionId) : undefined;

    if (existingTransport) {
      transport = existingTransport;
    } else {
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: sessionId ? () => sessionId : undefined
      });
      const tempServer = new McpServer({
        name: "temp-gateway",
        version: "1.0.0"
      });
      await tempServer.connect(transport);
    }
  }

  return await transport.handleRequest(request, { parsedBody });
}

async function handleNonInitRequest(request: Request) {
  const sessionId = request.headers.get("mcp-session-id");
  const existingTransport = sessionId ? activeSessions.get(sessionId) : undefined;

  let transport: WebStandardStreamableHTTPServerTransport;

  if (existingTransport) {
    transport = existingTransport;
  } else {
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: sessionId ? () => sessionId : undefined
    });
    const tempServer = new McpServer({
      name: "temp-gateway",
      version: "1.0.0"
    });
    await tempServer.connect(transport);
  }

  return await transport.handleRequest(request);
}

export async function GET(request: Request) {
  return await handleNonInitRequest(request);
}

export async function DELETE(request: Request) {
  return await handleNonInitRequest(request);
}
