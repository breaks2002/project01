/**
 * 兜底策略引擎 V2 - 完全动态版本
 *
 * 核心原则：
 * 1. 不硬编码任何指标名称（如"收入"、"成本"、"净利润"等）
 * 2. 不硬编码任何计算公式
 * 3. 完全基于用户实际的指标模型结构进行分析
 * 4. 根据一级指标目标差距，自动推导需要调整的驱动因子
 *
 * 适用场景：
 * - 财务模型：收入、成本、利润等
 * - 生产模型：产能、良率、效率等
 * - 销售模型：GMV、转化率、客单价等
 * - 人力模型：人效、离职率、招聘达成率等
 * - 任何自定义模型
 */

// ==================== 工具函数 ====================

/**
 * 提取所有驱动因子
 */
const extractDrivers = (nodes) => {
  if (!nodes) return [];
  return Object.values(nodes)
    .filter(node => node.type === 'driver')
    .map(node => ({
      id: node.id,
      name: node.name,
      code: node.code,
      currentValue: node.value ?? 0,
      baseline: node.baseline ?? node.initialBaseline ?? node.value ?? 0,
      targetValue: node.targetValue,
      range: node.range || { min: 0, max: node.value * 2 },
      unit: node.unit || '',
      timeData: node.timeData,
      parentId: node.parentId,
      level: node.level || 3 // 默认 3 级指标
    }));
};

/**
 * 提取计算指标（一级指标/目标指标）
 */
const extractComputedMetrics = (nodes) => {
  if (!nodes) return [];
  return Object.values(nodes)
    .filter(node => node.type === 'computed')
    .map(node => ({
      id: node.id,
      name: node.name,
      code: node.code,
      value: node.value ?? 0,
      targetValue: node.targetValue,
      formula: node.formula,
      parentId: node.parentId,
      level: node.level || 1
    }));
};

/**
 * 分析驱动因子的时间序列数据
 */
/**
 * 查找指标的所有上游驱动因子（递归）
 */
const findUpstreamDrivers = (metric, nodes, sensitivityData = []) => {
  const upstream = [];
  const visited = new Set();

  // 从公式中提取依赖的因子 ID
  const extractDependencies = (formula) => {
    if (!formula) return [];
    // 简单提取：匹配字母数字组合（因子代码/ID）
    const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    return matches;
  };

  // 递归查找
  const findDependencies = (nodeId, depth = 0) => {
    if (visited.has(nodeId) || depth > 5) return; // 防止无限递归
    visited.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return;

    if (node.type === 'driver') {
      // 找到驱动因子
      const sensitivityInfo = sensitivityData.find(
        s => s.factorId === node.id || s.factorName === node.name
      );
      upstream.push({
        driver: node,
        sensitivity: sensitivityInfo?.sensitivity || 0.5,
        correlation: sensitivityInfo?.correlation || 'positive',
        depth
      });
    } else if (node.type === 'computed' && node.formula) {
      // 继续查找依赖
      const deps = extractDependencies(node.formula);
      deps.forEach(depCode => {
        const depNode = nodes[depCode];
        if (depNode) {
          findDependencies(depNode.id, depth + 1);
        }
      });

      // 同时查找 parentId 依赖
      if (node.parentId) {
        findDependencies(node.parentId, depth + 1);
      }
    }
  };

  // 从指标的公式开始查找
  if (metric.formula) {
    const deps = extractDependencies(metric.formula);
    deps.forEach(depCode => {
      const depNode = Object.values(nodes).find(n =>
        n.code === depCode || n.id === depCode || n.name === depCode
      );
      if (depNode) {
        findDependencies(depNode.id, 1);
      }
    });
  }

  // 同时查找 parentId 依赖
  if (metric.parentId) {
    findDependencies(metric.parentId, 1);
  }

  return upstream;
};

/**
 * 分析依赖关系（基于公式）
 */
