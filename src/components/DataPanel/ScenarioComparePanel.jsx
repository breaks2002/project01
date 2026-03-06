import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { formatValue, aggregateTimeData, getDiffColorClass, isPositiveIndicator } from '../../utils/formatters';
import { FormulaParser } from '../../engine/FormulaParser';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';

const ScenarioComparePanel = ({ scenarios, onClose, isMinimized, onToggleMinimize, onBringToFront }) => {
  const [selectedScenarioIds, setSelectedScenarioIds] = useState([]);
  const [baselineScenarioId, setBaselineScenarioId] = useState(null);
  const [leftWidth, setLeftWidth] = useState(220);
  const [nodeNameFilter, setNodeNameFilter] = useState('');
  const [showOnlyNonZeroDiff, setShowOnlyNonZeroDiff] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 100, y: 80 });
  const [panelSize, setPanelSize] = useState({ width: 1200, height: 750 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [selectedChartNode, setSelectedChartNode] = useState(null);
  const [activeTab, setActiveTab] = useState('table'); // 'table' | 'chart'
  const [monthlyActiveTab, setMonthlyActiveTab] = useState('table'); // 'table' | 'chart'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [prevPanelState, setPrevPanelState] = useState(null);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });
  const leftDividerStartX = useRef(0);
  const leftDividerStartWidth = useRef(0);
  const isDraggingLeftDivider = useRef(false);

  // 切换全屏
  const toggleFullscreen = () => {
    if (isFullscreen) {
      // 恢复之前的状态
      if (prevPanelState) {
        setPanelPosition(prevPanelState.position);
        setPanelSize(prevPanelState.size);
      }
      setIsFullscreen(false);
    } else {
      // 保存当前状态并进入全屏
      setPrevPanelState({
        position: { ...panelPosition },
        size: { ...panelSize }
      });
      setIsFullscreen(true);
    }
  };

  // 初始化：默认选中前3个方案，第一个作为基准
  useEffect(() => {
    const scenarioList = Object.values(scenarios).sort((a, b) => a.createdAt - b.createdAt);
    if (scenarioList.length > 0) {
      const defaultSelected = scenarioList.slice(0, Math.min(5, scenarioList.length)).map(s => s.id);
      setSelectedScenarioIds(defaultSelected);
      setBaselineScenarioId(scenarioList[0].id);
    }
  }, [scenarios]);

  // 切换方案选择
  const toggleScenario = (id) => {
    setSelectedScenarioIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(sid => sid !== id);
      } else {
        if (prev.length >= 5) {
          alert('最多只能选择 5 个方案进行对比');
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  // 计算节点在指定方案中的汇总数据
  const getNodeAggregatedData = (node) => {
    const isDriver = node.type === 'driver';
    const hasMonthlyFunction = !isDriver && FormulaParser.hasMonthlyFunction(node.formula);

    let aggType = 'sum';
    if (isDriver) {
      aggType = node.aggregationType || (node.unit === '%' ? 'average' : 'sum');
    }

    const aggregated = aggregateTimeData(node.timeData, aggType);

    let actualPlusForecastTotal = aggregated.actualPlusForecastTotal;

    if (!isDriver) {
      if (hasMonthlyFunction) {
        actualPlusForecastTotal = node.value ?? 0;
      }
    }

    return {
      actualPlusForecastTotal,
      value: node.value,
      timeData: node.timeData
    };
  };

  // 检查节点是否有非零差额
  const hasNonZeroDiff = (node, selectedScenarios, baselineScenarioId, scenarios) => {
    if (!showOnlyNonZeroDiff) return true;
    const baselineScenario = baselineScenarioId ? scenarios[baselineScenarioId] : null;
    const baselineNode = baselineScenario?.nodes?.[node.id];
    const baselineData = baselineNode ? getNodeAggregatedData(baselineNode) : null;

    for (const scenario of selectedScenarios) {
      if (scenario.id === baselineScenarioId) continue;
      const scenarioNode = scenario.nodes?.[node.id];
      const data = scenarioNode ? getNodeAggregatedData(scenarioNode) : null;
      if (baselineData && data) {
        const diff = data.actualPlusForecastTotal - baselineData.actualPlusForecastTotal;
        if (Math.abs(diff) > 0.0001) return true;
      }
    }
    return false;
  };

  // 获取所有需要显示的节点（取所有选中方案的并集，按名称排序）
  const allNodes = useMemo(() => {
    const nodeMap = {};
    selectedScenarioIds.forEach(sid => {
      const scenario = scenarios[sid];
      if (scenario && scenario.nodes) {
        Object.values(scenario.nodes).forEach(node => {
          if (!nodeMap[node.id]) {
            nodeMap[node.id] = {
              id: node.id,
              name: node.name,
              unit: node.unit,
              format: node.format,
              direction: node.direction
            };
          }
        });
      }
    });
    return Object.values(nodeMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [scenarios, selectedScenarioIds]);

  // 确保选中的图表指标有效
  useEffect(() => {
    if (allNodes.length > 0) {
      if (!selectedChartNode || !allNodes.find(n => n.id === selectedChartNode)) {
        setSelectedChartNode(allNodes[0].id);
      }
    }
  }, [allNodes, selectedChartNode]);

  // 应用筛选后的节点
  const filteredNodes = useMemo(() => {
    const selectedScenariosList = selectedScenarioIds
      .map(id => scenarios[id])
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);

    return allNodes.filter(node => {
      const nameMatch = node.name.toLowerCase().includes(nodeNameFilter.toLowerCase());
      const nonZeroMatch = hasNonZeroDiff(node, selectedScenariosList, baselineScenarioId, scenarios);
      return nameMatch && nonZeroMatch;
    });
  }, [allNodes, nodeNameFilter, showOnlyNonZeroDiff, selectedScenarioIds, baselineScenarioId, scenarios]);

  // 获取选中的方案列表
  const selectedScenarios = useMemo(() => {
    return selectedScenarioIds
      .map(id => scenarios[id])
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [scenarios, selectedScenarioIds]);

  // 格式化数值
  const formatNumber = (value, format) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '-';
    }
    let formatted = value;
    if (format.includes('#,##0')) {
      formatted = value.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    } else if (format.includes('0.00')) {
      formatted = value.toFixed(2);
    } else if (format.includes('0%')) {
      formatted = value.toFixed(1);
    } else {
      formatted = Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    }
    return formatted;
  };

  // 获取差额箭头符号
  const getDiffArrow = (diff, node) => {
    if (diff === null || diff === undefined || isNaN(diff) || Math.abs(diff) < 0.0001) {
      return '';
    }
    const isPositive = node.direction === 'positive' ||
      (node.direction === 'auto' && isPositiveIndicator(node.name));
    const isPositiveDiff = diff > 0;
    if ((isPositive && isPositiveDiff) || (!isPositive && !isPositiveDiff)) {
      return '↑';
    } else {
      return '↓';
    }
  };

  // 获取差额颜色类
  const getDiffClass = (diff, node) => {
    if (diff === null || diff === undefined || isNaN(diff) || Math.abs(diff) < 0.0001) {
      return 'text-gray-600';
    }
    return getDiffColorClass(diff, node.direction, node.name);
  };

  // 检查是否点击了滚动条
  const isScrollbarClick = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;

    // 检查是否是可滚动元素
    const hasScrollbar = target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
    if (!hasScrollbar) return false;

    // 计算鼠标位置是否在滚动条区域
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 垂直滚动条通常在右侧 15px 范围内
    const isVerticalScrollbar = x > target.clientWidth - 20 && x <= rect.width;
    // 水平滚动条通常在底部 15px 范围内
    const isHorizontalScrollbar = y > target.clientHeight - 20 && y <= rect.height;

    return isVerticalScrollbar || isHorizontalScrollbar;
  };

  // 拖动窗口
  const handleDragStart = useCallback((e) => {
    // 检查是否点击了按钮、输入框、选择框或滚动条
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('select') ||
        e.target.closest('textarea') ||
        isScrollbarClick(e)) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
    // 置顶窗口
    onBringToFront?.();
  }, [panelPosition, onBringToFront]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: Math.max(0, panelStartPos.current.x + deltaX),
      y: Math.max(0, panelStartPos.current.y + deltaY)
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 全局监听鼠标移动和抬起
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleGlobalMouseMove = (e) => {
        if (isDragging) handleDragMove(e);
        if (isResizing) handleResizeMove(e);
      };
      const handleGlobalMouseUp = () => {
        if (isDragging) handleDragEnd();
        if (isResizing) handleResizeEnd();
      };
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, isResizing, handleDragMove, handleDragEnd]);

  // 调整窗口大小
  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
    // 置顶窗口
    onBringToFront?.();
  }, [panelSize, panelPosition, onBringToFront]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;
    let newX = panelStartPos.current.x;
    let newY = panelStartPos.current.y;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(800, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(500, panelStartSize.current.height + deltaY);
    }
    if (resizeHandle.includes('left')) {
      newWidth = Math.max(800, panelStartSize.current.width - deltaX);
      newX = panelStartPos.current.x + deltaX;
    }
    if (resizeHandle.includes('top')) {
      newHeight = Math.max(500, panelStartSize.current.height - deltaY);
      newY = panelStartPos.current.y + deltaY;
    }

    setPanelSize({ width: newWidth, height: newHeight });
    setPanelPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  }, [isResizing, resizeHandle]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  // 左侧分隔条拖动
  const handleLeftDividerStart = (e) => {
    e.stopPropagation();
    isDraggingLeftDivider.current = true;
    leftDividerStartX.current = e.clientX;
    leftDividerStartWidth.current = leftWidth;
  };

  const handleLeftDividerMove = useCallback((e) => {
    if (!isDraggingLeftDivider.current) return;
    const delta = e.clientX - leftDividerStartX.current;
    const newWidth = Math.max(160, Math.min(300, leftDividerStartWidth.current + delta));
    setLeftWidth(newWidth);
  }, [leftWidth]);

  const handleLeftDividerEnd = useCallback(() => {
    isDraggingLeftDivider.current = false;
  }, []);

  // 监听分隔条拖动
  useEffect(() => {
    if (isDraggingLeftDivider.current) {
      const handleMove = (e) => handleLeftDividerMove(e);
      const handleEnd = () => handleLeftDividerEnd();
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
      };
    }
  }, [handleLeftDividerMove, handleLeftDividerEnd]);

  // 收集预测月份（只显示预测期，因为实际数一样）
  const forecastMonthKeys = useMemo(() => {
    const monthSet = new Set();
    selectedScenarios.forEach(scenario => {
      Object.values(scenario.nodes || {}).forEach(node => {
        if (node.timeData) {
          Object.keys(node.timeData).forEach(key => {
            if (key.includes('预测')) {
              monthSet.add(key);
            }
          });
        }
      });
    });
    const monthOrder = ['9月预测', '10月预测', '11月预测', '12月预测'];
    return Array.from(monthSet).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
  }, [selectedScenarios]);

  // 导出汇总表到 Excel
  const exportSummaryExcel = () => {
    const data = [];
    // 表头
    const header = ['指标名称', '单位'];
    selectedScenarios.forEach(scenario => {
      const isBaseline = scenario.id === baselineScenarioId;
      header.push(scenario.name + (isBaseline ? ' (基准)' : ''));
      if (!isBaseline) {
        header.push('差额');
        header.push('差额%');
      }
    });
    data.push(header);

    // 数据行
    filteredNodes.forEach(node => {
      const row = [node.name, node.unit || '-'];
      const baselineScenario = baselineScenarioId ? scenarios[baselineScenarioId] : null;
      const baselineNode = baselineScenario?.nodes?.[node.id];
      const baselineData = baselineNode ? getNodeAggregatedData(baselineNode) : null;

      selectedScenarios.forEach(scenario => {
        const scenarioNode = scenario.nodes?.[node.id];
        const data = scenarioNode ? getNodeAggregatedData(scenarioNode) : null;
        const isBaseline = scenario.id === baselineScenarioId;

        row.push(data ? data.actualPlusForecastTotal : '');

        if (!isBaseline && baselineData && data) {
          const diff = data.actualPlusForecastTotal - baselineData.actualPlusForecastTotal;
          row.push(diff);
          const diffPercent = baselineData.actualPlusForecastTotal !== 0
            ? (diff / baselineData.actualPlusForecastTotal) * 100
            : '';
          row.push(diffPercent !== '' ? diffPercent.toFixed(2) + '%' : '');
        }
      });
      data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '汇总对比');
    XLSX.writeFile(wb, '方案比选_汇总表.xlsx');
  };

  // 导出分月表到 Excel
  const exportMonthlyExcel = () => {
    const data = [];
    // 表头
    const header = ['指标名称', '单位', '月份'];
    selectedScenarios.forEach(scenario => {
      const isBaseline = scenario.id === baselineScenarioId;
      header.push(scenario.name + (isBaseline ? ' (基准)' : ''));
      if (!isBaseline) {
        header.push('差额');
        header.push('差额%');
      }
    });
    data.push(header);

    // 数据行
    filteredNodes.forEach((node, nodeIndex) => {
      forecastMonthKeys.forEach((monthKey, monthIndex) => {
        const row = [monthIndex === 0 ? node.name : '', monthIndex === 0 ? (node.unit || '-') : '', monthKey];
        const baselineScenario = baselineScenarioId ? scenarios[baselineScenarioId] : null;
        const baselineNode = baselineScenario?.nodes?.[node.id];
        const baselineValue = baselineNode?.timeData?.[monthKey];

        selectedScenarios.forEach(scenario => {
          const scenarioNode = scenario.nodes?.[node.id];
          const value = scenarioNode?.timeData?.[monthKey];
          const isBaseline = scenario.id === baselineScenarioId;

          row.push(value !== undefined && value !== null ? value : '');

          if (!isBaseline && baselineValue !== undefined && baselineValue !== null && value !== undefined && value !== null) {
            const diff = value - baselineValue;
            row.push(diff);
            const diffPercent = baselineValue !== 0
              ? (diff / baselineValue) * 100
              : '';
            row.push(diffPercent !== '' ? diffPercent.toFixed(2) + '%' : '');
          }
        });
        data.push(row);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '分月对比');
    XLSX.writeFile(wb, '方案比选_分月表.xlsx');
  };

  // 汇总表柱状图数据
  const summaryChartData = useMemo(() => {
    if (!selectedChartNode) return [];
    const node = allNodes.find(n => n.id === selectedChartNode);
    if (!node) return [];

    return selectedScenarios.map(scenario => {
      const scenarioNode = scenario.nodes?.[node.id];
      const data = scenarioNode ? getNodeAggregatedData(scenarioNode) : null;
      return {
        name: scenario.name,
        value: data?.actualPlusForecastTotal || 0
      };
    });
  }, [selectedChartNode, selectedScenarios, allNodes, scenarios]);

  // 分月折线图数据
  const monthlyChartData = useMemo(() => {
    if (!selectedChartNode) return [];
    const node = allNodes.find(n => n.id === selectedChartNode);
    if (!node) return [];

    return forecastMonthKeys.map(month => {
      const item = { month };
      selectedScenarios.forEach(scenario => {
        const scenarioNode = scenario.nodes?.[node.id];
        const value = scenarioNode?.timeData?.[month];
        item[scenario.name] = value ?? 0;
      });
      return item;
    });
  }, [selectedChartNode, selectedScenarios, allNodes, scenarios, forecastMonthKeys]);

  // 图表颜色
  const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // 如果最小化，只返回一个占位
  if (isMinimized) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* 浮动窗口 */}
      <div
        className={`bg-white ${isFullscreen ? '' : 'rounded-xl'} shadow-2xl flex flex-col overflow-hidden pointer-events-auto ${isDragging && !isFullscreen ? 'cursor-grabbing' : 'cursor-default'}`}
        style={isFullscreen ? {
          position: 'fixed',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh'
        } : {
          position: 'absolute',
          left: panelPosition.x,
          top: panelPosition.y,
          width: panelSize.width,
          height: panelSize.height
        }}
        onMouseDown={() => onBringToFront?.()}
      >
        {/* 调整大小的句柄（非全屏时显示）- 右侧只保留顶部和底部，给滚动条留出空间 */}
        {!isFullscreen && (
          <>
            <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
            <div className="absolute top-0 left-4 right-4 h-2 cursor-n-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'top')} />
            <div className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
            <div className="absolute left-0 top-4 bottom-4 w-2 cursor-w-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'left')} />
            {/* 右侧调整大小句柄：只保留顶部和底部各 40px，给滚动条留出中间空间 */}
            <div className="absolute right-0 top-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'right')} />
            <div className="absolute right-0 bottom-4 w-2 h-10 cursor-e-resize" style={{ zIndex: 1 }} onMouseDown={(e) => handleResizeStart(e, 'right')} />
          </>
        )}

        {/* 头部 - 可拖动（非全屏时） */}
        <div
          className={`px-4 py-2 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 flex-shrink-0 select-none ${!isFullscreen ? 'cursor-move' : ''}`}
          onMouseDown={!isFullscreen ? handleDragStart : undefined}
        >
          {/* 左侧：拖拽区域 + 筛选器 */}
          <div className="flex items-center gap-3 flex-1">
            {/* 标题（可拖动） */}
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span>📊</span>
              方案比选
            </h2>
            {!isFullscreen && (
              <span className="text-xs text-gray-500">
                (拖动标题栏移动窗口)
              </span>
            )}

            {/* 筛选器 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nodeNameFilter}
                onChange={(e) => setNodeNameFilter(e.target.value)}
                placeholder="筛选指标..."
                className="px-2 py-1 border rounded text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyNonZeroDiff}
                  onChange={(e) => setShowOnlyNonZeroDiff(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-600">仅差额</span>
              </label>
              <span className="text-xs text-gray-400">
                {filteredNodes.length}/{allNodes.length}
              </span>
            </div>
          </div>

          {/* 右侧：按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMinimize}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title="最小化"
            >
              一
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? '⛶' : '⛶'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-red-100 hover:bg-red-200 rounded text-red-600 font-medium transition-colors"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：方案选择 */}
          <div className="bg-gray-50 border-r flex flex-col flex-shrink-0" style={{ width: leftWidth }}>
            <div className="p-2.5 border-b bg-white">
              <h3 className="font-semibold text-gray-700 mb-2 text-xs">选择方案</h3>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {Object.values(scenarios)
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map(scenario => (
                    <label key={scenario.id} className="flex items-center gap-1.5 p-1 hover:bg-white rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScenarioIds.includes(scenario.id)}
                        onChange={() => toggleScenario(scenario.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-700 flex-1 truncate">{scenario.name}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="p-2.5 border-b bg-white">
              <h3 className="font-semibold text-gray-700 mb-1.5 text-xs">基准方案</h3>
              <select
                value={baselineScenarioId || ''}
                onChange={(e) => setBaselineScenarioId(e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {selectedScenarios.map(scenario => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2.5 border-b bg-white">
              <h3 className="font-semibold text-gray-700 mb-1.5 text-xs">图表指标</h3>
              <select
                value={selectedChartNode || ''}
                onChange={(e) => setSelectedChartNode(e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {allNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2.5 pr-4 flex-1 overflow-y-auto">
              <h3 className="font-semibold text-gray-700 mb-1.5 text-xs">图例</h3>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-green-100 text-green-700 rounded flex items-center justify-center font-bold text-xs">↑</span>
                  <span className="text-gray-600">正向增/反向降</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-red-100 text-red-700 rounded flex items-center justify-center font-bold text-xs">↓</span>
                  <span className="text-gray-600">正向降/反向增</span>
                </div>
              </div>
            </div>
          </div>

          {/* 左侧拖拽分隔条 */}
          <div
            className="w-1 bg-gray-200 hover:bg-indigo-400 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={handleLeftDividerStart}
          />

          {/* 右侧：数据表格 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 汇总表 - 上半部分 */}
            <div className="h-1/2 flex flex-col border-b">
              <div className="px-3 py-1.5 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">📈 汇总对比</span>
                  <div className="flex bg-white rounded border overflow-hidden">
                    <button
                      onClick={() => setActiveTab('table')}
                      className={`px-2 py-0.5 text-xs ${activeTab === 'table' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100'}`}
                    >
                      表格
                    </button>
                    <button
                      onClick={() => setActiveTab('chart')}
                      className={`px-2 py-0.5 text-xs ${activeTab === 'chart' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100'}`}
                    >
                      柱状图
                    </button>
                  </div>
                </div>
                <button
                  onClick={exportSummaryExcel}
                  className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                >
                  <span>📥</span>
                  导出Excel
                </button>
              </div>

              {activeTab === 'table' ? (
                <div className="flex-1 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-100 sticky top-0 z-20">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-100 z-30 border-r border-gray-200 w-24">
                          指标名称
                        </th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-16">
                          单位
                        </th>
                        {selectedScenarios.map(scenario => {
                          const isBaseline = scenario.id === baselineScenarioId;
                          return (
                            <React.Fragment key={scenario.id}>
                              <th className={`px-2 py-1.5 text-center font-semibold uppercase tracking-wider border-r border-gray-200 ${
                                isBaseline ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                <span className="truncate inline-block max-w-[80px]" title={scenario.name}>
                                  {scenario.name}
                                </span>
                                {isBaseline && <span className="ml-0.5 text-xs">(基)</span>}
                              </th>
                              {!isBaseline && (
                                <>
                                  <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 bg-gray-50 w-20">
                                    差额
                                  </th>
                                  <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 bg-gray-50 w-16">
                                    差额%
                                  </th>
                                </>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredNodes.map(node => {
                        const baselineScenario = baselineScenarioId ? scenarios[baselineScenarioId] : null;
                        const baselineNode = baselineScenario?.nodes?.[node.id];
                        const baselineData = baselineNode ? getNodeAggregatedData(baselineNode) : null;

                        return (
                          <tr
                            key={node.id}
                            className={`hover:bg-gray-50 cursor-pointer ${selectedChartNode === node.id ? 'bg-indigo-50' : ''}`}
                            onClick={() => setSelectedChartNode(node.id)}
                          >
                            <td className="px-2 py-1 text-gray-900 font-medium sticky left-0 bg-white z-15 border-r border-gray-200 w-24">
                              {node.name}
                            </td>
                            <td className="px-2 py-1 text-gray-500 text-center border-r border-gray-200 w-16">
                              {node.unit || '-'}
                            </td>
                            {selectedScenarios.map(scenario => {
                              const scenarioNode = scenario.nodes?.[node.id];
                              const data = scenarioNode ? getNodeAggregatedData(scenarioNode) : null;
                              const isBaseline = scenario.id === baselineScenarioId;
                              const diff = !isBaseline && baselineData && data
                                ? data.actualPlusForecastTotal - baselineData.actualPlusForecastTotal
                                : null;
                              const diffPercent = !isBaseline && baselineData && data && baselineData.actualPlusForecastTotal !== 0
                                ? (diff / baselineData.actualPlusForecastTotal) * 100
                                : null;

                              return (
                                <React.Fragment key={scenario.id}>
                                  <td className={`px-2 py-1 text-gray-900 text-right font-mono border-r border-gray-200 ${isBaseline ? 'bg-blue-50' : ''}`}>
                                    {data
                                      ? formatNumber(data.actualPlusForecastTotal, node.format || '')
                                      : '-'}
                                  </td>
                                  {!isBaseline && (
                                    <>
                                      <td className={`px-2 py-1 text-right font-mono font-medium border-r border-gray-200 ${getDiffClass(diff, node)}`}>
                                        {diff !== null && !isNaN(diff)
                                          ? `${getDiffArrow(diff, node)} ${diff > 0 ? '+' : ''}${formatNumber(diff, node.format || '')}`
                                          : '-'}
                                      </td>
                                      <td className={`px-2 py-1 text-right font-mono font-medium border-r border-gray-200 ${getDiffClass(diff, node)}`}>
                                        {diffPercent !== null && !isNaN(diffPercent)
                                          ? `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`
                                          : '-'}
                                      </td>
                                    </>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 p-4 flex flex-col">
                  <div className="text-center mb-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {allNodes.find(n => n.id === selectedChartNode)?.name || ''}
                      {allNodes.find(n => n.id === selectedChartNode)?.unit ? ` (${allNodes.find(n => n.id === selectedChartNode)?.unit})` : ''}
                    </span>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip
                          formatter={(value) => {
                            const node = allNodes.find(n => n.id === selectedChartNode);
                            return [formatNumber(value, node?.format || ''), '值'];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="value">
                          {summaryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* 分月表 - 下半部分 */}
            <div className="h-1/2 flex flex-col">
              <div className="px-3 py-1.5 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">📅 分月对比 (仅预测期)</span>
                  <div className="flex bg-white rounded border overflow-hidden">
                    <button
                      onClick={() => setMonthlyActiveTab('table')}
                      className={`px-2 py-0.5 text-xs ${monthlyActiveTab === 'table' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100'}`}
                    >
                      表格
                    </button>
                    <button
                      onClick={() => setMonthlyActiveTab('chart')}
                      className={`px-2 py-0.5 text-xs ${monthlyActiveTab === 'chart' ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100'}`}
                    >
                      折线图
                    </button>
                  </div>
                </div>
                <button
                  onClick={exportMonthlyExcel}
                  className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs flex items-center gap-1"
                >
                  <span>📥</span>
                  导出Excel
                </button>
              </div>

              {monthlyActiveTab === 'table' ? (
                <div className="flex-1 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-100 sticky top-0 z-20">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-100 z-30 border-r border-gray-200 w-24">
                          指标名称
                        </th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-16">
                          单位
                        </th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-20">
                          月份
                        </th>
                        {selectedScenarios.map(scenario => {
                          const isBaseline = scenario.id === baselineScenarioId;
                          return (
                            <React.Fragment key={scenario.id}>
                              <th className={`px-2 py-1.5 text-center font-semibold uppercase tracking-wider border-r border-gray-200 ${
                                isBaseline ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                <span className="truncate inline-block max-w-[80px]" title={scenario.name}>
                                  {scenario.name}
                                </span>
                                {isBaseline && <span className="ml-0.5 text-xs">(基)</span>}
                              </th>
                              {!isBaseline && (
                                <>
                                  <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 bg-gray-50 w-20">
                                    差额
                                  </th>
                                  <th className="px-2 py-1.5 text-center font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 bg-gray-50 w-16">
                                    差额%
                                  </th>
                                </>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredNodes.flatMap((node) => {
                        return forecastMonthKeys.map((monthKey, monthIndex) => {
                          const baselineScenario = baselineScenarioId ? scenarios[baselineScenarioId] : null;
                          const baselineNode = baselineScenario?.nodes?.[node.id];
                          const isFirstMonth = monthIndex === 0;
                          const baselineValue = baselineNode?.timeData?.[monthKey];

                          return (
                            <tr
                              key={`${node.id}-${monthKey}`}
                              className={`hover:bg-gray-50 cursor-pointer ${selectedChartNode === node.id ? 'bg-indigo-50' : ''}`}
                              onClick={() => setSelectedChartNode(node.id)}
                            >
                              <td className="px-2 py-0.5 text-gray-900 font-medium sticky left-0 bg-white z-15 border-r border-gray-200 w-24">
                                {isFirstMonth ? node.name : ''}
                              </td>
                              <td className="px-2 py-0.5 text-gray-500 text-center border-r border-gray-200 w-16">
                                {isFirstMonth ? (node.unit || '-') : ''}
                              </td>
                              <td className="px-2 py-0.5 text-gray-600 text-center border-r border-gray-200 w-20">
                                {monthKey}
                              </td>
                              {selectedScenarios.map(scenario => {
                                const scenarioNode = scenario.nodes?.[node.id];
                                const value = scenarioNode?.timeData?.[monthKey];
                                const isBaseline = scenario.id === baselineScenarioId;
                                const diff = !isBaseline && baselineValue !== undefined && baselineValue !== null && value !== undefined && value !== null
                                  ? value - baselineValue
                                  : null;
                                const diffPercent = !isBaseline && baselineValue !== undefined && baselineValue !== null && value !== undefined && value !== null && baselineValue !== 0
                                  ? (diff / baselineValue) * 100
                                  : null;

                                return (
                                  <React.Fragment key={scenario.id}>
                                    <td className={`px-2 py-0.5 text-gray-900 text-right font-mono border-r border-gray-200 ${isBaseline ? 'bg-blue-50' : ''}`}>
                                      {value !== undefined && value !== null && !isNaN(value)
                                        ? formatNumber(value, node.format || '')
                                        : '-'}
                                    </td>
                                    {!isBaseline && (
                                      <>
                                        <td className={`px-2 py-0.5 text-right font-mono font-medium border-r border-gray-200 ${getDiffClass(diff, node)}`}>
                                          {diff !== null && !isNaN(diff)
                                            ? `${getDiffArrow(diff, node)} ${diff > 0 ? '+' : ''}${formatNumber(diff, node.format || '')}`
                                            : '-'}
                                        </td>
                                        <td className={`px-2 py-0.5 text-right font-mono font-medium border-r border-gray-200 ${getDiffClass(diff, node)}`}>
                                          {diffPercent !== null && !isNaN(diffPercent)
                                            ? `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`
                                            : '-'}
                                        </td>
                                      </>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 p-4 flex flex-col">
                  <div className="text-center mb-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {allNodes.find(n => n.id === selectedChartNode)?.name || ''}
                      {allNodes.find(n => n.id === selectedChartNode)?.unit ? ` (${allNodes.find(n => n.id === selectedChartNode)?.unit})` : ''}
                    </span>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip
                          formatter={(value) => {
                            const node = allNodes.find(n => n.id === selectedChartNode);
                            return [formatNumber(value, node?.format || ''), '值'];
                          }}
                        />
                        <Legend />
                        {selectedScenarios.map((scenario, index) => (
                          <Line
                            key={scenario.id}
                            type="monotone"
                            dataKey={scenario.name}
                            stroke={chartColors[index % chartColors.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScenarioComparePanel;
