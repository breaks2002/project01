/**
 * 差距分析工具
 * 计算每个驱动因子当前值与目标值的差距
 */

/**
 * 计算驱动因子的目标差距
 * @param {Object} factor - 驱动因子对象
 * @param {Object} targetMetric - 目标指标（一级指标）
 * @param {Object} sensitivityData - 敏感性分析数据
 * @returns {Object} 差距分析结果
 */
export const calculateFactorGap = (factor, targetMetric = null, sensitivityData = null) => {
  const {
    value: currentValue,
    targetValue,
    range,
    sensitivity,
    correlation
  } = factor;

  const result = {
    factorId: factor.id,
    factorName: factor.name,
    currentValue,
    targetValue: targetValue || null,
    hasDirectTarget: !!targetValue,
    gapValue: 0,
    gapPercentage: 0,
    isLargeGap: false,
    directionAligned: false,
    idealPosition: null,
    recommendation: ''
  };

  // ======================================
  // 情况 1：驱动因子有直接目标值
  // ======================================
  if (targetValue !== undefined && targetValue !== null) {
    result.gapValue = targetValue - currentValue;
    result.gapPercentage = Math.abs(result.gapValue) / Math.max(Math.abs(targetValue), 1);
    result.isLargeGap = result.gapPercentage > 0.1; // 10% 阈值

    // 判断方向是否对齐
    const needsIncrease = targetValue > currentValue;
    result.directionAligned = needsIncrease;

    result.recommendation = needsIncrease
      ? `需要提升 ${formatNumber(result.gapValue)} (${formatPercent(result.gapPercentage)})`
      : `需要降低 ${formatNumber(Math.abs(result.gapValue))} (${formatPercent(result.gapPercentage)})`;
  }
  // ======================================
  // 情况 2：无直接目标，根据一级指标反推
  // ======================================
  else if (targetMetric && sensitivityData) {
    const {
      value: targetMetricValue,
      targetValue: targetMetricTarget
    } = targetMetric;

    const {
      elasticity = sensitivity || 0.5,
      correlation: metricCorrelation = correlation || 'positive'
    } = sensitivityData;

    // 计算一级指标的差距比例
    const metricGapRatio = targetMetricTarget
      ? (targetMetricTarget - targetMetricValue) / Math.max(Math.abs(targetMetricTarget), 1)
      : 0.1; // 默认 10% 差距

    // 根据敏感性和相关性反推理想位置
    const minRange = range?.min || currentValue * 0.5;
    const maxRange = range?.max || currentValue * 1.5;
    const rangeSpread = maxRange - minRange;

    if (metricCorrelation === 'positive') {
      // 正相关：需要提升
      if (metricGapRatio > 0) {
        // 需要提升目标指标 → 提升该因子
        const requiredChange = (metricGapRatio / elasticity) * currentValue;
        result.idealPosition = Math.min(currentValue + requiredChange, maxRange);
      } else {
        // 需要降低目标指标 → 降低该因子
        const requiredChange = (Math.abs(metricGapRatio) / elasticity) * currentValue;
        result.idealPosition = Math.max(currentValue - requiredChange, minRange);
      }
    } else {
      // 负相关：反向操作
      if (metricGapRatio > 0) {
        // 需要提升目标指标 → 降低该因子（负相关）
        const requiredChange = (metricGapRatio / elasticity) * currentValue;
        result.idealPosition = Math.max(currentValue - requiredChange, minRange);
      } else {
        // 需要降低目标指标 → 提升该因子（负相关）
        const requiredChange = (Math.abs(metricGapRatio) / elasticity) * currentValue;
        result.idealPosition = Math.min(currentValue + requiredChange, maxRange);
      }
    }

    result.gapValue = result.idealPosition - currentValue;
    result.gapPercentage = Math.abs(result.gapValue) / rangeSpread;
    result.isLargeGap = result.gapPercentage > 0.1;
    result.directionAligned = result.gapValue > 0;

    result.recommendation = result.gapValue > 0
      ? `建议提升 ${formatNumber(result.gapValue)} (${formatPercent(result.gapPercentage)})`
      : `建议降低 ${formatNumber(Math.abs(result.gapValue))} (${formatPercent(result.gapPercentage)})`;
  }
  // ======================================
  // 情况 3：无任何参考数据，使用默认逻辑
  // ======================================
  else {
    // 默认假设需要提升 10%
    const defaultIncrease = currentValue * 0.1;
    result.idealPosition = currentValue + defaultIncrease;
    result.gapValue = defaultIncrease;
    result.gapPercentage = 0.1;
    result.isLargeGap = false;
    result.directionAligned = true;
    result.recommendation = `无明确目标，默认建议提升 ${formatNumber(defaultIncrease)}`;
  }

  return result;
};