const analyzeDependency = (driver, computedMetrics) => {
  // 查找哪些计算指标依赖这个驱动因子
  const dependentMetrics = computedMetrics.filter(metric => {
    if (!metric.formula) return false;
    return metric.formula.includes(driver.code) ||
           metric.formula.includes(driver.id) ||
           metric.formula.includes(driver.name);
  });

  return {
    isDriver: true,
    dependentMetrics: dependentMetrics.map(m => ({ id: m.id, name: m.name })),
    impactCount: dependentMetrics.length
  };
};

/**
 * 基于公式依赖链条传播目标差距
 *
 * 核心逻辑：
 * 1. 从一级指标（目标指标）开始
 * 2. 沿着公式依赖关系向下追踪
 * 3. 根据弹性系数/敏感性分配差距到各驱动因子
 *
 * @param {Object} targetMetric - 目标指标
 * @param {Object} nodes - 所有节点
 * @param {Array} sensitivityData - 敏感性数据
 * @returns {Object} 差距传播结果
 */
const propagateGapThroughChain = (targetMetric, nodes, sensitivityData = []) => {
  if (!targetMetric || !targetMetric.formula) {
    return { gap: 0, gapPercent: 0, downstreamGaps: [] };
  }

  // 计算一级指标的目标差距
  const targetGap = targetMetric.targetValue - targetMetric.value;
  const targetGapPercent = targetGap / Math.max(Math.abs(targetMetric.value), 1);

  console.log('[GapPropagation] 目标指标:', targetMetric.name,
              '当前值:', targetMetric.value,
              '目标值:', targetMetric.targetValue,
              '差距:', targetGap,
              '差距百分比:', targetGapPercent);

  // 从公式中提取依赖
  const extractDependencies = (formula) => {
    if (!formula) return [];
    // 简单提取：匹配字母数字组合（因子代码/ID）
    const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    return [...new Set(matches)]; // 去重
  };

  // 递归查找依赖链条
  const dependencyChain = [];
  const visited = new Set();

  const findChain = (nodeId, depth = 0, parentGapPercent = targetGapPercent) => {
    if (visited.has(nodeId) || depth > 5) return;
    visited.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return;

    if (node.type === 'driver') {
      // 找到驱动因子，计算其需要贡献的差距
      const sensitivityInfo = sensitivityData.find(
        s => s.factorId === node.id || s.factorName === node.name
      );

      // 弹性系数：该因子变化 1% 对目标的影响
      const elasticity = sensitivityInfo?.elasticity || sensitivityInfo?.impact || 1;

      // 该因子需要变化的百分比 = 目标差距百分比 / 弹性系数
      const requiredGapPercent = parentGapPercent / Math.max(elasticity, 0.1);

      dependencyChain.push({
        driver: node,
        depth,
        elasticity,
        requiredGapPercent,
        requiredAbsoluteGap: node.value * requiredGapPercent,
        correlation: sensitivityInfo?.correlation || 'positive'
      });
    } else if (node.type === 'computed' && node.formula) {
      // 继续查找依赖
      const deps = extractDependencies(node.formula);
      deps.forEach(depCode => {
        const depNode = Object.values(nodes).find(n =>
          n.id === depCode || n.name === depCode
        );
        if (depNode) {
          // 平均分配差距到子节点（简化处理）
          findChain(depNode.id, depth + 1, parentGapPercent / deps.length);
        }
      });
    }
  };

  // 从目标指标的公式开始
  const deps = extractDependencies(targetMetric.formula);
  deps.forEach(depCode => {
    const depNode = Object.values(nodes).find(n =>
      n.code === depCode || n.id === depCode || n.name === depCode
    );
    if (depNode) {
      findChain(depNode.id, 1, targetGapPercent / deps.length);
    }
  });

  console.log('[GapPropagation] 依赖链条分析完成，找到', dependencyChain.length, '个驱动因子');

  return {
    gap: targetGap,
    gapPercent: targetGapPercent,
    downstreamGaps: dependencyChain,
    targetMetric: {
      id: targetMetric.id,
      name: targetMetric.name,
      value: targetMetric.value,
      targetValue: targetMetric.targetValue
    }
  };
};

/**
 * 根据依赖链条结果计算驱动因子的差距
 */
