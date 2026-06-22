import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { runTrinoQuery } from '@/lib/trino';

export async function POST(request: Request) {
  try {
    const { scenarioCode, prompt: userPrompt, format: promptFormat = 'markdown' } = await request.json();
    if (!scenarioCode) {
      return NextResponse.json({ success: false, error: 'Scenario code is required' }, { status: 400 });
    }

    const config = readConfig();
    const sc = config.scenarios.find(s => s.code === scenarioCode);
    if (!sc) {
      return NextResponse.json({ success: false, error: 'Scenario not found' }, { status: 404 });
    }

    // 1. 获取物理表及其字段、物理注释、自定义描述说明
    const contextTables: any[] = [];
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
          const customDesc = customField?.description || '';
          if (customDesc) col.custom_description = customDesc;
          return col;
        });
      } catch (err) {
        console.error(`Describe table ${tableName} failed:`, err);
      }

      let physicalTableComment = '';
      try {
        const commentRes = await runTrinoQuery(
          `SELECT comment FROM system.metadata.table_comments 
           WHERE catalog_name = '${catalog}' 
             AND schema_name = '${schema}' 
             AND table_name = '${table}'`
        );
        if (commentRes.data && commentRes.data.length > 0) {
          physicalTableComment = (commentRes.data[0][0] as string || '').trim();
        }
      } catch (err) {
        console.error(`Failed to fetch table comment for ${tableName}:`, err);
      }

      const customTableDesc = (sc.table_overrides?.[tableName] || '').trim();
      const tableEntry: Record<string, any> = {
        table_name: tableName,
        columns
      };
      if (customTableDesc) tableEntry.custom_description = customTableDesc;
      if (physicalTableComment) tableEntry.physical_comment = physicalTableComment;
      contextTables.push(tableEntry);
    }

    const globalRules = (sc.global_rules || '无全局场景规则说明').trim();

    // 格式化 metadata 表现形式，过滤可能破坏 Markdown 表格的特殊字符如 '|'
    const escapeMdCell = (val: string) => {
      if (!val) return '';
      return val.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    };

    let metadataString = '';
    if (promptFormat === 'markdown') {
      metadataString = contextTables.map(t => {
        let md = `### 物理表: ${t.table_name}\n`;
        const phyComment = t.physical_comment ? t.physical_comment.trim() : '无';
        md += `*原始物理注释 / ORIGINAL PHYSICAL COMMENT:* ${escapeMdCell(phyComment)}\n`;
        const tableDesc = t.custom_description ? t.custom_description.trim() : '无';
        md += `*表业务描述:* ${escapeMdCell(tableDesc)}\n\n`;
        
        if (!t.columns || t.columns.length === 0) {
          md += `*(暂无可用字段结构或连接超时)*\n`;
          return md;
        }

        md += `| 物理字段名 (Column) | 字段类型 (Type) | 物理注释 (Physical Comment) | 自定义描述修正 (Custom Description) |\n`;
        md += `|---|---|---|---|\n`;
        t.columns.forEach((c: any) => {
          const phyComment = c.comment ? c.comment.trim() : '无';
          const custDesc = c.custom_description ? c.custom_description.trim() : '无';
          md += `| ${escapeMdCell(c.name)} | ${escapeMdCell(c.type)} | ${escapeMdCell(phyComment)} | ${escapeMdCell(custDesc)} |\n`;
        });
        return md;
      }).join('\n');
    } else {
      metadataString = JSON.stringify(contextTables, null, 2);
    }

    // 2. 组装最终的大模型 Prompt 提示词模板
    const assembledPrompt = `You are a standard ANSI SQL (Trino dialect) query generator.
Given the database schema metadata, custom semantic descriptions, and scenario global rules, write a SQL query to answer the user's question.

Matched Scenario: ${sc.name} (${sc.code})
Scenario Global Rules:
${globalRules}

Database Metadata (Tables and Columns):
${metadataString}

User Question: "${userPrompt || '无'}"

Important Rules:
1. If the user's request can be resolved in a single query, return ONLY that SQL inside a markdown code block: \`\`\`sql\n...\n\`\`\`.
2. If the user's request involves multiple questions, multi-step analysis, or comparisons that cannot be efficiently queried in one statement, you should:
   a. Write multiple separate SQL statements, each wrapped in its own \`\`\`sql ... \`\`\` markdown code block.
   b. Provide a clear, step-by-step description of how these queries should be run and combined to answer the user's intent.
3. Tables MUST be referenced with their fully-qualified names: catalog.schema.table.
4. Do not modify data; only write SELECT statements.
5. Put each SQL query inside a markdown code block: \`\`\`sql\n...\n\`\`\``;

    return NextResponse.json({
      success: true,
      scenarioCode,
      scenarioName: sc.name,
      prompt: assembledPrompt
    });

  } catch (err: any) {
    console.error('Failed to build prompt:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
