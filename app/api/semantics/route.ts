import { NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';

// GET /api/semantics - 获取当前场景下的表级与字段级语义描述修正
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get('scenario');

  if (!scenario) {
    return NextResponse.json({ success: false, error: 'Scenario is required' }, { status: 400 });
  }

  try {
    const config = readConfig();
    const sc = config.scenarios.find(s => s.code === scenario);
    if (!sc) {
      return NextResponse.json({ success: false, error: 'Scenario not found' }, { status: 404 });
    }

    const fieldsList: any[] = [];
    if (sc.field_overrides) {
      Object.entries(sc.field_overrides).forEach(([tableName, cols]) => {
        Object.entries(cols).forEach(([colName, val]) => {
          fieldsList.push({
            table_name: tableName,
            column_name: colName,
            logical_name: val.logical_name || '',
            description: val.description || ''
          });
        });
      });
    }

    const tablesList: any[] = [];
    if (sc.table_overrides) {
      Object.entries(sc.table_overrides).forEach(([tableName, desc]) => {
        tablesList.push({
          table_name: tableName,
          description: desc || ''
        });
      });
    }

    return NextResponse.json({
      success: true,
      fields: fieldsList,
      tables: tablesList
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/semantics - 保存场景下定制的表和字段语义说明
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scenario_code, fields, tables = [], global_rules } = body as {
      scenario_code: string;
      tables?: Array<{
        table_name: string;
        description: string;
      }>;
      fields: Array<{
        table_name: string;
        column_name: string;
        logical_name: string;
        description?: string;
      }>;
      global_rules?: string;
    };

    if (!scenario_code) {
      return NextResponse.json({ success: false, error: 'Scenario code is required' }, { status: 400 });
    }

    const config = readConfig();
    const sc = config.scenarios.find(s => s.code === scenario_code);
    if (!sc) {
      return NextResponse.json({ success: false, error: 'Scenario not found' }, { status: 404 });
    }

    // 1. 合并表描述的修改 (仅更新请求中指定的表)
    if (tables && Array.isArray(tables)) {
      if (!sc.table_overrides) sc.table_overrides = {};
      const overrides = sc.table_overrides;
      tables.forEach(t => {
        const desc = (t.description || '').trim();
        if (desc) {
          overrides[t.table_name] = desc;
        } else {
          delete overrides[t.table_name];
        }
      });
    }

    // 2. 合并列注释的修改 (仅更新请求中指定的字段)
    if (fields && Array.isArray(fields)) {
      if (!sc.field_overrides) sc.field_overrides = {};
      const overrides = sc.field_overrides;
      fields.forEach(f => {
        const logicalName = (f.logical_name || '').trim();
        const desc = (f.description || '').trim();
        if (logicalName || desc) {
          if (!overrides[f.table_name]) {
            overrides[f.table_name] = {};
          }
          overrides[f.table_name][f.column_name] = {
            logical_name: logicalName || undefined,
            description: desc || undefined
          };
        } else {
          // 如果内容被清空，则从配置中移除该字段的重写
          if (overrides[f.table_name]) {
            delete overrides[f.table_name][f.column_name];
            if (Object.keys(overrides[f.table_name]).length === 0) {
              delete overrides[f.table_name];
            }
          }
        }
      });
    }

    if (global_rules !== undefined) {
      sc.global_rules = global_rules;
    }

    writeConfig(config);

    return NextResponse.json({
      success: true,
      message: 'Semantics definitions saved successfully'
    });
  } catch (err: any) {
    console.error('Failed to save semantics:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