const calculateGapFromChain = (driver, chainResult) => {
  const result = {
    absoluteGap: 0,
    relativeGap: 0,
    isSignificant: false,
    direction: 'neutral',
    gapSource: 'none'
  };

  // 从依赖链条中查找该驱动因子
  const chainItem = chainResult.downstreamGaps.find(
    item => item.driver.id === driver.id
  );

  if (chainItem) {
    result.absoluteGap = chainItem.requiredAbsoluteGap;
    result.relativeGap = Math.abs(chainItem.requiredGapPercent);
    result.isSignificant = Math.abs(chainItem.requiredGapPercent) > 0.05; // 5% 阈值

    // 根据相关性方向决定需要增加还是减少
    if (chainItem.correlation === 'negative') {
      // 负相关：如果目标需要提升，该因子需要降低
      result.direction = chainItem.requiredGapPercent > 0 ? 'need_decrease' : 'need_increase';
    } else {
      // 正相关：同向变化
      result.direction = chainItem.requiredGapPercent > 0 ? 'need_increase' : 'need_decrease';
    }

    result.gapSource = 'chain';
    result._chainInfo = chainItem;
  }

  return result;
};

const analyzeTimeData = (driver) => {
  if (!driver.timeData) return null;

  const actualValues = [];
  const forecastValues = [];
  const targetValues = [];

  Object.entries(driver.timeData).forEach(([key, value]) => {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return;

    if (key.includes('实际')) {
      actualValues.push(numVal);
    } else if (key.includes('预测')) {
      forecastValues.push(numVal);
    } else if (key.includes('目标')) {
      targetValues.push(numVal);
    }
  });

  const result = {
    hasActual: actualValues.length > 0,
    hasForecast: forecastValues.length > 0,
    hasTarget: targetValues.length > 0
  };

  if (actualValues.length > 0) {
    result.actualAvg = actualValues.reduce((a, b) => a + b, 0) / actualValues.length;
    result.actualSum = actualValues.reduce((a, b) => a + b, 0);
  }

  if (forecastValues.length > 0) {
    result.forecastAvg = forecastValues.reduce((a, b) => a + b, 0) / forecastValues.length;
    result.forecastSum = forecastValues.reduce((a, b) => a + b, 0);
  }

  if (targetValues.length > 0) {
    result.targetAvg = targetValues.reduce((a, b) => a + b, 0) / targetValues.length;
    result.targetSum = targetValues.reduce((a, b) => a + b, 0);
  }

  // 计算实际 vs 预测偏差
  if (result.actualAvg && result.forecastAvg) {
    result.deviation = (result.forecastAvg - result.actualAvg) / Math.max(result.actualAvg, 1);
  }

  return result;
};

/**
 * 计算驱动因子的差距分析
 */
const calculateGap = (driver, targetMetric = null) => {
  const result = {
    absoluteGap: 0,
    relativeGap: 0,
    isSignificant: false,
    direction: 'neutral', // 'need_increase' | 'need_decrease' | 'neutral'
    gapSource: 'target' // 'target' | 'model' | 'none'
  };

  // 1. 优先使用目标值计算差距
  if (driver.targetValue !== null && driver.targetValue !== undefined) {
    result.absoluteGap = driver.targetValue - driver.currentValue;
    result.relativeGap = Math.abs(result.absoluteGap) / Math.max(Math.abs(driver.currentValue), 1);
    result.isSignificant = result.relativeGap > 0.1; // 10% 阈值

    if (result.absoluteGap > 0) {
      result.direction = 'need_increase';
    } else if (result.absoluteGap < 0) {
      result.direction = 'need_decrease';
    }
    result.gapSource = 'target';
    return result;
  }

  // 2. 如果没有目标值，使用一级指标差距反推
  if (targetMetric && targetMetric.targetValue) {
    const metricGap = targetMetric.targetValue - targetMetric.value;
    const metricRelativeGap = Math.abs(metricGap) / Math.max(Math.abs(targetMetric.value), 1);

    // 根据敏感性反推理想位置
    if (driver.sensitivity !== undefined && driver.sensitivity !== null) {
      const requiredChange = metricRelativeGap / Math.max(driver.sensitivity, 0.1);
      result.absoluteGap = driver.currentValue * requiredChange;
      result.relativeGap = Math.abs(requiredChange);
      result.isSignificant = metricRelativeGap > 0.05;

      if (driver.correlation === 'negative') {
        result.direction = metricGap > 0 ? 'need_decrease' : 'need_increase';
      } else {
        result.direction = metricGap > 0 ? 'need_increase' : 'need_decrease';
      }
    }

    result.gapSource = 'model';
    return result;
  }

  result.gapSource = 'none';
  return result;
};

