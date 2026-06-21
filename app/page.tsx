"use client";

import React, { useState, useEffect } from 'react';
import { format } from 'sql-formatter';
import { 
  Database, 
  Terminal, 
  Sliders, 
  Check, 
  Play, 
  Code,  
  Table as TableIcon, 
  CaretDown,
  PencilSimple,
  Trash,
  CaretRight,
  Stack,
  ArrowCounterClockwise,
  Warning
} from '@phosphor-icons/react';

export default function WorkspaceConsole() {
  const [activeTab, setActiveTab] = useState<'global_rules' | 'table_rules' | 'field_rules' | 'semantic_test' | 'sql_sandbox'>('global_rules');
  const [showDatasourceSettings, setShowDatasourceSettings] = useState(false);
  const [showScenarioSettings, setShowScenarioSettings] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<'datasources' | 'scenarios'>('datasources');

  // ==========================================
  // 自定义对话框与确认框 (Industrial Blueprint Theme)
  // ==========================================
  const [dialog, setDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onResolve: (val: boolean) => void;
  } | null>(null);

  const customAlert = (message: string, title = '/// 系统提示') => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        show: true,
        title,
        message,
        type: 'alert',
        onResolve: (val) => {
          setDialog(null);
          resolve(val);
        }
      });
    });
  };

  const customConfirm = (message: string, title = '/// 确认操作') => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        show: true,
        title,
        message,
        type: 'confirm',
        onResolve: (val) => {
          setDialog(null);
          resolve(val);
        }
      });
    });
  };

  // ==========================================
  // 共享/全局状态
  // ==========================================
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [datasources, setDatasources] = useState<any[]>([]);

  // 加载场景和数据源
  const refreshMetadata = async () => {
    try {
      const dsRes = await fetch('/api/datasource');
      const dsData = await dsRes.json();
      if (dsData.success) setDatasources(dsData.datasources);

      const scRes = await fetch('/api/scenario');
      const scData = await scRes.json();
      if (scData.success) {
        setScenarios(scData.scenarios);
        if (scData.scenarios.length > 0 && !selectedScenario) {
          setSelectedScenario(scData.scenarios[0].code);
        }
      }
    } catch (err) {
      console.error("Failed to load metadata:", err);
    }
  };

  useEffect(() => {
    refreshMetadata();
  }, []);

  // ==========================================
  // 1. 数据源管理 Tab 状态与逻辑
  // ==========================================
  const [dsForm, setDsForm] = useState({
    name: '',
    connector: 'postgresql',
    host: 'localhost',
    port: '5432',
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  const [dsStatusMsg, setDsStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isDsSubmitting, setIsDsSubmitting] = useState(false);
  const [isEditingDs, setIsEditingDs] = useState(false);
  const [editingDsName, setEditingDsName] = useState('');

  const startEditDatasource = (ds: any) => {
    const connUrl = ds.properties['connection-url'] || '';
    let host = 'localhost';
    let port = ds.connector === 'mysql' ? '3306' : '5432';
    let database = '';

    try {
      if (ds.connector === 'postgresql' && connUrl.startsWith('jdbc:postgresql://')) {
        const cleanUrl = connUrl.replace('jdbc:postgresql://', '');
        const [hostPort, dbName] = cleanUrl.split('/');
        database = dbName || '';
        const [h, p] = hostPort.split(':');
        if (h) host = h;
        if (p) port = p;
      } else if (ds.connector === 'mysql' && connUrl.startsWith('jdbc:mysql://')) {
        const cleanUrl = connUrl.replace('jdbc:mysql://', '');
        const [hostPort, dbName] = cleanUrl.split('/');
        database = dbName || '';
        const [h, p] = hostPort.split(':');
        if (h) host = h;
        if (p) port = p;
      }
    } catch (err) {
      console.error('Failed to parse connection URL during edit:', err);
    }

    setDsForm({
      name: ds.name,
      connector: ds.connector,
      host,
      port,
      user: ds.properties['connection-user'] || '',
      password: '',
      database
    });
    setIsEditingDs(true);
    setEditingDsName(ds.name);
    setDsStatusMsg(null);
  };

  const cancelEditDatasource = () => {
    setDsForm({ name: '', connector: 'postgresql', host: 'localhost', port: '5432', user: 'postgres', password: 'postgres', database: 'postgres' });
    setIsEditingDs(false);
    setEditingDsName('');
    setDsStatusMsg(null);
  };

  const handleDsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDsSubmitting(true);
    setDsStatusMsg(null);
    try {
      if (isEditingDs && editingDsName) {
        const delRes = await fetch(`/api/datasource?name=${editingDsName}`, { method: 'DELETE' });
        const delData = await delRes.json();
        if (!delData.success) {
          throw new Error(`更新失败，无法卸载旧数据源: ${delData.error}`);
        }
      }
      // 拼装不同 connector 的 properties
      let properties: Record<string, string> = {};
      if (dsForm.connector === 'postgresql') {
        properties = {
          'connection-url': `jdbc:postgresql://${dsForm.host}:${dsForm.port}/${dsForm.database}`,
          'connection-user': dsForm.user,
          'connection-password': dsForm.password
        };
      } else if (dsForm.connector === 'mysql') {
        const dbSuffix = dsForm.database ? dsForm.database.trim() : '';
        properties = {
          'connection-url': `jdbc:mysql://${dsForm.host}:${dsForm.port}/${dbSuffix}`,
          'connection-user': dsForm.user,
          'connection-password': dsForm.password
        };
      }

      const res = await fetch('/api/datasource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dsForm.name,
          connector: dsForm.connector,
          properties
        })
      });
      const data = await res.json();
      if (data.success) {
        setDsStatusMsg({ type: 'success', text: data.message });
        setDsForm({ name: '', connector: 'postgresql', host: 'localhost', port: '5432', user: 'postgres', password: 'postgres', database: 'postgres' });
        refreshMetadata();
      } else {
        setDsStatusMsg({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setDsStatusMsg({ type: 'error', text: err.message || '配置提交失败' });
    } finally {
      setIsDsSubmitting(false);
    }
  };

  // ==========================================
  // 2. 场景管理 Tab 状态与逻辑
  // ==========================================
  const [scForm, setScForm] = useState({
    code: '',
    name: '',
    global_rules: '',
    catalogs: [] as string[],
    tables: [] as string[]
  });
  const [scStatusMsg, setScStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isEditingScenario, setIsEditingScenario] = useState(false);
  const [availableTree, setAvailableTree] = useState<any[]>([]);

  // 监听 datasources 列表，为可供选择的数据源和表结构建立树状节点结构
  useEffect(() => {
    const fetchTreeMetadata = async () => {
      const treeNodes = [];
      for (const ds of datasources) {
        try {
          const res = await fetch(`/api/semantics/schema?catalog=${ds.name}`);
          const data = await res.json();
          if (data.success && data.schemas) {
            treeNodes.push({
              catalog: ds.name,
              connector: ds.connector,
              schemas: data.schemas
            });
          }
        } catch (err) {
          console.error("Failed to load catalog schemas for tree selector:", ds.name, err);
        }
      }
      setAvailableTree(treeNodes);
    };
    if (showScenarioSettings && datasources.length > 0) {
      fetchTreeMetadata();
    }
  }, [showScenarioSettings, datasources]);

  const handleScSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScStatusMsg(null);
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scForm)
      });
      const data = await res.json();
      if (data.success) {
        setScStatusMsg({ type: 'success', text: data.message });
        setScForm({ code: '', name: '', global_rules: '', catalogs: [], tables: [] });
        setIsEditingScenario(false);
        refreshMetadata();
      } else {
        setScStatusMsg({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setScStatusMsg({ type: 'error', text: err.message || '场景保存失败' });
    }
  };

  const startEditScenario = (sc: any) => {
    setScForm({
      code: sc.code,
      name: sc.name,
      global_rules: sc.global_rules || '',
      catalogs: [...sc.catalogs],
      tables: [...(sc.tables || [])]
    });
    setIsEditingScenario(true);
    setScStatusMsg(null);
  };

  const cancelEditScenario = () => {
    setScForm({ code: '', name: '', global_rules: '', catalogs: [], tables: [] });
    setIsEditingScenario(false);
    setScStatusMsg(null);
  };

  const handleDeleteDatasource = async (name: string) => {
    const confirmed = await customConfirm(`确认要卸载物理数据源 "${name}" 吗？此操作将在 Trino 动态注销 Catalog，已选定此数据源的分析场景将可能无法读取该 Catalog 下的物理表。`, '/// 数据源卸载确认');
    if (!confirmed) return;
    
    try {
      const res = await fetch(`/api/datasource?name=${name}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await customAlert(data.message, '/// 卸载成功');
        refreshMetadata();
      } else {
        await customAlert('卸载失败: ' + data.error, '/// 卸载失败');
      }
    } catch (err: any) {
      await customAlert('卸载异常: ' + err.message, '/// 系统异常');
    }
  };

  const handleDeleteScenario = async (code: string) => {
    // Allow deleting finance scenario
    const confirmed = await customConfirm(`确认要删除场景 "${code}" 吗？此操作将级联清退该场景绑定的所有物理表语义定义、字段映射及关联键 (Joins) 配置。`, '/// 场景删除确认');
    if (!confirmed) {
      return;
    }
    try {
      const res = await fetch(`/api/scenario?code=${code}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await customAlert(data.message, '/// 删除成功');
        if (selectedScenario === code) {
          setSelectedScenario('');
        }
        refreshMetadata();
      } else {
        await customAlert('删除失败: ' + data.error, '/// 删除失败');
      }
    } catch (err: any) {
      await customAlert('删除异常: ' + err.message, '/// 系统异常');
    }
  };

  // ==========================================
  // 3. 语义建模器 Tab 状态与逻辑
  // ==========================================
  const [dbTree, setDbTree] = useState<any[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [activeTable, setActiveTable] = useState<{ catalog: string, schema: string, table: string } | null>(null);
  
  // 工作台编辑状态
  const [semanticFields, setSemanticFields] = useState<any[]>([]);
  const [isSemanticsSaving, setIsSemanticsSaving] = useState(false);
  const [isRulesSaving, setIsRulesSaving] = useState(false);
  
  const [activeScenarioRules, setActiveScenarioRules] = useState<string>('');
  
  // 语义生成测试 & SQL沙盒相关状态
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [testGeneratedPrompt, setTestGeneratedPrompt] = useState('');
  const [promptFormat, setPromptFormat] = useState<'markdown' | 'json'>('markdown');
  const [sqlSandboxInput, setSqlSandboxInput] = useState('');
  const [sqlExecuting, setSqlExecuting] = useState(false);
  const [sqlResult, setSqlResult] = useState<{ columns: any[], rows: any[] } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);


  useEffect(() => {
    if (selectedScenario && scenarios.length > 0) {
      const currentSc = scenarios.find(s => s.code === selectedScenario);
      if (currentSc) {
        setActiveScenarioRules(currentSc.global_rules || '');
      }
    }
  }, [selectedScenario, scenarios]);

  // 获取物理库树结构 (仅拉取并展示当前选定场景 tables 预选表范围中的表)
  const loadDbTree = async () => {
    if (!selectedScenario) return;
    const scenarioDetail = scenarios.find(s => s.code === selectedScenario);
    if (!scenarioDetail) return;
    
    const targetTables = scenarioDetail.tables || [];
    const treeData = [];
    for (const catalog of scenarioDetail.catalogs) {
      try {
        const res = await fetch(`/api/semantics/schema?catalog=${catalog}`);
        const data = await res.json();
        if (data.success && data.schemas) {
          // 过滤，只保留该场景选定 tables 下的 schema 与 table
          const filteredSchemas = data.schemas.map((schNode: any) => {
            const matchedTables = (schNode.tables || []).filter((tName: string) => {
              const fullPath = `${catalog}.${schNode.name}.${tName}`;
              return targetTables.includes(fullPath);
            });
            return {
              ...schNode,
              tables: matchedTables
            };
          }).filter((schNode: any) => schNode.tables.length > 0);

          if (filteredSchemas.length > 0) {
            treeData.push({
              catalog,
              schemas: filteredSchemas
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching catalog ${catalog}:`, err);
      }
    }
    setDbTree(treeData);
  };

  useEffect(() => {
    if ((activeTab === 'table_rules' || activeTab === 'field_rules') && selectedScenario) {
      loadDbTree();
      setActiveTable(null);
      setSemanticFields([]);
    }
  }, [activeTab, selectedScenario, scenarios]);

  const [activeTableDesc, setActiveTableDesc] = useState<string>('');
  const [physicalTableComment, setPhysicalTableComment] = useState<string>('');

  // 点击左侧树表名
  const handleTableClick = async (catalog: string, schema: string, table: string) => {
    const fullTableName = `${catalog}.${schema}.${table}`;
    setActiveTable({ catalog, schema, table });
    setActiveTableDesc('');
    setPhysicalTableComment('');
    
    try {
      // 1. 获取该场景下已保存的语义定义
      const semRes = await fetch(`/api/semantics?scenario=${selectedScenario}`);
      const semData = await semRes.json();
      
      let existingFields = [];
      if (semData.success) {
        existingFields = (semData.fields || []).filter((f: any) => f.table_name === fullTableName);
        const matchedTableOverride = (semData.tables || []).find((t: any) => t.table_name === fullTableName);
        if (matchedTableOverride) {
          setActiveTableDesc(matchedTableOverride.description || '');
        }
      }

      // 2. 获取该物理表的物理字段及原始物理注释
      const phyRes = await fetch(`/api/semantics/schema?catalog=${catalog}&schema=${schema}&table=${table}`);
      const phyData = await phyRes.json();
      
      if (phyData.success) {
        const physicalColumns = phyData.columns || [];
        // 从 system metadata (Trino) 中我们没有表级别原始 comment，但我们可以尝试描述，或者暂时默认为物理表
        setPhysicalTableComment(`物理数据表: ${fullTableName}`);
        
        // 融合同步物理字段
        const fieldsList = physicalColumns.map((col: any) => {
          const matched = existingFields.find((f: any) => f.column_name === col.name);
          return {
            column_name: col.name,
            physical_type: col.type,
            physical_comment: col.comment || '无原始注释',
            description: matched ? (matched.description || '') : ''
          };
        });

        setSemanticFields(fieldsList);
      }
    } catch (err) {
      console.error("Error loading table details:", err);
    }
  };

  // 修改字段描述
  const handleFieldChange = (index: number, val: string) => {
    const updated = [...semanticFields];
    updated[index] = { ...updated[index], description: val };
    setSemanticFields(updated);
  };

  // 保存语义配置
  const saveSemantics = async () => {
    if (!activeTable) return;
    setIsSemanticsSaving(true);
    try {
      const fullTableName = `${activeTable.catalog}.${activeTable.schema}.${activeTable.table}`;
      
      const payload = {
        scenario_code: selectedScenario,
        tables: [
          {
            table_name: fullTableName,
            description: activeTableDesc
          }
        ],
        fields: semanticFields.map(f => ({
          table_name: fullTableName,
          column_name: f.column_name,
          logical_name: '', // 统一并入极简 description 说明修正即可
          description: f.description
        })),
        global_rules: activeScenarioRules
      };

      const res = await fetch('/api/semantics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await customAlert('语义层配置与场景全局规则保存成功！已更新至本地存储。', '/// 保存成功');
        await refreshMetadata();
        handleTableClick(activeTable.catalog, activeTable.schema, activeTable.table);
      } else {
        await customAlert('保存失败: ' + data.error, '/// 保存失败');
      }
    } catch (err: any) {
      await customAlert('保存异常: ' + err.message, '/// 保存异常');
    } finally {
      setIsSemanticsSaving(false);
    }
  };

  // 仅保存全局场景规则
  const saveGlobalRulesOnly = async () => {
    if (!selectedScenario) {
      await customAlert('请先在左侧选择一个场景！', '/// 提示');
      return;
    }
    setIsRulesSaving(true);
    try {
      const payload = {
        scenario_code: selectedScenario,
        global_rules: activeScenarioRules
      };

      const res = await fetch('/api/semantics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await customAlert('场景全局规则与提示事项保存成功！已更新至本地存储。', '/// 保存成功');
        await refreshMetadata();
      } else {
        await customAlert('保存失败: ' + data.error, '/// 保存失败');
      }
    } catch (err: any) {
      await customAlert('保存异常: ' + err.message, '/// 保存异常');
    } finally {
      setIsRulesSaving(false);
    }
  };

  // 生成测试 Prompt
  const handleGeneratePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setIsGeneratingPrompt(true);
    setSqlError(null);
    try {
      const res = await fetch('/api/query/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioCode: selectedScenario, prompt: chatInput, format: promptFormat })
      });
      const data = await res.json();
      if (data.success) {
        setTestGeneratedPrompt(data.prompt);
      } else {
        setTestGeneratedPrompt(`[Prompt 生成错误] ${data.error || '未知错误'}`);
      }
    } catch (err: any) {
      setTestGeneratedPrompt(`[Prompt 生成异常] ${err.message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // 执行 SQL 沙盒查询
  const handleExecuteSqlSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sqlSandboxInput.trim()) return;
    setSqlExecuting(true);
    setSqlError(null);
    setSqlResult(null);

    // 自动追加 LIMIT 10 逻辑：如果 SQL 中不含 limit 关键字 (大小写不敏感)，自动追加
    let executedSql = sqlSandboxInput.trim();
    if (!/\blimit\b/i.test(executedSql)) {
      // 如果末尾有分号，去除或插入到分号前
      if (executedSql.endsWith(';')) {
        executedSql = executedSql.slice(0, -1) + ' LIMIT 10;';
      } else {
        executedSql = executedSql + ' LIMIT 10';
      }
    }

    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: selectedScenario, sql: executedSql })
      });
      const data = await res.json();
      if (data.success) {
        setSqlResult({
          columns: data.columns || [],
          rows: data.data || []
        });
      } else {
        setSqlError(data.error || '查询执行失败');
      }
    } catch (err: any) {
      setSqlError(err.message || '查询异常');
    } finally {
      setSqlExecuting(false);
    }
  };

  // 格式化 SQL
  const handleFormatSqlSandbox = () => {
    if (!sqlSandboxInput.trim()) return;
    try {
      const formatted = format(sqlSandboxInput, {
        language: 'trino',
        tabWidth: 2,
        keywordCase: 'upper'
      });
      setSqlSandboxInput(formatted);
    } catch (err: any) {
      console.error("Formatting failed:", err);
      // Fallback
      const fallback = sqlSandboxInput
        .replace(/\s+/g, ' ')
        .replace(/\b(select|from|where|group by|having|order by|limit|join|left join|right join|inner join|on|and|or|union|with|as)\b/gi, (match) => `\n${match.toUpperCase()}`)
        .trim();
      setSqlSandboxInput(fallback);
    }
  };

  // ==========================================
  // 4. AI 调试沙盒 Tab 状态与逻辑
  // ==========================================
  // 模拟终端对话数据
  const [chatLog, setChatLog] = useState<Array<{ sender: 'user' | 'agent', text: string, type?: 'thought' | 'action' | 'result' }>>([
    { sender: 'agent', text: 'Federated Semantic Sandbox initialized. Choose a scenario and query mode to run test queries.', type: 'thought' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSandboxExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsChatLoading(true);

    const question = chatInput || "Custom query execution";
    
    // 写入 Chat 记录
    const nextLog = [...chatLog, { sender: 'user' as const, text: question }];
    setChatLog(nextLog);
    setChatInput('');

    try {
      const res = await fetch('/api/query/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioCode: selectedScenario, prompt: question })
      });
      const data = await res.json();

      if (data.success) {
        setChatLog(prev => [
          ...prev,
          { 
            sender: 'agent', 
            text: data.prompt, 
            type: 'action' 
          }
        ]);
      } else {
        setChatLog(prev => [
          ...prev,
          { sender: 'agent', text: `[Prompt 生成错误] ${data.error || '未知错误'}`, type: 'action' }
        ]);
      }
    } catch (err: any) {
      console.error(err);
      setChatLog(prev => [...prev, { sender: 'agent', text: `[网络或系统异常] ${err.message}`, type: 'action' }]);
    } finally {
      setIsChatLoading(false);
    }
  };




  return (
    <div className="flex h-screen bg-[#050505] font-sans text-slate-100 overflow-hidden relative">
      {/* 极简磨砂背景发光效果 */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/2 blur-[120px] pointer-events-none" />

      {/* 左侧固定侧边栏 (太空控制台 Sidebar) */}
      <aside className="w-64 border-r border-white/10 bg-[#070708] flex flex-col justify-between select-none z-10">
        <div>
          {/* Logo 标识区 */}
          <div className="p-5 border-b border-white/10 flex items-center space-x-2.5 bg-[#0a0a0c]">
            <div className="w-2.5 h-2.5 bg-[#ff2a2a] animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-[0.1em] text-[#eaeaea] uppercase font-mono whitespace-nowrap">[ AGENTIC SEMANTIC LAYER ]</span>
              <span className="text-[8px] font-mono text-[#ff2a2a] uppercase tracking-widest leading-none mt-0.5">系统版本: 3.8.2</span>
            </div>
          </div>

          {/* 全局场景下拉选择器 */}
          <div className="p-4 border-b border-white/10 bg-[#0c0c0f]">
            <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1.5 font-bold">
              &gt;&gt;&gt; 请选择当前活跃场景
            </label>
            <div className="relative">
              <select
                value={selectedScenario}
                onChange={e => setSelectedScenario(e.target.value)}
                className="w-full bg-[#050507] border border-white/15 text-xs text-[#eaeaea] font-mono p-2 pr-8 focus:border-[#ff2a2a] cursor-pointer appearance-none rounded-none outline-none transition-colors"
              >
                <option value="">-- 未选定场景 / SELECT --</option>
                {scenarios.map(sc => (
                  <option key={sc.code} value={sc.code} className="bg-[#0c0c0f]">
                    {sc.name.toUpperCase()} [{sc.code.toUpperCase()}]
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-500">
                <CaretDown size={12} />
              </div>
            </div>
          </div>

          {/* 侧边导航菜单 */}
          <nav className="p-3 space-y-1">
            <span className="px-2 text-[9px] font-mono uppercase tracking-[0.22em] text-slate-500 block mb-3 font-bold">/// 场景层级操作菜单</span>
            
            {/* 1. 全局语义设定 */}
            <button
              onClick={() => selectedScenario && setActiveTab('global_rules')}
              disabled={!selectedScenario}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-mono transition-all cursor-pointer ${
                !selectedScenario
                  ? 'opacity-20 cursor-not-allowed text-slate-600'
                  : activeTab === 'global_rules'
                    ? 'bg-[#121215] text-[#ff2a2a] font-bold border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121215]/50'
              }`}
            >
              <Code size={14} className={activeTab === 'global_rules' && selectedScenario ? 'text-[#ff2a2a]' : 'text-slate-500'} />
              <span>[ 1. 全局语义设定 ]</span>
            </button>

            {/* 2. 表级别语义设定 */}
            <button
              onClick={() => selectedScenario && setActiveTab('table_rules')}
              disabled={!selectedScenario}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-mono transition-all cursor-pointer ${
                !selectedScenario
                  ? 'opacity-20 cursor-not-allowed text-slate-600'
                  : activeTab === 'table_rules'
                    ? 'bg-[#121215] text-[#ff2a2a] font-bold border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121215]/50'
              }`}
            >
              <TableIcon size={14} className={activeTab === 'table_rules' && selectedScenario ? 'text-[#ff2a2a]' : 'text-slate-500'} />
              <span>[ 2. 表级别语义设定 ]</span>
            </button>

            {/* 3. 表字段语义设定 */}
            <button
              onClick={() => selectedScenario && setActiveTab('field_rules')}
              disabled={!selectedScenario}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-mono transition-all cursor-pointer ${
                !selectedScenario
                  ? 'opacity-20 cursor-not-allowed text-slate-600'
                  : activeTab === 'field_rules'
                    ? 'bg-[#121215] text-[#ff2a2a] font-bold border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121215]/50'
              }`}
            >
              <Sliders size={14} className={activeTab === 'field_rules' && selectedScenario ? 'text-[#ff2a2a]' : 'text-slate-500'} />
              <span>[ 3. 表字段语义设定 ]</span>
            </button>

            {/* 4. 语义生成测试 */}
            <button
              onClick={() => selectedScenario && setActiveTab('semantic_test')}
              disabled={!selectedScenario}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-mono transition-all cursor-pointer ${
                !selectedScenario
                  ? 'opacity-20 cursor-not-allowed text-slate-600'
                  : activeTab === 'semantic_test'
                    ? 'bg-[#121215] text-[#ff2a2a] font-bold border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121215]/50'
              }`}
            >
              <Terminal size={14} className={activeTab === 'semantic_test' && selectedScenario ? 'text-[#ff2a2a]' : 'text-slate-500'} />
              <span>[ 4. 语义生成测试 ]</span>
            </button>

            {/* 5. SQL 查询沙盒测试 */}
            <button
              onClick={() => selectedScenario && setActiveTab('sql_sandbox')}
              disabled={!selectedScenario}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-mono transition-all cursor-pointer ${
                !selectedScenario
                  ? 'opacity-20 cursor-not-allowed text-slate-600'
                  : activeTab === 'sql_sandbox'
                    ? 'bg-[#121215] text-[#ff2a2a] font-bold border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121215]/50'
              }`}
            >
              <Play size={14} className={activeTab === 'sql_sandbox' && selectedScenario ? 'text-[#ff2a2a]' : 'text-slate-500'} />
              <span>[ 5. SQL 查询沙盒测试 ]</span>
            </button>
          </nav>
        </div>

        {/* 侧边栏底部状态指示器 */}
        <div className="p-4 border-t border-white/10 bg-[#070708]">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>TRINO 服务端</span>
            <span className="text-[#4af626] font-bold uppercase flex items-center">
              <Check size={8} className="mr-0.5 text-[#4af626]" /> 在线 / ONLINE
            </span>
          </div>
        </div>
      </aside>

      {/* 右侧主工作区 (太空控制台 Workspace) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050505] overflow-hidden relative">
        {/* 面板头部面包屑与标题 */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#070708] select-none z-10">
          <div className="flex flex-col">
            
            <h1 className="text-sm font-semibold tracking-tight text-slate-200 mt-1 uppercase font-mono">
              {activeTab === 'global_rules' && '/// 全局语义设定'}
              {activeTab === 'table_rules' && '/// 表级别语义设定'}
              {activeTab === 'field_rules' && '/// 表字段语义设定'}
              {activeTab === 'semantic_test' && '/// 语义生成测试'}
              {activeTab === 'sql_sandbox' && '/// SQL 查询沙盒测试'}
            </h1>
          </div>
 
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowDatasourceSettings(true)}
              className="px-3 py-1.5 text-[10px] font-mono border border-emerald-500 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 transition-all cursor-pointer font-bold"
            >
              [ 数据源配置 / DATASOURCES ]
            </button>
            <button 
              onClick={() => setShowScenarioSettings(true)}
              className="px-3 py-1.5 text-[10px] font-mono border border-[#ff2a2a] text-[#ff2a2a] bg-[#ff2a2a]/5 hover:bg-[#ff2a2a]/15 transition-all cursor-pointer font-bold"
            >
              [ 业务场景定义 / SCENARIOS ]
            </button>
          </div>
        </header>

        {/* 主工作区视图切换 */}
        <main className="flex-1 overflow-hidden relative bg-[#050505]">

        {/* 场景未选定空状态保护 */}
        {!selectedScenario && (
          <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8 bg-[#050505] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-1 rounded-[1.5rem] bg-[#0c0c0e] border border-white/10 max-w-md w-full shadow-lg shadow-emerald-500/2">
              <div className="bg-[#050505] rounded-[calc(1.5rem-0.25rem)] p-8 border border-white/5 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                  <Sliders size={20} />
                </div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 mb-2 font-bold animate-pulse">未选定分析场景 / No Active Scenario</h3>
                <p className="text-xs text-slate-500 mb-6 max-w-xs leading-relaxed">
                  语义层设计与沙盒调试必须基于特定的业务场景。请在左侧侧边栏中选择一个已激活的分析场景，或前往“分析场景定义”创建新场景。
                </p>
                <button
                  onClick={() => {
                    setShowScenarioSettings(true);
                    setSettingsSubTab('scenarios');
                  }}
                  className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[10px] tracking-wider uppercase transition-all duration-300 cursor-pointer active:scale-[0.98] shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20"
                >
                  去配置业务场景
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. 全局语义设定 */}
        {activeTab === 'global_rules' && selectedScenario && (
          <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950 p-6 font-mono text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-1.5 font-mono">
                  <Code size={14} className="text-[#ff2a2a]" />
                  <span>场景全局规则与提示注意事项 / GLOBAL PROMPT RULES</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">设置场景级别的全局性提示词与业务规则，在生成 Prompt 时会被直接注入到大模型输入中。</p>
              </div>
              <button 
                onClick={saveGlobalRulesOnly}
                disabled={isRulesSaving}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-5 py-2 rounded-md flex items-center space-x-1 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
              >
                {isRulesSaving ? <ArrowCounterClockwise size={12} className="animate-spin" /> : <Check size={12} />}
                <span>保存全局规则</span>
              </button>
            </div>
            <div className="flex-1">
              <textarea 
                rows={18}
                value={activeScenarioRules}
                onChange={e => setActiveScenarioRules(e.target.value)}
                placeholder="例如：&#10;1. 金额计算公式统一使用 price * qty - discount。&#10;2. 所有日期字段在过滤时若未指定年份，默认限制在当前自然年。&#10;3. 查询销售额时，必须乘以汇率系数 7.1。"
                className="w-full h-full bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] focus:ring-1 focus:ring-[#ff2a2a] rounded-none p-4 text-xs text-slate-200 leading-relaxed resize-none font-mono outline-none transition-all placeholder-slate-650"
              />
            </div>
          </div>
        )}

        {/* 2. 表级别语义设定 */}
        {activeTab === 'table_rules' && selectedScenario && (
          <div className="grid grid-cols-12 h-full overflow-hidden">
            {/* 左侧：物理表列表 */}
            <div className="col-span-3 border-r border-slate-800 h-full flex flex-col overflow-y-auto p-4 select-none bg-slate-900/40">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center space-x-1.5">
                <Database size={14} />
                <span>物理表结构目录树</span>
              </h3>
              <div className="space-y-2">
                {dbTree.length === 0 ? (
                  <div className="text-[10px] font-mono text-slate-500 italic py-2">暂无场景绑定的表，请在场景配置中选择。</div>
                ) : (
                  dbTree.map(catNode => (
                    <div key={catNode.catalog}>
                      <div 
                        onClick={() => setExpandedNodes({ ...expandedNodes, [catNode.catalog]: !expandedNodes[catNode.catalog] })}
                        className="flex items-center space-x-1 text-xs text-slate-350 hover:text-slate-100 cursor-pointer font-semibold py-1 rounded hover:bg-slate-800/40 px-1"
                      >
                        {expandedNodes[catNode.catalog] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        <Database size={12} className="text-emerald-500" />
                        <span>{catNode.catalog}</span>
                      </div>

                      {expandedNodes[catNode.catalog] && (
                        <div className="pl-4 border-l border-slate-800/60 ml-2.5 mt-1 space-y-1">
                          {catNode.schemas.map((schNode: any) => {
                            const key = `${catNode.catalog}.${schNode.name}`;
                            return (
                              <div key={schNode.name}>
                                <div 
                                  onClick={() => setExpandedNodes({ ...expandedNodes, [key]: !expandedNodes[key] })}
                                  className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer py-1 px-1 rounded hover:bg-slate-800/30"
                                >
                                  {expandedNodes[key] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                                  <span>{schNode.name}</span>
                                </div>

                                {expandedNodes[key] && (
                                  <div className="pl-4 border-l border-slate-800/40 ml-2 mt-1 space-y-0.5">
                                    {schNode.tables.map((tName: string) => {
                                      const isSelected = activeTable?.catalog === catNode.catalog && activeTable?.schema === schNode.name && activeTable?.table === tName;
                                      return (
                                        <div 
                                          key={tName}
                                          onClick={() => handleTableClick(catNode.catalog, schNode.name, tName)}
                                          className={`flex items-center space-x-1.5 text-xs cursor-pointer py-1 px-2 rounded font-mono transition-colors ${isSelected ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'}`}
                                        >
                                          <TableIcon size={12} />
                                          <span>{tName}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：表描述编辑区 */}
            <div className="col-span-9 h-full flex flex-col overflow-hidden bg-slate-950">
              {activeTable ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/40">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none">Table Semantic Setting</span>
                      <h2 className="text-sm font-mono text-emerald-400 font-bold mt-0.5">{activeTable.catalog}.{activeTable.schema}.{activeTable.table}</h2>
                    </div>
                    <button 
                      onClick={saveSemantics}
                      disabled={isSemanticsSaving}
                      className="bg-[#ff2a2a] hover:bg-[#ff4d4d] text-black text-xs font-bold px-4 py-1.5 rounded-md flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      {isSemanticsSaving ? <ArrowCounterClockwise size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>保存表级别语义描述</span>
                    </button>
                  </div>

                  <div className="flex-1 p-6 space-y-4 font-mono text-xs">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-400 uppercase font-bold">物理表路径</label>
                      <input 
                        type="text" 
                        readOnly 
                        value={`${activeTable.catalog}.${activeTable.schema}.${activeTable.table}`} 
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-400 font-mono disabled:opacity-50" 
                        disabled
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] text-[#ff2a2a] uppercase font-bold">表业务描述修正 / TABLE CUSTOM DESCRIPTION</label>
                      <textarea 
                        rows={8}
                        value={activeTableDesc} 
                        onChange={e => setActiveTableDesc(e.target.value)}
                        placeholder="请输入为此场景定制的表级别业务语义描述，例如：此表包含财务分析所涉及的年度运营总支出数据，在进行成本统计时优先从该表取数。"
                        className="w-full bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] focus:ring-1 focus:ring-[#ff2a2a] rounded-none p-3 text-xs text-slate-200 font-mono leading-relaxed outline-none transition-all placeholder-slate-650"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
                    <TableIcon size={20} />
                  </div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 font-bold">未选定物理表</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    请在左侧物理表目录树中点击一张表，为其配置表级别的业务描述修正。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. 表字段语义设定 */}
        {activeTab === 'field_rules' && selectedScenario && (
          <div className="grid grid-cols-12 h-full overflow-hidden">
            {/* 左侧：物理表列表 */}
            <div className="col-span-3 border-r border-slate-800 h-full flex flex-col overflow-y-auto p-4 select-none bg-slate-900/40">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center space-x-1.5">
                <Database size={14} />
                <span>物理表结构目录树</span>
              </h3>
              <div className="space-y-2">
                {dbTree.length === 0 ? (
                  <div className="text-[10px] font-mono text-slate-500 italic py-2">暂无场景绑定的表，请在场景配置中选择。</div>
                ) : (
                  dbTree.map(catNode => (
                    <div key={catNode.catalog}>
                      <div 
                        onClick={() => setExpandedNodes({ ...expandedNodes, [catNode.catalog]: !expandedNodes[catNode.catalog] })}
                        className="flex items-center space-x-1 text-xs text-slate-350 hover:text-slate-100 cursor-pointer font-semibold py-1 rounded hover:bg-slate-800/40 px-1"
                      >
                        {expandedNodes[catNode.catalog] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        <Database size={12} className="text-emerald-500" />
                        <span>{catNode.catalog}</span>
                      </div>

                      {expandedNodes[catNode.catalog] && (
                        <div className="pl-4 border-l border-slate-800/60 ml-2.5 mt-1 space-y-1">
                          {catNode.schemas.map((schNode: any) => {
                            const key = `${catNode.catalog}.${schNode.name}`;
                            return (
                              <div key={schNode.name}>
                                <div 
                                  onClick={() => setExpandedNodes({ ...expandedNodes, [key]: !expandedNodes[key] })}
                                  className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer py-1 px-1 rounded hover:bg-slate-800/30"
                                >
                                  {expandedNodes[key] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                                  <span>{schNode.name}</span>
                                </div>

                                {expandedNodes[key] && (
                                  <div className="pl-4 border-l border-slate-800/40 ml-2 mt-1 space-y-0.5">
                                    {schNode.tables.map((tName: string) => {
                                      const isSelected = activeTable?.catalog === catNode.catalog && activeTable?.schema === schNode.name && activeTable?.table === tName;
                                      return (
                                        <div 
                                          key={tName}
                                          onClick={() => handleTableClick(catNode.catalog, schNode.name, tName)}
                                          className={`flex items-center space-x-1.5 text-xs cursor-pointer py-1 px-2 rounded font-mono transition-colors ${isSelected ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'}`}
                                        >
                                          <TableIcon size={12} />
                                          <span>{tName}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：字段编辑网格 */}
            <div className="col-span-9 h-full flex flex-col overflow-hidden bg-slate-950">
              {activeTable ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/40">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none">Field Semantic Setting</span>
                      <h2 className="text-sm font-mono text-emerald-400 font-bold mt-0.5">{activeTable.catalog}.{activeTable.schema}.{activeTable.table}</h2>
                    </div>
                    <button 
                      onClick={saveSemantics}
                      disabled={isSemanticsSaving}
                      className="bg-[#ff2a2a] hover:bg-[#ff4d4d] text-black text-xs font-bold px-4 py-1.5 rounded-md flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      {isSemanticsSaving ? <ArrowCounterClockwise size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>保存字段语义配置</span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5 font-mono">
                      <Sliders size={14} />
                      <span>物理字段语义配置</span>
                    </h3>
                    
                    <div className="space-y-3">
                      {semanticFields.map((field, index) => (
                        <div 
                          key={field.column_name} 
                          className="border border-slate-800 rounded-md p-4 bg-slate-900/40 font-mono text-xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between font-mono">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs font-bold text-slate-200">{field.column_name}</span>
                              <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 border border-slate-850">{field.physical_type}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">
                              原始物理注释: <span className="text-slate-400">{field.physical_comment || '无'}</span>
                            </span>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase text-[#ff2a2a] mb-1 font-bold font-mono">语义修正描述 / CUSTOM DESCRIPTION</label>
                            <input 
                              type="text" 
                              value={field.description} 
                              onChange={e => handleFieldChange(index, e.target.value)}
                              placeholder="选填。输入自定义的字段语义描述修正，可纠正或补充物理注释不准确之处..."
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-[#ff2a2a] font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
                    <TableIcon size={20} />
                  </div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2 font-bold">未选定物理表</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    请在左侧物理表目录树中点击一张表，开始配置其字段语义。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. 语义生成测试 */}
        {activeTab === 'semantic_test' && selectedScenario && (
          <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950/40 p-4 font-mono text-xs">
            {/* 顶栏：显示说明 */}
            <div className="flex items-center justify-between px-4 py-3 border border-slate-800 bg-[#0c0c0f] mb-4">
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 font-bold">活跃测试场景:</span>
                <span className="text-emerald-400 font-bold uppercase font-mono">
                  {scenarios.find(s => s.code === selectedScenario)?.name || selectedScenario}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">SEMANTIC GENERATION PLAYGROUND</span>
            </div>

            {/* Prompt 显示面板 */}
            <div className="flex-1 overflow-y-auto border border-slate-800 bg-[#070709] p-5 space-y-4 mb-4">
              {!testGeneratedPrompt ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-2">
                  <Terminal size={24} className="text-slate-650" />
                  <span className="text-xs max-w-sm leading-relaxed">在下方输入您的自然语言问数，系统将组装当前场景下的完整 LLM 提示词 (Prompt)。生成结果会在这里覆盖展示，可直接复制提供给大模型生成 SQL。</span>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-1">
                    <span className="font-bold uppercase text-[10px] text-emerald-400">
                      /// ASSEMBLED COMPATIBLE PROMPT
                    </span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(testGeneratedPrompt);
                        customAlert("Prompt 已成功复制到剪贴板！", "/// 复制成功");
                      }}
                      className="text-[9px] text-[#ff2a2a] hover:underline font-bold"
                    >
                      [ 复制 PROMPT ]
                    </button>
                  </div>
                  <pre className="bg-[#050507] text-[#eaeaea] p-4 border border-slate-850 rounded font-mono text-[11px] whitespace-pre-wrap leading-relaxed select-text overflow-y-auto max-h-[60vh]">
                    {testGeneratedPrompt}
                  </pre>
                </div>
              )}

              {isGeneratingPrompt && (
                <div className="text-slate-600 flex items-center space-x-2 animate-pulse font-mono">
                  <ArrowCounterClockwise className="animate-spin" size={12} />
                  <span>正在匹配场景并检索元数据组装 Prompt 提示词...</span>
                </div>
              )}
            </div>

            {/* 输入发送控制台 */}
            <div className="border border-slate-800 bg-[#0c0c0f] p-4 flex flex-col space-y-2">
              <form onSubmit={handleGeneratePromptSubmit} className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="输入分析提问，例如：查询今年Nike品牌订单数量..."
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)}
                  className="flex-1 bg-[#050507] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-[#ff2a2a] outline-none"
                />
                
                {/* 格式选择下拉菜单 */}
                <div className="relative shrink-0 flex items-center">
                  <select
                    value={promptFormat}
                    onChange={e => setPromptFormat(e.target.value as 'markdown' | 'json')}
                    className="bg-[#050507] border border-slate-800 text-xs text-[#eaeaea] font-mono px-3 py-2 pr-8 focus:border-[#ff2a2a] cursor-pointer appearance-none rounded outline-none h-full"
                  >
                    <option value="markdown">Markdown (默认表格)</option>
                    <option value="json">JSON (树状原始数据)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-500">
                    <CaretDown size={12} />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isGeneratingPrompt}
                  className="bg-[#ff2a2a] hover:bg-[#ff4d4d] text-black px-5 py-2 rounded font-bold transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 shrink-0"
                >
                  <Play size={12} weight="fill" />
                  <span>生成 Prompt</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 5. SQL 查询沙盒测试 */}
        {activeTab === 'sql_sandbox' && selectedScenario && (
          <div className="w-full h-full flex flex-col overflow-hidden bg-slate-950 p-4 font-mono text-xs space-y-4">
            {/* 上半部分：SQL 编辑面板 */}
            <div className="flex flex-col border border-slate-800 bg-[#0c0c0f] p-4 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Terminal size={14} className="text-[#ff2a2a]" />
                  <span className="font-bold text-slate-300">Trino SQL 编辑器 (执行将自动限制 10 行)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={handleFormatSqlSandbox}
                    className="border border-slate-700 hover:border-slate-500 text-slate-300 text-[10px] font-bold px-3 py-1 rounded transition-all cursor-pointer"
                  >
                    格式化 SQL
                  </button>
                  <button 
                    onClick={handleExecuteSqlSandbox}
                    disabled={sqlExecuting}
                    className="bg-[#ff2a2a] hover:bg-[#ff4d4d] text-black text-[10px] font-bold px-4 py-1 rounded flex items-center space-x-1 transition-all cursor-pointer shadow-md shadow-red-500/10"
                  >
                    {sqlExecuting ? <ArrowCounterClockwise size={10} className="animate-spin" /> : <Play size={10} weight="fill" />}
                    <span>执行查询</span>
                  </button>
                </div>
              </div>
              <textarea 
                rows={6}
                value={sqlSandboxInput}
                onChange={e => setSqlSandboxInput(e.target.value)}
                placeholder="在此编写符合 Trino SQL 语法的 SELECT 语句，表名需包含完整前缀，例如:&#10;SELECT * FROM mysql.mysql_db.brands LIMIT 5;"
                className="w-full bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] focus:ring-1 focus:ring-[#ff2a2a] rounded-none p-3 text-xs text-slate-200 font-mono leading-relaxed resize-y outline-none transition-all placeholder-slate-650"
              />
            </div>

            {/* 下半部分：执行结果面板 */}
            <div className="flex-1 flex flex-col border border-slate-800 bg-[#070709] overflow-hidden min-h-0">
              <div className="px-4 py-2 border-b border-slate-850 bg-[#0c0c0f] flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-slate-500 tracking-wider">EXECUTION RESULT</span>
                {sqlResult && (
                  <span className="text-[9px] text-emerald-400 font-bold">返回行数: {sqlResult.rows.length} 行</span>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4 min-h-0">
                {sqlExecuting && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 animate-pulse">
                    <ArrowCounterClockwise size={24} className="animate-spin text-slate-650" />
                    <span className="text-xs">正在执行 Trino 联邦 SQL 查询，请稍候...</span>
                  </div>
                )}

                {sqlError && (
                  <div className="border border-red-900/50 bg-red-950/20 text-red-400 p-4 rounded font-mono text-xs space-y-2">
                    <div className="flex items-center space-x-1.5 font-bold">
                      <Warning size={14} />
                      <span>查询执行失败 / QUERY ERROR</span>
                    </div>
                    <pre className="whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px] opacity-90 pl-5">
                      {sqlError}
                    </pre>
                  </div>
                )}

                {!sqlExecuting && !sqlError && !sqlResult && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center">
                    <span className="text-xs">在上方输入 SQL 语句并点击“执行查询”按钮获取查询结果。</span>
                  </div>
                )}

                {!sqlExecuting && !sqlError && sqlResult && (
                  <div className="overflow-x-auto border border-slate-850 rounded">
                    <table className="w-full text-left border-collapse font-mono text-[11px] select-text">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-850 text-slate-400">
                          {sqlResult.columns.map((col: any) => (
                            <th key={col.name} className="px-4 py-2 border-r border-slate-850 font-bold whitespace-nowrap">
                              {col.name}
                              <span className="text-[9px] text-slate-600 ml-1 font-normal uppercase">({col.type})</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300">
                        {sqlResult.rows.length === 0 ? (
                          <tr>
                            <td colSpan={sqlResult.columns.length} className="px-4 py-8 text-center text-slate-500 italic">
                              查询结果集为空 (0 rows)
                            </td>
                          </tr>
                        ) : (
                          sqlResult.rows.map((row: any[], rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-slate-900/40 odd:bg-slate-950/20">
                              {row.map((cell: any, cIdx: number) => (
                                <td key={cIdx} className="px-4 py-2 border-r border-slate-850 whitespace-nowrap">
                                  {cell === null ? (
                                    <span className="text-slate-650 italic">NULL</span>
                                  ) : typeof cell === 'object' ? (
                                    JSON.stringify(cell)
                                  ) : (
                                    String(cell)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 全局系统配置终端 Modal (工业蓝图 style) */}
      {/* 1. 物理数据源配置 Modal */}
      {showDatasourceSettings && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8">
          <div className="w-full max-w-5xl h-[85vh] bg-[#0c0c0f] border border-white/20 flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0a0a0c]">
              <span className="text-xs font-mono font-bold tracking-[0.2em] text-emerald-400">[ 物理数据源挂载控制台 / DATASOURCES ]</span>
              <button 
                onClick={() => setShowDatasourceSettings(false)}
                className="text-xs font-mono text-[#ff2a2a] hover:text-white border border-[#ff2a2a]/20 px-3 py-1 cursor-pointer hover:bg-[#ff2a2a]/10"
              >
                [ 关闭配置终端 / CLOSE ]
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-hidden bg-[#0c0c0f]">
              <div className="grid grid-cols-2 h-full divide-x divide-white/10">
                {/* Left: Registered Catalogs */}
                <div className="p-6 overflow-y-auto">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2 font-mono">
                    <span>&gt;&gt;&gt; 已注册的物理数据库 CATALOG 列表</span>
                  </h2>
                  <div className="space-y-3">
                    {datasources.map(ds => (
                      <div key={ds.name} className="bg-[#121215] border border-white/5 p-4 flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between space-x-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-slate-100 font-mono">{ds.name.toUpperCase()}</span>
                              <span className="text-[10px] font-mono text-[#ff2a2a] border border-[#ff2a2a]/30 bg-[#ff2a2a]/5 px-1.5 py-0.5 uppercase">{ds.connector}</span>
                            </div>
                            <div className="mt-2 text-[11px] font-mono text-slate-500 space-y-1 break-all">
                              {Object.entries(ds.properties).map(([k, v]) => (
                                <div key={k}><span className="text-slate-400">{k}:</span> {String(v)}</div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5 border border-[#4af626]/20 bg-[#4af626]/5 text-[#4af626] px-2 py-0.5 text-[9px] font-mono font-bold uppercase whitespace-nowrap">
                            <Check size={8} />
                            <span>已连接 / CONNECTED</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end space-x-2 pt-2.5 border-t border-white/5">
                          <button
                            onClick={() => startEditDatasource(ds)}
                            className="flex items-center space-x-1 text-[10px] font-mono text-slate-350 hover:text-emerald-400 cursor-pointer border border-white/10 hover:border-emerald-500/30 bg-white/5 hover:bg-emerald-500/5 px-2.5 py-1 transition-all duration-150 whitespace-nowrap"
                            title="编辑物理数据源"
                          >
                            <PencilSimple size={11} />
                            <span>编辑 / EDIT</span>
                          </button>
                          <button
                            onClick={() => handleDeleteDatasource(ds.name)}
                            className="flex items-center space-x-1 text-[10px] font-mono text-rose-500 hover:text-rose-450 cursor-pointer border border-rose-500/20 hover:border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 px-2.5 py-1 transition-all duration-150 whitespace-nowrap"
                            title="卸载物理数据源"
                          >
                            <Trash size={11} />
                            <span>卸载 / UNMOUNT</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Right: Mount Form */}
                <div className="p-6 overflow-y-auto bg-[#0a0a0c]/40">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2 font-mono">
                    <span>{isEditingDs ? `>>> 编辑物理数据源 CATALOG: ${editingDsName}` : '>>> 热挂载新物理数据源 CATALOG'}</span>
                  </h2>
                  <form onSubmit={handleDsSubmit} className="space-y-4 max-w-lg font-mono text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">物理库名称 / CATALOG_NAME (仅限小写字母及下划线)</label>
                      <input 
                        type="text" 
                        required 
                        readOnly={isEditingDs}
                        placeholder="oracle_db, mysql_replica"
                        value={dsForm.name} 
                        onChange={e => setDsForm({ ...dsForm, name: e.target.value.toLowerCase() })}
                        className={`w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650 ${isEditingDs ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">物理连接器类型 / CONNECTOR_TYPE</label>
                      <select 
                        value={dsForm.connector} 
                        onChange={e => {
                          const val = e.target.value;
                          setDsForm({
                            ...dsForm,
                            connector: val,
                            port: val === 'mysql' ? '3306' : '5432',
                            user: val === 'mysql' ? 'root' : 'postgres',
                            password: val === 'mysql' ? 'root' : 'postgres',
                            database: val === 'mysql' ? '' : 'postgres'
                          });
                        }}
                        className="w-full p-2 bg-[#050507] border border-white/15 text-xs text-[#eaeaea] font-mono p-1.5 focus:border-[#ff2a2a] cursor-pointer"
                      >
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                      </select>
                    </div>
                    
                    {(dsForm.connector === 'postgresql' || dsForm.connector === 'mysql') && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-[10px] text-slate-400 mb-1">主机名或IP地址 / HOST_IP</label>
                          <input 
                            type="text" 
                            required
                            value={dsForm.host} 
                            onChange={e => setDsForm({ ...dsForm, host: e.target.value })}
                            className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">物理端口 / PORT</label>
                          <input 
                            type="text" 
                            required
                            value={dsForm.port} 
                            onChange={e => setDsForm({ ...dsForm, port: e.target.value })}
                            className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650"
                          />
                        </div>
                      </div>
                    )}

                    {(dsForm.connector === 'postgresql' || dsForm.connector === 'mysql') && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">数据库用户名 / DB_USER</label>
                          <input 
                            type="text" 
                            required
                            value={dsForm.user} 
                            onChange={e => setDsForm({ ...dsForm, user: e.target.value })}
                            className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1">数据库密码 / DB_PASSWORD</label>
                          <input 
                            type="password" 
                            value={dsForm.password} 
                            onChange={e => setDsForm({ ...dsForm, password: e.target.value })}
                            className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-250 outline-none rounded-none font-mono placeholder-slate-650"
                          />
                        </div>
                      </div>
                    )}

                    {(dsForm.connector === 'postgresql' || dsForm.connector === 'mysql') && (
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {dsForm.connector === 'postgresql' ? '目标数据库名 / DB_NAME' : '目标数据库名 (可选，留空则拉取所有库) / DB_NAME'}
                        </label>
                        <input 
                          type="text" 
                          required={dsForm.connector === 'postgresql'}
                          value={dsForm.database} 
                          onChange={e => setDsForm({ ...dsForm, database: e.target.value })}
                          className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650"
                        />
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <button 
                        type="submit" 
                        disabled={isDsSubmitting}
                        className="flex-1 bg-[#ff2a2a] text-black font-bold text-xs py-2 hover:bg-[#ff4d4d] cursor-pointer flex items-center justify-center space-x-1"
                      >
                        {isDsSubmitting ? <ArrowCounterClockwise className="animate-spin" size={12} /> : <Check size={12} />}
                        <span>{isDsSubmitting ? '正在提交...' : (isEditingDs ? '确认保存修改' : '确认热挂载新物理数据源')}</span>
                      </button>
                      {isEditingDs && (
                        <button 
                          type="button"
                          onClick={cancelEditDatasource}
                          className="bg-transparent text-slate-400 border border-white/10 font-bold text-xs px-4 py-2 hover:text-white hover:border-white/20 cursor-pointer"
                        >
                          取消编辑
                        </button>
                      )}
                    </div>
                    
                    {dsStatusMsg && (
                      <div className={`p-3 border text-[11px] font-mono flex items-start space-x-2 ${dsStatusMsg.type === 'success' ? 'bg-[#4af626]/10 border-[#4af626]/30 text-[#4af626]' : 'bg-[#ff2a2a]/10 border-[#ff2a2a]/30 text-[#ff2a2a]'}`}>
                        <Warning size={12} className="mt-0.5" />
                        <span>{dsStatusMsg.text}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. 业务场景定义 Modal */}
      {showScenarioSettings && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8">
          <div className="w-full max-w-5xl h-[85vh] bg-[#0c0c0f] border border-white/20 flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0a0a0c]">
              <span className="text-xs font-mono font-bold tracking-[0.2em] text-[#ff2a2a]">[ 业务场景定义与授权终端 / SCENARIOS ]</span>
              <button 
                onClick={() => setShowScenarioSettings(false)}
                className="text-xs font-mono text-[#ff2a2a] hover:text-white border border-[#ff2a2a]/20 px-3 py-1 cursor-pointer hover:bg-[#ff2a2a]/10"
              >
                [ 关闭配置终端 / CLOSE ]
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-hidden bg-[#0c0c0f]">
              <div className="grid grid-cols-2 h-full divide-x divide-white/10">
                {/* Left: Scenarios List */}
                <div className="p-6 overflow-y-auto">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2 font-mono">
                    <span>&gt;&gt;&gt; 已激活的分析场景资源列表</span>
                  </h2>
                  <div className="space-y-4">
                    {scenarios.map(sc => (
                      <div key={sc.code} className="bg-[#121215] border border-white/5 p-4 hover:border-[#ff2a2a]/40 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-100 font-mono">{sc.name.toUpperCase()}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-[#ff2a2a] bg-[#ff2a2a]/10 border border-[#ff2a2a]/20 px-1.5 py-0.5">{sc.code.toUpperCase()}</span>
                            <button 
                              onClick={() => startEditScenario(sc)}
                              className="p-1 text-slate-400 hover:text-[#ff2a2a] border border-transparent hover:border-white/10 cursor-pointer"
                              title="编辑"
                            >
                              <PencilSimple size={12} />
                            </button>
                            <button 
                              onClick={() => handleDeleteScenario(sc.code)}
                              className="p-1 text-slate-400 hover:text-[#ff2a2a] border border-transparent hover:border-white/10 cursor-pointer"
                              title="删除"
                            >
                              <Trash size={12} />
                            </button>
                          </div>
                        </div>

                        
                        <div className="mt-3 flex flex-wrap gap-1 pt-3 border-t border-white/5">
                          {sc.catalogs.map((cat: string) => (
                            <span key={cat} className="text-[9px] font-mono border border-white/10 text-slate-300 px-2 py-0.5">{cat}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Right: Scenario Form */}
                <div className="p-6 overflow-y-auto bg-[#0a0a0c]/40">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2 font-mono">
                    <span>&gt;&gt;&gt; {isEditingScenario ? '编辑业务场景属性' : '定义并创建新分析场景'}</span>
                  </h2>
                  <form onSubmit={handleScSubmit} className="space-y-4 max-w-lg font-mono text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">场景唯一编码 / SCENARIO_CODE (英文主键)</label>
                      <input 
                        type="text" 
                        required 
                        disabled={isEditingScenario}
                        placeholder="supply_chain, hr"
                        value={scForm.code} 
                        onChange={e => setScForm({ ...scForm, code: e.target.value.toLowerCase() })}
                        className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 disabled:opacity-40 outline-none rounded-none font-mono"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">场景中文名称 / SCENARIO_NAME</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="例如: 供应链运营分析"
                        value={scForm.name} 
                        onChange={e => setScForm({ ...scForm, name: e.target.value })}
                        className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono"
                      />
                    </div>



                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">场景大模型生成规则与注意事项 / GLOBAL PROMPT RULES</label>
                      <textarea 
                        rows={4}
                        placeholder="例如: 1. 金额计算公式统一为 price * qty - discount. 2. 查询默认使用当前年份..."
                        value={scForm.global_rules} 
                        onChange={e => setScForm({ ...scForm, global_rules: e.target.value })}
                        className="w-full p-2 bg-[#070709] border border-slate-800 focus:border-[#ff2a2a] text-slate-200 outline-none rounded-none font-mono placeholder-slate-650"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-2">配置场景数据访问范围 / SELECT CATALOGS & TABLES (树形勾选)</label>
                      <div className="space-y-3 max-h-80 overflow-y-auto border border-white/10 p-3 bg-[#050507]">
                        {availableTree.length === 0 ? (
                          <div className="text-[10px] font-mono text-slate-500 italic py-2">暂无可用数据源，请确保至少成功挂载一个 Catalog。</div>
                        ) : (
                          availableTree.map(catNode => {
                            const catChecked = scForm.catalogs.includes(catNode.catalog);
                            return (
                              <div key={catNode.catalog} className="space-y-1">
                                {/* Catalog Level */}
                                <div 
                                  onClick={() => {
                                    const nextCats = catChecked
                                      ? scForm.catalogs.filter(c => c !== catNode.catalog)
                                      : [...scForm.catalogs, catNode.catalog];
                                    
                                    let nextTables = scForm.tables;
                                    if (catChecked) {
                                      nextTables = scForm.tables.filter(t => !t.startsWith(catNode.catalog + '.'));
                                    }

                                    setScForm(prev => ({
                                      ...prev,
                                      catalogs: nextCats,
                                      tables: nextTables
                                    }));
                                  }}
                                  className="flex items-center space-x-2 cursor-pointer select-none py-1 group"
                                >
                                  <div className={`w-3.5 h-3.5 border transition-colors flex items-center justify-center ${catChecked ? 'border-[#ff2a2a] bg-[#ff2a2a]/15 text-[#ff2a2a]' : 'border-white/20 bg-transparent text-transparent group-hover:border-white/40'}`}>
                                    {catChecked && <Check size={10} weight="bold" />}
                                  </div>
                                  <Database size={12} className="text-emerald-500" />
                                  <span className={`font-bold transition-colors ${catChecked ? 'text-white' : 'text-slate-400 group-hover:text-slate-355'}`}>{catNode.catalog.toUpperCase()}</span>
                                  <span className="text-[9px] text-slate-500 font-mono">({catNode.connector})</span>
                                </div>

                                {/* Schemas / Tables Levels */}
                                {catChecked && (
                                  <div className="pl-4 border-l border-white/5 ml-1.5 space-y-2">
                                    {catNode.schemas.map((sch: any) => (
                                      <div key={sch.name} className="space-y-1">
                                        <div className="flex items-center space-x-1.5 py-0.5 text-slate-400">
                                          <FolderIcon />
                                          <span className="text-[11px] font-semibold">{sch.name}</span>
                                        </div>

                                        <div className="pl-4 border-l border-white/5 ml-1.5 space-y-1">
                                          {sch.tables && sch.tables.map((tName: string) => {
                                            const fullPath = `${catNode.catalog}.${sch.name}.${tName}`;
                                            const tblChecked = scForm.tables.includes(fullPath);
                                            return (
                                              <div 
                                                key={tName}
                                                onClick={() => {
                                                  const nextTables = tblChecked
                                                    ? scForm.tables.filter(t => t !== fullPath)
                                                    : [...scForm.tables, fullPath];
                                                  setScForm(prev => ({ ...prev, tables: nextTables }));
                                                }}
                                                className="flex items-center space-x-2 cursor-pointer select-none py-0.5 group"
                                              >
                                                <div className={`w-3 h-3 border transition-colors flex items-center justify-center ${tblChecked ? 'border-[#ff2a2a] bg-[#ff2a2a]/15 text-[#ff2a2a]' : 'border-white/20 bg-transparent text-transparent group-hover:border-white/40'}`}>
                                                  {tblChecked && <Check size={8} weight="bold" />}
                                                </div>
                                                <TableIcon size={10} className="text-slate-500" />
                                                <span className={`font-mono text-[11px] transition-colors ${tblChecked ? 'text-[#ff2a2a]' : 'text-slate-505 group-hover:text-slate-355'}`}>{tName}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button 
                        type="submit" 
                        className="flex-1 bg-[#ff2a2a] text-black font-bold text-xs py-2 hover:bg-[#ff4d4d] cursor-pointer flex items-center justify-center space-x-1"
                      >
                        <Check size={12} />
                        <span>{isEditingScenario ? '保存修改' : '创建分析场景'}</span>
                      </button>
                      {isEditingScenario && (
                        <button 
                          type="button"
                          onClick={cancelEditScenario}
                          className="px-4 py-2 bg-slate-800 text-slate-355 hover:bg-slate-700 cursor-pointer"
                        >
                          取消
                        </button>
                      )}
                    </div>
                    
                    {scStatusMsg && (
                      <div className={`p-3 border text-[11px] font-mono flex items-start space-x-2 ${scStatusMsg.type === 'success' ? 'bg-[#4af626]/10 border-[#4af626]/30 text-[#4af626]' : 'bg-[#ff2a2a]/10 border-[#ff2a2a]/30 text-[#ff2a2a]'}`}>
                        <Warning size={12} className="mt-0.5" />
                        <span>{scStatusMsg.text}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}{dialog && dialog.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs select-none">
          <div className="w-full max-w-md border-2 border-[#ff2a2a] bg-[#0c0c0f] font-mono text-xs shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#ff2a2a]/30 bg-[#14141a] px-4 py-2 text-[10px] font-bold text-[#ff2a2a] tracking-widest uppercase">
              <span>{dialog.title}</span>
              <Warning size={14} className="text-[#ff2a2a] animate-pulse" />
            </div>
            
            {/* Body */}
            <div className="p-6 text-slate-300 leading-relaxed border-b border-white/10 whitespace-pre-wrap select-text">
              {dialog.message}
            </div>
            
            {/* Footer / Action buttons */}
            <div className="flex items-center justify-end p-3 bg-[#070709] space-x-2">
              {dialog.type === 'confirm' ? (
                <>
                  <button 
                    onClick={() => dialog.onResolve(false)}
                    className="px-4 py-1.5 bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors font-bold cursor-pointer"
                  >
                    [ 取消 / CANCEL ]
                  </button>
                  <button 
                    onClick={() => dialog.onResolve(true)}
                    className="px-4 py-1.5 bg-[#ff2a2a] text-black hover:bg-[#ff4d4d] transition-colors font-bold cursor-pointer"
                  >
                    [ 确认 / CONFIRM ]
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => dialog.onResolve(true)}
                  className="px-6 py-1.5 bg-[#4af626] text-black hover:bg-[#6ef853] transition-colors font-bold cursor-pointer"
                >
                  [ 确认 / OK ]
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}

// 物理树自定义 Folder 图标，适配 tasteskill phosphor-icons
function FolderIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-1.5V9a3 3 0 00-3-3h-4.5a3 3 0 00-3 3v1.5H6A3 3 0 003 13.5V18a3 3 0 003 3h13.5zM12 9a1 1 0 011-1h4.5a1 1 0 011 1v1.5H12V9z"></path>
    </svg>
  );
}
