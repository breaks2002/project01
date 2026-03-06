import React, { useMemo } from 'react';

/**
 * 标准差分析图例
 */
const StdDevLegend = ({ scenarios = {}, data = [], selectedIndicators = [], onIndicatorToggle }) => {
  // 动态获取方案列表
  const scenarioList = useMemo(() => {
    return Object.values(scenarios || {}).map(s => ({
      id: s.id,
      name: s.name
    }));
  }, [scenarios]);

  // 从实际数据中提取出现的指标类别 - 使用完整节点名称
  const indicatorCategories = useMemo(() => {
    const categories = new Map();

    // 遍历数据中的节点名称，收集所有唯一的指标
    data.forEach(d => {
      if (!d.nodeName) return;
      const indicatorName = d.nodeName.trim();
      if (!categories.has(indicatorName)) {
        // 根据指标类型分配颜色
        const name = d.nodeName.toLowerCase();
        let color = '#6b7280'; // 默认灰色
        if (name.includes('净利润') || name.includes('利润')) color = '#1e40af';
        else if (name.includes('收入') || name.includes('销售')) color = '#16a34a';
        else if (name.includes('成本')) color = '#dc2626';
        else if (name.includes('毛利')) color = '#9333ea';
        else if (name.includes('费用')) color = '#ea580c';

        categories.set(indicatorName, {
          color,
          label: indicatorName,
          nodeId: d.nodeId
        });
      }
    });

    return Array.from(categories.values());
  }, [data]);

  // 判断指标是否被选中
  const isIndicatorSelected = (label) => {
    // 如果没有选择任何指标，默认全选
    if (!selectedIndicators || selectedIndicators.length === 0) return true;
    return selectedIndicators.includes(label);
  };

  // 辅助函数：获取形状的 clipPath
  const getShapeClipPath = (shape) => {
    if (shape === 'triangle') return 'polygon(50% 0%, 0% 100%, 100% 100%)';
    if (shape === 'square') return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
    if (shape === 'diamond') return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    return 'circle(50%)';
  };

  return (
    <div className="px-4 py-2 border-t bg-gray-50 flex items-center gap-6 flex-wrap">
      {/* 方案+版本图例 - 每个方案显示初始和当前两个版本 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 font-medium">图例：</span>
        <div className="flex items-center gap-3 flex-wrap">
          {scenarioList.length > 0 ? (
            scenarioList.map((scenario, index) => {
              const colors = ['#1e40af', '#16a34a', '#dc2626', '#9333ea', '#ea580c'];
              const shapes = ['triangle', 'circle', 'square', 'diamond', 'pentagon'];
              const color = colors[index % colors.length];
              const shape = shapes[index % shapes.length];
              const clipPath = getShapeClipPath(shape);

              return (
                <div key={scenario.id} className="flex items-center gap-2">
                  {/* 初始版本 */}
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3" style={{
                      clipPath,
                      backgroundColor: color,
                      opacity: 0.4
                    }} />
                    <span className="text-xs text-gray-500">{scenario.name}(初始)</span>
                  </div>
                  {/* 当前版本 */}
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3" style={{
                      clipPath,
                      backgroundColor: color,
                      opacity: 0.9
                    }} />
                    <span className="text-xs text-gray-700">{scenario.name}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-gray-500">暂无方案</span>
          )}
        </div>
      </div>

      {/* 分隔线 */}
      {indicatorCategories.length > 0 && <div className="w-px h-4 bg-gray-300" />}

      {/* 指标类别图例 - 可点击切换 */}
      {indicatorCategories.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 font-medium">指标：</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {indicatorCategories.map((category) => {
              const isSelected = isIndicatorSelected(category.label);
              return (
                <div
                  key={category.label}
                  onClick={() => onIndicatorToggle?.(category.label)}
                  className={`flex items-center gap-1 px-2 py-1 rounded border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white border-purple-300 shadow-sm'
                      : 'bg-gray-100 border-gray-200 opacity-60'
                  }`}
                  title="点击切换显示/隐藏"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: category.color,
                      opacity: isSelected ? 1 : 0.3
                    }}
                  />
                  <span className="text-xs text-gray-700">{category.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StdDevLegend;
