import React, { useState, useEffect, useCallback } from 'react';
import { PowerBIDesktopConnector } from '../../services/dataConnectors/PowerBIDesktopConnector';
import useVDTStore from '../../store/useVDTStore';

const connector = new PowerBIDesktopConnector();

/**
 * Power BI 连接向导弹窗
 * 4 步流程：代理检测 → 选择实例 → 字段映射 → 预览确认
 */
const PowerBIConnectModal = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: 代理状态
  const [proxyAvailable, setProxyAvailable] = useState(false);

  // Step 2: 实例列表
  const [instances, setInstances] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [connectedInfo, setConnectedInfo] = useState(null);

  // Step 3: 字段映射
  const [tables, setTables] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [mappingMode, setMappingMode] = useState('table'); // 'table' | 'dax'
  const [selectedTable, setSelectedTable] = useState('');
  const [tableFormat, setTableFormat] = useState('long'); // 'long' | 'wide'
  const [mapping, setMapping] = useState({
    nodeIdColumn: '',
    nodeNameColumn: '',
    periodColumn: '',
    dataTypeColumn: '',
    valueColumn: '',
    acColumn: '',
    fcColumn: '',
    buColumn: '',
    dax: ''
  });

  // Step 4: 预览
  const [previewData, setPreviewData] = useState(null);
  const [previewNodes, setPreviewNodes] = useState(null);

  const loadFromPowerBINew = useVDTStore(s => s.loadFromPowerBINew);
  const setPbiConfig = useVDTStore(s => s.setPbiConfig);

  // Step 1: 检查代理
  const checkProxy = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await connector.checkAvailability();
      setProxyAvailable(result.available);
      if (result.available) {
        setStep(2);
        await loadInstances();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError('检查代理状态失败: ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkProxy();
  }, [checkProxy]);

  // Step 2: 加载实例
  const loadInstances = async () => {
    setLoading(true);
    try {
      const list = await connector.discoverInstances();
      setInstances(list);
      if (list.length === 0) {
        setError('未发现运行中的 Power BI Desktop 实例，请先打开 .pbix 文件');
      }
    } catch (e) {
      setError('发现实例失败: ' + e.message);
    }
    setLoading(false);
  };

  const connectInstance = async (instance) => {
    setLoading(true);
    setError('');
    try {
      const result = await connector.connect({ instanceId: instance.id, port: instance.port });
      if (result.connected) {
        setConnectedInfo(result);
        setTables(result.tables || []);
        setMeasures(result.measures || []);
        setStep(3);
      } else {
        setError('连接失败: ' + (result.error || '未知错误'));
      }
    } catch (e) {
      setError('连接失败: ' + e.message);
    }
    setLoading(false);
  };

  // Step 3: 表选择变更时自动填充列映射
  const handleTableChange = (tableName) => {
    setSelectedTable(tableName);
    const table = tables.find(t => t.name === tableName);
    if (table && table.columns.length > 0) {
      const cols = table.columns.map(c => c.name);
      const guess = (keywords) => cols.find(c => keywords.some(k => c.toLowerCase().includes(k))) || '';
      // 自动检测表格格式：如果有 AC/FC/BU 列名则判定为宽表
      const hasAcCol = cols.some(c => /^ac$/i.test(c) || /actual/i.test(c));
      const hasFcCol = cols.some(c => /^fc$/i.test(c) || /forecast/i.test(c));
      const detectedWide = hasAcCol || hasFcCol;
      setTableFormat(detectedWide ? 'wide' : 'long');
      setMapping({
        nodeIdColumn: guess(['id', 'metricid', 'indicatorid', 'kpiid', '指标id']),
        nodeNameColumn: guess(['name', 'metricname', 'indicatorname', '指标名', '名称']),
        periodColumn: guess(['period', 'date', 'month', 'yearmonth', 'week', '期间', '月份', '日期']),
        dataTypeColumn: detectedWide ? '' : guess(['type', 'datatype', 'category', '属性', '类型']),
        valueColumn: detectedWide ? '' : guess(['value', 'amount', 'qty', '值', '金额']),
        acColumn: detectedWide ? guess(['ac', 'actual', '实际']) : '',
        fcColumn: detectedWide ? guess(['fc', 'forecast', '预测']) : '',
        buColumn: detectedWide ? guess(['bu', 'budget', '目标', '预算']) : '',
        dax: `EVALUATE '${tableName}'`
      });
    }
  };

  // Step 4: 预览数据
  const handlePreview = async () => {
    setLoading(true);
    setError('');
    try {
      const dax = mappingMode === 'dax' ? mapping.dax : `EVALUATE '${selectedTable}'`;
      const result = await connector.executeQuery(dax);
      setPreviewData(result);

      // 尝试转换为节点
      if (mapping.nodeIdColumn && mapping.periodColumn && (mapping.valueColumn || mapping.acColumn)) {
        const finalMapping = { ...mapping, dax, tableFormat };
        const nodes = await connector.fetchData(finalMapping);
        setPreviewNodes(nodes);
      }
      setStep(4);
    } catch (e) {
      setError('查询失败: ' + e.message);
    }
    setLoading(false);
  };

  // 确认导入
  const handleImport = async () => {
    if (!previewNodes || previewNodes.size === 0) {
      setError('没有可导入的数据');
      return;
    }
    setLoading(true);
    try {
      const result = loadFromPowerBINew(previewNodes);
      // 保存 PBI 连接配置，供后续刷新使用
      const dax = mappingMode === 'dax' ? mapping.dax : `EVALUATE '${selectedTable}'`;
      setPbiConfig({
        port: connectedInfo?.port,
        mapping: { ...mapping, dax, tableFormat },
        selectedTable,
        mappingMode,
        lastRefresh: Date.now()
      });
      alert(`导入成功！加载了 ${result.nodeCount} 个节点，时间维度: ${result.timeDimension}`);
      onClose();
    } catch (e) {
      setError('导入失败: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h2 className="text-lg font-bold">连接 Power BI</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center px-6 py-3 bg-gray-50 border-b">
          {['代理检测', '选择实例', '字段映射', '预览导入'].map((label, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className={`flex-1 h-0.5 mx-2 ${step > i ? 'bg-blue-500' : 'bg-gray-200'}`} />}
              <div className={`flex items-center gap-1.5 text-sm ${step > i ? 'text-blue-600' : step === i + 1 ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > i ? 'bg-blue-500 text-white' : step === i + 1 ? 'bg-blue-100 text-blue-600 border-2 border-blue-500' : 'bg-gray-200 text-gray-500'}`}>
                  {step > i ? '✓' : i + 1}
                </span>
                {label}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: 代理检测 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center py-8">
                {loading ? (
                  <div className="text-gray-500">正在检查代理服务...</div>
                ) : proxyAvailable ? (
                  <div className="text-green-600 text-lg">✅ 代理服务运行中</div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-gray-600">
                      <p className="text-lg mb-2">⚠️ 代理服务未启动</p>
                      <p className="text-sm">请先启动 <code className="bg-gray-100 px-1.5 py-0.5 rounded">pbi-proxy.exe</code></p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-left text-sm">
                      <p className="font-medium mb-2">使用说明：</p>
                      <ol className="list-decimal list-inside space-y-1 text-gray-600">
                        <li>找到 <code className="bg-gray-100 px-1">pbi-proxy.exe</code> 文件</li>
                        <li>双击运行（会在后台启动代理服务）</li>
                        <li>回到这里点击"重新检测"</li>
                      </ol>
                    </div>
                    <button onClick={checkProxy} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                      重新检测
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: 选择实例 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">选择要连接的 Power BI Desktop 实例：</p>
              {instances.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>未发现运行中的 Power BI Desktop</p>
                  <p className="text-sm mt-2">请先打开 .pbix 文件</p>
                  <button onClick={loadInstances} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    重新扫描
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {instances.map((inst) => (
                    <div
                      key={inst.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedInstance?.id === inst.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedInstance(inst)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{inst.pbixFileName || `PBI Desktop 实例`}</div>
                          <div className="text-sm text-gray-500">端口: {inst.port} | ID: {inst.id.slice(0, 8)}...</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); connectInstance(inst); }}
                          disabled={loading}
                          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
                        >
                          {loading ? '连接中...' : '连接'}
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={loadInstances} className="text-sm text-blue-500 hover:underline">
                    重新扫描
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: 字段映射 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
                ✅ 已连接到 {connectedInfo?.databaseName || 'Power BI Desktop'}
              </div>

              {/* 模式切换 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setMappingMode('table')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${mappingMode === 'table' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  选择表
                </button>
                <button
                  onClick={() => setMappingMode('dax')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${mappingMode === 'dax' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  自定义 DAX
                </button>
              </div>

              {mappingMode === 'table' ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">选择数据表</span>
                    <select
                      value={selectedTable}
                      onChange={(e) => handleTableChange(e.target.value)}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- 选择表 --</option>
                      {tables.map(t => (
                        <option key={t.name} value={t.name}>{t.name} ({t.columns.length} 列)</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">DAX 查询</span>
                  <textarea
                    value={mapping.dax}
                    onChange={(e) => setMapping(m => ({ ...m, dax: e.target.value }))}
                    rows={4}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="EVALUATE SUMMARIZECOLUMNS(...)"
                  />
                </label>
              )}

              {/* 列映射 */}
              {(selectedTable || mappingMode === 'dax') && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">列映射配置</p>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setTableFormat('long')}
                        className={`px-2.5 py-1 text-xs rounded-md ${tableFormat === 'long' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                      >
                        长表（属性在行）
                      </button>
                      <button
                        onClick={() => setTableFormat('wide')}
                        className={`px-2.5 py-1 text-xs rounded-md ${tableFormat === 'wide' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                      >
                        宽表（AC/FC/BU 各一列）
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">
                    {tableFormat === 'long'
                      ? '长表格式：指标ID, 指标名称, 属性(AC/FC/BU), 期间, 金额'
                      : '宽表格式：指标ID, 指标名称, 期间, AC, FC, BU'}
                  </div>
                  {(tableFormat === 'long'
                    ? [
                        { key: 'nodeIdColumn', label: '节点ID列', placeholder: '如 MetricID' },
                        { key: 'nodeNameColumn', label: '节点名称列', placeholder: '如 MetricName' },
                        { key: 'periodColumn', label: '时间期间列', placeholder: '如 YearMonth' },
                        { key: 'dataTypeColumn', label: '数据类型列 (AC/FC/BU)', placeholder: '如 DataType' },
                        { key: 'valueColumn', label: '值列', placeholder: '如 Value' },
                      ]
                    : [
                        { key: 'nodeIdColumn', label: '节点ID列', placeholder: '如 MetricID' },
                        { key: 'nodeNameColumn', label: '节点名称列', placeholder: '如 MetricName' },
                        { key: 'periodColumn', label: '时间期间列', placeholder: '如 YearMonth' },
                        { key: 'acColumn', label: 'AC（实际）列', placeholder: '如 AC' },
                        { key: 'fcColumn', label: 'FC（预测）列', placeholder: '如 FC' },
                        { key: 'buColumn', label: 'BU（目标）列', placeholder: '如 BU（可留空）' },
                      ]
                  ).map(({ key, label, placeholder }) => (
                    <label key={key} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-40 shrink-0">{label}</span>
                      {selectedTable && tables.find(t => t.name === selectedTable) ? (
                        <select
                          value={mapping[key]}
                          onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value }))}
                          className="flex-1 border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">-- 选择列 --</option>
                          {tables.find(t => t.name === selectedTable)?.columns.map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={mapping[key]}
                          onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="flex-1 border rounded px-2 py-1.5 text-sm"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: 预览确认 */}
          {step === 4 && (
            <div className="space-y-4">
              {previewNodes && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <span className="font-medium text-green-700">解析结果：</span>
                  <span className="text-green-600"> {previewNodes.size} 个节点</span>
                  {previewNodes.size > 0 && (() => {
                    const firstNode = previewNodes.values().next().value;
                    const periodCount = Object.keys(firstNode?.periods || {}).length;
                    return <span className="text-green-600"> | {periodCount} 个期间</span>;
                  })()}
                </div>
              )}

              {/* 节点预览列表 */}
              {previewNodes && previewNodes.size > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">节点ID</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">名称</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">类型</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">期间数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(previewNodes.entries()).slice(0, 20).map(([id, node]) => (
                        <tr key={id} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-xs">{id}</td>
                          <td className="px-3 py-1.5">{node.name}</td>
                          <td className="px-3 py-1.5">{node.type === 'computed' ? '计算' : '驱动'}</td>
                          <td className="px-3 py-1.5 text-right">{Object.keys(node.periods).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewNodes.size > 20 && (
                    <div className="px-3 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                      ... 共 {previewNodes.size} 个节点，仅显示前 20 个
                    </div>
                  )}
                </div>
              )}

              {/* 原始数据预览 */}
              {previewData && previewData.rows.length > 0 && (
                <details className="border rounded-lg">
                  <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm font-medium text-gray-600">
                    查看原始数据 ({previewData.rowCount} 行)
                  </summary>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {previewData.columns.map(col => (
                            <th key={col} className="text-left px-2 py-1 font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-t">
                            {previewData.columns.map(col => (
                              <td key={col} className="px-2 py-1">{String(row[col] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <button
            onClick={step > 1 ? () => setStep(s => s - 1) : onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {step > 1 ? '上一步' : '取消'}
          </button>
          <div className="flex gap-2">
            {step === 3 && (
              <button
                onClick={handlePreview}
                disabled={loading || (!mapping.dax && !selectedTable)}
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '查询中...' : '预览数据'}
              </button>
            )}
            {step === 4 && (
              <button
                onClick={handleImport}
                disabled={loading || !previewNodes || previewNodes.size === 0}
                className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? '导入中...' : `确认导入 (${previewNodes?.size || 0} 个节点)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PowerBIConnectModal;
