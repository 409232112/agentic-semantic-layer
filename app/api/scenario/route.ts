import { NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';

// GET /api/scenario - 获取所有分析场景及其白名单与表绑定
export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json({ success: true, scenarios: config.scenarios });
  } catch (err: any) {
    console.error('Failed to get scenarios:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve scenarios' },
      { status: 500 }
    );
  }
}

// POST /api/scenario - 新建/修改分析场景
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, name, description, global_rules, catalogs, tables = [] } = body as {
      code: string;
      name: string;
      description?: string;
      global_rules?: string;
      catalogs: string[];
      tables: string[];
    };

    if (!code || !name || !catalogs) {
      return NextResponse.json(
        { success: false, error: 'Code, name, and catalogs are required' },
        { status: 400 }
      );
    }

    const config = readConfig();
    const existingIndex = config.scenarios.findIndex(s => s.code === code);

    const tableOverrides = existingIndex > -1 ? (config.scenarios[existingIndex].table_overrides || {}) : {};
    const fieldOverrides = existingIndex > -1 ? (config.scenarios[existingIndex].field_overrides || {}) : {};

    // Filter table_overrides and field_overrides to retain only selected tables
    const newTableOverrides: Record<string, string> = {};
    const newFieldOverrides: Record<string, any> = {};

    tables.forEach(tableName => {
      if (tableOverrides[tableName]) {
        newTableOverrides[tableName] = tableOverrides[tableName];
      }
      if (fieldOverrides[tableName]) {
        newFieldOverrides[tableName] = fieldOverrides[tableName];
      }
    });

    const existingRules = existingIndex > -1 ? (config.scenarios[existingIndex].global_rules || '') : '';

    const nextScenario = {
      code,
      name,
      description: description || '',
      global_rules: global_rules !== undefined ? global_rules : existingRules,
      catalogs,
      tables,
      table_overrides: newTableOverrides,
      field_overrides: newFieldOverrides
    };

    if (existingIndex > -1) {
      config.scenarios[existingIndex] = nextScenario;
    } else {
      config.scenarios.push(nextScenario);
    }

    writeConfig(config);
    return NextResponse.json({
      success: true,
      message: `Scenario '${code}' configured successfully`
    });
  } catch (err: any) {
    console.error('Failed to save scenario:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to configure scenario' },
      { status: 500 }
    );
  }
}

// DELETE /api/scenario - 删除分析场景
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Code parameter is required' },
        { status: 400 }
      );
    }

    // No restrictions on deleting default scenarios

    const config = readConfig();
    config.scenarios = config.scenarios.filter(s => s.code !== code);
    writeConfig(config);

    return NextResponse.json({
      success: true,
      message: `Scenario '${code}' deleted successfully`
    });
  } catch (err: any) {
    console.error('Failed to delete scenario:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete scenario' },
      { status: 500 }
    );
  }
}
