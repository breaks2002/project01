import React, { useState, useCallback, useMemo } from 'react';

/**
 * 标准差分析配置面板
 */
const StdDevConfigPanel = ({
  options,
  scenarios,
  nodes,
  onOptionsChange,
  onRecalculate,
  onExportExcel,
  onExportImage
}) => {
  const [localThresholds, setLocalThresholds] = useState(options.thresholds);
  const [isDragging, setIsDragging] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState(''); // 指标搜索关键字

  // 方案列表
  const scenarioList = useMemo(() => {
    return Object.values(scenarios || {}).map(s => ({
      id: s.id,
      name: s.name
    }));
  }, [scenarios]);

  // 从节点中提取指标类别 - 根据实际数据动态生成
  const indicatorCategories = useMemo(() => {
    const categories = new Map();

    // 获取所有节点（从当前方案）
    const nodesArray = nodes ? Object.values(nodes) : [];

    // 遍历节点，收集所有唯一的指标名称
    nodesArray.forEach(node => {
      if (!node.name || node.type === 'aggregate') return;
      // 直接用节点名称作为指标（去除空格）
      const indicatorName = node.name.trim();
      if (!categories.has(indicatorName)) {
        // 根据指标类型分配颜色
        const name = node.name.toLowerCase();
        let color = '#6b7280'; // 默认灰色
        if (name.includes('净利润') || name.includes('利润')) color = '#1e40af';
        else if (name.includes('收入') || name.includes('销售')) color = '#16a34a';
        else if (name.includes('成本')) color = '#dc2626';
        else if (name.includes('毛利')) color = '#9333ea';
        else if (name.includes('费用')) color = '#ea580c';

        categories.set(indicatorName, {
          color,
          label: indicatorName,
          nodeId: node.id
        });
      }
    });

    return Array.from(categories.values());
  }, [nodes]);

  // 根据搜索关键字过滤指标
  const filteredIndicatorCategories = useMemo(() => {
    if (!indicatorSearch.trim()) return indicatorCategories;
    const keyword = indicatorSearch.toLowerCase();
    return indicatorCategories.filter(cat =>
      cat.label.toLowerCase().includes(keyword)
    );
  }, [indicatorCategories, indicatorSearch]);

  // 阈值滑块拖动开始
  const handleThresholdDragStart = useCallback((axis) => {
    setIsDragging(true);
  }, []);

  // 阈值滑块拖动结束
  const handleThresholdDragEnd = useCallback(() => {
    setIsDragging(false);
    onOptionsChange({ thresholds: localThresholds });
  }, [localThresholds, onOptionsChange]);

  // 阈值变化（拖动中）
  const handleThresholdChange = useCallback((axis, value) => {
    setLocalThresholds(prev => ({
      ...prev,
      [axis]: parseFloat(value)
    }));
  }, []);

  // 数据模式变化
  const handleDataModeChange = useCallback((mode) => {
    onOptionsChange({ dataMode: mode });
  }, [onOptionsChange]);

  // 对比初始版本开关
  const handleCompareInitialChange = useCallback((checked) => {
    onOptionsChange({ compareInitial: checked });
  }, [onOptionsChange]);

  // 方案选择变化
  const handleScenarioToggle = useCallback((scenarioId) => {
    const currentSelected = options.selectedScenarios || [];
    let newSelected;
    if (currentSelected.includes(scenarioId)) {
      newSelected = currentSelected.filter(id => id !== scenarioId);
    } else {
      newSelected = [...currentSelected, scenarioId];
    }
    onOptionsChange({ selectedScenarios: newSelected });
  }, [options.selectedScenarios, onOptionsChange]);

  // 全选/取消全选方案
  const handleSelectAllScenarios = useCallback(() => {
    const allIds = scenarioList.map(s => s.id);
    onOptionsChange({ selectedScenarios: allIds });
  }, [scenarioList, onOptionsChange]);

  const handleClearAllScenarios = useCallback(() => {
    onOptionsChange({ selectedScenarios: [] });
  }, [onOptionsChange]);

  // 指标选择变化
  const handleIndicatorToggle = useCallback((indicatorLabel) => {
    const currentSelected = options.selectedIndicators || [];
    let newSelected;
    if (currentSelected.includes(indicatorLabel)) {
      newSelected = currentSelected.filter(label => label !== indicatorLabel);
    } else {
      newSelected = [...currentSelected, indicatorLabel];
    }
    onOptionsChange({ selectedIndicators: newSelected });
  }, [options.selectedIndicators, onOptionsChange]);

  // 全选/取消全选指标
  const handleSelectAllIndicators = useCallback(() => {
    const allLabels = indicatorCategories.map(c => c.label);
    onOptionsChange({ selectedIndicators: allLabels });
  }, [indicatorCategories, onOptionsChange]);

  const handleClearAllIndicators = useCallback(() => {
    onOptionsChange({ selectedIndicators: [] });
  }, [onOptionsChange]);

  return (
    <div className="px-4 py-3 border-b bg-gray-50 relative">
      <div className="space-y-3">
        {/* 第一行：方案选择 */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-gray-600 font-medium">方案：</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSelectAllScenarios}
              className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
            >
              全选
            </button>
            <button
              onClick={handleClearAllScenarios}
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              清空
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {scenarioList.map((scenario, index) => {
              const colors = ['#1e40af', '#16a34a', '#dc2626', '#9333ea', '#ea580c'];
              const color = colors[index % colors.length];
              const isSelected = (options.selectedScenarios || []).includes(scenario.id);
              return (
                <label key={scenario.id} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleScenarioToggle(scenario.id)}
                    className="w-3 h-3 rounded"
                    style={{ accentColor: color }}
                  />
                  <span className="text-xs text-gray-600">{scenario.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 第二行：指标选择（带搜索和滚动） */}
        {indicatorCategories.length > 0 && (
          <div className="flex items-start gap-4">
            <span className="text-xs text-gray-600 font-medium w-12 mt-1">指标：</span>
            <div className="flex flex-col gap-2 flex-1">
              {/* 搜索框和操作按钮 */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`搜索指标（共 ${indicatorCategories.length} 个）...`}
                  value={indicatorSearch}
                  onChange={(e) => setIndicatorSearch(e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded w-48 focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
                <button
                  onClick={handleSelectAllIndicators}
                  className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                >
                  全选
                </button>
                <button
                  onClick={handleClearAllIndicators}
                  className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  清空
                </button>
                {indicatorSearch && (
                  <span className="text-xs text-gray-500">
                    找到 {filteredIndicatorCategories.length} 个
                  </span>
                )}
              </div>
              {/* 指标列表 - 限制高度可滚动 */}
              <div className="flex items-center gap-2 flex-wrap max-h-24 overflow-y-auto p-1 border border-gray-200 rounded bg-white">
                {filteredIndicatorCategories.length > 0 ? (
                  filteredIndicatorCategories.map((category) => {
                    const isSelected = (options.selectedIndicators || []).length === 0 ||
                      (options.selectedIndicators || []).includes(category.label);
                    return (
                      <label
                        key={category.label}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-white border-purple-300 shadow-sm'
                            : 'bg-gray-100 border-gray-200 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleIndicatorToggle(category.label)}
                          className="w-3.5 h-3.5 rounded"
                          style={{ accentColor: category.color }}
                        />
                        <span className="text-xs text-gray-700">{category.label}</span>
                      </label>
                    );
                  })
                ) : (
                  <span className="text-xs text-gray-500 p-2">未找到匹配的指标</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 第三行：数据模式和阈值 */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* 数据模式 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">数据：</span>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="dataMode"
                checked={options.dataMode === 'mixed'}
                onChange={() => handleDataModeChange('mixed')}
                className="w-3 h-3 text-emerald-600"
              />
              <span>混合</span>
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="dataMode"
                checked={options.dataMode === 'actual-only'}
                onChange={() => handleDataModeChange('actual-only')}
                className="w-3 h-3 text-emerald-600"
              />
              <span>仅实际</span>
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="dataMode"
                checked={options.dataMode === 'forecast-only'}
                onChange={() => handleDataModeChange('forecast-only')}
                className="w-3 h-3 text-emerald-600"
              />
              <span>仅预测</span>
            </label>
          </div>

          {/* 分隔线 */}
          <div className="w-px h-4 bg-gray-300" />

          {/* 对比初始版本 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={options.compareInitial}
                onChange={(e) => handleCompareInitialChange(e.target.checked)}
                className="w-3 h-3 text-emerald-600 rounded"
              />
              <span className="text-gray-600">对比初始版本</span>
            </label>
          </div>

          {/* 分隔线 */}
          <div className="w-px h-4 bg-gray-300" />

          {/* 阈值调节 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 font-medium">阈值：</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">A</span>
              <input
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={localThresholds.A}
                onChange={(e) => handleThresholdChange('A', e.target.value)}
                onMouseUp={handleThresholdDragEnd}
                onTouchEnd={handleThresholdDragEnd}
                className="w-20 h-2 accent-emerald-600"
              />
              <span className="text-xs text-gray-700 w-10 font-mono">{localThresholds.A.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">B</span>
              <input
                type="range"
                min="0.01"
                max="0.5"
                step="0.01"
                value={localThresholds.B}
                onChange={(e) => handleThresholdChange('B', e.target.value)}
                onMouseUp={handleThresholdDragEnd}
                onTouchEnd={handleThresholdDragEnd}
                className="w-20 h-2 accent-emerald-600"
              />
              <span className="text-xs text-gray-700 w-10 font-mono">{localThresholds.B.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧操作按钮 - 绝对定位 */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          onClick={onRecalculate}
          className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
        >
          🔄 重新计算
        </button>
        <button
          onClick={onExportExcel}
          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
        >
          📊 导出 Excel
        </button>
        <button
          onClick={onExportImage}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
        >
          📷 导出图片
        </button>
      </div>
    </div>
  );
};

export default StdDevConfigPanel;
