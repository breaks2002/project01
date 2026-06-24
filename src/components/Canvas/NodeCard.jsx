import React, { useMemo, useState, useRef, useCallback } from 'react';
import { NODE_COLORS } from '../../utils/colors';
import { formatValue, getDiffColorClass, isPositiveIndicator, aggregateTimeData } from '../../utils/formatters';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 12; // 每页12期（3行×4个）


// 判断 timeData key 的类型（支持新旧格式）
// 新格式：202601-AC, 202601-FC, 202601-BU
// 旧格式：1 月实际，1 月预测，1 月目标
function isActualKey(key) {
  return key.endsWith('-AC') || key.includes('实际');
}

function isForecastKey(key) {
  return key.endsWith('-FC') || key.includes('预测');
}

function isTargetKey(key) {
  return key.endsWith('-BU') || key.includes('目标');
}

// 检测时间维度类型
function detectTimeDimension(timeData) {
  if (!timeData) return 'unknown';
  const keys = Object.keys(timeData);
  if (keys.length === 0) return 'unknown';

  const firstKey = keys[0];
  // 周度格式：2026WK01-AC
  if (/^\d{4}WK\d{2}-/.test(firstKey)) {
    return 'week';
  }
  // 季度格式：2026Q1-AC
  if (/^\d{4}Q[1-4]-/.test(firstKey)) {
    return 'quarter';
  }
  // 年度格式：2026-AC
  if (/^\d{4}-/.test(firstKey)) {
    return 'year';
  }
  // 新月度格式：202601-AC
  if (/^\d{6}-/.test(firstKey)) {
    return 'month';
  }
  // 旧月度格式：1 月实际
  if (firstKey.includes('月')) {
    return 'month';
  }
  // 过渡格式：2024-01-实际
  if (/^\d{4}-\d{2}-/.test(firstKey)) {
    return 'month';
  }
  return 'period';
}

// 获取时间维度的短名称（用于计数显示）
function getTimeUnitName(timeDim) {
  const names = {
    year: '年',
    quarter: '季',
    month: '月',
    week: '周',
    day: '日',
    period: '期',
    unknown: '期'
  };
  return names[timeDim] || '期';
}

// 获取时间维度的中文名称
function getTimeDimensionName(timeDim) {
  const names = {
    year: '年度',
    quarter: '季度',
    month: '月度',
    week: '周度',
    day: '日度',
    period: '分期',
    unknown: '分期'
  };
  return names[timeDim] || '分期';
}

// 格式化期间显示
function formatPeriodKey(key) {
  // 2026WK13-FC -> 2026WK13
  // 202601-FC -> 202601
  // 2026Q1-FC -> 2026Q1
  // 2026-FC -> 2026
  // 1 月预测 -> 1 月
  const match = key.match(/^([^-]+)/);
  return match ? match[1] : key;
}

