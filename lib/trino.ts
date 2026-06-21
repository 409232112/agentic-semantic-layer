export interface TrinoColumn {
  name: string;
  type: string;
}

export interface TrinoResult {
  columns: TrinoColumn[];
  data: any[][];
}

export interface TrinoErrorDetails {
  message: string;
  errorCode: number;
  errorName: string;
  errorType: string;
  errorLocation?: {
    lineNumber: number;
    columnNumber: number;
  };
}

// 执行 Trino SQL 查询，支持轮询结果并抛出结构化错误
export async function runTrinoQuery(sql: string, user = 'admin'): Promise<TrinoResult> {
  const trinoUrl = process.env.TRINO_URL || 'http://localhost:8080';
  
  const response = await fetch(`${trinoUrl}/v1/statement`, {
    method: 'POST',
    headers: {
      'X-Trino-User': user,
      'Content-Type': 'text/plain',
    },
    body: sql,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(JSON.stringify({
      message: `HTTP connection to Trino failed: ${response.statusText}`,
      errorCode: response.status,
      errorName: 'TRINO_HTTP_ERROR',
      errorType: 'HTTP',
      details: text
    }));
  }

  let body = await response.json() as any;
  let data: any[][] = [];
  let columns: TrinoColumn[] = body.columns || [];

  if (body.data) {
    data.push(...body.data);
  }

  // 轮询直到查询完成 (body.nextUri 不存在时代表结束)
  while (body.nextUri) {
    const nextResponse = await fetch(body.nextUri, {
      headers: { 'X-Trino-User': user },
    });
    if (!nextResponse.ok) {
      throw new Error(JSON.stringify({
        message: `Trino result polling failed: ${nextResponse.statusText}`,
        errorCode: nextResponse.status,
        errorName: 'TRINO_POLL_ERROR',
        errorType: 'HTTP'
      }));
    }
    body = await nextResponse.json();
    
    if (body.columns && columns.length === 0) {
      columns = body.columns;
    }
    if (body.data) {
      data.push(...body.data);
    }
    if (body.error) {
      throw new Error(JSON.stringify(body.error));
    }
  }

  if (body.error) {
    throw new Error(JSON.stringify(body.error));
  }

  return { columns, data };
}

// 使用 EXPLAIN 预检 SQL
export async function explainQuery(sql: string, user = 'admin'): Promise<{ valid: boolean; error?: TrinoErrorDetails }> {
  try {
    // 运行 EXPLAIN SQL
    await runTrinoQuery(`EXPLAIN ${sql}`, user);
    return { valid: true };
  } catch (err: any) {
    try {
      const parsedError = JSON.parse(err.message) as TrinoErrorDetails;
      return { valid: false, error: parsedError };
    } catch {
      return {
        valid: false,
        error: {
          message: err.message,
          errorCode: 0,
          errorName: 'UNKNOWN_ERROR',
          errorType: 'SYSTEM'
        }
      };
    }
  }
}
