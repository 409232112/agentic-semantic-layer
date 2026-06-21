import { NextResponse } from 'next/server';
import { runTrinoQuery } from '@/lib/trino';
import { readConfig, writeConfig } from '@/lib/config';

function getSystemCatalogProperties(name: string): Record<string, string> {
  switch (name) {
    case 'postgresql':
      return {
        'connection-url': 'jdbc:postgresql://localhost:5432/postgres',
        'connection-user': 'postgres',
        'connection-password': '******'
      };
    case 'mysql':
      return {
        'connection-url': 'jdbc:mysql://localhost:3306/mysql_db',
        'connection-user': 'root',
        'connection-password': '******'
      };
    default:
      return {};
  }
}

function maskProperties(properties: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    const lowerKey = k.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token')
    ) {
      masked[k] = '******';
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

// GET /api/datasource - 获取当前 Trino 的所有 Catalog 连接状态
export async function GET() {
  try {
    const config = readConfig();

    // 从 Trino 获取当前活动的所有 catalogs (包含 connector 类型)
    const trinoResult = await runTrinoQuery('SELECT catalog_name, connector_name FROM system.metadata.catalogs');
    const trinoCatalogsMap = new Map<string, string>();
    trinoResult.data.forEach(row => {
      trinoCatalogsMap.set(row[0], row[1]);
    });

    const dbCatalogsMap = new Map<string, { connector: string; properties: any }>();
    config.datasources.forEach(ds => {
      dbCatalogsMap.set(ds.name, {
        connector: ds.connector,
        properties: ds.properties
      });
    });

    const datasourceList = [];
    for (const [name, connector] of trinoCatalogsMap.entries()) {
      if (name === 'system') continue;

      let properties: Record<string, string> = {};
      let finalConnector = connector;

      if (dbCatalogsMap.has(name)) {
        const dbCat = dbCatalogsMap.get(name)!;
        finalConnector = dbCat.connector;
        properties = maskProperties(dbCat.properties);
      } else {
        properties = getSystemCatalogProperties(name);
      }

      datasourceList.push({
        name,
        connector: finalConnector,
        properties,
        status: 'online'
      });
    }

    return NextResponse.json({ success: true, datasources: datasourceList });
  } catch (e: any) {
    console.error('Failed to retrieve datasources:', e);
    return NextResponse.json(
      { success: false, error: e.message || 'Failed to retrieve data sources' },
      { status: 500 }
    );
  }
}

// POST /api/datasource - 纯 SQL 动态挂载新的物理数据源
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, connector, properties } = body as {
      name: string;
      connector: string;
      properties: Record<string, string>;
    };

    if (!name || !connector || !properties || Object.keys(properties).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name, connector, and properties are required' },
        { status: 400 }
      );
    }

    // 格式化 WITH 子句属性
    const withClauses = Object.entries(properties)
      .map(([key, val]) => `"${key}" = '${String(val).replace(/'/g, "''")}'`)
      .join(',\n  ');

    const createSql = `CREATE CATALOG ${name} USING ${connector} WITH (\n  ${withClauses}\n)`;
    console.log(`Executing Trino CREATE CATALOG for ${name}...`);
    
    // 1. 在 Trino 中执行动态创建 SQL
    await runTrinoQuery(createSql);

    // 2. 创建成功后，保存至本地 JSON 配置
    const config = readConfig();
    const existingIdx = config.datasources.findIndex(d => d.name === name);
    const newDs = { name, connector, properties };
    if (existingIdx > -1) {
      config.datasources[existingIdx] = newDs;
    } else {
      config.datasources.push(newDs);
    }
    writeConfig(config);

    return NextResponse.json({
      success: true,
      message: `Data source '${name}' dynamically mounted successfully via SQL`
    });
  } catch (e: any) {
    console.error('Failed to dynamically add datasource:', e);
    let errorMessage = e.message || 'Failed to add data source';
    try {
      const parsed = JSON.parse(e.message);
      errorMessage = parsed.message || errorMessage;
    } catch {}
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// DELETE /api/datasource - 纯 SQL 动态注销物理数据源
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Name parameter is required' },
        { status: 400 }
      );
    }

    // 系统预设数据源禁止删除
    const systemPreset = ['postgresql', 'mysql'];
    if (systemPreset.includes(name)) {
      return NextResponse.json(
        { success: false, error: 'System preset catalogs cannot be deleted' },
        { status: 400 }
      );
    }

    console.log(`Executing Trino DROP CATALOG for ${name}...`);

    // 1. 在 Trino 中执行动态删除 SQL
    await runTrinoQuery(`DROP CATALOG ${name}`);

    // 2. 从本地 JSON 配置中删除
    const config = readConfig();
    config.datasources = config.datasources.filter(d => d.name !== name);
    writeConfig(config);

    return NextResponse.json({
      success: true,
      message: `Data source '${name}' dynamically unmounted successfully via SQL`
    });
  } catch (e: any) {
    console.error('Failed to dynamically delete datasource:', e);
    let errorMessage = e.message || 'Failed to delete data source';
    try {
      const parsed = JSON.parse(e.message);
      errorMessage = parsed.message || errorMessage;
    } catch {}
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
