import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

const AdjustmentDescriptionList = ({ nodes, onExportExcel }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedFactorIds, setSelectedFactorIds] = useState([]); // 支持多选
  const [searchText, setSearchText] = useState('');
  const [showDescriptions, setShowDescriptions] = useState(true);
  const searchInputRef = useRef(null);

  // 提取所有已调整的驱动因子（包括没有描述的）
  const getAllAdjustedFactors = useCallback(() => {
    const factors = [];

    Object.values(nodes).forEach(node => {
      if (node.type === 'driver') {
        const hasChanged = node.value !== node.initialBaseline &&
                          node.initialBaseline !== null &&
                          node.initialBaseline !== undefined;

        if (hasChanged) {
          const hasDescription = node.adjustmentDescription && node.adjustmentDescription.trim() !== '';
          const isAIDecision = hasDescription && (
            node.adjustmentDescription.startsWith('🤖') ||
            node.adjustmentDescription.startsWith('AI 决策') ||
            node.adjustmentDescription.includes('🤖 AI 决策')
          );

          let summary = '';
          if (hasDescription) {
            const firstLine = node.adjustmentDescription.split('\n')[0];
            summary = firstLine.replace(/^[🤖\s]+/, '');
          } else {
            summary = '请补充描述';
          }

          const changeValue = node.initialBaseline !== null && node.initialBaseline !== undefined
            ? Math.round((node.value - node.initialBaseline) * 100) / 100
            : 0;

          const changePercent = node.initialBaseline && node.initialBaseline !== 0
            ? Math.round((node.value - node.initialBaseline) / node.initialBaseline * 10000) / 100
            : 0;

          factors.push({
            id: node.id,
            name: node.name,
            category: hasDescription ? (isAIDecision ? 'AI 决策' : '人工录入') : '待补充',
            currentValue: Math.round(node.value * 100) / 100,
            baselineValue: node.initialBaseline !== null && node.initialBaseline !== undefined
              ? Math.round(node.initialBaseline * 100) / 100
              : 0,
            changeValue,
            changePercent,
            description: node.adjustmentDescription || '',
            summary,
            hasDescription,
            unit: node.unit || ''
          });
        }
      }
    });

    return factors;
  }, [nodes]);

  // 获取排序后的因子列表
  const getSortedFactors = useCallback(() => {
    const factors = getAllAdjustedFactors();

    if (!sortConfig.key) return factors;

    return [...factors].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [getAllAdjustedFactors, sortConfig]);

  const factors = useMemo(() => getSortedFactors(), [getSortedFactors]);

  // 根据搜索文本过滤因子
  const filteredFactors = useMemo(() => {
    if (!searchText.trim()) return factors;

    const search = searchText.toLowerCase().trim();
    return factors.filter(f =>
      f.name.toLowerCase().includes(search) ||
      f.summary.toLowerCase().includes(search) ||
      f.description.toLowerCase().includes(search)
    );
  }, [factors, searchText]);

  // 根据选中状态显示描述
  const displayedDescriptions = useMemo(() => {
    if (selectedFactorIds.length > 0) {
      return filteredFactors.filter(f => selectedFactorIds.includes(f.id));
    }
    return filteredFactors;
  }, [filteredFactors, selectedFactorIds]);

  // 统计信息
  const stats = useMemo(() => {
    const aiCount = factors.filter(f => f.category === 'AI 决策').length;
    const manualCount = factors.filter(f => f.category === '人工录入').length;
    const pendingCount = factors.filter(f => f.category === '待补充').length;
    return { total: factors.length, aiCount, manualCount, pendingCount };
  }, [factors]);

  const filteredStats = useMemo(() => {
    return filteredFactors.length;
  }, [filteredFactors]);

  // 处理排序点击
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ⇅';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // 处理因子点击（支持 Ctrl 多选）
  const handleFactorClick = (id, event) => {
    if (event && (event.ctrlKey || event.metaKey)) {
      // Ctrl/Command 点击：切换选择状态
      setSelectedFactorIds(prev => {
        if (prev.includes(id)) {
          return prev.filter(fid => fid !== id);
        } else {
          return [...prev, id];
        }
      });
    } else {
      // 普通点击：单选
      setSelectedFactorIds(prev => prev.length === 1 && prev[0] === id ? [] : [id]);
    }
  };

  // 处理搜索
  const handleSearchChange = (e) => {
    setSearchText(e.target.value);
    setSelectedFactorIds([]);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setSelectedFactorIds([]);
    searchInputRef.current?.focus();
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFactorIds.length === filteredFactors.length) {
      setSelectedFactorIds([]);
    } else {
      setSelectedFactorIds(filteredFactors.map(f => f.id));
    }
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (searchText) {
          handleClearSearch();
        } else {
          setSelectedFactorIds([]);
        }
      }
      // Ctrl+A 全选
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        handleSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchText, selectedFactorIds, filteredFactors]);

  // 导出 Excel
  const handleExport = () => {
    const data = [
      ['调整描述清单'],
      ['导出时间:', new Date().toLocaleString('zh-CN')],
      [],
      ['序号', '因子名称', '类别', '当前值', '基准值', '调整额', '调整率 (%)', '调整描述摘要', '完整描述']
    ];

    filteredFactors.forEach((item, index) => {
      data.push([
        index + 1,
        item.name,
        item.category,
        item.unit === '%' ? `${item.currentValue}%` : item.currentValue,
        item.unit === '%' ? `${item.baselineValue}%` : item.baselineValue,
        item.unit === '%' ? `${item.changeValue}%` : item.changeValue,
        `${item.changePercent}%`,
        item.summary,
        item.description || '无'
      ]);
    });

    data.push([]);
    data.push(['统计汇总']);
    data.push(['总记录数:', stats.total]);
    data.push(['AI 决策:', stats.aiCount]);
    data.push(['人工录入:', stats.manualCount]);
    data.push(['待补充:', stats.pendingCount]);
    if (searchText.trim()) {
      data.push([`搜索过滤："${searchText}"，匹配 ${filteredStats} 条`]);
    }
    if (selectedFactorIds.length > 0) {
      data.push([`已选中：${selectedFactorIds.length} 条`]);
    }

    onExportExcel(data, `调整描述清单_${new Date().getTime()}`);
  };

  if (factors.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <div className="text-6xl mb-4">📝</div>
        <div className="text-lg font-medium">暂无调整记录</div>
        <div className="text-sm mt-2">调整驱动因子后，此处将显示调整清单</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 统计信息 + 搜索栏 */}
      <div className="mb-3 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              总记录：<span className="font-medium text-gray-800">{stats.total}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              AI 决策：<span className="font-medium text-purple-600">{stats.aiCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              人工录入：<span className="font-medium text-blue-600">{stats.manualCount}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              待补充：<span className="font-medium text-orange-600">{stats.pendingCount}</span>
            </span>
            {searchText.trim() && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                搜索匹配：<span className="font-medium text-green-600">{filteredStats}</span>
              </span>
            )}
            {selectedFactorIds.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                已选中：<span className="font-medium text-indigo-600">{selectedFactorIds.length}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium"
              title={selectedFactorIds.length === filteredFactors.length ? '取消全选' : '全选 (Ctrl+A)'}
            >
              {selectedFactorIds.length === filteredFactors.length ? '取消全选' : '全选'}
            </button>
            <button
              onClick={() => setShowDescriptions(!showDescriptions)}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2"
              title={showDescriptions ? '收起' : '展开'}
            >
              {showDescriptions ? '📋 描述已展开' : '📋 描述已收起'}
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <span>📊</span>
              导出 Excel
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              placeholder="搜索因子名称或描述内容... (Ctrl+F 聚焦)"
              className="w-full px-3 py-1.5 pl-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>
            {searchText.trim() && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="清除搜索 (Esc)"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('category')}>
                类别{getSortIcon('category')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                因子名称{getSortIcon('name')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('currentValue')}>
                当前值{getSortIcon('currentValue')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('baselineValue')}>
                基准值{getSortIcon('baselineValue')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('changeValue')}>
                调整额{getSortIcon('changeValue')}
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 border-b cursor-pointer hover:bg-gray-100" onClick={() => handleSort('changePercent')}>
                调整率 (%) {getSortIcon('changePercent')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b">
                调整描述摘要
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFactors.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  🔍 没有找到匹配的因子
                  {searchText.trim() && (
                    <button
                      onClick={handleClearSearch}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      清除搜索
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredFactors.map((item, index) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedFactorIds.includes(item.id)
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                  onClick={(e) => handleFactorClick(item.id, e)}
                  title="点击选择，Ctrl+ 点击多选"
                >
                  <td className="px-3 py-2 border-b">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.category === 'AI 决策'
                        ? 'bg-purple-100 text-purple-700'
                        : item.category === '人工录入'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {item.category === 'AI 决策' ? '🤖 AI 决策' :
                       item.category === '人工录入' ? '✏️ 人工录入' : '⚠️ 待补充'}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b font-medium text-gray-800">
                    {item.name}
                    {selectedFactorIds.includes(item.id) && (
                      <span className="ml-2 text-xs text-blue-600">✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b text-right">
                    <span className="text-gray-800">{item.currentValue}</span>
                    <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                  </td>
                  <td className="px-3 py-2 border-b text-right text-gray-500">
                    {item.baselineValue} {item.unit}
                  </td>
                  <td className="px-3 py-2 border-b text-right">
                    <span className={item.changeValue >= 0 ? 'text-red-600' : 'text-green-600'}>
                      {item.changeValue >= 0 ? '+' : ''}{item.changeValue}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                  </td>
                  <td className="px-3 py-2 border-b text-right">
                    <span className={item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}>
                      {item.changePercent >= 0 ? '+' : ''}{item.changePercent}%
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b max-w-md">
                    <div className={`truncate ${!item.hasDescription ? 'text-orange-600 font-medium' : 'text-gray-600'}`}
                         title={item.summary}>
                      {item.summary}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 完整描述查看区域（可折叠） */}
      {showDescriptions && (
        <div className="mt-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">
              📋 完整调整描述
              {selectedFactorIds.length > 0 && (
                <span className="ml-2 text-xs text-indigo-600">
                  （已筛选：{selectedFactorIds.length} 个因子）
                </span>
              )}
              <span className="ml-2 text-xs text-gray-400 font-normal">
                （共 {displayedDescriptions.length} 条）
              </span>
            </h4>
            <div className="flex items-center gap-2">
              {selectedFactorIds.length > 0 && (
                <button
                  onClick={() => setSelectedFactorIds([])}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  清除选择
                </button>
              )}
              <button
                onClick={() => setShowDescriptions(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                收起 ▲
              </button>
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg max-h-48 overflow-auto text-sm border">
            {displayedDescriptions.length === 0 ? (
              <div className="text-gray-500 text-center py-4">暂无描述内容</div>
            ) : (
              displayedDescriptions.map((item) => (
                <div key={item.id} className="mb-3 pb-3 border-b last:border-0 last:mb-0 last:pb-0">
                  <div className="font-medium text-gray-800 mb-1 flex items-center gap-2">
                    <span>{item.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      item.category === 'AI 决策'
                        ? 'bg-purple-100 text-purple-700'
                        : item.category === '人工录入'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {item.category}
                    </span>
                    {selectedFactorIds.includes(item.id) && (
                      <span className="text-xs text-indigo-600">✓ 已选中</span>
                    )}
                  </div>
                  {item.hasDescription ? (
                    <div className="text-gray-600 whitespace-pre-wrap">{item.description}</div>
                  ) : (
                    <div className="text-orange-600 italic">
                      ⚠️ 此因子暂无调整描述，请点击节点上的"调整描述"按钮补充说明
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 收起状态下的提示 */}
      {!showDescriptions && (
        <div className="mt-3 flex-shrink-0">
          <button
            onClick={() => setShowDescriptions(true)}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          >
            📋 展开描述 ▼
            <span className="text-xs text-gray-400">（共 {displayedDescriptions.length} 条）</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AdjustmentDescriptionList;