const NodeCard = ({ node, allNodes, onSelect, isSelected, onValueChange, onDelete, onEdit, onResize, onMouseDown, isCollapsed, onToggleCollapse, onResetToInitial, isHighlighted = false, isAffected = false, isDownstream = false, isDependency = false, onOpenTrendChart, onOpenWaterfallChart, onMonthValueChange, onBringNodeToFront, isFront = false, isDragging = false }) => {
  const colors = NODE_COLORS[node.type] || NODE_COLORS.computed;
  const isDriver = node.type === 'driver';
  const [isResizing, setIsResizing] = useState(false);
  const [percentInput, setPercentInput] = useState('');
  const [localInputValue, setLocalInputValue] = useState(null);

  // 当节点的值从外部（如AI调参）更新时，重置本地输入值
  React.useEffect(() => {
    setLocalInputValue(null);
  }, [node.value]);

  // 当节点的 adjustmentDescription 从外部更新时，同步到本地状态
  React.useEffect(() => {
    setAdjustmentDescription(node.adjustmentDescription || '');
  }, [node.adjustmentDescription]);

  // 关键修复：当节点的 periodData 变化时，同步 monthEdits 状态
  // 这样调整后的值会在面板中正确显示
  React.useEffect(() => {
    if (node.periodData && isDriver) {
      const forecastPeriods = {};
      Object.entries(node.periodData).forEach(([key, data]) => {
        // 只处理预测期的数据（必须有 FC 数据且不为 0）
        const hasForecast = (
          data?.forecast !== null &&
          data?.forecast !== undefined &&
          data?.forecast !== 0
        );
        if (hasForecast) {
          forecastPeriods[key] = data.forecast;
        }
      });
      if (Object.keys(forecastPeriods).length > 0) {
        setMonthEdits(forecastPeriods);
      }
    }
  }, [node.periodData, isDriver]);

  const [isMonthEditMode, setIsMonthEditMode] = useState(false);
  const [monthEdits, setMonthEdits] = useState({});
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [editingMonthKey, setEditingMonthKey] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [isWeightEditMode, setIsWeightEditMode] = useState(false);
  const [monthWeights, setMonthWeights] = useState({});
  const [monthPage, setMonthPage] = useState(0);     // 分期调整当前页码
  const [weightPage, setWeightPage] = useState(0);   // 权重分配当前页码
  const [isDescriptionEditMode, setIsDescriptionEditMode] = useState(false);
  const [adjustmentDescription, setAdjustmentDescription] = useState(node.adjustmentDescription || '');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const cardRef = useRef(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const lastClickTimeRef = useRef(0);

  // 辅助函数：判断 aggregationType 是否为空（处理 undefined/null/''）
  const isAggTypeEmpty = (aggType) => aggType === undefined || aggType === null || aggType === '';

  // 判断是否为平均模式（支持三种模式）
  // - aggregationType === 'average' → 平均
  // - aggregationType === 'sum' → 加总
  // - aggregationType === '' 或 undefined → 自动（%用平均，其他用加总）
  const isAvgMode = node.aggregationType === 'average' || (isAggTypeEmpty(node.aggregationType) && node.unit === '%');

  // 聚合时间数据 - 根据节点的 aggregationType 选择聚合方式
  const aggregated = useMemo(() => {
    let aggType = node.aggregationType;
    // 自动模式：空值时，% 用平均，其他用加总
    if (isAggTypeEmpty(aggType)) {
      aggType = node.unit === '%' ? 'average' : 'sum';
    }

    // 调试：打印驱动因子的聚合类型
    if (isDriver && node.name === '商机数') {
      // 先计算结果以便调试
      const tempResult = aggregateTimeData(node.timeData, aggType);
      return tempResult;
    }

    // 关键修复：对于计算指标（非驱动因子），直接使用 node.summary 中的汇总值
    // 因为 summary 已经包含了新架构计算好的调整后值
    if (node.type !== 'driver' && node.summary) {
      return {
        actualTotal: node.summary.actualTotal ?? 0,
        forecastTotal: node.summary.forecastTotal ?? 0,
        targetTotal: node.summary.targetTotal ?? 0,
        actualPlusForecastTotal: node.summary.actualPlusForecast ?? 0,
        actualCount: node.summary.actualCount ?? node.summary.actualPeriods ?? 0,
        forecastCount: node.summary.forecastCount ?? node.summary.forecastPeriods ?? 0,
        targetCount: node.summary.budgetCount ?? node.summary.targetPeriods ?? 0,
        diffVsTarget: (node.summary.actualPlusForecast ?? 0) - (node.summary.targetTotal ?? 0),
        diffPercentVsTarget: (node.summary.targetTotal ?? 0) !== 0
          ? (((node.summary.actualPlusForecast ?? 0) - (node.summary.targetTotal ?? 0)) / (node.summary.targetTotal ?? 0)) * 100
          : null,
        actualMonths: [],
        forecastMonths: [],
        targetMonths: []
      };
    }

    // 如果是计算指标且有 formula，直接使用 timeData 聚合
    if (node.formula && node.type !== 'driver') {
      return aggregateTimeData(node.timeData, aggType);
    }

    // 否则使用普通聚合（驱动因子）
    return aggregateTimeData(node.timeData, aggType);
  }, [node.timeData, node.aggregationType, node.unit, node.formula, node.type, allNodes, node.summary]);

  // 检测时间维度
  const timeDimension = useMemo(() => detectTimeDimension(node.timeData), [node.timeData]);
  const timeDimensionName = getTimeDimensionName(timeDimension);
  const timeUnitName = getTimeUnitName(timeDimension);

  // 初始化月份编辑数据
  const [actualTotal, setActualTotal] = useState(0);

  React.useEffect(() => {
    if (node.timeData && isMonthEditMode) {
      const edits = {};
      let actualSum = 0;
      Object.keys(node.timeData).forEach(key => {
        if (isActualKey(key)) {
          const val = parseFloat(node.timeData[key]);
          if (!isNaN(val)) actualSum += val;
        }
        if (isForecastKey(key)) {
          // 只存储一次，避免重复
          if (!edits[key]) {
            edits[key] = node.timeData[key];
          }
        }
      });
      setMonthEdits(edits);
      setActualTotal(actualSum);
    }
  }, [node.timeData, isMonthEditMode]);

  // 获取节点尺寸 - 横向长条形（更宽更窄）
  const nodeWidth = useMemo(() => {
    const baseWidth = node.size?.width || 520;
    // 月份编辑模式下，根据月份数量动态调整宽度
    // 每个月份约 95px（含 gap），最多显示 4 个/行
    if (isMonthEditMode && isDriver) {
      const monthCount = Object.keys(monthEdits).filter(k => k.includes('预测')).length;
      if (monthCount > 4) {
        // 多行显示：宽度固定为 4 个月的宽度 + padding
        return Math.max(baseWidth, 420);
      } else if (monthCount > 0) {
        // 单行显示：根据月份数量调整
        return Math.max(baseWidth, monthCount * 95 + 60);
      }
    }
    return baseWidth;
  }, [node.size, isMonthEditMode, isDriver, monthEdits]);

  const nodeHeight = node.size?.height || 'auto';

  // ========== 节点值 ==========
  let nodeValue = 0;

  if (isDriver) {
    // 驱动因素：检查 node.value 是否与 timeData 聚合值一致
    // 如果不一致（如AI调参后），优先使用 node.value
    // isAvgMode 已在组件顶部定义
    const aggregatedValue = aggregated.actualPlusForecastTotal;
    const storedValue = node.value ?? node.baseline ?? 0;

    // 平均模式下，始终使用聚合值（因为聚合值已按 average 计算）
    // 加总模式下，如果 storedValue 与 aggregatedValue 差异较大（>0.01），说明 value 被手动/AI设置过
    if (isAvgMode) {
      nodeValue = aggregatedValue;
    } else if (Math.abs(storedValue - aggregatedValue) > 0.01) {
      nodeValue = storedValue;
    } else if (aggregatedValue !== null && aggregatedValue !== undefined && !isNaN(aggregatedValue)) {
      nodeValue = aggregatedValue;
    } else {
      nodeValue = storedValue;
    }
  } else {
    // 计算指标：使用 node.value（来自 ArchitectureAdapter 的 value 字段）
    if (node.value !== null && node.value !== undefined && !isNaN(node.value)) {
      nodeValue = node.value;
    } else if (aggregated.actualTotal !== null &&
        aggregated.actualTotal !== undefined &&
        aggregated.actualTotal !== 0) {
      nodeValue = aggregated.actualTotal;
    }
  }

  // ========== 目标值和差额计算 ==========
  let displayBaseline;
  let changeAmount;
  let changePercent;

  if (!isDriver) {
    // ========== 计算指标 ==========
    if (node.targetValue !== null && node.targetValue !== undefined && !isNaN(node.targetValue)) {
      displayBaseline = node.targetValue;
    } else if (node.baseline !== null && node.baseline !== undefined) {
      displayBaseline = node.baseline;
    } else {
      displayBaseline = 0;
    }
    if (displayBaseline === 0 && nodeValue !== 0) {
      displayBaseline = nodeValue;
    }
    changeAmount = nodeValue - displayBaseline;
    changePercent = displayBaseline !== 0 ? (changeAmount / displayBaseline) * 100 : null;
  } else {
    // ========== 驱动因子 ==========
    // 根据 aggregationType 动态计算初始值和目标值，避免使用固定存储值
    // isAvgMode 已在组件顶部定义

    let nodeBaseline;
    if (isAvgMode) {
      // 平均模式：aggregated.targetTotal 已经是平均值（targetSum / targetCount）
      // 直接使用，不需要再除
      nodeBaseline = aggregated.targetTotal || (node.initialBaseline ?? 0);
    } else {
      // 加总模式：使用原始存储值
      if (node.targetValue !== null && node.targetValue !== undefined && !isNaN(node.targetValue)) {
        nodeBaseline = node.targetValue;
      } else if (aggregated.targetTotal !== 0 || aggregated.targetTotal === 0) {
        nodeBaseline = aggregated.targetTotal;
      } else if (node.baseline !== null && node.baseline !== undefined) {
        nodeBaseline = node.baseline;
      }
    }
    displayBaseline = nodeBaseline;
    // 修复：驱动因子的差额计算优先使用 nodeValue - nodeBaseline，因为 nodeValue 是最新的
    // aggregated.diffVsTarget 可能基于旧的 timeData
    const diffFromAggregated = aggregated.diffVsTarget !== undefined ? aggregated.diffVsTarget : null;
    const diffFromValues = nodeValue - nodeBaseline;

    // 如果 aggregated 的差额与直接计算的差额差异很大，说明 aggregated 可能过期了，使用直接计算的值
    if (diffFromAggregated !== null && Math.abs(diffFromAggregated - diffFromValues) < 1) {
      // aggregated 是准确的，使用它
      changeAmount = diffFromAggregated;
      changePercent = aggregated.diffPercentVsTarget !== null ? aggregated.diffPercentVsTarget : (nodeBaseline !== 0 ? ((changeAmount) / nodeBaseline) * 100 : null);
    } else {
      // aggregated 可能过期，使用直接计算
      changeAmount = diffFromValues;
      changePercent = nodeBaseline !== 0 ? ((changeAmount) / nodeBaseline) * 100 : null;
    }

  }

  let posX = 0;
  let posY = 0;
  if (node.position) {
    if (node.position.x !== null && node.position.x !== undefined) {
      posX = node.position.x;
    }
    if (node.position.y !== null && node.position.y !== undefined) {
      posY = node.position.y;
    }
  }

  // 滑块参数
  let sliderMin = 0;
  let sliderMax = 100;
  let sliderStep = 1;

  if (node.range) {
    if (node.range.min !== null && node.range.min !== undefined) {
      sliderMin = node.range.min;
    }
    if (node.range.max !== null && node.range.max !== undefined) {
      sliderMax = node.range.max;
    }
    if (node.range.step !== null && node.range.step !== undefined) {
      sliderStep = node.range.step;
    } else if (node.range.max !== null && node.range.max !== undefined &&
               node.range.min !== null && node.range.min !== undefined) {
      sliderStep = (node.range.max - node.range.min) / 100;
    }
  } else {
    sliderMax = nodeValue * 2;
    if (sliderMax < 100) sliderMax = 100;
  }

  // 计算与初始基准值的差额
  // 平均模式下，初始基准值 = 完整周期（AC+FC）平均
  const totalPeriods = (aggregated.actualCount || 0) + (aggregated.forecastCount || 0) || 1;
  const initialBaseline = isDriver && isAvgMode
    ? (node.initialBaseline ?? 0) / totalPeriods
    : node.initialBaseline;

  // 主数值颜色：基于与目标值的对比
  const mainValueColorClass = useMemo(() => {
    return getDiffColorClass(changeAmount, node.direction, node.name);
  }, [changeAmount, node.direction, node.name]);

  const handleSliderChange = useCallback((e) => {
    e.stopPropagation();
    const newValue = parseFloat(e.target.value);
    const roundedValue = Math.round(newValue * 100) / 100;
    setLocalInputValue(null);
    onValueChange(node.id, roundedValue);
  }, [node.id, onValueChange]);

  const handleInputChange = useCallback((e) => {
    e.stopPropagation();
    setLocalInputValue(e.target.value);
  }, []);

  const handleInputBlur = useCallback((e) => {
    e.stopPropagation();
    // 如果没有输入任何内容，保持原值不变
    if (localInputValue === null || localInputValue === '' || localInputValue === undefined) {
      setLocalInputValue(null);
      return;
    }

    let inputStr = localInputValue.toString().trim();
    let v = 0;

    if (inputStr !== '' && inputStr !== null && inputStr !== undefined) {
      const parsed = Number(inputStr);
      if (!isNaN(parsed)) {
        v = parsed;
      } else {
        // 输入无效，保持原值
        setLocalInputValue(null);
        return;
      }
    }

    v = Number(v.toFixed(2));
    setLocalInputValue(null);
    onValueChange(node.id, v);
  }, [localInputValue, node.id, onValueChange]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.target.blur();
    }
  }, []);

  const handleSliderMouseDown = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleInputMouseDown = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handlePercentChange = useCallback((e) => {
    e.stopPropagation();
    setPercentInput(e.target.value);
  }, []);

  const handlePercentApply = useCallback((e) => {
    e.stopPropagation();
    const percent = parseFloat(percentInput);
    if (!isNaN(percent) && initialBaseline && initialBaseline !== 0) {
      const newValue = initialBaseline * (1 + percent / 100);
      setLocalInputValue(null);
      onValueChange(node.id, newValue);
    }
    setPercentInput('');
  }, [percentInput, initialBaseline, node.id, onValueChange]);

  const handleResetInitial = useCallback((e) => {
    e.stopPropagation();
    if (initialBaseline !== null && initialBaseline !== undefined && !isNaN(initialBaseline)) {
      // 如果有调整描述，显示选择对话框
      if (adjustmentDescription && adjustmentDescription.trim() !== '') {
        setShowResetConfirm(true);
      } else {
        setLocalInputValue(null);
        onValueChange(node.id, initialBaseline);
      }
    }
  }, [initialBaseline, node.id, onValueChange, adjustmentDescription]);

  // 确认重置（仅重置数据）
  const handleResetDataOnly = useCallback((e) => {
    e?.stopPropagation();
    setShowResetConfirm(false);
    setLocalInputValue(null);
    onValueChange(node.id, initialBaseline);
    // 保留描述，不清空
  }, [initialBaseline, node.id, onValueChange]);

  // 确认重置（数据和描述同步重置）
  const handleResetDataAndDescription = useCallback((e) => {
    e?.stopPropagation();
    setShowResetConfirm(false);
    setLocalInputValue(null);
    setAdjustmentDescription('');
    onValueChange(node.id, initialBaseline, { adjustmentDescription: '' });
  }, [initialBaseline, node.id, onValueChange]);

  // 取消重置
  const handleCancelReset = useCallback((e) => {
    e?.stopPropagation();
    setShowResetConfirm(false);
  }, []);

  // ========== 月份调整相关 ==========
  // 处理单个月份值变化
  const handleMonthValueChange = useCallback((monthKey, newValue, isFinal = false) => {
    const newEdits = {
      ...monthEdits,
      [monthKey]: newValue
    };
    setMonthEdits(newEdits);

    // 计算新的汇总值
    const forecastValues = Object.values(newEdits);
    const forecastTotal = forecastValues.reduce((a, b) => {
      const num = parseFloat(b);
      return a + (isNaN(num) ? 0 : num);
    }, 0);

    let newTotal;
    if (isAvgMode) {
      // 平均模式：(实际总和 + 预测总和) / 总月数
      const actualCount = aggregated.actualCount || 0;
      const forecastCount = forecastValues.length;
      const totalCount = actualCount + forecastCount;
      if (totalCount > 0) {
        newTotal = (actualTotal + forecastTotal) / totalCount;
        newTotal = (actualTotal + forecastTotal) / totalCount;
      } else {
        newTotal = forecastTotal;
      }
    } else {
      // 加总模式：实际总和 + 预测总和
      newTotal = actualTotal + forecastTotal;
    }

    // 四舍五入到两位小数，避免精度问题
    newTotal = Math.round(newTotal * 100) / 100;

    // 调用更新（会触发画布、趋势图、瀑布图联动）
    // 只在最终确认时（blur 或回车）才触发更新，避免输入过程中频繁更新
    if (isFinal && onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }
  }, [monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id]);

  // 处理输入框聚焦
  const handleMonthFocus = useCallback((monthKey, currentValue) => {
    setEditingMonthKey(monthKey);
    setEditingValue(currentValue !== null && currentValue !== undefined ? String(currentValue) : '');
  }, []);

  // 处理输入框变化（不立即触发更新）
  const handleMonthInputChange = useCallback((monthKey, e) => {
    const value = e.target.value;
    setEditingValue(value);
    // 允许清空或输入负号，其他有效值时更新编辑状态
    if (value === '' || value === '-') {
      // 清空时，设置为 0
      setMonthEdits(prev => ({
        ...prev,
        [monthKey]: 0
      }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setMonthEdits(prev => ({
          ...prev,
          [monthKey]: numValue
        }));
      }
    }
  }, []);

  // 处理输入框模糊（确认更新）
  const handleMonthBlur = useCallback((monthKey) => {
    setEditingMonthKey(null);
    // 将编辑的值应用到 monthEdits
    const numValue = parseFloat(editingValue);
    // 空值或'-'时设为 0
    const finalValue = (!isNaN(numValue) && editingValue !== '' && editingValue !== '-') ? numValue : 0;

    setMonthEdits(prev => {
      const newEdits = {
        ...prev,
        [monthKey]: finalValue
      };

      // 计算并触发更新
      const forecastValues = Object.values(newEdits);
      const forecastTotal = forecastValues.reduce((a, b) => {
        const num = parseFloat(b);
        return a + (isNaN(num) ? 0 : num);
      }, 0);

      let newTotal;
      if (isAvgMode) {
        const actualCount = aggregated.actualCount || 0;
        const forecastCount = forecastValues.length;
        const totalCount = actualCount + forecastCount;
        newTotal = totalCount > 0 ? (actualTotal + forecastTotal) / totalCount : forecastTotal;
      } else {
        newTotal = actualTotal + forecastTotal;
      }

      // 四舍五入到两位小数，避免精度问题
      newTotal = Math.round(newTotal * 100) / 100;

      if (onMonthValueChange) {
        onMonthValueChange(node.id, newTotal, newEdits);
      }

      return newEdits;
    });
  }, [editingValue, actualTotal, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id]);

  // 切换月份编辑模式
  const toggleMonthEditMode = useCallback((e) => {
    e.stopPropagation();
    if (!isMonthEditMode && onBringNodeToFront) {
      onBringNodeToFront();
    }
    setIsMonthEditMode(!isMonthEditMode);
  }, [isMonthEditMode, onBringNodeToFront]);

  // 月份恢复初始值
  const handleMonthReset = useCallback((monthKey, e) => {
    e?.stopPropagation();
    if (node.originalTimeData && node.originalTimeData[monthKey] !== undefined) {
      const initialValue = node.originalTimeData[monthKey];
      handleMonthValueChange(monthKey, initialValue);
    }
  }, [node.originalTimeData, handleMonthValueChange]);

  // 重置选中的月份，如果没有选中则重置当前编辑的月份
  const handleResetSelected = useCallback((e) => {
    e?.stopPropagation();
    if (!node.originalTimeData) return;

    // 确定要重置的月份：如果有选中的月份，重置选中的；否则重置当前编辑的
    const monthsToReset = selectedMonths.length > 0 ? selectedMonths : (editingMonthKey ? [editingMonthKey] : []);
    if (monthsToReset.length === 0) return;

    setMonthEdits(prev => {
      const newEdits = { ...prev };
      monthsToReset.forEach(key => {
        if (node.originalTimeData && node.originalTimeData[key] !== undefined) {
          newEdits[key] = node.originalTimeData[key];
        }
      });

      const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
      const newTotal = isAvgMode
        ? (actualTotal + forecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).length)
        : actualTotal + forecastTotal;

      if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
      return newEdits;
    });
  }, [node.originalTimeData, selectedMonths, editingMonthKey, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id, actualTotal]);

  // 批量调整：百分比变化
  const handleBatchAdjustPercent = useCallback((percent, e) => {
    e.stopPropagation();
    const monthsToAdjust = selectedMonths.length > 0 ? selectedMonths : Object.keys(monthEdits);
    const newEdits = { ...monthEdits };
    monthsToAdjust.forEach(key => {
      if (newEdits[key] !== undefined) {
        const currentVal = parseFloat(newEdits[key]);
        if (!isNaN(currentVal)) {
          newEdits[key] = Math.round(currentVal * (1 + percent / 100) * 100) / 100;
        }
      }
    });
    setMonthEdits(newEdits);

    // 重新计算汇总值
    const forecastTotal = Object.values(newEdits).reduce((a, b) => {
      const num = parseFloat(b);
      return a + (isNaN(num) ? 0 : num);
    }, 0);
    let newTotal;
    if (isAvgMode) {
      newTotal = (actualTotal + forecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).length);
    } else {
      newTotal = actualTotal + forecastTotal;
    }

    // 四舍五入到两位小数，避免精度问题
    newTotal = Math.round(newTotal * 100) / 100;

    if (onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }
  }, [selectedMonths, monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id]);

  // 选择/取消选择月份
  const toggleMonthSelection = useCallback((monthKey, e) => {
    e.stopPropagation();
    setSelectedMonths(prev => {
      if (prev.includes(monthKey)) {
        return prev.filter(k => k !== monthKey);
      } else {
        return [...prev, monthKey];
      }
    });
  }, []);

  // 全选所有月份
  const handleSelectAll = useCallback((e) => {
    e?.stopPropagation();
    setSelectedMonths(Object.keys(monthEdits).filter(k => isForecastKey(k)));
  }, [monthEdits]);

  // 取消选择所有月份
  const handleDeselectAll = useCallback((e) => {
    e?.stopPropagation();
    setSelectedMonths([]);
  }, []);

  // 切换权重编辑模式
  const toggleWeightEditMode = useCallback((e) => {
    e.stopPropagation();
    if (!isWeightEditMode) {
      // 确保 monthEdits 已经初始化（如果用户直接点击权重分配，monthEdits 可能为空）
      let currentMonthEdits = monthEdits;
      let currentActualTotal = actualTotal;

      const hasForecastKeys = Object.keys(monthEdits).some(k => isForecastKey(k));
      if ((!hasForecastKeys) && node.timeData) {
        // 手动初始化 monthEdits（monthEdits 为空或 key 格式不含 -FC/预测 时需要重新初始化）
        const edits = {};
        let actualSum = 0;
        Object.keys(node.timeData).forEach(key => {
          if (isActualKey(key)) {
            const val = parseFloat(node.timeData[key]);
            if (!isNaN(val)) actualSum += val;
          }
          if (isForecastKey(key)) {
            if (!edits[key]) {
              edits[key] = node.timeData[key];
            }
          }
        });
        currentMonthEdits = edits;
        currentActualTotal = actualSum;
        setMonthEdits(edits);
        setActualTotal(actualSum);
      }

      // 进入权重编辑模式时，初始化权重为当前月份值的比例
      const forecastMonths = Object.keys(currentMonthEdits).filter(k => isForecastKey(k));
      const total = Object.values(currentMonthEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

      // 计算原始预测总额 - 优先使用 originalTimeData，如果不存在则使用 initialBaseline 分摊
      let originalForecastTotal = 0;
      const hasOriginalTimeData = node.originalTimeData && Object.keys(node.originalTimeData).some(k => isForecastKey(k));

      if (hasOriginalTimeData) {
        // 使用 originalTimeData 中的原始预测值
        originalForecastTotal = Object.keys(currentMonthEdits)
          .filter(key => node.originalTimeData[key] !== undefined)
          .reduce((sum, key) => sum + (parseFloat(node.originalTimeData[key]) || 0), 0);
      } else if (node.initialBaseline !== undefined && node.initialBaseline !== null) {
        // 如果没有 originalTimeData，使用 initialBaseline 作为原始总额参考
        originalForecastTotal = Math.max(0, (node.initialBaseline || 0) - currentActualTotal);
      }

      const totalAdjustment = total - originalForecastTotal;

      const weights = {};
      forecastMonths.forEach(key => {
        let originalValue = 0;
        if (hasOriginalTimeData && node.originalTimeData[key]) {
          originalValue = parseFloat(node.originalTimeData[key]);
        } else {
          // 如果没有 originalTimeData，假设原始值均匀分布
          originalValue = forecastMonths.length > 0 ? originalForecastTotal / forecastMonths.length : 0;
        }
        const currentValue = parseFloat(currentMonthEdits[key] || 0);
        const adjustment = currentValue - originalValue;
        // 如果总调整额为 0，权重初始化为均匀分布；否则按调整额比例分配
        if (Math.abs(totalAdjustment) < 0.0001) {
          weights[key] = (1 / forecastMonths.length).toFixed(4);
        } else {
          weights[key] = (adjustment / totalAdjustment).toFixed(4);
        }
      });
      setMonthWeights(weights);
      // 通知父组件置顶节点
      if (onBringNodeToFront) {
        onBringNodeToFront();
      }
    }
    setIsWeightEditMode(!isWeightEditMode);
  }, [isWeightEditMode, monthEdits, actualTotal, node.originalTimeData, node.initialBaseline, node.timeData, onBringNodeToFront]);

  // 处理权重变化
  const handleWeightChange = useCallback((monthKey, value) => {
    // 直接存储用户输入的原始值，允许 -、-.、空字符串等中间状态
    setMonthWeights(prev => ({
      ...prev,
      [monthKey]: value
    }));
  }, []);

  // 应用权重分配到总额（只分配调整额）
  const handleApplyWeights = useCallback((e) => {
    e.stopPropagation();
    // 计算权重总和
    const weightSum = Object.values(monthWeights).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    // 如果权重总和不等于 1，不执行
    if (Math.abs(weightSum - 1) > 0.0001) {
      alert(`权重总和为${weightSum.toFixed(4)}，必须等于 1 才能应用`);
      return;
    }

    // 计算当前的预测总额和调整前的预测总额
    const currentForecastTotal = Object.values(monthEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    // 获取原始预测总额（调整前的值）
    const originalForecastTotal = Object.keys(monthEdits)
      .filter(key => node.originalTimeData && node.originalTimeData[key] !== undefined)
      .reduce((sum, key) => sum + (parseFloat(node.originalTimeData[key]) || 0), 0);

    // 计算需要分配的总调整额 = 当前预测总额 - 原始预测总额
    const totalAdjustment = currentForecastTotal - originalForecastTotal;

    // 根据权重重新分配各月：原始值 + 调整额 × 权重
    const newEdits = { ...monthEdits };
    Object.keys(monthWeights).forEach(key => {
      const weight = parseFloat(monthWeights[key] || 0);
      const originalValue = node.originalTimeData && node.originalTimeData[key] ? parseFloat(node.originalTimeData[key]) : 0;
      newEdits[key] = Math.round((originalValue + totalAdjustment * weight) * 100) / 100;
    });

    setMonthEdits(newEdits);

    // 计算新的汇总值
    const newForecastTotal = Object.values(newEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const newTotal = isAvgMode
      ? (actualTotal + newForecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).length)
      : actualTotal + newForecastTotal;

    if (onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }

    // 退出权重编辑模式
    setIsWeightEditMode(false);
  }, [monthWeights, monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id, node.originalTimeData]);

  // 重置权重：基于当前的实际调整额重新计算
  const handleResetWeights = useCallback((e) => {
    e.stopPropagation();
    const forecastMonths = Object.keys(monthEdits).filter(k => k.includes('预测'));
    const total = Object.values(monthEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const originalForecastTotal = Object.keys(monthEdits)
      .filter(key => node.originalTimeData && node.originalTimeData[key] !== undefined)
      .reduce((sum, key) => sum + (parseFloat(node.originalTimeData[key]) || 0), 0);
    const totalAdjustment = total - originalForecastTotal;

    const weights = {};
    forecastMonths.forEach(key => {
      const originalValue = node.originalTimeData && node.originalTimeData[key] ? parseFloat(node.originalTimeData[key]) : 0;
      const currentValue = parseFloat(monthEdits[key] || 0);
      const adjustment = currentValue - originalValue;
      weights[key] = totalAdjustment !== 0 ? (adjustment / totalAdjustment).toFixed(4) : 0;
    });
    setMonthWeights(weights);
  }, [monthEdits, node.originalTimeData]);

  // 恢复初始：恢复到仅调整总额时的默认权重（按金额比例分配）
  const handleRecoverInitial = useCallback((e) => {
    e.stopPropagation();
    const forecastMonths = Object.keys(monthEdits).filter(k => k.includes('预测'));
    const totalForecast = Object.values(monthEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    const weights = {};
    forecastMonths.forEach(key => {
      const currentValue = parseFloat(monthEdits[key] || 0);
      // 按当前各月金额比例分配权重
      weights[key] = totalForecast > 0 ? (currentValue / totalForecast).toFixed(4) : (1 / forecastMonths.length).toFixed(4);
    });
    setMonthWeights(weights);
  }, [monthEdits]);

  // ========== 导入分期数据 ==========
  const handleImportPeriodData = useCallback((target) => {
    // target: 'monthEdits' | 'weights'
    const nodeName = node.name;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          let headerRow = null;
          let rows = [];

          if (file.name.endsWith('.csv')) {
            const text = evt.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) {
              alert('导入失败：文件至少需要标题行和一行数据');
              return;
            }
            // 第一行为标题行
            const headerCols = lines[0].split(',').map(c => c.trim());
            headerRow = { col0: headerCols[0], col1: headerCols[1] };
            // 数据行从第二行开始
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',');
              if (cols.length >= 2) {
                const period = cols[0].trim();
                const val = parseFloat(cols[1].trim());
                if (period && !isNaN(val)) rows.push({ period, value: val });
              }
            }
          } else {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (jsonData.length < 2) {
              alert('导入失败：文件至少需要标题行和一行数据');
              return;
            }
            // 第一行为标题行
            headerRow = { col0: String(jsonData[0][0] || '').trim(), col1: String(jsonData[0][1] || '').trim() };
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (row && row.length >= 2) {
                const period = String(row[0]).trim();
                const val = parseFloat(row[1]);
                if (period && !isNaN(val)) rows.push({ period, value: val });
              }
            }
          }

          // 校验标题行存在
          if (!headerRow || !headerRow.col0 || !headerRow.col1) {
            alert('导入失败：缺少标题行。\n\n正确格式：\n第一列标题：期间\n第二列标题：' + nodeName);
            return;
          }

          // 校验第二列标题与当前节点名称匹配
          if (headerRow.col1 !== nodeName) {
            alert('导入失败：列标题「' + headerRow.col1 + '」与当前节点「' + nodeName + '」不匹配。\n\n请确认导入文件是否对应当前节点。');
            return;
          }

          if (rows.length === 0) {
            alert('导入失败：未解析到有效数据行。\n\n标题行已识别，但没有有效的数据行。');
            return;
          }

          if (target === 'monthEdits') {
            const existingKeys = Object.keys(monthEdits).filter(k => isForecastKey(k));
            const newEdits = { ...monthEdits };
            let matched = 0;
            rows.forEach(({ period, value }) => {
              const exactKey = existingKeys.find(k => k === period + '-FC');
              const pureKey = existingKeys.find(k => formatPeriodKey(k) === period);
              const matchedKey = exactKey || pureKey;
              if (matchedKey) {
                newEdits[matchedKey] = value;
                matched++;
              }
            });
            setMonthEdits(newEdits);
            const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
            const isAvg = node.aggregationType?.toUpperCase() === 'AVG' || node.aggregationType?.toUpperCase() === 'AVERAGE';
            const newTotal = isAvg
              ? (actualTotal + forecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).filter(k => isForecastKey(k)).length)
              : actualTotal + forecastTotal;
            if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
            alert(`导入完成：匹配 ${matched}/${rows.length} 期`);
          } else {
            const existingKeys = Object.keys(monthEdits).filter(k => isForecastKey(k));
            const newWeights = { ...monthWeights };
            let matched = 0;
            rows.forEach(({ period, value }) => {
              const exactKey = existingKeys.find(k => k === period + '-FC');
              const pureKey = existingKeys.find(k => formatPeriodKey(k) === period);
              const matchedKey = exactKey || pureKey;
              if (matchedKey) {
                newWeights[matchedKey] = value;
                matched++;
              }
            });
            setMonthWeights(newWeights);
            alert(`导入完成：匹配 ${matched}/${rows.length} 期`);
          }
        } catch (err) {
          console.error('导入失败:', err);
          alert('导入失败：' + err.message);
        }
      };
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    };
    input.click();
  }, [monthEdits, monthWeights, actualTotal, aggregated, node, onMonthValueChange]);

  // ========== 调整描述相关 ==========
  // 切换描述编辑模式
  const toggleDescriptionEditMode = useCallback((e) => {
    e.stopPropagation();
    if (!isDescriptionEditMode && onBringNodeToFront) {
      onBringNodeToFront();
    }
    setIsDescriptionEditMode(!isDescriptionEditMode);
  }, [isDescriptionEditMode, onBringNodeToFront]);

  // 保存调整描述
  const handleSaveDescription = useCallback((e) => {
    e.stopPropagation();
    if (onValueChange) {
      // 通过 onValueChange 传递描述更新（特殊的 updates 对象）
      onValueChange(node.id, node.value, { adjustmentDescription });
    }
    setIsDescriptionEditMode(false);
  }, [node.id, node.value, adjustmentDescription, onValueChange]);

  // AI 一键应用时自动填充描述
  const handleAutoFillDescription = useCallback((aiReason) => {
    setAdjustmentDescription(aiReason);
    if (onValueChange) {
      onValueChange(node.id, node.value, { adjustmentDescription: aiReason });
    }
  }, [node.id, node.value, onValueChange]);

  // 月份输入框键盘快捷键
  const handleMonthKeyDown = useCallback((monthKey, e) => {
    e.stopPropagation();

    // 同步更新 editingValue（如果当前正在编辑这个月份）
    const syncEditingValue = (newVal) => {
      if (editingMonthKey === monthKey) {
        setEditingValue(String(newVal));
      }
    };

    // 获取要调整的月份列表（优先使用选中的月份，否则只调整当前月份）
    const monthsToAdjust = selectedMonths.length > 0 ? selectedMonths : [monthKey];

    // Ctrl + 上箭头：增加 1%
    if (e.ctrlKey && e.key === 'ArrowUp') {
      e.preventDefault();
      setMonthEdits(prev => {
        const newEdits = { ...prev };
        monthsToAdjust.forEach(key => {
          const currentVal = parseFloat(newEdits[key] || 0);
          if (!isNaN(currentVal)) {
            const newVal = Math.round(currentVal * 1.01 * 100) / 100;
            newEdits[key] = newVal;
            // 如果当前编辑的月份在调整列表中，同步更新显示
            if (editingMonthKey === key) {
              setEditingValue(String(newVal));
            }
          }
        });
        const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
        const newTotal = isAvgMode
          ? (actualTotal + forecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).length)
          : actualTotal + forecastTotal;
        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
        return newEdits;
      });
    }
    // Ctrl + 下箭头：减少 1%
    if (e.ctrlKey && e.key === 'ArrowDown') {
      e.preventDefault();
      setMonthEdits(prev => {
        const newEdits = { ...prev };
        monthsToAdjust.forEach(key => {
          const currentVal = parseFloat(newEdits[key] || 0);
          if (!isNaN(currentVal)) {
            const newVal = Math.round(currentVal * 0.99 * 100) / 100;
            newEdits[key] = newVal;
            // 如果当前编辑的月份在调整列表中，同步更新显示
            if (editingMonthKey === key) {
              setEditingValue(String(newVal));
            }
          }
        });
        const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
        const newTotal = isAvgMode
          ? (actualTotal + forecastTotal) / ((aggregated.actualCount || 0) + Object.keys(newEdits).length)
          : actualTotal + forecastTotal;
        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
        return newEdits;
      });
    }
    // 注：Ctrl+0 快捷键已移除，避免与浏览器/画布重置冲突
  }, [monthEdits, editingMonthKey, selectedMonths, node.aggregationType, node.unit, aggregated.actualCount || 0, onMonthValueChange, node.id, actualTotal]);

  let vsInitialAmount = null;
  let vsInitialPercent = null;
  if (initialBaseline !== null && initialBaseline !== undefined && !isNaN(initialBaseline) && initialBaseline !== 0) {
    vsInitialAmount = nodeValue - initialBaseline;
    vsInitialPercent = (vsInitialAmount / initialBaseline) * 100;
  }

  const isPositive = isPositiveIndicator(node.name);

  const getChangeArrow = (amount, isPosIndicator) => {
    if (Math.abs(amount) < 0.0001) return { arrow: '-', isGood: true, colorClass: 'text-yellow-600' };
    const isGoodChange = isPosIndicator ? amount > 0 : amount < 0;
    const isUp = amount > 0;
    return {
      arrow: isUp ? '▲' : '▼',
      isGood: isGoodChange,
      colorClass: isGoodChange ? 'text-green-600' : 'text-red-600'
    };
  };

  const vsTargetArrow = getChangeArrow(changeAmount, isPositive);

  const getVsInitialArrow = (amount, isPosIndicator) => {
    if (amount === null || Math.abs(amount) < 0.0001) return { arrow: '-', colorClass: 'text-yellow-600' };
    const isGoodChange = isPosIndicator ? amount > 0 : amount < 0;
    const isUp = amount > 0;
    return {
      arrow: isUp ? '▲' : '▼',
      colorClass: isGoodChange ? 'text-blue-600' : 'text-orange-600'
    };
  };

  const vsInitialArrowObj = vsInitialAmount !== null ? getVsInitialArrow(vsInitialAmount, isPositive) : { arrow: '', colorClass: 'text-gray-600' };

  const handleCardClick = useCallback((e) => {
    e.stopPropagation();

    // 检查点击的是否是输入控件相关元素，如果是则不触发选中和高亮
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
      return;
    }
    // 检查是否在输入控件的父容器内
    if (target.closest('input') || target.closest('button')) {
      return;
    }

    const now = Date.now();
    if (now - lastClickTimeRef.current > 300) {
      onSelect(node.id);
    }
    lastClickTimeRef.current = now;
  }, [node.id, onSelect]);

  const handleCardDoubleClick = useCallback((e) => {
    e.stopPropagation();
    onEdit(node.id);
  }, [node.id, onEdit]);

  const handleResetSize = useCallback((e) => {
    e.stopPropagation();
    onResize(node.id, { width: 520, height: 'auto' });
  }, [node.id, onResize]);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    // 拖动时禁用文本选择
    document.body.style.userSelect = 'none';
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: nodeWidth,
      height: cardRef.current?.offsetHeight || 200
    };
  }, [nodeWidth]);

  const handleResizeMouseMove = useCallback((e) => {
    if (!isResizing || !onResize) return;
    e.preventDefault();

    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;

    const newWidth = Math.max(200, resizeStartRef.current.width + dx);
    const newHeight = Math.max(150, resizeStartRef.current.height + dy);

    onResize(node.id, { width: newWidth, height: newHeight });
  }, [isResizing, node.id, onResize]);

  const handleResizeMouseUp = useCallback(() => {
    setIsResizing(false);
    // 恢复文本选择
    document.body.style.userSelect = '';
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

  // 判断节点是否有变化
  const hasChanges = vsInitialAmount !== null && Math.abs(vsInitialAmount) > 0.0001;

  // 根据高亮状态和节点类型确定高亮样式
  const getHighlightClass = () => {
    let classes = [];
    if (isHighlighted) {
      // 点击的本级节点：蓝色边框，无背景色
      classes.push("ring-4 ring-blue-600 border-4 border-blue-600");
    } else if (isDownstream) {
      // 下游节点：紫色（和上游一样醒目）
      classes.push("ring-3 ring-purple-600 border-3 border-purple-600");
    } else if (isAffected) {
      if (node.type === 'driver') {
        classes.push("ring-3 ring-green-600 border-3 border-green-600");
      } else {
        classes.push("ring-3 ring-yellow-500 border-3 border-yellow-500");
      }
    } else if (isDependency) {
      if (node.type === 'driver') {
        classes.push("ring-2 ring-green-500 border-2 border-green-500");
      } else {
        classes.push("ring-2 ring-yellow-400 border-2 border-yellow-400");
      }
    }
    // 如果有变化且没有其他高亮，添加变化提示边框
    if (hasChanges && !isHighlighted && !isDownstream && !isAffected && !isDependency) {
      classes.push("border-2 border-orange-400");
    }
    return classes.join(" ");
  };

  // 根据高亮状态确定背景色（用内联样式确保优先级）
  const getHighlightBackgroundColor = () => {
    // 注意：本级选中节点（isHighlighted）不要蓝色背景，保持原节点背景色
    if (isDownstream) return "#f3e8ff"; // purple-100
    if (isAffected) {
      if (node.type === 'driver') return "#dcfce7"; // green-100
      return "#fef9c3"; // yellow-100
    }
    if (isDependency) {
      if (node.type === 'driver') return "#dcfce7"; // green-100
      return "#fef9c3"; // yellow-100
    }
    return undefined; // 没有高亮或本级选中时用默认背景色
  };

  return (
    <div
      ref={cardRef}
      className={"absolute rounded-lg shadow-md border-2 transition-all duration-300 cursor-move " +
        colors.bg + " " + colors.border + " " +
        (isSelected ? "ring-2 ring-blue-500 ring-offset-2" : "") + " " +
        getHighlightClass()}
      style={{
        left: posX,
        top: posY,
        width: nodeWidth,
        height: nodeHeight,
        zIndex: isFront ? 100 : (isSelected ? 20 : (isHighlighted ? 18 : (isAffected || isDownstream || isDependency ? 15 : 10))),
        opacity: (isHighlighted || isAffected || isDownstream || isDependency || !isHighlighted && !isAffected && !isDownstream && !isDependency) ? 1 : 0.3,
        backgroundColor: getHighlightBackgroundColor(),
        willChange: isDragging ? 'transform, left, top' : 'auto',
        transition: isDragging ? 'none' : 'all 0.3s ease'
      }}
      onMouseDown={onMouseDown}
      onClick={handleCardClick}
    >
      <div className={"px-3 py-2 rounded-t-md " + colors.header + " flex justify-between items-center cursor-pointer"}
        onDoubleClick={handleCardDoubleClick}
        title="双击编辑节点">
        <div className="flex items-center gap-2">
          <span className={"text-base font-bold " + colors.text}>
            {isDriver ? '⚙️ 驱动因子' : '📊 计算指标'}
          </span>
          {hasChanges && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 animate-pulse">
              ✨ 已修改
            </span>
          )}
          {isDriver && hasChanges && !adjustmentDescription && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700" title="此调整尚未添加描述，建议补充调整理由和预期效果">
              ⚠️ 未添加描述
            </span>
          )}
          {isDriver && adjustmentDescription && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700" title="已添加调整描述">
              📝 已描述
            </span>
          )}
          {!isDriver && node.dependsOn && node.dependsOn.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse && onToggleCollapse(); }}
              className="text-gray-400 hover:text-gray-600 text-xs"
              title={isCollapsed ? "展开下级" : "收起下级"}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {node.type !== 'driver' && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenWaterfallChart && onOpenWaterfallChart(node); }}
              className="text-gray-400 hover:text-purple-500 text-xs px-1"
              title="查看因素分析"
            >
              📊
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenTrendChart && onOpenTrendChart(node); }}
            className="text-gray-400 hover:text-blue-500 text-xs px-1"
            title="查看分期趋势"
          >
            📈
          </button>
          <button
            onClick={handleResetSize}
            className="text-gray-400 hover:text-green-500 text-xs px-1"
            title="恢复默认大小"
          >
            ↺
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(node.id); }}
            className="text-gray-400 hover:text-blue-500 text-xs px-1"
            title="编辑节点"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            className="text-gray-400 hover:text-red-500 text-xs px-1"
            title="删除节点"
          >
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <div className="p-3">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="text-gray-800 font-medium">{node.name}</div>
              <div className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-1">
                {node.id}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className={"text-xl font-bold px-2 py-1 rounded inline-block " + (mainValueColorClass ? mainValueColorClass + ' bg-white' : 'bg-white')}>
                  {formatValue(nodeValue, node.format, node.unit)}
                </div>
                {displayBaseline !== null && displayBaseline !== undefined && !isNaN(displayBaseline) && displayBaseline !== 0 && Math.abs(changeAmount) > 0.0001 && (
                  <span className={"text-xl font-bold " + vsTargetArrow.colorClass}>
                    {vsTargetArrow.arrow}
                  </span>
                )}
              </div>

              <div className="flex flex-nowrap gap-2 mt-2">
                {(initialBaseline !== null && initialBaseline !== undefined && !isNaN(initialBaseline) && initialBaseline !== 0) && (
                  <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                    <span className="text-gray-600">📍 初始:</span>
                    <span className="font-mono ml-1">{formatValue(initialBaseline, node.format, node.unit)}</span>
                    {vsInitialAmount !== null && (
                      <span className={"ml-1 " + vsInitialArrowObj.colorClass}>
                        {vsInitialArrowObj.arrow && <span className="mr-0.5">{vsInitialArrowObj.arrow}</span>}
                        ({vsInitialAmount > 0 ? '+' : ''}{formatValue(vsInitialAmount, node.format, node.unit)}
                        {vsInitialPercent !== null && (
                          <span className="ml-0.5">{vsInitialPercent > 0 ? '+' : ''}{vsInitialPercent.toFixed(2)}%</span>
                        )})
                      </span>
                    )}
                  </div>
                )}

                {displayBaseline !== null && displayBaseline !== undefined && !isNaN(displayBaseline) && displayBaseline !== 0 && (
                  <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                    <span className="text-gray-600">🎯 目标:</span>
                    <span className="font-mono ml-1">{formatValue(displayBaseline, node.format, node.unit)}</span>
                    <span className={"ml-1 " + vsTargetArrow.colorClass}>
                      {Math.abs(changeAmount) > 0.0001 && <span className="mr-0.5">{vsTargetArrow.arrow}</span>}
                      ({changeAmount > 0 ? '+' : ''}{formatValue(changeAmount, node.format, node.unit)}
                      {changePercent !== null && (
                        <span className="ml-0.5">{changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%</span>
                      )})
                    </span>
                  </div>
                )}
              </div>

              {node.timeData && Object.keys(node.timeData).length > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  📊 实际+预测 ({(aggregated.actualCount || 0) + (aggregated.forecastCount || 0)}{timeUnitName}) | 实际: {formatValue(aggregated.actualTotal, node.format, node.unit)} | 预测: {formatValue(aggregated.forecastTotal, node.format, node.unit)}
                </div>
              )}
            </div>
          </div>

          {isDriver && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              {/* 月份调整模式切换按钮 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMonthEditMode}
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isMonthEditMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                    title="展开/收起月份调整面板"
                  >
                    {isMonthEditMode ? '✓' : '📅'} {timeDimensionName}调整
                  </button>
                  <button
                    onClick={toggleWeightEditMode}
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isWeightEditMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
                    title="按权重分配总额"
                  >
                    ⚖️ 权重分配
                  </button>
                  <button
                    onClick={toggleDescriptionEditMode}
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isDescriptionEditMode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                    title="添加或查看调整理由和摘要"
                  >
                    📝 调整描述
                  </button>
                </div>
                {isMonthEditMode && (
                  <div className="flex items-center gap-1">
                    {selectedMonths.length > 0 ? (
                      <>
                        <span className="text-xs text-gray-500">已选 {selectedMonths.length} 个月</span>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); handleBatchAdjustPercent(1, e); }}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 cursor-pointer select-none"
                          title="增加 1%"
                        >
                          +1%
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); handleBatchAdjustPercent(-1, e); }}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer select-none"
                          title="减少 1%"
                        >
                          -1%
                        </button>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDeselectAll(e); }}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 cursor-pointer select-none"
                          title="取消选择所有月份"
                        >
                          取消选择
                        </button>
                      </>
                    ) : (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); handleSelectAll(e); }}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 cursor-pointer select-none"
                        title="全选所有预测月份"
                      >
                        全选
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 快捷键说明 */}
              {isMonthEditMode && (
                <div className="mb-2 px-2 py-1.5 bg-blue-50 rounded border border-blue-100 text-[10px] text-gray-600 flex flex-wrap items-center gap-2">
                  <span className="font-medium">💡 快捷键:</span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white border rounded text-[9px] font-mono">Ctrl</kbd>+
                    <kbd className="px-1.5 py-0.5 bg-white border rounded text-[9px] font-mono">↑</kbd>
                    <span>+1%</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white border rounded text-[9px] font-mono">Ctrl</kbd>+
                    <kbd className="px-1.5 py-0.5 bg-white border rounded text-[9px] font-mono">↓</kbd>
                    <span>-1%</span>
                  </span>
                  <span className="text-gray-400">|</span>
                  <span>勾选月份后快捷键可批量调整</span>
                  <span className="text-gray-400">|</span>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleResetSelected(e); }}
                    className="px-1.5 py-0.5 bg-white border rounded text-[9px] text-gray-600 hover:bg-gray-50 cursor-pointer select-none"
                    title={selectedMonths.length > 0 ? `重置选中的 ${selectedMonths.length} 个月份` : editingMonthKey ? '重置当前编辑的月份' : '重置月份'}
                  >
                    重置 {selectedMonths.length > 0 && `(${selectedMonths.length})`}
                  </button>
                </div>
              )}

              {/* 月份调整面板 */}
              {isMonthEditMode && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200" onKeyDown={(e) => {
                  // 如果有选中的月份，且按下了 Ctrl+ 上/下箭头，触发批量调整
                  if (selectedMonths.length > 0 && e.ctrlKey) {
                    e.stopPropagation();
                    const monthsToAdjust = selectedMonths;
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setMonthEdits(prev => {
                        const newEdits = { ...prev };
                        monthsToAdjust.forEach(key => {
                          const currentVal = parseFloat(newEdits[key] || 0);
                          if (!isNaN(currentVal)) {
                            const newVal = Math.round(currentVal * 1.01 * 100) / 100;
                            newEdits[key] = newVal;
                          }
                        });
                        const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
                        const newTotal = isAvgMode
                          ? (actualTotal + forecastTotal) / (aggregated.actualCount || 0 + Object.keys(newEdits).length)
                          : actualTotal + forecastTotal;
                        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
                        return newEdits;
                      });
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setMonthEdits(prev => {
                        const newEdits = { ...prev };
                        monthsToAdjust.forEach(key => {
                          const currentVal = parseFloat(newEdits[key] || 0);
                          if (!isNaN(currentVal)) {
                            const newVal = Math.round(currentVal * 0.99 * 100) / 100;
                            newEdits[key] = newVal;
                          }
                        });
                        const forecastTotal = Object.values(newEdits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
                        const newTotal = isAvgMode
                          ? (actualTotal + forecastTotal) / (aggregated.actualCount || 0 + Object.keys(newEdits).length)
                          : actualTotal + forecastTotal;
                        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
                        return newEdits;
                      });
                    }
                  }
                }} tabIndex={-1}>
                  {(() => {
                    const sortedForecasts = Object.entries(monthEdits)
                      .filter(([key]) => isForecastKey(key))
                      .sort((a, b) => {
                        const aNum = a[0].match(/^(\d+)月/);
                        const bNum = b[0].match(/^(\d+)月/);
                        if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
                        return a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
                      });
                    const totalPages = Math.ceil(sortedForecasts.length / PAGE_SIZE);
                    const safePage = Math.min(monthPage, Math.max(0, totalPages - 1));
                    const pageItems = sortedForecasts.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {pageItems.map(([key, editValue]) => {
                            const period = formatPeriodKey(key);
                            const initialValue = node.originalTimeData?.[key] ?? editValue ?? 0;
                            const changePercent = initialValue !== 0 && initialValue !== null
                              ? (((parseFloat(editValue) || 0) - initialValue) / initialValue * 100)
                              : 0;
                            const isSelected = selectedMonths.includes(key);

                            return (
                              <div key={key} className="w-[90px] flex-shrink-0">
                                <div className="flex items-center gap-1 mb-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleMonthSelection(key, e);
                                    }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="w-3 h-3 text-blue-600 rounded focus:ring-blue-500"
                                    title="选中后可以进行批量操作"
                                  />
                                  <label className="text-xs text-gray-500 truncate" title={period}>{period}</label>
                                </div>
                                <input
                                  type="text"
                                  value={editingMonthKey === key ? editingValue : (editValue !== null && editValue !== undefined ? editValue : '')}
                                  onChange={(e) => handleMonthInputChange(key, e)}
                                  onFocus={(e) => {
                                    e.stopPropagation();
                                    handleMonthFocus(key, editValue);
                                  }}
                                  onBlur={(e) => {
                                    e.stopPropagation();
                                    handleMonthBlur(key);
                                  }}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    handleMonthKeyDown(key, e);
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleMonthBlur(key);
                                    }
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.nativeEvent.stopImmediatePropagation();
                                  }}
                                  className="w-full px-1.5 py-1 border rounded text-xs focus:ring-2 focus:ring-blue-500 cursor-text text-right font-mono"
                                  inputMode="decimal"
                                />
                                <div className={`text-xs mt-0.5 text-center ${changePercent > 0 ? 'text-green-600' : changePercent < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center text-xs">
                          <span className="text-gray-600">合计：</span>
                          <span className="font-bold text-gray-800">
                            {formatValue(actualTotal + Object.values(monthEdits).reduce((a, b) => {
                              const num = parseFloat(b);
                              return a + (isNaN(num) ? 0 : num);
                            }, 0), node.format, node.unit)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">
                              ({sortedForecasts.length}{timeDimensionName})
                            </span>
                            {totalPages > 1 && (
                              <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); setMonthPage(p => Math.max(0, p - 1)); }}
                                  disabled={safePage === 0}
                                  className={`px-1.5 py-0.5 rounded ${safePage === 0 ? 'text-gray-300' : 'text-blue-600 hover:bg-blue-100'}`}
                                  onMouseDown={(e) => e.stopPropagation()}>◀</button>
                                <span className="text-gray-500">{safePage + 1}/{totalPages}</span>
                                <button onClick={(e) => { e.stopPropagation(); setMonthPage(p => Math.min(totalPages - 1, p + 1)); }}
                                  disabled={safePage >= totalPages - 1}
                                  className={`px-1.5 py-0.5 rounded ${safePage >= totalPages - 1 ? 'text-gray-300' : 'text-blue-600 hover:bg-blue-100'}`}
                                  onMouseDown={(e) => e.stopPropagation()}>▶</button>
                              </div>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleImportPeriodData('monthEdits'); }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                              title="从 CSV/Excel 导入分期数据（两列：期间,值）"
                            >📥 导入</button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* 权重分配面板 */}
              {isWeightEditMode && (
                <div className="mb-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-purple-700">⚖️ 权重分配</span>
                      <span className="text-[10px] text-purple-600">|</span>
                      <span className="text-[10px] text-purple-600">对调整额按权重分配到各月</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImportPeriodData('weights'); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-xs px-2 py-1 bg-purple-100 text-purple-600 rounded hover:bg-purple-200"
                        title="从 CSV/Excel 导入权重数据（两列：期间,权重值）"
                      >
                        📥 导入
                      </button>
                      <button
                        onClick={handleRecoverInitial}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                        title="恢复到仅调整总额时的默认权重（按金额比例分配）"
                      >
                        恢复初始
                      </button>
                      <button
                        onClick={handleResetWeights}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        title="重置为当前比例"
                      >
                        重置权重
                      </button>
                      <button
                        onClick={handleApplyWeights}
                        className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                        title="应用权重分配"
                      >
                        应用分配
                      </button>
                    </div>
                  </div>

                  {/* 权重输入框（分页） */}
                  {(() => {
                    const sortedWeightItems = Object.entries(monthEdits)
                      .filter(([key]) => isForecastKey(key))
                      .sort((a, b) => {
                        const aNum = a[0].match(/^(\d+)月/);
                        const bNum = b[0].match(/^(\d+)月/);
                        if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
                        return a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
                      });
                    const wTotalPages = Math.ceil(sortedWeightItems.length / PAGE_SIZE);
                    const wSafePage = Math.min(weightPage, Math.max(0, wTotalPages - 1));
                    const wPageItems = sortedWeightItems.slice(wSafePage * PAGE_SIZE, (wSafePage + 1) * PAGE_SIZE);

                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {wPageItems.map(([key, editValue]) => {
                            const period = formatPeriodKey(key);
                            const weight = monthWeights[key] || 0;
                            const currentValue = parseFloat(editValue) || 0;
                            const originalValue = node.originalTimeData && node.originalTimeData[key] ? parseFloat(node.originalTimeData[key]) : 0;
                            const adjustment = currentValue - originalValue;

                            return (
                              <div key={key} className="w-[140px] flex-shrink-0">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs text-purple-600 truncate">{period}</label>
                                  <span className="text-[10px] text-gray-400">
                                    原：{formatValue(originalValue, node.format, node.unit)}
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={weight === '' || weight === undefined ? 0 : weight}
                                  onChange={(e) => handleWeightChange(key, e.target.value)}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.nativeEvent.stopImmediatePropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.nativeEvent.stopImmediatePropagation();
                                  }}
                                  className="w-full px-1.5 py-1 border border-purple-300 rounded text-xs focus:ring-2 focus:ring-purple-500 font-mono cursor-text"
                                  placeholder="权重 (可负)"
                                />
                                <div className="text-[10px] text-gray-500 mt-0.5 flex justify-between">
                                  <span>现：{formatValue(currentValue, node.format, node.unit)}</span>
                                  <span className="text-purple-600">调：{formatValue(adjustment, node.format, node.unit)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {wTotalPages > 1 && (
                          <div className="mt-2 pt-1 flex justify-center items-center gap-1 text-xs">
                            <button onClick={(e) => { e.stopPropagation(); setWeightPage(p => Math.max(0, p - 1)); }}
                              disabled={wSafePage === 0}
                              className={`px-1.5 py-0.5 rounded ${wSafePage === 0 ? 'text-gray-300' : 'text-purple-600 hover:bg-purple-100'}`}
                              onMouseDown={(e) => e.stopPropagation()}>◀</button>
                            <span className="text-gray-500">{wSafePage + 1}/{wTotalPages}</span>
                            <button onClick={(e) => { e.stopPropagation(); setWeightPage(p => Math.min(wTotalPages - 1, p + 1)); }}
                              disabled={wSafePage >= wTotalPages - 1}
                              className={`px-1.5 py-0.5 rounded ${wSafePage >= wTotalPages - 1 ? 'text-gray-300' : 'text-purple-600 hover:bg-purple-100'}`}
                              onMouseDown={(e) => e.stopPropagation()}>▶</button>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* 调整额说明 */}
                  <div className="mt-2 text-xs text-purple-600">
                    <span className="font-medium">💡 说明：</span>
                    <span>权重分配的是</span>
                    <span className="font-mono">调整额（当前值 - 原始值）</span>
                    <span>，不是总额。支持负权重，可实现部分月份增加、部分月份减少。</span>
                  </div>

                  {/* 权重总和检查和提示 */}
                  <WeightSumCheck monthWeights={monthWeights} onApply={handleApplyWeights} monthEdits={monthEdits} node={node} originalTimeData={node.originalTimeData} />
                </div>
              )}

              {/* 调整描述面板 */}
              {isDescriptionEditMode && (
                <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-700">📝 调整描述</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const template = `【业务理由】
（填写调整的业务背景和原因，例如：Q4 销售旺季，需加大市场推广力度）

【数据依据】
（填写数据支撑，例如：历史同期销售费用投入产出比为 1:5，敏感性分析显示该因子敏感度为 0.85）

【预期效果】
（填写预期达成的效果，例如：GMV 提升 18%，净利润提升 15%）

【风险提示】
（填写可能的风险，例如：费用投入后若市场反应不及预期，可能影响利润目标）`;
                          setAdjustmentDescription(template);
                        }}
                        className="text-xs px-2 py-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
                        title="插入通用描述模板，包含业务理由、数据依据、预期效果、风险提示四个维度"
                      >
                        📋 插入模板
                      </button>
                      <button
                        onClick={() => {
                          setAdjustmentDescription('');
                        }}
                        className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                        title="清空调整描述"
                      >
                        🗑️ 清空
                      </button>
                      <button
                        onClick={handleSaveDescription}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        title="保存调整描述"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={adjustmentDescription}
                    onChange={(e) => setAdjustmentDescription(e.target.value)}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    placeholder="请输入调整理由、摘要要点等信息...\n\n例如：\n- 调整理由：Q4 销售旺季，加大市场推广力度\n- 预期效果：GMV 提升 18%，净利润提升 15%\n- 关键措施：增加广告投放，优化渠道结构"
                    className="w-full h-32 px-2 py-2 border border-green-300 rounded text-xs focus:ring-2 focus:ring-green-500 resize-y"
                    style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
                  />
                  <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                    <span className="font-medium">💡 提示：</span>
                    <span>记录调整理由和预期效果，便于后续复盘和追溯</span>
                    {adjustmentDescription && adjustmentDescription.includes('AI 决策') && (
                      <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px]">
                        🤖 AI 生成
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 调整描述摘要显示（非编辑模式） */}
              {!isDescriptionEditMode && adjustmentDescription && (
                <div className="mb-3 p-2 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-green-700">📝 调整描述</span>
                      {adjustmentDescription.includes('AI 决策') && (
                        <span className="px-1 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px]">
                          🤖 AI 生成
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setAdjustmentDescription('');
                          if (onValueChange) {
                            onValueChange(node.id, node.value, { adjustmentDescription: '' });
                          }
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                        title="删除调整描述"
                      >
                        🗑️ 删除
                      </button>
                      <button
                        onClick={toggleDescriptionEditMode}
                        className="text-xs text-green-600 hover:text-green-800"
                        title="编辑调整描述"
                      >
                        编辑
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-700 whitespace-pre-wrap line-clamp-2">
                    {adjustmentDescription.length > 100
                      ? adjustmentDescription.substring(0, 100) + '...'
                      : adjustmentDescription}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={sliderStep}
                  value={nodeValue}
                  onChange={handleSliderChange}
                  onMouseDown={handleSliderMouseDown}
                  onClick={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  value={localInputValue !== null ? localInputValue : nodeValue}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  onKeyDown={handleInputKeyDown}
                  onMouseDown={handleInputMouseDown}
                  onClick={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  step="1"
                  className="w-36 text-sm border rounded px-2 py-1"
                />
                <span className="text-xs text-gray-400">{node.unit || ''}</span>
                <button
                  onClick={handleResetInitial}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 whitespace-nowrap"
                  title="恢复初始值"
                >
                  重置
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">百分比调整:</span>
                <input
                  type="number"
                  value={percentInput}
                  onChange={handlePercentChange}
                  placeholder="%"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="w-24 text-sm border rounded px-2 py-1"
                />
                <span className="text-xs text-gray-400">%</span>
                <button
                  onClick={handlePercentApply}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 whitespace-nowrap"
                >
                  应用
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="text-gray-800 font-medium">{node.name}</div>
              <div className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-1">
                {node.id}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className={"text-xl font-bold px-2 py-1 rounded inline-block " + (mainValueColorClass ? mainValueColorClass + ' bg-white' : 'bg-white')}>
                  {formatValue(nodeValue, node.format, node.unit)}
                </div>
                {displayBaseline !== null && displayBaseline !== undefined && !isNaN(displayBaseline) && displayBaseline !== 0 && Math.abs(changeAmount) > 0.0001 && (
                  <span className={"text-xl font-bold " + vsTargetArrow.colorClass}>
                    {vsTargetArrow.arrow}
                  </span>
                )}
              </div>

              <div className="flex flex-nowrap gap-2 mt-2">
                {(initialBaseline !== null && initialBaseline !== undefined && !isNaN(initialBaseline) && initialBaseline !== 0) && (
                  <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                    <span className="text-gray-600">📍 初始:</span>
                    <span className="font-mono ml-1">{formatValue(initialBaseline, node.format, node.unit)}</span>
                    {vsInitialAmount !== null && (
                      <span className={"ml-1 " + vsInitialArrowObj.colorClass}>
                        {vsInitialArrowObj.arrow && <span className="mr-0.5">{vsInitialArrowObj.arrow}</span>}
                        ({vsInitialAmount > 0 ? '+' : ''}{formatValue(vsInitialAmount, node.format, node.unit)}
                        {vsInitialPercent !== null && (
                          <span className="ml-0.5">{vsInitialPercent > 0 ? '+' : ''}{vsInitialPercent.toFixed(2)}%</span>
                        )})
                      </span>
                    )}
                  </div>
                )}

                {displayBaseline !== null && displayBaseline !== undefined && !isNaN(displayBaseline) && displayBaseline !== 0 && (
                  <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                    <span className="text-gray-600">🎯 目标:</span>
                    <span className="font-mono ml-1">{formatValue(displayBaseline, node.format, node.unit)}</span>
                    <span className={"ml-1 " + vsTargetArrow.colorClass}>
                      {Math.abs(changeAmount) > 0.0001 && <span className="mr-0.5">{vsTargetArrow.arrow}</span>}
                      ({changeAmount > 0 ? '+' : ''}{formatValue(changeAmount, node.format, node.unit)}
                      {changePercent !== null && (
                        <span className="ml-0.5">{changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%</span>
                      )})
                    </span>
                  </div>
                )}
              </div>

              {node.timeData && Object.keys(node.timeData).length > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  📊 实际+预测 ({(aggregated.actualCount || 0) + (aggregated.forecastCount || 0)}{timeUnitName}) | 实际: {formatValue(aggregated.actualTotal, node.format, node.unit)} | 预测: {formatValue(aggregated.forecastTotal, node.format, node.unit)}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-gray-400 hover:text-gray-600"
        onMouseDown={handleResizeMouseDown}
        title="拖拽调整大小"
      >
        ◢
      </div>

      {/* 重置确认对话框 */}
      {showResetConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg z-50">
          <div className="bg-white rounded-lg p-4 max-w-sm mx-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔄</span>
              <span className="font-medium text-gray-800">重置确认</span>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              检测到当前有调整描述，请选择：
            </div>
            <div className="space-y-2">
              <button
                onClick={handleResetDataOnly}
                className="w-full px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
              >
                📊 仅重置数据（保留描述）
              </button>
              <button
                onClick={handleResetDataAndDescription}
                className="w-full px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
              >
                🗑️ 数据和描述同步重置
              </button>
              <button
                onClick={handleCancelReset}
                className="w-full px-3 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// 权重总和检查和提示组件
const WeightSumCheck = ({ monthWeights, onApply, monthEdits, node, originalTimeData }) => {
  // 计算权重总和，忽略非数字的中间状态（如 '-'、'-.' 等）
  const weightSum = Object.values(monthWeights).reduce((sum, val) => {
    // 如果是字符串且是有效的数字格式（包括负数），才计算
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    return sum + (isNaN(numVal) ? 0 : numVal);
  }, 0);

  const isValid = Math.abs(weightSum - 1) < 0.0001;

  // 计算总调整额
  let totalAdjustment = 0;
  const adjustments = [];
  Object.keys(monthWeights).forEach(key => {
    const currentValue = monthEdits && monthEdits[key] ? parseFloat(monthEdits[key]) || 0 : 0;
    const originalValue = originalTimeData && originalTimeData[key] ? parseFloat(originalTimeData[key]) || 0 : 0;
    const adj = currentValue - originalValue;
    adjustments.push({ key, adj });
    totalAdjustment += adj;
  });

  // 检查是否所有权重都是 0（总调整额为 0 的情况）
  const allZero = Object.values(monthWeights).every(w => {
    const numVal = typeof w === 'string' ? parseFloat(w) : w;
    return !isNaN(numVal) && Math.abs(numVal) < 0.0001;
  });

  // 检查是否有负权重（只有当值是有效数字且小于 0 时）
  const hasNegativeWeight = Object.values(monthWeights).some(w => {
    const numVal = typeof w === 'string' ? parseFloat(w) : w;
    return !isNaN(numVal) && numVal < 0;
  });

  return (
    <div className="mt-3 pt-2 border-t border-purple-200">
      {/* 调整额汇总 - 只显示汇总额 */}
      <div className="text-xs p-2 rounded bg-purple-50 text-purple-700 mb-2">
        <span className="font-medium">📊 调整额汇总：</span>
        <span className="font-mono ml-1">{totalAdjustment > 0 ? '+' : ''}{node ? formatValue(totalAdjustment, node.format, node.unit) : totalAdjustment.toFixed(2)}</span>
      </div>
      {allZero && (
        <div className="text-xs p-2 rounded bg-yellow-100 text-yellow-700 mb-2">
          <span className="font-medium">⚠ </span>
          <span>当前总调整额为 0，无需分配权重</span>
        </div>
      )}
      <div className={`text-xs p-2 rounded ${isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          <span className="font-medium">{isValid ? '✓ ' : '⚠ '}</span>
          <span>权重总和：{weightSum.toFixed(4)}</span>
          {!isValid && (
            <span className="ml-2">
              (需要等于 1，差值：{weightSum > 1 ? '+' : ''}{(weightSum - 1).toFixed(4)})
            </span>
          )}
          {hasNegativeWeight && isValid && (
            <span className="ml-2 text-orange-600">
              (含负权重：部分月份增加，部分月份减少)
            </span>
          )}
          {/* 输入中提示 */}
          {Object.values(monthWeights).some(w => w === '-' || w === '-.' || w === '.') && (
            <span className="ml-2 text-gray-500">
              (输入中...)
            </span>
          )}
        </div>
    </div>
  );
};

export default NodeCard;
