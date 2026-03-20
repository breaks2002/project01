import React, { useState, useMemo } from 'react';

/**
 * 节点选择器 - 用于 AI 调参时选择计算指标和驱动因子
 */
const NodeSelector = ({
  nodes,
  selectedMetrics = [],
  selectedDrivers = [],
  targetMetric = null,
  onChange,
  mode = 'auto'
}) => {
  const [searchMetrics, setSearchMetrics] = useState('');
  const [searchDrivers, setSearchDrivers] = useState('');
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [showDriversModal, setShowDriversModal] = useState(false);
  const [showDependencyModal, setShowDependencyModal] = useState(false); // 计算链弹窗
  const [nonModal, setNonModal] = useState(true); // 非模态模式

  // 面板显示阈值
  const PANEL_THRESHOLD = 6; // 超过 6 个节点时，使用弹窗模式（约 2 行）

  // 分类节点
  const { computedNodes, driverNodes } = useMemo(() => {
    const allNodes = Object.values(nodes);
    return {
      computedNodes: allNodes.filter(n => n.type === 'computed'),
      driverNodes: allNodes.filter(n => n.type === 'driver')
    };
  }, [nodes]);

  // 计算链分析
  const dependencyChain = useMemo(() => {
    if (!targetMetric) return [];
    const chain = [];
    const visited = new Set();

    const findDependencies = (nodeId, depth = 0) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes[nodeId];
      if (!node) return;

      if (depth > 0) {
        chain.push({ ...node, depth });
      }

      if (node.formula) {
        const deps = node.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];
        deps.forEach(depId => {
          const depNode = nodes[depId];
          if (depNode) {
            findDependencies(depId, depth + 1);
          }
        });
      }
    };

    findDependencies(targetMetric);
    return chain;
  }, [nodes, targetMetric]);

  // 搜索过滤
  const filteredComputedNodes = useMemo(() => {
    if (!searchMetrics) return computedNodes;
    const search = searchMetrics.toLowerCase();
    return computedNodes.filter(n =>
      n.name.toLowerCase().includes(search) ||
      n.id.toLowerCase().includes(search)
    );
  }, [computedNodes, searchMetrics]);

  const filteredDriverNodes = useMemo(() => {
    if (!searchDrivers) return driverNodes;
    const search = searchDrivers.toLowerCase();
    return driverNodes.filter(n =>
      n.name.toLowerCase().includes(search) ||
      n.id.toLowerCase().includes(search)
    );
  }, [driverNodes, searchDrivers]);

  // 处理指标选择
  const handleToggleMetric = (nodeId) => {
    const newMetrics = selectedMetrics.includes(nodeId)
      ? selectedMetrics.filter(id => id !== nodeId)
      : [...selectedMetrics, nodeId];
    onChange?.({ metrics: newMetrics, drivers: selectedDrivers, mode });
  };

  // 处理驱动因子选择
  const handleToggleDriver = (nodeId) => {
    const newDrivers = selectedDrivers.includes(nodeId)
      ? selectedDrivers.filter(id => id !== nodeId)
      : [...selectedDrivers, nodeId];
    onChange?.({ metrics: selectedMetrics, drivers: newDrivers, mode });
  };

  // 全选/取消全选
  const handleSelectAllMetrics = () => {
    const allIds = filteredComputedNodes.map(n => n.id);
    onChange?.({ metrics: allIds, drivers: selectedDrivers, mode });
  };

  const handleDeselectAllMetrics = () => {
    onChange?.({ metrics: [], drivers: selectedDrivers, mode });
  };

  const handleSelectAllDrivers = () => {
    const allIds = filteredDriverNodes.map(n => n.id);
    onChange?.({ metrics: selectedMetrics, drivers: allIds, mode });
  };

  const handleDeselectAllDrivers = () => {
    onChange?.({ metrics: selectedMetrics, drivers: [], mode });
  };

  // 一键添加推荐
  const handleAddRecommended = () => {
    const recommendedDrivers = dependencyChain
      .filter(n => n.type === 'driver')
      .map(n => n.id);

    const newDrivers = [...new Set([...selectedDrivers, ...recommendedDrivers])];
    onChange?.({ metrics: selectedMetrics, drivers: newDrivers, mode });
  };

  // 计算链显示限制
  const MAX_DEPENDENCY_DISPLAY = 10; // 最多显示 10 个依赖节点
  const displayedDependencyChain = dependencyChain.slice(0, MAX_DEPENDENCY_DISPLAY);
  const hasMoreDependencies = dependencyChain.length > MAX_DEPENDENCY_DISPLAY;

  // 计算链分类统计
  const dependencyChainStats = useMemo(() => {
    const computed = dependencyChain.filter(n => n.type === 'computed').length;
    const drivers = dependencyChain.filter(n => n.type === 'driver').length;
    return { computed, drivers, total: dependencyChain.length };
  }, [dependencyChain]);

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* 模式选择 */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'auto'}
              onChange={() => onChange?.({ metrics: selectedMetrics, drivers: selectedDrivers, mode: 'auto' })}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm font-medium text-gray-700">🤖 AI 自主选择（推荐）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'manual'}
              onChange={() => onChange?.({ metrics: selectedMetrics, drivers: selectedDrivers, mode: 'manual' })}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm font-medium text-gray-700">✋ 指定调整范围</span>
          </label>
        </div>
      </div>

      {mode === 'manual' && (
        <div className="p-3 space-y-3">
          {/* 计算指标选择 - 节点少时面板显示，多时弹窗 */}
          <div>
            {computedNodes.length <= PANEL_THRESHOLD ? (
              /* 面板模式 */
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span>📊</span> 计算指标（用于目标验证）
                  <span className="text-xs text-gray-500">已选 {selectedMetrics.length} / {computedNodes.length} 个</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {computedNodes.map(node => (
                    <label
                      key={node.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-sm cursor-pointer ${
                        selectedMetrics.includes(node.id)
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(node.id)}
                        onChange={() => handleToggleMetric(node.id)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded"
                      />
                      <span>{node.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              /* 弹窗模式 */
              <div
                className="flex items-center justify-between cursor-pointer py-3 hover:bg-gray-50 rounded-lg px-3 border border-gray-200"
                onClick={() => setShowMetricsModal(true)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <div>
                    <div className="text-sm font-medium text-gray-700">计算指标（用于目标验证）</div>
                    <div className="text-xs text-gray-500">已选 {selectedMetrics.length} 个 · 共 {computedNodes.length} 个 · 点击选择更多</div>
                  </div>
                </div>
                <span className="text-gray-400">▶</span>
              </div>
            )}
          </div>

          {/* 驱动因子选择 - 节点少时面板显示，多时弹窗 */}
          <div>
            {driverNodes.length <= PANEL_THRESHOLD ? (
              /* 面板模式 */
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span>⚙️</span> 驱动因子（AI 可调整范围）
                  <span className="text-xs text-gray-500">已选 {selectedDrivers.length} / {driverNodes.length} 个</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {driverNodes.map(node => (
                    <label
                      key={node.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-sm cursor-pointer ${
                        selectedDrivers.includes(node.id)
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDrivers.includes(node.id)}
                        onChange={() => handleToggleDriver(node.id)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded"
                      />
                      <span>{node.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              /* 弹窗模式 */
              <div
                className="flex items-center justify-between cursor-pointer py-3 hover:bg-gray-50 rounded-lg px-3 border border-gray-200"
                onClick={() => setShowDriversModal(true)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚙️</span>
                  <div>
                    <div className="text-sm font-medium text-gray-700">驱动因子（AI 可调整范围）</div>
                    <div className="text-xs text-gray-500">已选 {selectedDrivers.length} 个 · 共 {driverNodes.length} 个 · 点击选择更多</div>
                  </div>
                </div>
                <span className="text-gray-400">▶</span>
              </div>
            )}
          </div>

          {/* 计算链提示 */}
          {dependencyChain.length > 0 && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-sm">💡</span>
                <div className="text-xs text-blue-700 flex-1">
                  <div className="font-medium mb-1 flex items-center gap-2">
                    <span>已自动包含计算链依赖：</span>
                    <span className="text-blue-600">
                      共 {dependencyChain.length} 个（计算指标 {dependencyChainStats.computed} · 驱动因子 {dependencyChainStats.drivers}）
                    </span>
                    {hasMoreDependencies && (
                      <button
                        onClick={() => setShowDependencyModal(true)}
                        className="ml-2 px-2 py-0.5 bg-blue-200 hover:bg-blue-300 text-blue-800 rounded text-xs transition-colors"
                      >
                        查看全部 →
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {displayedDependencyChain.map((node, i) => (
                      <span
                        key={node.id}
                        className={`px-1.5 py-0.5 rounded border text-xs ${
                          node.type === 'computed'
                            ? 'bg-purple-100 border-purple-300 text-purple-700'
                            : 'bg-green-100 border-green-300 text-green-700'
                        }`}
                        title={`${node.type === 'computed' ? '计算指标' : '驱动因子'} · ${node.name}`}
                      >
                        {node.name}
                      </span>
                    ))}
                    {hasMoreDependencies && (
                      <span className="px-1.5 py-0.5 bg-blue-100 border border-blue-300 text-blue-700 text-xs rounded cursor-pointer hover:bg-blue-200" onClick={() => setShowDependencyModal(true)}>
                        +{dependencyChain.length - MAX_DEPENDENCY_DISPLAY} 更多
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 计算链详情弹窗 */}
          {showDependencyModal && (
            <div
              className="fixed inset-0 flex items-center justify-center z-[300] bg-black/50"
              onClick={() => setShowDependencyModal(false)}
            >
              <div
                className="bg-white rounded-lg p-6 w-[700px] max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">计算链依赖详情</h3>
                  <button onClick={() => setShowDependencyModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <div className="font-medium mb-1">📊 计算指标 ({dependencyChainStats.computed}个)</div>
                  <div className="text-xs">紫色标签为计算指标，由公式计算得出</div>
                </div>
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                  <div className="font-medium mb-1">⚙️ 驱动因子 ({dependencyChainStats.drivers}个)</div>
                  <div className="text-xs">绿色标签为驱动因子，可直接调整</div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4">
                  {/* 按深度分组显示 */}
                  {(() => {
                    const grouped = {};
                    dependencyChain.forEach(node => {
                      const depth = node.depth || 1;
                      if (!grouped[depth]) grouped[depth] = [];
                      grouped[depth].push(node);
                    });
                    return Object.entries(grouped).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([depth, nodes]) => (
                      <div key={depth}>
                        <div className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-gray-200 rounded text-gray-700">深度 {depth}</span>
                          <span className="text-gray-500">（{nodes.length} 个节点）</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {nodes.map(node => (
                            <span
                              key={node.id}
                              className={`px-3 py-1.5 rounded border text-sm ${
                                node.type === 'computed'
                                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                                  : 'bg-green-100 border-green-300 text-green-700'
                              }`}
                              title={`ID: ${node.id}`}
                            >
                              {node.name}
                              <span className="text-xs ml-1 opacity-75">({node.id})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="flex justify-end mt-4 pt-3 border-t">
                  <button onClick={() => setShowDependencyModal(false)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">关闭</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 计算指标选择弹窗 */}
      {showMetricsModal && (
        <div
          className={`fixed inset-0 flex items-center justify-center z-[200] ${
            nonModal ? '' : 'bg-black/50'
          }`}
          onClick={() => nonModal && setShowMetricsModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">选择计算指标</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={nonModal}
                    onChange={(e) => setNonModal(e.target.checked)}
                    className="w-3 h-3 text-indigo-600 rounded"
                  />
                  非模态
                </label>
                <button onClick={() => setShowMetricsModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
            <input
              type="text"
              value={searchMetrics}
              onChange={(e) => setSearchMetrics(e.target.value)}
              placeholder="🔍 搜索指标..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {/* 全选/取消全选按钮 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSelectAllMetrics}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                全选
              </button>
              <button
                onClick={handleDeselectAllMetrics}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                取消全选
              </button>
              <span className="text-xs text-gray-500 self-center">
                已选 {selectedMetrics.length} / {computedNodes.length} 个
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredComputedNodes.map(node => (
                <label
                  key={node.id}
                  className={`flex items-center justify-between px-3 py-2 rounded border cursor-pointer ${
                    selectedMetrics.includes(node.id)
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(node.id)}
                      onChange={() => handleToggleMetric(node.id)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm">{node.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{node.id}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <button onClick={() => setShowMetricsModal(false)} className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
              <button onClick={() => setShowMetricsModal(false)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 驱动因子选择弹窗 */}
      {showDriversModal && (
        <div
          className={`fixed inset-0 flex items-center justify-center z-[200] ${
            nonModal ? '' : 'bg-black/50'
          }`}
          onClick={() => nonModal && setShowDriversModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">选择驱动因子</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={nonModal}
                    onChange={(e) => setNonModal(e.target.checked)}
                    className="w-3 h-3 text-indigo-600 rounded"
                  />
                  非模态
                </label>
                <button onClick={() => setShowDriversModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
            <input
              type="text"
              value={searchDrivers}
              onChange={(e) => setSearchDrivers(e.target.value)}
              placeholder="🔍 搜索因子..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {/* 全选/取消全选按钮 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSelectAllDrivers}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                全选
              </button>
              <button
                onClick={handleDeselectAllDrivers}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                取消全选
              </button>
              <span className="text-xs text-gray-500 self-center">
                已选 {selectedDrivers.length} / {driverNodes.length} 个
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredDriverNodes.map(node => (
                <label
                  key={node.id}
                  className={`flex items-center justify-between px-3 py-2 rounded border cursor-pointer ${
                    selectedDrivers.includes(node.id)
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedDrivers.includes(node.id)}
                      onChange={() => handleToggleDriver(node.id)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm">{node.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{node.id}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <button onClick={() => setShowDriversModal(false)} className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
              <button
                onClick={() => {
                  handleAddRecommended();
                  setShowDriversModal(false);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                添加推荐
              </button>
              <button onClick={() => setShowDriversModal(false)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeSelector;
