import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FormulaParser } from '../../engine/FormulaParser';
import { formatValue as formatValueWithUnit } from '../../utils/formatters';
import { isPositiveIndicator } from '../../utils/formatters';
import html2canvas from 'html2canvas';

// 解析月份key，支持两种格式
function parseMonthKey(key) {
  try {
    const matchShort = key.match(/^(\d{1,2})月(实际|预测|目标)$/);
    if (matchShort) {
      const monthNum = parseInt(matchShort[1], 10);
      return {
        month: `${monthNum}月`,
        sortKey: monthNum,
        type: matchShort[2],
        fullKey: key
      };
    }
    const matchLong = key.match(/^(\d{4}-\d{2})-(实际|预测|目标)$/);
    if (matchLong) {
      return {
        month: matchLong[1],
        sortKey: matchLong[1],
        type: matchLong[2],
        fullKey: key
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// 获取排序后的月份列表
function getSortedMonths(timeData) {
  try {
    const monthMap = new Map();
    Object.keys(timeData || {}).forEach(key => {
      const parsed = parseMonthKey(key);
      if (parsed && !monthMap.has(parsed.month)) {
        monthMap.set(parsed.month, parsed.sortKey);
      }
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => (a[1] > b[1] ? 1 : -1))
      .map(([month]) => month);
  } catch (e) {
    return [];
  }
}

const WaterfallChart = ({ node, allNodes = {}, scenarioName = '当前方案', onClose }) => {
  const { name, type, formula } = node || {};

  // 导出图片处理函数
  const handleExportImage = useCallback(async () => {
    try {
      const element = document.getElementById('waterfall-chart-container');
      if (!element) {
        throw new Error('未找到图表元素');
      }

      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });

      const safeName = String(name || '节点').replace(/[\\/:*?"<>|]/g, '_');
      const link = document.createElement('a');
      link.download = `${safeName}_因素分析瀑布图.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      return true;
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请重试');
      return false;
    }
  }, [name]);

  // 窗口状态
  const [panelPosition, setPanelPosition] = useState({ x: 200, y: 80 });
  const [panelSize, setPanelSize] = useState({ width: 1000, height: 700 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'monthly'
  const [selectedMonth, setSelectedMonth] = useState(null);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });

  // ========================================================================
  // 窗口拖动和调整大小
  // ========================================================================
  const isScrollbarClick = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;
    const hasScrollbar = target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
    if (!hasScrollbar) return false;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isVerticalScrollbar = x > target.clientWidth - 20 && x <= rect.width;
    const isHorizontalScrollbar = y > target.clientHeight - 20 && y <= rect.height;
    return isVerticalScrollbar || isHorizontalScrollbar;
  };

  const handleDragStart = useCallback((e) => {
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
  }, [panelPosition]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: Math.max(0, panelStartPos.current.x + deltaX),
      y: Math.max(0, panelStartPos.current.y + deltaY)
    });
  }, [isDragging, panelStartPos]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
  }, [panelSize, panelPosition]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;
    let newX = panelStartPos.current.x;
    let newY = panelStartPos.current.y;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(700, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(550, panelStartSize.current.height + deltaY);
    }
    if (resizeHandle.includes('left')) {
      newWidth = Math.max(700, panelStartSize.current.width - deltaX);
      newX = panelStartPos.current.x + deltaX;
    }
    if (resizeHandle.includes('top')) {
      newHeight = Math.max(550, panelStartSize.current.height - deltaY);
      newY = panelStartPos.current.y + deltaY;
    }

    setPanelSize({ width: newWidth, height: newHeight });
    setPanelPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  }, [isResizing, resizeHandle, panelStartSize, panelStartPos]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

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
  }, [isDragging, isResizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  // ========================================================================
  // 核心计算逻辑 - 参考 TrendChart 的实现
  // ========================================================================

  // 计算某个节点在指定数据上下文中的值（支持 MONTHLY 公式）
  const computeNodeValue = useCallback((targetNode, nodesContext, monthKey = null) => {
    if (!targetNode) return 0;

    if (targetNode.type === 'driver') {
      // 驱动因子
      if (monthKey) {
        const data = nodesContext[targetNode.id]?.timeData || targetNode.timeData;
        if (data && data[monthKey] !== undefined) {
          return parseFloat(data[monthKey]) || 0;
        }
      }
      return nodesContext[targetNode.id]?.value ?? targetNode.value ?? 0;
    }

    // 计算指标
    if (!targetNode.formula) return 0;

    const allNodeIds = Object.keys(nodesContext);

    // 检查是否是 MONTHLY 节点
    if (monthKey && FormulaParser.hasMonthlyFunction(targetNode.formula)) {
      const detected = FormulaParser.detectMonthlyFunction(targetNode.formula);
      if (!detected) return 0;

      const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
      const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);

      // 检查是否有外层公式
      const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
      const hasOuterFormula = formulaWithPlaceholder !== placeholder;
      let outerCompileFn = null;
      if (hasOuterFormula) {
        try {
          outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        } catch (e) {}
      }

      // 计算该月的值
      try {
        const monthValues = {};
        innerDeps.forEach(depId => {
          const depNode = nodesContext[depId] || allNodes[depId];
          if (depNode) {
            if (depNode.type === 'driver') {
              // 驱动因子：直接取该月数据
              const data = nodesContext[depId]?.timeData || depNode.timeData;
              if (data && data[monthKey] !== undefined) {
                monthValues[depId] = parseFloat(data[monthKey]) || 0;
              } else {
                monthValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
              }
            } else {
              // 计算指标：递归计算
              monthValues[depId] = computeNodeValue(depNode, nodesContext, monthKey);
            }
          }
        });

        let monthValue = innerCompileFn(monthValues);
        if (hasOuterFormula && outerCompileFn) {
          try {
            monthValue = outerCompileFn({ [placeholder]: monthValue });
          } catch (e) {}
        }
        return isNaN(monthValue) ? 0 : monthValue;
      } catch (e) {
        return 0;
      }
    }

    // 普通计算（非 MONTHLY 或非分月模式）
    const deps = FormulaParser.extractDependencies(targetNode.formula, allNodeIds);

    // 构建值上下文
    const valueContext = {};
    deps.forEach(depId => {
      const depNode = nodesContext[depId] || allNodes[depId];
      if (depNode) {
        if (monthKey) {
          // 分月计算
          const data = nodesContext[depId]?.timeData || depNode.timeData;
          if (data && data[monthKey] !== undefined) {
            valueContext[depId] = parseFloat(data[monthKey]) || 0;
          } else {
            valueContext[depId] = computeNodeValue(depNode, nodesContext, monthKey);
          }
        } else {
          // 汇总计算
          valueContext[depId] = computeNodeValue(depNode, nodesContext);
        }
      }
    });

    try {
      const compileFn = FormulaParser.compile(targetNode.formula, allNodeIds);
      const result = compileFn(valueContext);
      return isNaN(result) ? 0 : result;
    } catch (e) {
      return 0;
    }
  }, [allNodes]);

  // 构建初始状态的节点上下文（使用 originalTimeData）
  const buildInitialContext = useCallback(() => {
    const context = {};
    Object.values(allNodes).forEach(n => {
      if (n.type === 'driver') {
        context[n.id] = {
          ...n,
          timeData: n.originalTimeData ? { ...n.originalTimeData } : { ...n.timeData },
          value: n.initialBaseline ?? n.baseline ?? n.value
        };
      } else {
        context[n.id] = { ...n };
      }
    });
    return context;
  }, [allNodes]);

  // 构建当前状态的节点上下文
  const buildCurrentContext = useCallback(() => {
    const context = {};
    Object.values(allNodes).forEach(n => {
      context[n.id] = { ...n };
    });
    return context;
  }, [allNodes]);

  // 获取所有底层驱动因子（递归查找）
  const getDirectDependencies = useCallback((targetNode) => {
    const drivers = [];
    const visited = new Set();

    const traverse = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const depNode = allNodes[nodeId];
      if (!depNode) return;

      if (depNode.type === 'driver') {
        if (!drivers.find(d => d.id === nodeId)) {
          drivers.push(depNode);
        }
        return;
      }

      // 计算指标：继续递归查找
      const deps = depNode.dependsOn || [];
      deps.forEach(depId => traverse(depId));
    };

    const directDeps = targetNode.dependsOn || [];
    directDeps.forEach(depId => traverse(depId));

    return drivers;
  }, [allNodes]);

  // 计算单个驱动因子变化的影响（保持其他驱动因子不变）
  const computeDriverImpact = useCallback((driverId, initialContext, currentContext, monthKey = null) => {
    // 创建混合上下文：这个驱动因子用当前值，其他用初始值
    const mixedContext = {};

    // 先复制初始上下文
    Object.keys(initialContext).forEach(id => {
      mixedContext[id] = { ...initialContext[id] };
      if (mixedContext[id].timeData) {
        mixedContext[id].timeData = { ...mixedContext[id].timeData };
      }
    });

    // 更新指定驱动因子为当前值（完整替换）
    const currentDriver = currentContext[driverId];
    if (currentDriver) {
      mixedContext[driverId] = { ...currentDriver };
    }

    // 计算混合上下文下的目标节点值
    return computeNodeValue(node, mixedContext, monthKey);
  }, [node, computeNodeValue]);

  // ========================================================================
  // 准备数据
  // ========================================================================

  // 计算目标值
  const computeTargetValue = useCallback((targetNode, monthKey = null) => {
    if (!targetNode) return 0;

    if (monthKey) {
      // 分月模式：从 timeData 中读取目标值
      let targetKey;
      if (monthKey.includes('月')) {
        const monthNum = parseInt(monthKey);
        targetKey = `${monthNum}月目标`;
      } else {
        targetKey = `${monthKey}-目标`;
      }
      if (targetNode.timeData && targetNode.timeData[targetKey] !== undefined) {
        return parseFloat(targetNode.timeData[targetKey]) || 0;
      }
    }

    // 汇总模式或者分月没有目标值：使用 targetValue 或 baseline
    if (targetNode.targetValue !== null && targetNode.targetValue !== undefined && !isNaN(targetNode.targetValue)) {
      return targetNode.targetValue;
    }
    if (targetNode.baseline !== null && targetNode.baseline !== undefined && !isNaN(targetNode.baseline)) {
      return targetNode.baseline;
    }
    return 0;
  }, []);

  const waterfallData = useMemo(() => {
    if (!node || node.type !== 'computed') return null;

    const initialContext = buildInitialContext();
    const currentContext = buildCurrentContext();
    const directDrivers = getDirectDependencies(node);

    // 计算初始值、当前值和目标值（汇总）
    const initialValue = computeNodeValue(node, initialContext);
    const currentValue = computeNodeValue(node, currentContext);
    const targetValue = computeTargetValue(node);

    // 计算每个驱动因子的影响
    const driverImpacts = [];

    directDrivers.forEach(driver => {
      const impactedValue = computeDriverImpact(driver.id, initialContext, currentContext);
      // 影响 = 只有这个驱动因子变化时的目标值 - 初始值
      const impact = impactedValue - initialValue;

      // 只记录有实际影响的因素（影响不为0）
      if (Math.abs(impact) > 0.0000001) {
        driverImpacts.push({
          driver,
          impact,
          startValue: initialValue,
          endValue: impactedValue
        });
      }
    });

    // 确保最后能对到调整后的值（修正浮点误差）
    // 计算当前所有影响的总和
    const totalImpact = driverImpacts.reduce((sum, impact) => sum + impact.impact, 0);
    const remainingDiff = (currentValue - initialValue) - totalImpact;
    if (Math.abs(remainingDiff) > 0.0000001 && driverImpacts.length > 0) {
      // 将剩余差异加到第一个影响因素上（或者创建一个新的"其他"因素）
      const firstImpact = driverImpacts[0];
      firstImpact.impact += remainingDiff;
      firstImpact.endValue = firstImpact.startValue + firstImpact.impact;
    }

    // 获取月份列表（分月模式用）
    const months = getSortedMonths(node.timeData || {});
    const forecastMonths = months.filter(m => {
      const key = m.includes('月') ? `${parseInt(m)}月预测` : `${m}-预测`;
      return (node.timeData && node.timeData[key] !== undefined);
    });

    // 如果没有选择月份，默认选第一个预测月
    if (!selectedMonth && forecastMonths.length > 0) {
      setTimeout(() => setSelectedMonth(forecastMonths[0]), 0);
    }

    return {
      initialValue,
      currentValue,
      targetValue,
      totalChange: currentValue - initialValue,
      diffToTarget: currentValue - targetValue,
      driverImpacts,
      months,
      forecastMonths
    };
  }, [node, buildInitialContext, buildCurrentContext, getDirectDependencies, computeNodeValue, computeDriverImpact, computeTargetValue, selectedMonth]);

  // 分月数据：比较初始预测 vs 调整后预测
  const monthlyWaterfallData = useMemo(() => {
    if (!node || node.type !== 'computed' || !selectedMonth || !waterfallData) return null;

    const initialContext = buildInitialContext();
    const currentContext = buildCurrentContext();
    const directDrivers = getDirectDependencies(node);

    // 构造月份key - 只看预测
    let forecastKey;
    if (selectedMonth.includes('月')) {
      const monthNum = parseInt(selectedMonth);
      forecastKey = `${monthNum}月预测`;
    } else {
      forecastKey = `${selectedMonth}-预测`;
    }

    // 计算初始预测值、当前预测值和目标值
    const initialForecastValue = computeNodeValue(node, initialContext, forecastKey);
    const currentForecastValue = computeNodeValue(node, currentContext, forecastKey);
    const targetValue = computeTargetValue(node, selectedMonth);

    // 计算每个驱动因子的影响
    const driverImpacts = [];

    directDrivers.forEach(driver => {
      const impactedValue = computeDriverImpact(driver.id, initialContext, currentContext, forecastKey);
      // 影响 = 只有这个驱动因子变化时的目标值 - 初始值
      const impact = impactedValue - initialForecastValue;

      // 只记录有实际影响的因素（影响不为0）
      if (Math.abs(impact) > 0.0000001) {
        driverImpacts.push({
          driver,
          impact,
          startValue: initialForecastValue,
          endValue: impactedValue
        });
      }
    });

    // 确保最后能对到调整后的值（修正浮点误差）
    // 计算当前所有影响的总和
    const totalImpact = driverImpacts.reduce((sum, impact) => sum + impact.impact, 0);
    const remainingDiff = (currentForecastValue - initialForecastValue) - totalImpact;
    if (Math.abs(remainingDiff) > 0.0000001 && driverImpacts.length > 0) {
      // 将剩余差异加到第一个影响因素上
      const firstImpact = driverImpacts[0];
      firstImpact.impact += remainingDiff;
      firstImpact.endValue = firstImpact.startValue + firstImpact.impact;
    }

    return {
      month: selectedMonth,
      baseValue: initialForecastValue,
      compareValue: currentForecastValue,
      targetValue,
      totalChange: currentForecastValue - initialForecastValue,
      diffToTarget: currentForecastValue - targetValue,
      driverImpacts
    };
  }, [node, selectedMonth, waterfallData, buildInitialContext, buildCurrentContext, getDirectDependencies, computeNodeValue, computeDriverImpact, computeTargetValue]);

  if (!node || node.type !== 'computed') {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9998,
        pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          width: '500px',
          maxWidth: '90vw',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          pointerEvents: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              📊 {name || '节点'} - 因素分析
            </h2>
            <button onClick={onClose} style={{ fontSize: '24px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
          <p style={{ color: '#6b7280' }}>请选择计算指标节点查看因素分析</p>
        </div>
      </div>
    );
  }

  const activeData = viewMode === 'summary' ? waterfallData : monthlyWaterfallData;
  if (!activeData) return null;

  // 准备瀑布图数据点
  const bars = useMemo(() => {
    const result = [];

    if (viewMode === 'summary') {
      // 汇总模式
      result.push({
        type: 'start',
        label: '初始值',
        value: waterfallData.initialValue,
        start: 0,
        end: waterfallData.initialValue
      });

      waterfallData.driverImpacts.forEach((impact, i) => {
        result.push({
          type: 'change',
          label: impact.driver ? impact.driver.name : (impact.name || '因素'),
          value: impact.impact,
          start: impact.startValue,
          end: impact.endValue,
          driver: impact.driver
        });
      });

      result.push({
        type: 'end',
        label: `${scenarioName}调整`,
        value: waterfallData.currentValue,
        start: 0,
        end: waterfallData.currentValue
      });

      // 添加目标值柱子
      result.push({
        type: 'target',
        label: '目标值',
        value: waterfallData.targetValue,
        start: 0,
        end: waterfallData.targetValue,
        diffToTarget: waterfallData.diffToTarget
      });
    } else {
      // 分月模式
      result.push({
        type: 'start',
        label: '初始预测',
        value: monthlyWaterfallData.baseValue,
        start: 0,
        end: monthlyWaterfallData.baseValue
      });

      monthlyWaterfallData.driverImpacts.forEach((impact, i) => {
        result.push({
          type: 'change',
          label: impact.driver ? impact.driver.name : (impact.name || '因素'),
          value: impact.impact,
          start: impact.startValue,
          end: impact.endValue,
          driver: impact.driver
        });
      });

      result.push({
        type: 'end',
        label: `${scenarioName}调整`,
        value: monthlyWaterfallData.compareValue,
        start: 0,
        end: monthlyWaterfallData.compareValue
      });

      // 添加目标值柱子
      result.push({
        type: 'target',
        label: '目标值',
        value: monthlyWaterfallData.targetValue,
        start: 0,
        end: monthlyWaterfallData.targetValue,
        diffToTarget: monthlyWaterfallData.diffToTarget
      });
    }

    return result;
  }, [viewMode, waterfallData, monthlyWaterfallData, scenarioName]);

  // 图表尺寸
  const chartWidth = Math.max(600, panelSize.width - 100);
  const chartHeight = Math.max(300, panelSize.height - 350);
  const padding = { top: 60, right: 40, bottom: 80, left: 100 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight;

  // 计算数值范围
  const allValues = useMemo(() => {
    const vals = [];
    bars.forEach(bar => {
      vals.push(bar.start);
      vals.push(bar.end);
    });
    return vals.filter(v => !isNaN(v) && isFinite(v));
  }, [bars]);

  let minValue = Math.min(...allValues);
  let maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 10;
  minValue = minValue - range * 0.15;
  maxValue = maxValue + range * 0.15;

  // 坐标转换
  const barWidth = Math.max(40, Math.min(100, plotWidth / bars.length - 20));
  const barGap = (plotWidth - barWidth * bars.length) / (bars.length + 1);

  const xScale = (index) => padding.left + barGap + index * (barWidth + barGap);
  const yScale = (value) => {
    if (isNaN(value) || !isFinite(value)) return null;
    return padding.top + plotHeight - ((value - minValue) / (maxValue - minValue || 1)) * plotHeight;
  };

  // 使用节点的 format 和 unit 格式化数值
  const formatValue = (value) => {
    return formatValueWithUnit(value, node?.format || '', node?.unit || '');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9998,
      pointerEvents: 'none'
    }}>
      {/* 浮动窗口 */}
      <div
        style={{
          position: 'absolute',
          left: panelPosition.x,
          top: panelPosition.y,
          width: panelSize.width,
          height: panelSize.height,
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'default',
          pointerEvents: 'auto'
        }}
      >
        {/* 调整大小的句柄 */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 16, height: 16, cursor: 'nw-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, cursor: 'ne-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 16, height: 16, cursor: 'sw-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, cursor: 'se-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
        <div style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 8, cursor: 'n-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top')} />
        <div style={{ position: 'absolute', bottom: 0, left: 16, right: 16, height: 8, cursor: 's-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
        <div style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 8, cursor: 'w-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'left')} />
        {/* 右侧调整大小句柄：只保留顶部和底部各 40px，给滚动条留出中间空间 */}
        <div style={{ position: 'absolute', right: 0, top: 16, width: 8, height: 40, cursor: 'e-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'right')} />
        <div style={{ position: 'absolute', right: 0, bottom: 16, width: 8, height: 40, cursor: 'e-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'right')} />

        {/* 标题栏 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            background: 'linear-gradient(to right, #f9fafb, #f3f4f6)'
          }}
          onMouseDown={handleDragStart}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
            📊 {name || '节点'} - 因素分析
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 导出图片按钮 */}
            <button
              onClick={handleExportImage}
              style={{
                fontSize: '14px',
                color: '#3b82f6',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#dbeafe';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#eff6ff';
              }}
              title="导出图片"
            >
              🖼️ 导出
            </button>
            <button onClick={onClose} style={{
              fontSize: '24px',
              color: '#9ca3af',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px'
            }}>
              ✕
            </button>
          </div>
        </div>

        {/* 工具栏 */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: '#fafafa'
        }}>
          {/* 查看模式切换 */}
          <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('summary')}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                background: viewMode === 'summary' ? 'white' : 'transparent',
                color: viewMode === 'summary' ? '#1f2937' : '#6b7280',
                boxShadow: viewMode === 'summary' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              汇总视图
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                background: viewMode === 'monthly' ? 'white' : 'transparent',
                color: viewMode === 'monthly' ? '#1f2937' : '#6b7280',
                boxShadow: viewMode === 'monthly' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              分月视图
            </button>
          </div>

          {/* 月份选择（分月模式） */}
          {viewMode === 'monthly' && waterfallData && waterfallData.forecastMonths.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>选择月份：</span>
              <select
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '13px',
                  background: 'white'
                }}
              >
                {waterfallData.forecastMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* 总体变化摘要 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>初始值：</span>
              <span style={{ fontWeight: 600, color: '#3b82f6' }}>
                {formatValue(viewMode === 'summary' ? waterfallData.initialValue : monthlyWaterfallData?.baseValue)}
              </span>
            </div>
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>变化：</span>
              <span style={{
                fontWeight: 600,
                color: (viewMode === 'summary' ? waterfallData.totalChange : monthlyWaterfallData?.totalChange) >= 0 ? '#10b981' : '#ef4444'
              }}>
                {(viewMode === 'summary' ? waterfallData.totalChange : monthlyWaterfallData?.totalChange) >= 0 ? '+' : ''}
                {formatValue(viewMode === 'summary' ? waterfallData.totalChange : monthlyWaterfallData?.totalChange)}
              </span>
            </div>
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>调整后：</span>
              <span style={{ fontWeight: 600, color: '#8b5cf6' }}>
                {formatValue(viewMode === 'summary' ? waterfallData.currentValue : monthlyWaterfallData?.compareValue)}
              </span>
            </div>
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>目标值：</span>
              <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                {formatValue(viewMode === 'summary' ? waterfallData.targetValue : monthlyWaterfallData?.targetValue)}
              </span>
            </div>
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: '#6b7280' }}>与目标差额：</span>
              <span style={{
                fontWeight: 600,
                color: (viewMode === 'summary' ? waterfallData.diffToTarget : monthlyWaterfallData?.diffToTarget) >= 0 ? '#10b981' : '#ef4444'
              }}>
                {(viewMode === 'summary' ? waterfallData.diffToTarget : monthlyWaterfallData?.diffToTarget) >= 0 ? '+' : ''}
                {formatValue(viewMode === 'summary' ? waterfallData.diffToTarget : monthlyWaterfallData?.diffToTarget)}
              </span>
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div id="waterfall-chart-container" style={{ padding: '20px 24px 20px 20px', flex: 1, overflow: 'auto', background: '#fff' }}>
          {/* 瀑布图 */}
          <svg width={chartWidth} height={chartHeight + 100} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            {/* Y轴网格线 */}
            {[0, 1, 2, 3, 4, 5].map(i => {
              const y = padding.top + (plotHeight / 5) * i;
              const value = maxValue - ((maxValue - minValue) / 5) * i;
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#6b7280"
                    fontSize="12"
                  >
                    {formatValue(value)}
                  </text>
                </g>
              );
            })}

            {/* 连接线 */}
            {bars.slice(0, -1).map((bar, i) => {
              const nextBar = bars[i + 1];
              // 如果下一个是 target，不画连接线
              if (nextBar.type === 'target') return null;

              const x1 = xScale(i) + barWidth;
              const y1 = yScale(bar.end);
              const x2 = xScale(i + 1);
              const y2 = yScale(nextBar.type === 'end' ? nextBar.end : nextBar.start);

              if (y1 === null || y2 === null) return null;

              return (
                <line
                  key={`connector-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#9ca3af"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                />
              );
            })}

            {/* 柱子 */}
            {bars.map((bar, i) => {
              const x = xScale(i);
              let yStart, yEnd, color;

              if (bar.type === 'start') {
                yStart = yScale(0);
                yEnd = yScale(bar.value);
                color = '#3b82f6';
              } else if (bar.type === 'end') {
                yStart = yScale(0);
                yEnd = yScale(bar.value);
                color = '#8b5cf6';
              } else if (bar.type === 'target') {
                yStart = yScale(0);
                yEnd = yScale(bar.value);
                color = '#f59e0b'; // 橙色 - 目标值
              } else {
                yStart = yScale(bar.start);
                yEnd = yScale(bar.end);
                color = bar.value >= 0 ? '#10b981' : '#ef4444';
              }

              if (yStart === null || yEnd === null) return null;

              const barTop = Math.min(yStart, yEnd);
              const barHeight = Math.abs(yEnd - yStart);

              return (
                <g key={`bar-${i}`}>
                  {/* 柱子 */}
                  <rect
                    x={x}
                    y={barTop}
                    width={barWidth}
                    height={Math.max(2, barHeight)}
                    fill={color}
                    rx="4"
                  />

                  {/* 数值标注 - 所有柱子都显示 */}
                  <text
                    x={x + barWidth / 2}
                    y={barTop - 8}
                    textAnchor="middle"
                    fill={color}
                    fontSize="12"
                    fontWeight="600"
                  >
                    {bar.type === 'change' ? (bar.value >= 0 ? '+' : '') : ''}
                    {formatValue(bar.type === 'change' ? bar.value : bar.value)}
                  </text>

                  {/* X轴标签 */}
                  <text
                    x={x + barWidth / 2}
                    y={padding.top + plotHeight + 20}
                    textAnchor="middle"
                    fill="#4b5563"
                    fontSize="11"
                    transform={`rotate(-30, ${x + barWidth / 2}, ${padding.top + plotHeight + 25})`}
                  >
                    {bar.label}
                  </text>
                </g>
              );
            })}

            {/* 从调整后到目标值的差额连接线和标注 */}
            {(() => {
              // 找到 end 柱子和 target 柱子的索引
              const endIndex = bars.findIndex(b => b.type === 'end');
              const targetIndex = bars.findIndex(b => b.type === 'target');
              if (endIndex === -1 || targetIndex === -1) return null;

              const endBar = bars[endIndex];
              const targetBar = bars[targetIndex];
              const endValue = endBar.value;
              const targetValue = targetBar.value;
              const diff = endValue - targetValue;

              const endX = xScale(endIndex) + barWidth / 2;
              const targetX = xScale(targetIndex) + barWidth / 2;
              const endY = yScale(endValue);
              const targetY = yScale(targetValue);
              const midX = (endX + targetX) / 2;

              // 找到两条线中更靠上的位置（更小的y值），把差额标注放在那上方
              const higherY = Math.min(endY !== null ? endY : Infinity, targetY !== null ? targetY : Infinity);
              const labelY = Math.min(endY, targetY) - 30; // 在更高的位置，避免被遮挡

              if (endY === null || targetY === null) return null;

              // 根据指标方向判断颜色
              const isPositive = isPositiveIndicator(node?.name || '');
              // 正向指标：超过目标是好的（绿色），未达目标是坏的（红色）
              // 反向指标：超过目标是坏的（红色），未达目标是好的（绿色）
              let diffColor;
              if (isPositive) {
                // 正向指标：diff > 0 表示超过目标，好（绿色）
                diffColor = diff >= 0 ? '#10b981' : '#ef4444';
              } else {
                // 反向指标：diff > 0 表示超过目标（费用超支），坏（红色）
                diffColor = diff >= 0 ? '#ef4444' : '#10b981';
              }

              return (
                <g key="diff-to-target">
                  {/* 两条竖线 */}
                  <line
                    x1={endX}
                    y1={endY}
                    x2={endX}
                    y2={labelY + 20}
                    stroke={diffColor}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                  <line
                    x1={targetX}
                    y1={targetY}
                    x2={targetX}
                    y2={labelY + 20}
                    stroke={diffColor}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                  {/* 中间横线 */}
                  <line
                    x1={endX}
                    y1={labelY + 20}
                    x2={targetX}
                    y2={labelY + 20}
                    stroke={diffColor}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                  {/* 差额标注 - 放在更上方 */}
                  <text
                    x={midX}
                    y={labelY}
                    textAnchor="middle"
                    fill={diffColor}
                    fontSize="13"
                    fontWeight="700"
                  >
                    差额: {diff >= 0 ? '+' : ''}{formatValue(diff)}
                  </text>
                </g>
              );
            })()}
          </svg>

          {/* 数据详情表 */}
          <div style={{ marginTop: '20px', background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>因素明细：</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>因素</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>影响额</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>占总变化比例</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewMode === 'summary' ? waterfallData.driverImpacts : monthlyWaterfallData?.driverImpacts || []).map((impact, i) => {
                    const totalChange = viewMode === 'summary' ? waterfallData.totalChange : monthlyWaterfallData?.totalChange;
                    const percentage = totalChange !== 0 ? (impact.impact / totalChange * 100) : 0;
                    return (
                      <tr key={i}>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
                          {impact.driver ? impact.driver.name : (impact.name || '因素')}
                        </td>
                        <td style={{
                          textAlign: 'right',
                          padding: '6px 12px',
                          borderBottom: '1px solid #f3f4f6',
                          color: impact.impact >= 0 ? '#10b981' : '#ef4444',
                          fontWeight: 500
                        }}>
                          {impact.impact >= 0 ? '+' : ''}{formatValue(impact.impact)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
                          {percentage.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaterfallChart;