/**
 * 分析改进区/危险区
 */
const analyzeZone = (driver) => {
  const result = {
    improvementZone: false,
    dangerZone: false,
    zoneReason: ''
  };

  const timeAnalysis = analyzeTimeData(driver);

  if (timeAnalysis) {
    // 改进区：预测显著高于实际
    if (timeAnalysis.deviation > 0.15) {
      result.improvementZone = true;
      result.zoneReason = `预测值高于实际值${(timeAnalysis.deviation * 100).toFixed(1)}%`;
    }
    // 危险区：实际显著高于预测（可能目标定低了）或预测远低于实际
    else if (timeAnalysis.deviation < -0.2) {
      result.dangerZone = true;
      result.zoneReason = `实际值高于预测值${(Math.abs(timeAnalysis.deviation) * 100).toFixed(1)}%，可能存在风险`;
    }
  }

  return result;
};

/**
 * 计算综合优先级分数（动态权重）
 */
const calculatePriorityScore = (data) => {
  const weights = {
    sensitivity: 0.35,
    gap: 0.35,
    improvementZone: 0.15,
    trend: 0.15
  };

  let score = 0;
  let weightSum = 0;

  // 敏感度分数
  if (data.sensitivity !== null && data.sensitivity !== undefined) {
    score += Math.min(1, data.sensitivity) * weights.sensitivity;
    weightSum += weights.sensitivity;
  }

  // 差距分数
  if (data.gap !== null && data.gap !== undefined) {
    score += Math.min(1, data.gap.relativeGap || 0) * weights.gap;
    weightSum += weights.gap;
  }

  // 改进区分数
  if (data.improvementZone) {
    score += weights.improvementZone;
    weightSum += weights.improvementZone;
  }

  // 趋势分数（如果有上升趋势）
  if (data.trend && data.trend.direction === 'up') {
    score += weights.trend;
    weightSum += weights.trend;
  }

  // 归一化
  if (weightSum === 0) return 0.5;
  return score / weightSum;
};

/**
 * 创建调整方案（完全动态，不硬编码任何字段）
 * @param {Object} driver - 驱动因子
 * @param {string} direction - 调整方向
 * @param {number} priorityScore - 优先级分数
 * @param {Object} targetMetric - 目标指标
 * @param {Array} computedMetrics - 计算指标列表（用于因子联动分析）
 */
