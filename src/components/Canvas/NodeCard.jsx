import React, { useMemo, useState, useRef, useCallback } from 'react';
import { NODE_COLORS } from '../../utils/colors';
import { formatValue, getDiffColorClass, isPositiveIndicator, aggregateTimeData, aggregateRatioIndicator } from '../../utils/formatters';

const NodeCard = ({ node, allNodes, onSelect, isSelected, onValueChange, onDelete, onEdit, onResize, onMouseDown, isCollapsed, onToggleCollapse, onResetToInitial, isHighlighted = false, isAffected = false, isDownstream = false, isDependency = false, onOpenTrendChart, onOpenWaterfallChart, onMonthValueChange, onBringNodeToFront, isFront = false, isDragging = false }) => {
  const colors = NODE_COLORS[node.type] || NODE_COLORS.computed;
  const isDriver = node.type === 'driver';
  const [isResizing, setIsResizing] = useState(false);
  const [percentInput, setPercentInput] = useState('');
  const [localInputValue, setLocalInputValue] = useState(null);
  const [isMonthEditMode, setIsMonthEditMode] = useState(false);
  const [monthEdits, setMonthEdits] = useState({});
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [editingMonthKey, setEditingMonthKey] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [isWeightEditMode, setIsWeightEditMode] = useState(false);
  const [monthWeights, setMonthWeights] = useState({});
  const cardRef = useRef(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const lastClickTimeRef = useRef(0);

  // 聚合时间数据 - 根据节点的 aggregationType 选择聚合方式
  const aggregated = useMemo(() => {
    let aggType = node.aggregationType;
    if (!aggType) {
      aggType = node.unit === '%' ? 'average' : 'sum';
    }

    // 如果是比率型指标，使用特殊的聚合逻辑
    if (node.isRatioIndicator && allNodes) {
      return aggregateRatioIndicator(node, allNodes, aggType);
    }

    // 否则使用普通聚合
    return aggregateTimeData(node.timeData, aggType);
  }, [node.timeData, node.aggregationType, node.unit, node.isRatioIndicator, node.formula, allNodes]);

  // 初始化月份编辑数据
  const [actualTotal, setActualTotal] = useState(0);

  React.useEffect(() => {
    if (node.timeData && isMonthEditMode) {
      const edits = {};
      let actualSum = 0;
      Object.keys(node.timeData).forEach(key => {
        if (key.includes('实际')) {
          const val = parseFloat(node.timeData[key]);
          if (!isNaN(val)) actualSum += val;
        }
        if (key.includes('预测')) {
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
    // 驱动因素：优先使用 aggregated.actualPlusForecastTotal（按 aggregationType 聚合）
    if (aggregated.actualPlusForecastTotal !== null && aggregated.actualPlusForecastTotal !== undefined && !isNaN(aggregated.actualPlusForecastTotal)) {
      nodeValue = aggregated.actualPlusForecastTotal;
    } else if (node.value !== null && node.value !== undefined && !isNaN(node.value)) {
      nodeValue = node.value;
    }
  } else {
    // 计算指标：直接使用 node.value（已经通过公式计算过）
    if (node.value !== null && node.value !== undefined && !isNaN(node.value)) {
      nodeValue = node.value;
    } else if (aggregated.actualPlusForecastTotal !== 0) {
      nodeValue = aggregated.actualPlusForecastTotal;
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
    let nodeBaseline = 0;
    if (node.targetValue !== null && node.targetValue !== undefined && !isNaN(node.targetValue)) {
      nodeBaseline = node.targetValue;
    } else if (aggregated.targetTotal !== 0 || aggregated.targetTotal === 0) {
      // 对于驱动因子，优先用 aggregated.targetTotal（按 aggregationType 聚合）
      nodeBaseline = aggregated.targetTotal;
    } else if (node.baseline !== null && node.baseline !== undefined) {
      nodeBaseline = node.baseline;
    }
    displayBaseline = nodeBaseline;
    if (displayBaseline === 0 && nodeValue !== 0) {
      displayBaseline = nodeValue;
    }
    // 对于驱动因子，用 aggregated 的差额（已考虑聚合方式）
    changeAmount = aggregated.diffVsTarget !== undefined ? aggregated.diffVsTarget : (nodeValue - displayBaseline);
    changePercent = aggregated.diffPercentVsTarget !== null ? aggregated.diffPercentVsTarget : (displayBaseline !== 0 ? ((changeAmount) / displayBaseline) * 100 : null);
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
  const initialBaseline = node.initialBaseline;

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
      setLocalInputValue(null);
      onValueChange(node.id, initialBaseline);
    }
  }, [initialBaseline, node.id, onValueChange]);

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
    if (node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')) {
      // 平均模式：(实际总和 + 预测总和) / 总月数
      const actualCount = aggregated.actualMonths.length;
      const forecastCount = forecastValues.length;
      const totalCount = actualCount + forecastCount;
      if (totalCount > 0) {
        newTotal = (actualTotal + forecastTotal) / totalCount;
      } else {
        newTotal = forecastTotal;
      }
    } else {
      // 加总模式：实际总和 + 预测总和
      newTotal = actualTotal + forecastTotal;
    }

    // 调用更新（会触发画布、趋势图、瀑布图联动）
    // 只在最终确认时（blur 或回车）才触发更新，避免输入过程中频繁更新
    if (isFinal && onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }
  }, [monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id]);

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
      if (node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')) {
        const actualCount = aggregated.actualMonths.length;
        const forecastCount = forecastValues.length;
        const totalCount = actualCount + forecastCount;
        newTotal = totalCount > 0 ? (actualTotal + forecastTotal) / totalCount : forecastTotal;
      } else {
        newTotal = actualTotal + forecastTotal;
      }

      if (onMonthValueChange) {
        onMonthValueChange(node.id, newTotal, newEdits);
      }

      return newEdits;
    });
  }, [editingValue, actualTotal, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id, actualTotal]);

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
      const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
        ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
        : actualTotal + forecastTotal;

      if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
      return newEdits;
    });
  }, [node.originalTimeData, selectedMonths, editingMonthKey, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id, actualTotal]);

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
    const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
      ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
      : actualTotal + forecastTotal;

    if (onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }
  }, [selectedMonths, monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id]);

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
    setSelectedMonths(Object.keys(monthEdits).filter(k => k.includes('预测')));
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

      if (Object.keys(monthEdits).length === 0 && node.timeData) {
        // 手动初始化 monthEdits
        const edits = {};
        let actualSum = 0;
        Object.keys(node.timeData).forEach(key => {
          if (key.includes('实际')) {
            const val = parseFloat(node.timeData[key]);
            if (!isNaN(val)) actualSum += val;
          }
          if (key.includes('预测')) {
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
      const forecastMonths = Object.keys(currentMonthEdits).filter(k => k.includes('预测'));
      const total = Object.values(currentMonthEdits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

      // 计算原始预测总额 - 优先使用 originalTimeData，如果不存在则使用 initialBaseline 分摊
      let originalForecastTotal = 0;
      const hasOriginalTimeData = node.originalTimeData && Object.keys(node.originalTimeData).some(k => k.includes('预测'));

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
        // 计算实际权重 = 该月调整额 / 总调整额
        weights[key] = totalAdjustment !== 0 ? (adjustment / totalAdjustment).toFixed(4) : (1 / forecastMonths.length).toFixed(4);
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
    const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
      ? (actualTotal + newForecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
      : actualTotal + newForecastTotal;

    if (onMonthValueChange) {
      onMonthValueChange(node.id, newTotal, newEdits);
    }

    // 退出权重编辑模式
    setIsWeightEditMode(false);
  }, [monthWeights, monthEdits, actualTotal, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id, node.originalTimeData]);

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
        const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
          ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
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
        const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
          ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
          : actualTotal + forecastTotal;
        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
        return newEdits;
      });
    }
    // 注：Ctrl+0 快捷键已移除，避免与浏览器/画布重置冲突
  }, [monthEdits, editingMonthKey, selectedMonths, node.aggregationType, node.unit, aggregated.actualMonths.length, onMonthValueChange, node.id, actualTotal]);

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
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: nodeWidth,
      height: cardRef.current?.offsetHeight || 200
    };
  }, [nodeWidth]);

  const handleResizeMouseMove = useCallback((e) => {
    if (!isResizing || !onResize) return;

    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;

    const newWidth = Math.max(200, resizeStartRef.current.width + dx);
    const newHeight = Math.max(150, resizeStartRef.current.height + dy);

    onResize(node.id, { width: newWidth, height: newHeight });
  }, [isResizing, node.id, onResize]);

  const handleResizeMouseUp = useCallback(() => {
    setIsResizing(false);
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
            title="查看分月趋势"
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
                  📊 实际+预测 ({aggregated.actualMonths.length + aggregated.forecastMonths.length}个月) | 实际: {formatValue(aggregated.actualTotal, node.format, node.unit)} | 预测: {formatValue(aggregated.forecastTotal, node.format, node.unit)}
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
                    {isMonthEditMode ? '✓' : '📅'} 月份调整
                  </button>
                  <button
                    onClick={toggleWeightEditMode}
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isWeightEditMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
                    title="按权重分配总额"
                  >
                    ⚖️ 权重分配
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
                        const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
                          ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
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
                        const newTotal = node.aggregationType === 'average' || (!node.aggregationType && node.unit === '%')
                          ? (actualTotal + forecastTotal) / (aggregated.actualMonths.length + Object.keys(newEdits).length)
                          : actualTotal + forecastTotal;
                        if (onMonthValueChange) onMonthValueChange(node.id, newTotal, newEdits);
                        return newEdits;
                      });
                    }
                  }
                }} tabIndex={-1}>
                  <div className="flex flex-wrap gap-2">
                    {/* 使用 monthEdits 直接渲染，避免重复 */}
                    {Object.entries(monthEdits)
                      .filter(([key]) => key.includes('预测'))
                      .sort((a, b) => {
                        // 按月份排序
                        const aMatch = a[0].match(/^(\d+) 月/);
                        const bMatch = b[0].match(/^(\d+) 月/);
                        if (aMatch && bMatch) {
                          return parseInt(aMatch[1]) - parseInt(bMatch[1]);
                        }
                        return 0;
                      })
                      .map(([key, editValue]) => {
                        // 从 key 提取月份名称，如 "9 月预测" -> "9 月"
                        const monthMatch = key.match(/^(\d+) 月预测$/);
                        const month = monthMatch ? `${monthMatch[1]}月` : key.replace('预测', '');
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
                              <label className="text-xs text-gray-500 truncate" title={month}>{month}</label>
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
                                // 阻止节点拖动，但允许文本选择
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
                    <span className="text-gray-400 ml-2">
                      ({Object.keys(monthEdits).length}个月)
                    </span>
                  </div>
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

                  {/* 权重输入框 */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(monthEdits)
                      .filter(([key]) => key.includes('预测'))
                      .sort((a, b) => {
                        const aMatch = a[0].match(/^(\d+) 月/);
                        const bMatch = b[0].match(/^(\d+) 月/);
                        if (aMatch && bMatch) {
                          return parseInt(aMatch[1]) - parseInt(bMatch[1]);
                        }
                        return 0;
                      })
                      .map(([key, editValue]) => {
                        const monthMatch = key.match(/^(\d+) 月预测$/);
                        const month = monthMatch ? `${monthMatch[1]}月` : key.replace('预测', '');
                        const weight = monthWeights[key] || 0;
                        const currentValue = parseFloat(editValue) || 0;
                        const originalValue = node.originalTimeData && node.originalTimeData[key] ? parseFloat(node.originalTimeData[key]) : 0;
                        const adjustment = currentValue - originalValue;

                        return (
                          <div key={key} className="w-[140px] flex-shrink-0">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-purple-600 truncate">{month}</label>
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

                  {/* 调整额说明 */}
                  <div className="mt-2 text-xs text-purple-600">
                    <span className="font-medium">💡 说明：</span>
                    <span>权重分配的是</span>
                    <span className="font-mono">调整额（当前值 - 原始值）</span>
                    <span>，不是总额。支持负权重，可实现部分月份增加、部分月份减少。</span>
                  </div>

                  {/* 权重总和检查和提示 */}
                  <WeightSumCheck monthWeights={monthWeights} onApply={handleApplyWeights} />
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
                  📊 实际+预测 ({aggregated.actualMonths.length + aggregated.forecastMonths.length}个月) | 实际: {formatValue(aggregated.actualTotal, node.format, node.unit)} | 预测: {formatValue(aggregated.forecastTotal, node.format, node.unit)}
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

    </div>
  );
};

// 权重总和检查和提示组件
const WeightSumCheck = ({ monthWeights, onApply }) => {
  // 计算权重总和，忽略非数字的中间状态（如 '-'、'-.' 等）
  const weightSum = Object.values(monthWeights).reduce((sum, val) => {
    // 如果是字符串且是有效的数字格式（包括负数），才计算
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    return sum + (isNaN(numVal) ? 0 : numVal);
  }, 0);

  const isValid = Math.abs(weightSum - 1) < 0.0001;

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
      {allZero ? (
        <div className="text-xs p-2 rounded bg-yellow-100 text-yellow-700">
          <span className="font-medium">⚠ </span>
          <span>当前总调整额为 0，无需分配权重</span>
        </div>
      ) : (
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
      )}
    </div>
  );
};

export default NodeCard;