/**
 * 分析所有驱动因子的差距
 * @param {Array} factors - 驱动因子列表
 * @param {Object} targetMetric - 目标指标
 * @param {Object} sensitivityMap - 敏感性分析数据映射 {factorId: sensitivityData}
 * @returns {Array} 差距分析结果列表
 */
export const analyzeAllGaps = (factors, targetMetric = null, sensitivityMap = {}) => {
  const gapResults = factors.map(factor => {
    const sensitivityData = sensitivityMap[factor.id] || null;
    return calculateFactorGap(factor, targetMetric, sensitivityData);
  });

  // 按差距比例排序（差距大的优先）
  gapResults.sort((a, b) => b.gapPercentage - a.gapPercentage);

  return gapResults;
};

/**
 * 计算综合优先级分数
 * @param {Object} gapResult - 差距分析结果
 * @param {Object} sensitivityData - 敏感性数据
 * @param {boolean} improvementZone - 是否在改进区
 * @returns {number} 优先级分数 (0-1)
 */
export const calculatePriority = (gapResult, sensitivityData = null, improvementZone = null) => {
  const availableWeights = [];

  // 敏感度 (40% 权重)
  if (sensitivityData?.score !== null && sensitivityData?.score !== undefined) {
    availableWeights.push({
      value: sensitivityData.score,
      weight: 0.4
    });
  }

  // 改进区 (30% 权重)
  if (improvementZone !== null && improvementZone !== undefined) {
    availableWeights.push({
      value: improvementZone ? 1 : 0,
      weight: 0.3
    });
  }

  // 差距 (30% 权重)
  if (gapResult?.gapPercentage !== null && gapResult?.gapPercentage !== undefined) {
    // 差距越大，分数越高
    const gapScore = Math.min(gapResult.gapPercentage * 2, 1); // 归一化到 0-1
    availableWeights.push({
      value: gapScore,
      weight: 0.3
    });
  }

  // 如果没有任何可用数据，返回默认分数 0.5
  if (availableWeights.length === 0) return 0.5;

  // 归一化权重并计算加权分数
  const totalWeight = availableWeights.reduce((sum, w) => sum + w.weight, 0);
  const priorityScore = availableWeights.reduce(
    (sum, w) => sum + w.value * (w.weight / totalWeight),
    0
  );

  return Math.round(priorityScore * 100) / 100;
};

/**
 * 格式化数字
 */
const formatNumber = (num) => {
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toFixed(1);
};

/**
 * 格式化百分比
 */
const formatPercent = (ratio) => {
  return (ratio * 100).toFixed(1) + '%';
};

/**
 * 生成差距分析摘要
 * @param {Array} gapResults - 差距分析结果列表
 * @returns {string} 摘要文本
 */
export const generateGapSummary = (gapResults) => {
  const largeGaps = gapResults.filter(r => r.isLargeGap);
  const alignedGaps = gapResults.filter(r => r.directionAligned);

  let summary = [];

  if (largeGaps.length > 0) {
    summary.push(`${largeGaps.length}个因子存在显著差距 (>10%)`);
  }

  if (alignedGaps.length > 0) {
    summary.push(`${alignedGaps.length}个因子调整方向与目标一致`);
  }

  if (summary.length === 0) {
    summary.push('所有因子差距在合理范围内');
  }

  return summary.join('；');
};

export default {
  calculateFactorGap,
  analyzeAllGaps,
  calculatePriority,
  generateGapSummary
};
