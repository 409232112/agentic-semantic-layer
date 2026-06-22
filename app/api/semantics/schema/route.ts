import { NextResponse } from 'next/server';
import { runTrinoQuery } from '@/lib/trino';

// GET /api/semantics/schema - 浏览物理 Catalog 下的库、表与字段结构
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const catalog = searchParams.get('catalog');
  const schema = searchParams.get('schema');
  const table = searchParams.get('table');

  if (!catalog) {
    return NextResponse.json(
      { success: false, error: 'Catalog parameter is required' },
      { status: 400 }
    );
  }

  try {
    // 场景 1：获取某个具体表的字段结构 (Describe Table)
    if (schema && table) {
      const describeRes = await runTrinoQuery(`DESCRIBE ${catalog}.${schema}.${table}`);
      const columns = describeRes.data.map(row => ({
        name: row[0] as string,
        type: row[1] as string,
        extra: row[2] as string,
        comment: row[3] as string
      }));

      let comment = '';
      try {
        const commentRes = await runTrinoQuery(
          `SELECT comment FROM system.metadata.table_comments 
           WHERE catalog_name = '${catalog}' 
             AND schema_name = '${schema}' 
             AND table_name = '${table}'`
        );
        if (commentRes.data && commentRes.data.length > 0) {
          comment = commentRes.data[0][0] as string || '';
        }
      } catch (err) {
        console.error('Failed to fetch table comment from Trino:', err);
      }

      return NextResponse.json({ success: true, columns, comment });
    }

    // 场景 2：获取某个 Schema 下的所有表
    if (schema) {
      const tablesRes = await runTrinoQuery(`SHOW TABLES FROM ${catalog}.${schema}`);
      const tables = tablesRes.data.map(row => row[0]);
      return NextResponse.json({ success: true, tables });
    }

    // 场景 3：获取整个 Catalog 下的所有 Schema 与其表结构树 (树状展开)
    const schemasRes = await runTrinoQuery(`SHOW SCHEMAS FROM ${catalog}`);
    const schemasList = schemasRes.data.map(row => row[0] as string);
    
    // 预先拉取该 catalog 下所有表的注释
    const commentsMap: Record<string, string> = {};
    try {
      const commentsRes = await runTrinoQuery(
        `SELECT schema_name, table_name, comment FROM system.metadata.table_comments WHERE catalog_name = '${catalog}'`
      );
      if (commentsRes && commentsRes.data) {
        for (const row of commentsRes.data) {
          const sName = row[0] as string;
          const tName = row[1] as string;
          const comment = row[2] as string || '';
          commentsMap[`${sName}.${tName}`] = comment;
        }
      }
    } catch (commentErr) {
      console.warn(`Could not fetch table comments for catalog ${catalog}:`, commentErr);
    }
    
    const tree = [];

    for (const sch of schemasList) {
      // 过滤系统架构
      if (sch.toLowerCase() === 'information_schema') continue;
      
      let tables: string[] = [];
      try {
        const tablesRes = await runTrinoQuery(`SHOW TABLES FROM ${catalog}.${sch}`);
        tables = tablesRes.data.map(row => row[0] as string);
      } catch (tableErr) {
        // 部分 schema 可能没有访问权限，捕获并跳过
        console.warn(`Could not show tables for ${catalog}.${sch}:`, tableErr);
      }

      const tablesInfo = tables.map(tName => ({
        name: tName,
        comment: commentsMap[`${sch}.${tName}`] || ''
      }));

      tree.push({
        name: sch,
        tables,
        tablesInfo
      });
    }

    return NextResponse.json({ success: true, schemas: tree });
  } catch (e: any) {
    console.error('Failed to get schema info:', e);
    return NextResponse.json(
      { success: false, error: e.message || 'Failed to retrieve schema metadata' },
      { status: 500 }
    );
  }
}