const createAdjustment = (driver, direction, priorityScore, targetMetric = null, computedMetrics = []) => {
  const gapAnalysis = calculateGap(driver, targetMetric);
  const zoneAnalysis = analyzeZone(driver);

  // 分析时间序列数据
  const timeAnalysis = analyzeTimeData(driver);

  // 计算目标值（优先使用节点的目标值，其次使用当前值）
  const targetValue = driver.targetValue !== null && driver.targetValue !== undefined
    ? driver.targetValue
    : driver.currentValue;

  // 业务合理性：允许的调整范围是目标值的±5%
  const minAllowedValue = targetValue * 0.95;  // 最低允许值（目标值的 95%）
  const maxAllowedValue = targetValue * 1.05;  // 最高允许值（目标值的 105%）

  // 根据优先级和差距计算建议值
  let changePercent, recommendedValue, changeReason;

  if (direction === 'increase') {
    // 提升幅度：基于优先级和差距
    const baseIncrease = gapAnalysis.relativeGap || (priorityScore * 0.2);
    changePercent = Math.round(Math.min(baseIncrease * 100, 50) * 100) / 100; // 最多提升 50%
    recommendedValue = Math.round(driver.currentValue * (1 + changePercent / 100) * 100) / 100;

    // 【业务合理性检查】如果建议值低于目标值的 95%，说明提升不足
    if (recommendedValue < minAllowedValue) {
      console.log(`[业务合理性] ${driver.name} 建议值 ${recommendedValue} 低于目标值 95% (${minAllowedValue})，调整为最低允许值`);
      recommendedValue = Math.round(minAllowedValue * 100) / 100;
      changePercent = Math.round(((recommendedValue - driver.currentValue) / driver.currentValue) * 100 * 100) / 100;
      changeReason = `基于业务目标，该${driver.name}需达到目标范围（目标值±5%），建议提升至${recommendedValue}`;
    } else {
      changeReason = `基于数据分析，该${driver.name}优先级分数${(priorityScore * 100).toFixed(0)}%，建议提升${changePercent.toFixed(1)}%`;
    }
  } else if (direction === 'decrease') {
    // 降低幅度：基于优先级和差距
    const baseDecrease = gapAnalysis.relativeGap || (priorityScore * 0.15);
    changePercent = -Math.round(Math.min(baseDecrease * 100, 30) * 100) / 100; // 最多降低 30%
    recommendedValue = Math.round(driver.currentValue * (1 + changePercent / 100) * 100) / 100;

    // 【业务合理性检查】如果建议值高于目标值的 105%，说明降低不足
    if (recommendedValue > maxAllowedValue) {
      console.log(`[业务合理性] ${driver.name} 建议值 ${recommendedValue} 高于目标值 105% (${maxAllowedValue})，调整为最高允许值`);
      recommendedValue = Math.round(maxAllowedValue * 100) / 100;
      changePercent = Math.round(((recommendedValue - driver.currentValue) / driver.currentValue) * 100 * 100) / 100;
      changeReason = `基于业务目标，该${driver.name}需控制在目标范围（目标值±5%），建议优化至${recommendedValue}`;
    } else if (recommendedValue < minAllowedValue) {
      // 如果建议值低于目标值的 95%，说明降低过度
      console.log(`[业务合理性] ${driver.name} 建议值 ${recommendedValue} 低于目标值 95% (${minAllowedValue})，调整为最低允许值`);
      recommendedValue = Math.round(minAllowedValue * 100) / 100;
      changePercent = Math.round(((recommendedValue - driver.currentValue) / driver.currentValue) * 100 * 100) / 100;
      changeReason = `基于业务目标，该${driver.name}需控制在目标范围（目标值±5%），建议调整为${recommendedValue}`;
    } else {
      changeReason = `基于数据分析，该${driver.name}优先级分数${(priorityScore * 100).toFixed(0)}%，建议优化降低${Math.abs(changePercent).toFixed(1)}%`;
    }
  } else {
    // 保持现状
    changePercent = 0;
    recommendedValue = driver.currentValue;
    changeReason = `基于数据分析，该${driver.name}当前状态合理，建议保持`;
  }

  // 生成月度策略（基于时间数据分析）
  const monthlyStrategy = generateMonthlyStrategy(driver, direction, timeAnalysis);

  return {
    nodeId: driver.id,
    nodeName: driver.name,
    currentValue: driver.currentValue,
    recommendedValue,
    changePercent,
    changeReason,
    dataBasis: generateDataBasis(driver, gapAnalysis, zoneAnalysis, priorityScore),
    businessReason: changeReason,
    riskWarning: generateRiskWarning(driver, zoneAnalysis),
    factorLinkage: generateFactorLinkage(driver, direction, computedMetrics), // 新增：因子联动说明
    monthlyStrategy,
    monthlyFactors: monthlyStrategy.factors,
    confidence: Math.round(priorityScore * 0.85 * 100) / 100,
    isFallback: true,
    _metadata: {
      gapSource: gapAnalysis.gapSource,
      direction: gapAnalysis.direction,
      improvementZone: zoneAnalysis.improvementZone,
      dangerZone: zoneAnalysis.dangerZone
    }
  };
};

/**
 * 生成因子联动说明
 */
