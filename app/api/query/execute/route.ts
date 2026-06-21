import { NextResponse } from 'next/server';
import { runTrinoQuery, explainQuery } from '@/lib/trino';

// POST /api/query/execute - 统一查询执行接口 (只支持 SQL 直生模式 A，提供 DDL 安全检测与 EXPLAIN 自愈)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scenario, sql: rawSql } = body as {
      scenario: string;
      sql?: string;
    };

    if (!scenario || !rawSql) {
      return NextResponse.json(
        { success: false, error: 'Scenario and SQL string are required' },
        { status: 400 }
      );
    }

    // 1. SQL 拦截防注入：严禁任何数据修改/写指令
    const ddlKeywords = /\b(drop|delete|update|insert|create|alter|truncate|grant|revoke)\b/i;
    if (ddlKeywords.test(rawSql)) {
      return NextResponse.json(
        {
          success: false,
          errorType: 'SECURITY_VIOLATION',
          error: 'Access denied: Write/modification operations are strictly prohibited.'
        },
        { status: 403 }
      );
    }

    // 2. EXPLAIN 预检与智能自愈 (Self-Healing) 中间件
    const explainResult = await explainQuery(rawSql);
    if (!explainResult.valid && explainResult.error) {
      const err = explainResult.error;
      
      // 组装结构化错误信息返回给 Agent 纠错
      return NextResponse.json(
        {
          success: false,
          errorType: 'TRINO_SYNTAX_ERROR',
          sql: rawSql,
          error: {
            message: err.message,
            errorCode: err.errorCode,
            errorName: err.errorName,
            errorLocation: err.errorLocation,
            recommendation: generateHealingRecommendation(err)
          }
        },
        { status: 400 }
      );
    }

    // 3. 提交执行查询并获取结果
    const queryResult = await runTrinoQuery(rawSql);

    return NextResponse.json({
      success: true,
      sql: rawSql,
      columns: queryResult.columns,
      data: queryResult.data
    });

  } catch (e: any) {
    console.error('Failed to execute federated query:', e);
    return NextResponse.json(
      { success: false, error: e.message || 'Internal query execution error' },
      { status: 500 }
    );
  }
}

// 辅助自愈纠错提示推荐
function generateHealingRecommendation(err: any): string {
  const msg = (err.message || '').toLowerCase();
  
  if (msg.includes('cannot be resolved') || msg.includes('column does not exist')) {
    return 'The query references a column that does not exist. Please check the spelling against the semantic metadata.';
  }
  if (msg.includes('relation') && msg.includes('does not exist')) {
    return 'The query references a table or relation that does not exist. Please make sure the table name is fully qualified: catalog.schema.table.';
  }
  if (msg.includes('mismatched input') || msg.includes('syntax error')) {
    return 'There is a SQL syntax error. Note that Trino utilizes standard ANSI SQL dialect. Ensure functions like date math (e.g. interval) are written as: CURRENT_DATE - INTERVAL \'7\' DAY.';
  }
  if (msg.includes('cannot compare') || msg.includes('type mismatch')) {
    return 'There is a data type mismatch in the comparison. Ensure string values are wrapped in single quotes, and numeric casts (e.g. CAST(x AS VARCHAR)) are applied where appropriate.';
  }
  
  return 'Please review the SQL statement, verify table and column names, and ensure compatibility with Trino SQL dialect.';
}
