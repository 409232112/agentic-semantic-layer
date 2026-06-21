import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { runTrinoQuery } from '@/lib/trino';
import { OpenAI } from 'openai';

// 初始化 Dashscope / Aliyun Aliview OpenAI 兼容接口
const apiKey = process.env.EMBEDDING_API_KEY || '';
const baseURL = process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
});

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    const config = readConfig();
    const scenarios = config.scenarios;
    if (scenarios.length === 0) {
      return NextResponse.json({ success: false, error: 'No scenarios defined in system' }, { status: 400 });
    }

    const traceSteps: Array<{ type: string; title: string; detail: string }> = [];

    // 第一步：根据自然语言，调用大模型匹配最合适的场景
    let matchedScenarioCode = scenarios[0].code;
    traceSteps.push({
      type: 'agent',
      title: '意图识别：匹配业务场景',
      detail: `正在匹配提问 "${prompt}" 对应的业务场景。当前系统场景列表有: ${scenarios.map(s => `${s.name}(${s.code})`).join(', ')}。`
    });

    try {
      if (apiKey && apiKey !== 'your-api-key-here') {
        const scenarioSelectorPrompt = `您是一个数据库场景匹配器。请根据用户的自然语言问题，从下面的场景列表中选择最相关的一个场景。
场景列表 (JSON 数组):
${JSON.stringify(scenarios.map(s => ({ code: s.code, name: s.name, description: s.description })))}

用户提问: "${prompt}"

请直接返回匹配到的场景 code 编码（例如 "finance"），不要输出任何其他文本、不要包含 Markdown 标记。`;

        const selectorRes = await openai.chat.completions.create({
          model: 'qwen-plus',
          messages: [{ role: 'user', content: scenarioSelectorPrompt }],
          temperature: 0.1,
          max_tokens: 20
        });

        const selectedCode = selectorRes.choices[0]?.message?.content?.trim() || '';
        if (scenarios.some(s => s.code === selectedCode)) {
          matchedScenarioCode = selectedCode;
        }
      } else {
        // 本地降级：基于简单关键字匹配
        const pLower = prompt.toLowerCase();
        const matched = scenarios.find(s => 
          pLower.includes(s.name.toLowerCase()) || 
          pLower.includes(s.description.toLowerCase()) ||
          pLower.includes('财务') || pLower.includes('nike') || pLower.includes('订单')
        );
        if (matched) matchedScenarioCode = matched.code;
      }
    } catch (e: any) {
      console.warn("LLM scenario selection failed, fallback to default scenario", e);
    }

    const sc = scenarios.find(s => s.code === matchedScenarioCode)!;
    traceSteps.push({
      type: 'success',
      title: `成功匹配场景: ${sc.name} [${sc.code}]`,
      detail: `根据语义相似度，已将查询导向场景 [${sc.name}]。场景范围描述: ${sc.description}`
    });

    // 第二步：通过场景 ID 获取其所涉及的所有表与字段的结构及语义注释
    traceSteps.push({
      type: 'agent',
      title: '检索场景元数据与语义修正定义',
      detail: `拉取场景 [${sc.name}] 绑定的物理表结构，并融入用户自定义的语义层修正说明。`
    });

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

    const globalRules = sc.global_rules || '无全局规则';
    const metadataString = JSON.stringify(contextTables, null, 2);

    traceSteps.push({
      type: 'success',
      title: '语义层上下文装配完成',
      detail: `共装配 ${contextTables.length} 张物理表的元数据。\n全局规则提示事项:\n${globalRules}`
    });

    // 第三步：调用大模型生成标准 Trino SQL
    traceSteps.push({
      type: 'agent',
      title: '大模型智能 SQL 生成',
      detail: '正在将物理元数据、语义修正、全局规则输入至大模型进行推理与方言 SQL 翻译...'
    });

    let generatedSql = '';
    const systemPrompt = `您是一个联邦查询网关 (Trino SQL) 专家。
请根据以下业务场景元数据和全局规则，将用户的自然语言问题翻译成一条标准、可执行 of SQL 查询。

当前场景: ${sc.name}
全局规则与注意事项:
${globalRules}

已授权的数据表结构及语义描述说明 (JSON格式):
${metadataString}

注意约束:
1. 只能使用上述 JSON 中声明的表和字段，严禁虚构。
2. 引用表时，必须使用完全限定的物理表路径: catalog.schema.table。
3. 只能生成一条 SELECT 查询语句，严禁 DDL 修改。
4. Trino 对日期和类型强制要求高，字符串比较须加单引号，使用 INTERVAL 时语法应为 CURRENT_DATE - INTERVAL '7' DAY，转换时用 CAST(col AS type)。
5. 直接输出生成的 SQL 代码，请包裹在 \`\`\`sql 和 \`\`\` 代码块中，大模型会自动解析提取。`;

    try {
      if (apiKey && apiKey !== 'your-api-key-here') {
        const chatRes = await openai.chat.completions.create({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1
        });

        const content = chatRes.choices[0]?.message?.content || '';
        const match = content.match(/```sql([\s\S]*?)```/) || content.match(/```([\s\S]*?)```/);
        if (match) {
          generatedSql = match[1].trim();
        } else {
          generatedSql = content.trim();
        }
      } else {
        // 本地降级：根据演示问题返回预设的 SQL
        const pLower = prompt.toLowerCase();
        if (pLower.includes('nike') || pLower.includes('销售净额')) {
          generatedSql = `SELECT
  t1.name AS "品牌名称",
  t2.last_login_ip AS "最后登录IP",
  sum(t0.price * t0.qty - t0.discount) AS "销售净额",
  sum(t0.qty) AS "总销售件数"
FROM postgresql.public.orders t0
JOIN mysql.mysql_db.brands t1 ON t0.brand_id = t1.id
JOIN redis.default.user_cache t2 ON 'user_cache:' || CAST(t0.user_id AS VARCHAR) = t2.id
WHERE t1.name = 'Nike' AND t0.created_at >= date_trunc('year', CURRENT_DATE)
GROUP BY t1.name, t2.last_login_ip`;
        } else {
          generatedSql = `SELECT
  t0.order_id AS "订单ID",
  t1.name AS "品牌名称",
  t2.os AS "操作系统"
FROM postgresql.public.orders t0
JOIN mysql.mysql_db.brands t1 ON t0.brand_id = t1.id
JOIN mongodb.behavior_logs.action_logs t2 ON t0.user_id = t2.user_id`;
        }
        traceSteps.push({
          type: 'warning',
          title: '未配置大模型 API Key，已自动匹配本地演示 SQL 模版',
          detail: '可在 .env.local 中配置 EMBEDDING_API_KEY 开启真实的 LLM 自动生成 SQL 功能。'
        });
      }
    } catch (e: any) {
      console.error("LLM SQL generation failed:", e);
      return NextResponse.json({ success: false, error: '大模型生成 SQL 失败: ' + e.message }, { status: 500 });
    }

    traceSteps.push({
      type: 'success',
      title: 'SQL 自动翻译生成成功',
      detail: `生成的 Trino SQL 如下:\n${generatedSql}`
    });

    // 第四步：提交 Trino 网关执行
    traceSteps.push({
      type: 'agent',
      title: '执行联邦物理查询',
      detail: '正在将生成的 SQL 提交到联邦查询引擎 (Trino) 并获取数据结果...'
    });

    const queryResult = await runTrinoQuery(generatedSql);

    traceSteps.push({
      type: 'success',
      title: '查询执行成功',
      detail: `成功检索到 ${queryResult.data.length} 行数据记录。`
    });

    return NextResponse.json({
      success: true,
      scenarioCode: matchedScenarioCode,
      scenarioName: sc.name,
      sql: generatedSql,
      columns: queryResult.columns,
      data: queryResult.data,
      trace: traceSteps,
      metadata: contextTables,
      globalRules
    });

  } catch (err: any) {
    console.error('Agent query execution error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Intelligent agent execution failed'
    }, { status: 500 });
  }
}