const generateFactorLinkage = (driver, direction, computedMetrics) => {
  // 查找与该因子相关的计算指标
  const relatedMetrics = computedMetrics.filter(m =>
    m.formula && (m.formula.includes(driver.code) || m.formula.includes(driver.id) || m.formula.includes(driver.name))
  );

  if (relatedMetrics.length === 0) {
    return `该${driver.name}是独立驱动因子，调整后将直接影响最终目标`;
  }

  const metricNames = relatedMetrics.map(m => m.name).join('、');
  const directionText = direction === 'increase' ? '提升' : direction === 'decrease' ? '降低' : '调整';

  return `${driver.name}${directionText}后，将联动影响${metricNames}，最终传导至目标指标`;
};

/**
 * 生成数据依据说明
 */
const generateDataBasis = (driver, gapAnalysis, zoneAnalysis, priorityScore) => {
  const reasons = [];

  if (gapAnalysis.isSignificant) {
    reasons.push(`目标差距${(gapAnalysis.relativeGap * 100).toFixed(1)}%`);
  }

  if (zoneAnalysis.improvementZone) {
    reasons.push('处于改进区');
  }

  if (zoneAnalysis.dangerZone) {
    reasons.push('处于危险区（需谨慎）');
  }

  if (driver.sensitivity) {
    reasons.push(`敏感性${(driver.sensitivity * 100).toFixed(0)}%`);
  }

  if (reasons.length === 0) {
    reasons.push(`综合优先级分数${(priorityScore * 100).toFixed(0)}%`);
  }

  return reasons.join('，');
};

/**
 * 生成风险提示
 */
const generateRiskWarning = (driver, zoneAnalysis) => {
  const warnings = [];

  if (zoneAnalysis.dangerZone) {
    warnings.push('⚠️ 该因子处于危险区，调整需谨慎');
  }

  if (driver.sensitivity && driver.sensitivity > 0.8) {
    warnings.push('⚠️ 高敏感性因子，小幅调整可能有较大影响');
  }

  if (driver.sensitivity && driver.sensitivity < 0.2) {
    warnings.push('ℹ️ 低敏感性因子，调整效果可能有限');
  }

  if (warnings.length === 0) {
    warnings.push('ℹ️ 建议结合业务实际情况确认调整方案');
  }

  return warnings.join('；');
};

/**
 * 生成月度策略
 */
const generateMonthlyStrategy = (driver, direction, timeAnalysis) => {
  const months = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
  const factors = Array(12).fill(1);

  let strategyName = '平稳执行';

  if (direction === 'increase') {
    strategyName = '稳步增长';
    // 如果有季节性，在旺季加大系数
    if (timeAnalysis && timeAnalysis.monthlyAverages) {
      const maxMonth = Object.entries(timeAnalysis.monthlyAverages)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (maxMonth !== undefined) {
        factors[maxMonth] = 1.15;
        factors[(maxMonth - 1 + 12) % 12] = 1.1;
        factors[(maxMonth + 1) % 12] = 1.05;
      }
    } else {
      // 默认逐月递增
      for (let i = 0; i < 12; i++) {
        factors[i] = 1 + (i * 0.03);
      }
    }
  } else if (direction === 'decrease') {
    strategyName = '平稳优化';
    // 逐月递减
    for (let i = 0; i < 12; i++) {
      factors[i] = 1 - (i * 0.02);
    }
  }

  return {
    name: strategyName,
    factors: factors.map(f => Math.round(f * 100) / 100)
  };
};

/**
 * 分析驱动因子与一级指标的关系
 */
const analyzeDriverImpact = (driver, computedMetrics, sensitivityData = []) => {
  // 查找敏感性数据
  const sensitivityInfo = sensitivityData.find(
    s => s.factorId === driver.id || s.factorName === driver.name
  );

  return {
    sensitivity: sensitivityInfo?.sensitivity || sensitivityInfo?.impactScore || 0.5,
    correlation: sensitivityInfo?.correlation || 'positive',
    impactLevel: sensitivityInfo?.impact || '中'
  };
};

// ==================== 主引擎 ====================

/**
 * 生成兜底策略
 *
 * @param {Object} params
 * @param {Object} params.nodes - 指标模型节点
 * @param {Array} params.sensitivityData - 敏感性分析数据
 * @param {Array} params.stdDevData - 标准差分析数据
 * @param {number} params.positiveTopN - 正相关 TopN
 * @param {number} params.negativeTopN - 负相关 TopN
 * @returns {Object} 兜底策略结果
 */
export const generateFallbackStrategy = ({
  nodes,
  sensitivityData = [],
  stdDevData = [],
  positiveTopN = 5,
  negativeTopN = 5,
  driverIds = null // 新增：限制兜底的因子范围
}) => {
  console.log('[FallbackStrategy V3] 开始生成兜底策略（一级指标目标驱动）...');

  // 1. 提取驱动因子和计算指标
  let drivers = extractDrivers(nodes);

  // 如果指定了 driverIds，只保留这些因子
  if (driverIds && driverIds.length > 0) {
    drivers = drivers.filter(d => driverIds.includes(d.id));
    console.log('[FallbackStrategy] 限制兜底范围:', driverIds.length, '个因子');
  }

  const computedMetrics = extractComputedMetrics(nodes);

  if (drivers.length === 0) {
    return {
      success: false,
      error: '没有找到驱动因子',
      positiveAdjustments: [],
      negativeAdjustments: [],
      allAdjustments: []
    };
  }

  // 2. 构建敏感性数据映射
  const sensitivityMap = new Map();
  (sensitivityData || []).forEach(item => {
    const key = item.factorId || item.factorName;
    if (key) sensitivityMap.set(key, item);
  });

  // 3. 构建标准差数据映射
  const stdDevMap = new Map();
  (stdDevData || []).forEach(item => {
    const key = item.factorId || item.factorName;
    if (key) stdDevMap.set(key, item);
  });

  // 4. 确定目标指标（一级指标，用于差距分析）
  // 优先选择有目标值的计算指标（从最高层级开始）
  const targetMetric = computedMetrics
    .filter(m => m.targetValue !== null && m.targetValue !== undefined)
    .sort((a, b) => (a.level || 1) - (b.level || 1))[0] ||
    computedMetrics.sort((a, b) => (a.level || 1) - (b.level || 1))[0];

  // 5. 计算一级指标的目标差距
  let targetGap = null;
  let targetGapPercent = null;
  if (targetMetric) {
    targetGap = targetMetric.targetValue - targetMetric.value;
    targetGapPercent = Math.abs(targetGap) / Math.max(Math.abs(targetMetric.value), 1);
    console.log('[FallbackStrategy V3] 一级指标目标:', targetMetric.name,
                '当前值:', targetMetric.value,
                '目标值:', targetMetric.targetValue,
                '差距:', targetGap,
                '差距百分比:', targetGapPercent);
  }

  // 6. 基于公式依赖链条传播目标差距
  let chainResult = null;
  if (targetMetric) {
    console.log('[FallbackStrategy V3] 分析一级指标"', targetMetric.name, '"的依赖链条...');
    chainResult = propagateGapThroughChain(targetMetric, nodes, sensitivityData);
    console.log('[FallbackStrategy V3] 依赖链条分析完成，找到', chainResult.downstreamGaps?.length || 0, '个驱动因子');
  }

  // 6b. 分析目标指标的上游驱动因子（基于依赖关系）
  let upstreamDrivers = [];
  if (targetMetric) {
    console.log('[FallbackStrategy V3] 分析一级指标"', targetMetric.name, '"的上游驱动因子...');
    upstreamDrivers = findUpstreamDrivers(targetMetric, nodes, sensitivityData);
    console.log('[FallbackStrategy V3] 找到上游驱动因子:', upstreamDrivers.length, '个');
  }

  // 7. 分析每个驱动因子
  const analyzedDrivers = drivers.map(driver => {
    // 获取敏感性信息
    const impactInfo = analyzeDriverImpact(driver, computedMetrics, sensitivityData);

    // 检查是否是上游驱动因子
    const isUpstream = upstreamDrivers.find(u => u.driver.id === driver.id);
    if (isUpstream) {
      // 使用上游分析结果
      impactInfo.sensitivity = isUpstream.sensitivity;
      impactInfo.correlation = isUpstream.correlation;
      impactInfo.isUpstream = true;
      impactInfo.depth = isUpstream.depth;
    }

    // 依赖关系分析
    const dependencyInfo = analyzeDependency(driver, computedMetrics);

    // 时间序列分析
    const timeAnalysis = analyzeTimeData(driver);

    // 区域分析
    const zoneAnalysis = analyzeZone(driver);

    // 差距分析（优先使用依赖链条结果）
    let gapAnalysis;
    if (chainResult && chainResult.downstreamGaps?.length > 0) {
      // 使用依赖链条传播的差距
      gapAnalysis = calculateGapFromChain(driver, chainResult);
    } else {
      // 兜底：使用原来的方法
      gapAnalysis = calculateGap(driver, targetMetric);
    }

    // 优先级分数（上游因子加分）
    const priorityScore = calculatePriorityScore({
      sensitivity: impactInfo.sensitivity,
      gap: gapAnalysis,
      improvementZone: zoneAnalysis.improvementZone,
      trend: timeAnalysis?.deviation > 0 ? { direction: 'up' } : null,
      isUpstream: isUpstream ? 1 : 0
    });

    return {
      driver,
      impactInfo,
      dependencyInfo,
      timeAnalysis,
      zoneAnalysis,
      gapAnalysis,
      priorityScore,
      isUpstream: !!isUpstream
    };
  });

  // 8. 过滤危险区因子
  const safeDrivers = analyzedDrivers.filter(d => !d.zoneAnalysis.dangerZone);

  // 9. 分组：正相关 vs 负相关
  const positiveDrivers = safeDrivers
    .filter(d => d.impactInfo.correlation === 'positive')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, positiveTopN);

  const negativeDrivers = safeDrivers
    .filter(d => d.impactInfo.correlation === 'negative')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, negativeTopN);

  // 10. 创建调整方案（传入 computedMetrics）
  const positiveAdjustments = positiveDrivers.map(d =>
    createAdjustment(d.driver, 'increase', d.priorityScore, targetMetric, computedMetrics)
  );

  const negativeAdjustments = negativeDrivers.map(d =>
    createAdjustment(d.driver, 'decrease', d.priorityScore, targetMetric, computedMetrics)
  );

  const allAdjustments = [...positiveAdjustments, ...negativeAdjustments];

  console.log('[FallbackStrategy V3] 生成调整方案:', allAdjustments.length);
  console.log('[FallbackStrategy V3] 正相关:', positiveAdjustments.length, '负相关:', negativeAdjustments.length);

  return {
    success: true,
    positiveAdjustments,
    negativeAdjustments,
    allAdjustments,
    metadata: {
      totalDrivers: drivers.length,
      safeCandidates: safeDrivers.length,
      positiveCount: positiveDrivers.length,
      negativeCount: negativeDrivers.length,
      targetMetric: targetMetric ? {
        id: targetMetric.id,
        name: targetMetric.name,
        value: targetMetric.value,
        targetValue: targetMetric.targetValue
      } : null,
      analysisDetails: analyzedDrivers.map(d => ({
        factorId: d.driver.id,
        factorName: d.driver.name,
        priorityScore: d.priorityScore,
        correlation: d.impactInfo.correlation,
        gapSource: d.gapAnalysis.gapSource
      }))
    }
  };
};

/**
 * 兜底策略引擎类
 */
export class FallbackStrategyEngine {
  constructor() {
    this.lastResult = null;
    this.version = '2.0';
  }

  execute(params) {
    this.lastResult = generateFallbackStrategy(params);
    return this.lastResult;
  }

  getLastResult() {
    return this.lastResult;
  }

  isNeeded(aiResult) {
    if (!aiResult) return true;
    if (!aiResult.adjustments || aiResult.adjustments.length === 0) return true;
    if (aiResult.adjustments.length < 2) return true;
    return false;
  }

  getVersion() {
    return this.version;
  }
}

/**
 * 单例导出
 */
export const fallbackStrategyEngine = new FallbackStrategyEngine();
export default {
  generateFallbackStrategy,
  fallbackStrategyEngine,
  FallbackStrategyEngine
};
