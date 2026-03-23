// 导入兜底策略引擎（用于 AI 返回不足 1 个 adjustment 时的后备策略）
import { generateFallbackStrategy } from '../engine/FallbackStrategyEngine.js';

/**
 * AI Prompt构建工具 - 智能调参版
 * 支持业务背景理解、数据洞察分析、智能建议生成
 */

const formatConstraintDescription = (c) => {
  if (!c) return '';

  const { factorName, description, constraint, unitType, unit, value } = c;

  // 使用 constraintType 来判断约束类型
  const constraintType = constraint?.constraintType;

  switch (constraintType) {
    case 'max_absolute':
      return `不超过 ${constraint.maxValue}${unit || ''}（最大值限制）`;

    case 'max_relative':
      return `不超过 ${Math.round(constraint.max * 100)}%（相对值上限）`;

    case 'min_absolute':
      return `不低于 ${constraint.minValue}${unit || ''}（最小值要求）`;

    case 'min_relative':
      return `不低于 ${Math.round(constraint.min * 100)}%（相对值下限）`;

    case 'delta_point':
      // 百分点：直接加减
      const deltaPoint = constraint.delta * 100;
      const direction = deltaPoint > 0 ? '增加' : '降低';
      return `需要${direction}${Math.abs(deltaPoint)}个百分点（从当前值${deltaPoint > 0 ? '+' : ''}${deltaPoint}%）`;

    case 'delta_percent':
      // 百分比增幅：乘法
      const deltaPercent = constraint.delta * 100;
      const dir = deltaPercent > 0 ? '增加' : '降低';
      return `需要${dir}${Math.abs(deltaPercent)}%（相对增幅，原值×(1+${deltaPercent}%)）`;

    default:
      // 兜底：使用原有 description
      return description || `调整${value}${unit || ''}`;
  }
};

// ==================== 数据计算工具函数 ====================

/**
 * 计算数组的标准差
 * @param {Array} values - 数值数组
 * @returns {number} 标准差
 */
const calculateStdDev = (values) => {
  if (!values || values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * 计算数组的平均值
 * @param {Array} values - 数值数组
 * @returns {number} 平均值
 */
const calculateAverage = (values) => {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

/**
 * 计算趋势（线性回归斜率）
 * @param {Array} values - 数值数组
 * @returns {Object} 趋势信息
 */
const calculateTrend = (values) => {
  if (!values || values.length < 2) return { direction: 'flat', slope: 0, strength: 0 };

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const avgY = sumY / n;
  const trendStrength = Math.abs(slope) / (avgY || 1);

  let direction = 'flat';
  if (slope > 0.01) direction = 'up';
  if (slope < -0.01) direction = 'down';

  return {
    direction,
    slope: Math.round(slope * 100) / 100,
    strength: Math.round(trendStrength * 100) / 100,
    avgValue: Math.round(avgY * 100) / 100
  };
};

/**
 * 计算季节性模式
 * @param {Object} timeData - 月度数据
 * @returns {Object} 季节性分析
 */
const calculateSeasonality = (timeData) => {
  if (!timeData) return null;

  const monthlyData = {};
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  // 按月份分组
  Object.entries(timeData).forEach(([key, value]) => {
    months.forEach((month, index) => {
      if (key.includes(month) || key.includes(`${index + 1}月`)) {
        if (!monthlyData[index]) monthlyData[index] = [];
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) monthlyData[index].push(numVal);
      }
    });
  });

  if (Object.keys(monthlyData).length === 0) return null;

  // 计算每月平均值
  const monthlyAverages = {};
  Object.entries(monthlyData).forEach(([month, values]) => {
    if (values.length > 0) {
      monthlyAverages[month] = calculateAverage(values);
    }
  });

  // 找出高低峰
  const entries = Object.entries(monthlyAverages);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const highMonths = entries.slice(0, 3).map(([m]) => parseInt(m) + 1);
  const lowMonths = entries.slice(-3).map(([m]) => parseInt(m) + 1);

  return {
    monthlyAverages,
    highMonths,
    lowMonths,
    hasSeasonality: entries.length > 0
  };
};

/**
 * 计算节点初始值
 * @param {Object} node - 节点
 * @returns {number} 初始值
 */
const calculateInitialValue = (node) => {
  if (node.initialBaseline !== undefined && node.initialBaseline !== null) {
    return node.initialBaseline;
  }
  if (node.baseline !== undefined && node.baseline !== null) {
    return node.baseline;
  }
  if (node.timeData) {
    const values = Object.values(node.timeData)
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));
    if (values.length > 0) {
      return values.reduce((a, b) => a + b, 0);
    }
  }
  return node.value ?? 0;
};

/**
 * 构建月度数据摘要
 * @param {Object} timeData - 月度数据
 * @returns {Object} 摘要信息
 */
const buildMonthlySummary = (timeData) => {
  if (!timeData || Object.keys(timeData).length === 0) {
    return null;
  }

  const values = Object.values(timeData).map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stdDev = calculateStdDev(values);

  // 趋势分析
  const trend = calculateTrend(values);

  // 实际/预测分析
  const actualKeys = Object.keys(timeData).filter(k => k.includes('实际'));
  const forecastKeys = Object.keys(timeData).filter(k => k.includes('预测'));

  const actualValues = actualKeys.map(k => parseFloat(timeData[k])).filter(v => !isNaN(v));
  const forecastValues = forecastKeys.map(k => parseFloat(timeData[k])).filter(v => !isNaN(v));

  const actualSum = actualValues.reduce((sum, v) => sum + v, 0);
  const forecastSum = forecastValues.reduce((sum, v) => sum + v, 0);

  // 偏差分析
  let deviation = null;
  if (actualValues.length > 0 && forecastValues.length > 0) {
    const actualAvg = actualValues.reduce((a, b) => a + b, 0) / actualValues.length;
    const forecastAvg = forecastValues.reduce((a, b) => a + b, 0) / forecastValues.length;
    if (forecastAvg !== 0) {
      deviation = Math.round(((actualAvg - forecastAvg) / forecastAvg) * 100 * 100) / 100;
    }
  }

  return {
    months: Object.keys(timeData),
    count: values.length,
    total: Math.round(sum * 100) / 100,
    average: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    cv: avg !== 0 ? Math.round((stdDev / avg) * 100 * 100) / 100 : 0, // 变异系数
    actualTotal: Math.round(actualSum * 100) / 100,
    forecastTotal: Math.round(forecastSum * 100) / 100,
    trend: trend.direction,
    trendStrength: trend.strength,
    deviation,
    seasonality: calculateSeasonality(timeData)
  };
};

// ==================== 模型结构构建 ====================

/**
 * 构建计算链路径（从目标指标反向追溯到驱动因子）
 * @param {Object} nodes - 所有节点
 * @param {string} targetNodeId - 目标节点 ID
 * @returns {Array} 计算链路径，包含每一步的正向和逆向公式
 */
export const buildCalculationChain = (nodes, targetNodeId) => {
  if (!targetNodeId || !nodes[targetNodeId]) return [];

  const chain = [];
  const visited = new Set();

  const traverse = (nodeId, depth = 0) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return;

    if (node.formula && depth > 0) {
      // 分析公式类型，生成逆向运算规则
      const formula = node.formula;
      let inverseRules = [];

      // 简单公式解析：A = B op C 或 A = B op 常数
      // 支持的运算符：+ - * / ² √ 等
      const multiplyMatch = formula.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\*\s*([0-9.]+|[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)$/);
      const divideMatch = formula.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\/\s*([0-9.]+|[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)$/);
      const addMatch = formula.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\+\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)$/);
      const subtractMatch = formula.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*-\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)$/);
      const powerMatch = formula.match(/^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\^?\*?\s*([0-9.]+)$/);
      const sqrtMatch = formula.match(/√\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/);

      if (multiplyMatch) {
        // A = B * C → B = A / C, C = A / B
        const [, left, right] = multiplyMatch;
        inverseRules.push({
          type: 'multiply',
          formula: `${node.name} = ${left} × ${right}`,
          inverse: `若求 ${left}, 则 ${left} = ${node.name} / ${right}; 若求 ${right}, 则 ${right} = ${node.name} / ${left}`
        });
      } else if (divideMatch) {
        // A = B / C → B = A × C, C = B / A
        const [, left, right] = divideMatch;
        inverseRules.push({
          type: 'divide',
          formula: `${node.name} = ${left} ÷ ${right}`,
          inverse: `若求 ${left}, 则 ${left} = ${node.name} × ${right}; 若求 ${right}, 则 ${right} = ${left} / ${node.name}`
        });
      } else if (addMatch) {
        // A = B + C → B = A - C, C = A - B
        const [, left, right] = addMatch;
        inverseRules.push({
          type: 'add',
          formula: `${node.name} = ${left} + ${right}`,
          inverse: `若求 ${left}, 则 ${left} = ${node.name} - ${right}; 若求 ${right}, 则 ${right} = ${node.name} - ${left}`
        });
      } else if (subtractMatch) {
        // A = B - C → B = A + C, C = B - A
        const [, left, right] = subtractMatch;
        inverseRules.push({
          type: 'subtract',
          formula: `${node.name} = ${left} - ${right}`,
          inverse: `若求 ${left}, 则 ${left} = ${node.name} + ${right}; 若求 ${right}, 则 ${right} = ${left} - ${node.name}`
        });
      } else if (powerMatch) {
        // A = B^n → B = A^(1/n), n = log_B(A)
        const [, base, exp] = powerMatch;
        inverseRules.push({
          type: 'power',
          formula: `${node.name} = ${base}^${exp}`,
          inverse: `若求 ${base}, 则 ${base} = ${node.name}^(1/${exp}) = ${node.name} 的 ${exp} 次方根`
        });
      } else if (sqrtMatch) {
        // A = √B → B = A²
        const [, inside] = sqrtMatch;
        inverseRules.push({
          type: 'sqrt',
          formula: `${node.name} = √${inside}`,
          inverse: `若求 ${inside}, 则 ${inside} = ${node.name}²`
        });
      } else {
        // 复杂公式，需要 AI 自己理解
        inverseRules.push({
          type: 'complex',
          formula: `${node.name} = ${formula}`,
          inverse: `请根据公式 ${formula} 反向推导各变量的值`
        });
      }

      chain.push({
        nodeId: node.id,
        nodeName: node.name,
        formula,
        inverseRules,
        depth
      });
    }

    // 递归查找依赖
    if (node.formula) {
      const deps = node.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|[\u4e00-\u9fa5]+[a-zA-Z0-9_]*/g) || [];
      deps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          traverse(depId, depth + 1);
        }
      });
    }
  };

  traverse(targetNodeId);
  return chain.sort((a, b) => a.depth - b.depth);
};

/**
 * 构建增强的模型结构描述
 * @param {Object} nodes - 所有节点
 * @returns {Object} 增强的模型结构
 */
export const buildModelStructure = (nodes) => {
  const structure = {
    drivers: [],
    computed: [],
    relationships: [],
    targetNodes: []
  };

  Object.values(nodes).forEach((node) => {
    const nodeInfo = {
      id: node.id,
      name: node.name,
      unit: node.unit || '',
      min: node.min ?? null,
      max: node.max ?? null
    };

    if (node.type === 'driver') {
      const initialValue = calculateInitialValue(node);
      const currentValue = node.value ?? node.baseline ?? initialValue;
      const monthlySummary = buildMonthlySummary(node.timeData);

      structure.drivers.push({
        ...nodeInfo,
        initialValue: Math.round(initialValue * 100) / 100,
        originalBaseline: node.baseline ?? initialValue,
        currentValue: Math.round(currentValue * 100) / 100,
        editable: true,
        aggregationType: node.aggregationType || 'sum',
        monthlySummary,
        hasTimeData: !!node.timeData && Object.keys(node.timeData).length > 0
      });
    } else if (node.type === 'computed') {
      const currentValue = node.value ?? 0;

      structure.computed.push({
        ...nodeInfo,
        formula: node.formula || '',
        currentValue: Math.round(currentValue * 100) / 100,
        isTargetCandidate: true
      });

      structure.targetNodes.push({
        id: node.id,
        name: node.name,
        currentValue: Math.round(currentValue * 100) / 100,
        unit: node.unit || ''
      });
    }

    if (node.dependsOn && node.dependsOn.length > 0) {
      node.dependsOn.forEach((depId) => {
        structure.relationships.push({
          from: depId,
          fromName: nodes[depId]?.name || depId,
          to: node.id,
          toName: node.name,
          type: 'dependency'
        });
      });
    }
  });

  return structure;
};

/**
 * 构建三态值对比
 * @param {Object} nodes - 所有节点
 * @param {string} targetNodeId - 目标节点ID
 * @param {number} targetValue - 目标值
 * @returns {Object} 三态对比
 */
export const buildValueComparison = (nodes, targetNodeId = null, targetValue = null) => {
  const comparison = {
    drivers: {},
    computed: {},
    target: null
  };

  Object.values(nodes).forEach((node) => {
    const initialValue = calculateInitialValue(node);
    const currentValue = node.value ?? node.baseline ?? initialValue;

    const info = {
      name: node.name,
      initialValue: Math.round(initialValue * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
      unit: node.unit || '',
      changeFromInitial: initialValue !== 0
        ? Math.round(((currentValue - initialValue) / Math.abs(initialValue)) * 100 * 100) / 100
        : 0
    };

    if (node.type === 'driver') {
      info.adjustable = true;
      info.min = node.min ?? null;
      info.max = node.max ?? null;
      comparison.drivers[node.id] = info;
    } else {
      info.formula = node.formula || '';
      comparison.computed[node.id] = info;
    }
  });

  if (targetNodeId && nodes[targetNodeId]) {
    const targetNode = nodes[targetNodeId];
    const currentVal = targetNode.value ?? 0;
    const gap = targetValue !== null ? targetValue - currentVal : null;

    comparison.target = {
      id: targetNodeId,
      name: targetNode.name,
      currentValue: Math.round(currentVal * 100) / 100,
      targetValue: targetValue !== null ? Math.round(targetValue * 100) / 100 : null,
      gap: gap !== null ? Math.round(gap * 100) / 100 : null,
      gapPercent: currentVal !== 0 && gap !== null
        ? Math.round((gap / Math.abs(currentVal)) * 100 * 100) / 100
        : null,
      unit: targetNode.unit || '',
      isReached: gap !== null && gap <= 0.01
    };
  }

  return comparison;
};

// ==================== 数据洞察分析 ====================

/**
 * 计算敏感性分析
 * @param {Object} nodes - 所有节点
 * @param {string} targetNodeId - 目标节点ID
 * @returns {Array} 敏感性分析结果
 */
const calculateSensitivity = (nodes, targetNodeId) => {
  if (!targetNodeId || !nodes[targetNodeId]) return [];

  const targetNode = nodes[targetNodeId];
  const targetValue = targetNode.value ?? 0;
  const drivers = Object.values(nodes).filter(n => n.type === 'driver');

  return drivers.map(driver => {
    const driverValue = driver.value ?? driver.baseline ?? 1;
    if (driverValue === 0) return null;

    // 计算1%变化对目标的影响
    const onePercentChange = driverValue * 0.01;

    // 简单估算：基于公式中的系数
    let elasticity = 0;
    if (targetNode.formula) {
      // 如果目标节点公式中包含该驱动因子，估算影响
      const formula = targetNode.formula.toLowerCase();
      const driverName = driver.name.toLowerCase();
      if (formula.includes(driverName) || formula.includes(driver.id.toLowerCase())) {
        elasticity = 0.5; // 默认估算值
      }
    }

    // 计算影响系数
    const impact = elasticity * (driverValue / Math.abs(targetValue || 1));

    return {
      nodeId: driver.id,
      nodeName: driver.name,
      currentValue: Math.round(driverValue * 100) / 100,
      impact: Math.abs(impact) > 0.001 ? Math.round(impact * 100) / 100 : 0,
      elasticity: Math.round(elasticity * 100) / 100,
      priority: Math.abs(impact) > 0.1 ? 'high' : Math.abs(impact) > 0.01 ? 'medium' : 'low'
    };
  }).filter(Boolean).sort((a, b) => b.impact - a.impact);
};

/**
 * 分析数据趋势和风险
 * @param {Object} nodes - 所有节点
 * @returns {Object} 分析结果
 */
const analyzeDataInsights = (nodes) => {
  const insights = {
    trends: [],
    risks: [],
    warnings: []
  };

  const drivers = Object.values(nodes).filter(n => n.type === 'driver');

  drivers.forEach(node => {
    if (!node.timeData) return;

    const summary = buildMonthlySummary(node.timeData);
    if (!summary) return;

    // 趋势分析
    const trendInfo = {
      nodeId: node.id,
      nodeName: node.name,
      trend: summary.trend,
      trendStrength: summary.trendStrength,
      avgValue: summary.average,
      deviation: summary.deviation
    };

    if (summary.trend !== 'flat') {
      insights.trends.push(trendInfo);
    }

    // 风险分析
    if (summary.cv > 30) {
      insights.risks.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'high_volatility',
        description: `波动较大（变异系数${summary.cv}%）`,
        recommendation: '建议保守调整'
      });
    }

    if (summary.deviation !== null && Math.abs(summary.deviation) > 20) {
      insights.warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'forecast_deviation',
        description: `实际值与预测偏差${summary.deviation > 0 ? '+' : ''}${summary.deviation}%`,
        severity: Math.abs(summary.deviation) > 30 ? 'high' : 'medium'
      });
    }
  });

  return insights;
};

// ==================== Prompt构建 ====================

/**
 * 构建智能调参Prompt - 新版本
 * @param {Object} params - 参数对象
 * @returns {Object} {system, user}
 */
export const buildSmartTuningPrompt = ({
  nodes,
  businessContext,
  targetNodeId = null,
  targetValue = null,
  constraints = [],
  knowledgeResults = [],
  selectedScenarios = [],
  consistencyResult = null, // 一致性验证结果
  // 节点选择（新增）
  selectedMetrics = [],
  selectedDrivers = [],
  nodeSelectorMode = 'auto', // 'auto' | 'manual'
  // 特殊约束（B+C+D 方案）
  specialConstraints = [],
  // 调整模式选择（B+C+D 方案）
  adjustmentMode = 'auto', // 'auto' | 'conservative' | 'moderate' | 'aggressive' | 'custom'
  customRange = null, // { min: -50, max: 50 }
  // AI 语义兜底（新增）
  enableAIFallback = true // 是否启用 AI 语义兜底
}) => {
  console.log('[aiPromptBuilder] 收到节点选择:', { nodeSelectorMode, selectedMetrics, selectedDrivers });
  console.log('[aiPromptBuilder] 调整模式:', adjustmentMode, customRange);

  const modelStructure = buildModelStructure(nodes);
  const valueComparison = buildValueComparison(nodes, targetNodeId, targetValue);
  const sensitivity = calculateSensitivity(nodes, targetNodeId);
  const dataInsights = analyzeDataInsights(nodes);
  const calculationChain = buildCalculationChain(nodes, targetNodeId); // 新增：计算链路径

  const targetNode = targetNodeId ? nodes[targetNodeId] : null;

  // 日志：检查模板变量
  console.log('[aiPromptBuilder] 节点选择模式:', nodeSelectorMode);
  console.log('[aiPromptBuilder] selectedDrivers 长度:', selectedDrivers.length);
  console.log('[aiPromptBuilder] selectedMetrics 长度:', selectedMetrics.length);

  // 处理知识库结果
  let knowledgeContext = '';
  if (knowledgeResults && knowledgeResults.length > 0) {
    console.log('[buildSmartTuningPrompt] 知识库命中:', knowledgeResults.length, '条');
    knowledgeContext = knowledgeResults.map(k => {
      // 尝试从 factors 中提取关键因子
      let factorNames = '无';
      let factorResults = '无';

      if (k.factors && k.factors.length > 0) {
        factorNames = k.factors.map(f => f.factorName || f.name).filter(Boolean).join(', ') || '无';
        factorResults = k.factors.map(f => f.result || '未知').filter(Boolean).join(', ') || '无';
      } else {
        // 如果 factors 为空，尝试从描述中提取关键词
        const desc = k.description || k.scenario || '';
        if (desc) {
          // 简单提取：从描述中识别可能的因子名称（与节点匹配）
          const matchedFactors = Object.values(nodes || {}).filter(n =>
            n.type === 'driver' && desc.includes(n.name)
          ).map(n => n.name);

          if (matchedFactors.length > 0) {
            factorNames = matchedFactors.join(', ');
            factorResults = '基于历史经验推断';
          }
        }
      }

      return '- 标题：' + k.title + '\n  行业：' + (k.industry || '未指定') +
        '\n  场景：' + (k.scenario || '未指定') +
        '\n  关键因子：' + factorNames +
        '\n  历史效果：' + factorResults;
    }).join('\n');
  }

  // 构建知识库 Prompt
  const knowledgeBasePrompt = knowledgeContext ? `\n【知识库参考】\n系统检索到以下历史案例供参考（以当前模型为准）：\n` + knowledgeContext + '\n' : '';

  // 构建计算链 Prompt（新增）
  let calculationChainPrompt = '';
  if (calculationChain.length > 0) {
    // 生成动态示例，基于实际模型数据
    const firstStep = calculationChain[0];
    const exampleTarget = firstStep ? firstStep.nodeName : '目标指标';
    const exampleFormula = firstStep ? firstStep.formula : '';

    calculationChainPrompt = `\n【公式计算链与逆向推导规则】（极其重要！必须遵守！）

**计算路径（从目标到驱动因子）**：
${calculationChain.map((step, i) => `
第${i + 1}步：${step.nodeName}
  正向公式：${step.inverseRules[0]?.formula || step.formula}
  逆向推导：${step.inverseRules[0]?.inverse || '请根据公式反向推导'}`).join('\n')}

**逆向推导强制规则**（不遵守会导致计算错误！）：
1. **从目标值开始反向推导**：用户目标是"${exampleTarget} XXX"，你必须先根据上述公式进行逆运算
   - 例如：如果公式是"${exampleFormula}"，则使用对应的逆运算规则
   - 然后才能计算驱动因子的调整值

2. **通用逆运算规则**：
   - 如果公式是 Y = X × k（k 是系数），则 X = Y / k
   - 如果公式是 Y = X / k，则 X = Y × k
   - 如果公式是 Y = X + A，则 X = Y - A
   - 如果公式是 Y = X - A，则 X = Y + A
   - 如果公式是 Y = X^n，则 X = Y^(1/n)（开方）
   - 如果公式是 Y = √X，则 X = Y²

3. **计算验证步骤**（必须执行！）：
   - 步骤 1：从用户目标值开始，用逆运算计算中间变量
   - 步骤 2：根据中间变量推导驱动因子的调整值
   - 步骤 3：用正向公式验证：驱动因子 → 中间变量 → 目标值 = 用户目标
   - 步骤 4：如果验证不通过，重新调整
`.trim();
  }

  // 处理场景模板（支持多选）
  let scenarioPrompt = '';
  let scenarioNames = [];

  if (selectedScenarios && selectedScenarios.length > 0) {
    scenarioNames = selectedScenarios.map(s => s.name || '自定义场景');
    // 合并多个场景的 System Prompt
    const scenarioPrompts = selectedScenarios
      .map(s => s.systemPrompt || '')
      .filter(Boolean);
    scenarioPrompt = scenarioPrompts.join('\n\n---\n\n');
    console.log('[buildSmartTuningPrompt] 使用场景模板:', scenarioNames);
  }

  const baseSystemPrompt = `你是一位资深的业务分析和规划专家，擅长基于业务背景和数据洞察进行智能调参。

【核心任务】
用户提供了业务背景和未来计划，你需要：

**首要任务：正确理解指标计算链并执行逆运算**
1. 仔细阅读【公式计算链与逆向推导规则】部分，理解每个指标的公式和逆运算规则
2. 从用户目标值开始，用**逆运算**计算中间变量
   - 根据实际公式选择对应的逆运算规则（见上方通用规则）
   - 例如：如果公式是"目标 = 中间值 × 系数"，则"中间值 = 目标 / 系数"
3. 根据中间变量推导驱动因子的调整值
4. 用正向公式验证：调整后的驱动因子代入公式 → 结果必须等于用户目标

**关键警告**：
- ❌ 错误：直接用"收入 - 成本 - 费用"得到结果，忽略了目标指标的公式系数
- ✓ 正确：先通过逆运算计算中间变量，再调整驱动因子使公式成立

1. 深入理解业务背景中的关键信息（时间节点、目标方向、资源约束、涉及的业务模块）
2. 全面分析现有数据的趋势、敏感性和风险
3. **根据业务背景识别所有需要调整的驱动因子**（不要只调整一个！）
4. 为每个识别出的因子生成专业的调整建议

【调整范围约束】
${nodeSelectorMode === 'manual' && selectedDrivers.length > 0 ? `
用户指定了可调整的驱动因子范围，你必须**优先在以下范围内选择**：
${selectedDrivers.map(id => `- ${nodes[id]?.name || id}`).join('\n')}

注意：
- 如果业务背景中提到的因子不在上述范围内，你仍然可以建议，但需要在 explanation 中说明原因
- 如果用户提示词与选择的因子冲突，以提示词为准（提示词优先级更高）
` : `
你可以调整任意驱动因子，根据业务背景和你的专业判断自主选择
`}

【计算指标选择】
${nodeSelectorMode === 'manual' && selectedMetrics.length > 0 ? `
用户选择了以下计算指标用于目标验证：
${selectedMetrics.map(id => `- ${nodes[id]?.name || id}`).join('\n')}
` : `
目标验证指标将从业务背景中自动识别
`}

【关键原则】
1. **多因子联动**：业务目标通常需要多个因子协同调整
   - 如果目标是"提升收入"，可能需要：收入增长 + 营销投入增加 + 成本优化
   - 如果目标是"提升质量"，可能需要：质检投入 + 返工成本 + 客户满意度等
   - 如果目标是"研发提速"，可能需要：研发投入 + 人力成本 + 设备费用等

2. **从业务背景推导**：仔细阅读用户的业务描述，提取所有提到的可调因子
   - 用户说"增加推广费用"→ 销售费用需要调整
   - 用户说"优化管理"→ 管理费用需要调整
   - 用户说"提升产量"→ 生产成本/设备费用需要调整

3. **【极其重要】多因子强制要求**：
   - 业务场景涉及利润规划时，必须同时调整收入、成本、费用的多个因子
   - 不要只调营业收入！营业成本、销售费用、管理费用都必须考虑
   - adjustments数组中至少要有3-5个调整项，涵盖收入类、成本类、费用类

4. **联动调整逻辑**：
   - 营业收入增加 → 营业成本必须同比例增加（维持毛利率）
   - 市场推广增加 → 销售费用必须增加
   - 管理优化 → 管理费用应该降低
   - 这些都是独立的 adjustment 对象，不是只调一个！

【分析维度】

1. 业务理解 (understanding)
   - 时间节点：Q4旺季、项目周期、年度等
   - 目标方向：增长、控制、优化、冲刺、提升、降低
   - 涉及因子：业务背景中明确或隐含提到的所有可调因子
   - 约束条件：预算范围、资源限制、时间限制

2. 数据洞察 (dataAnalysis)
   - 趋势分析：识别季节性、增长/下降趋势
   - 敏感性：哪个因子对目标影响最大
   - 风险识别：高波动因子、预测偏差

3. 调整方案 (adjustments)
   - **为每个识别出的驱动因子提供独立的调整对象**

【输出格式要求】
必须返回以下 JSON 格式（不要包含 markdown 代码块）：

**【必填字段】calculationVerification（计算验证，用于确保逆运算正确执行）**
在返回 adjustments 之前，你必须先填写此字段，展示逆运算过程：
- targetMetric: 目标指标名称
- targetValue: 目标值
- formula: 目标指标的公式
- inverseStep1: 第一步逆运算（如：营业利润 = 净利润 / 0.75 = XXX）
- driverDerivation: 如何从驱动因子推导出中间变量的值
- finalVerification: 代入公式验证是否等于目标值

**注意**：如果不填写此字段或计算错误，你的方案将被拒绝！

【重要 - 长度优化】
由于输出长度限制，请严格遵守：
1. **优先保证**：calculationVerification、adjustments 数组（至少 3-5 个因子）、expectedImpact、explanation 必须完整
2. **简化描述**：understanding 每项≤50 字，dataAnalysis 每项≤30 字
3. **不可省略**：dataAnalysis.trends 和 dataAnalysis.sensitivity 必须至少各包含 1 条（用于前端展示）
4. **简洁第一**：用短语代替长句，如"Q4 旺季，10-12 月高峰"代替"当前处于年度规划阶段，10-12 月为传统旺季"

{
  "calculationVerification": {
    "targetMetric": "净利润",
    "targetValue": X,
    "formula": "",
    "inverseStep1": "营业利润 = X / 0.75 = Y 万",
    "driverDerivation": "营业收入 A - 营业成本 B - 销售费用 C - 管理费用 D = Y 万",
    "finalVerification": "Y × 0.75 = X 万 ✓"
  },
  "understanding": {
    "businessContext": "AI 对业务背景的理解摘要",
    "timeContext": "识别的时间节点",
    "keyGoals": ["目标 1", "目标 2"],
    "constraints": ["约束 1", "约束 2"],
    "flexibleFactors": ["可调因子"],
    "rigidFactors": ["刚性因子"]
  },
  "dataAnalysis": {
    "trends": [
      {"factor": "营业收入", "pattern": "Q4 为传统旺季，10-12 月环比增长 30-40%", "seasonality": "旺季在 Q4"}
    ],
    "sensitivity": [
      {"factor": "管理费用", "impact": "high", "correlation": "positive", "elasticity": 1.0}
    ],
    "risks": [
      {"factor": "营业收入", "riskLevel": "中", "description": "历史预测偏差较大", "recommendation": "需紧密监控市场反馈"}
    ]
  },
  "adjustments": [
    {
      "nodeId": "驱动因子ID",
      "nodeName": "驱动因子名称",
      "currentValue": 100,
      "recommendedValue": 120,
      "changePercent": 20,
      "changeReason": "调整理由（简洁）",
      "dataBasis": "数据依据（详细）：基于什么趋势/敏感性得出",
      "businessReason": "业务理由：结合用户背景说明为什么",
      "riskWarning": "风险提示：可能的不确定性",
      "monthlyStrategy": "月度分配策略名称",
      "monthlyFactors": [1.0, 1.1, ...], // 12个月分配系数
      "confidence": 0.85
    }
  ],
  "expectedImpact": {
    "keyMetrics": [
      {
        "name": "净利润",
        "before": 100,
        "after": 120,
        "change": "+20%",
        "probability": "75%"
      }
    ],
    "sensitivityScenario": [
      {"scenario": "乐观", "profit": 130, "assumption": "..."},
      {"scenario": "基准", "profit": 125, "assumption": "..."},
      {"scenario": "悲观", "profit": 110, "assumption": "..."}
    ],
    "summary": "整体影响说明"
  },
  "explanation": "详细的调整思路和分析过程"
}

【重要规则】
1. **必须返回 adjustments 字段**，且不能为空数组。如果分析后认为需要调整，请提供具体的调整建议。
2. **必须调整多个驱动因子**：不要只调整营业收入一个指标！根据业务背景，通常需要同时调整3-5个相关因子（如：营业收入、销售费用、管理费用、营业成本等）。
3. 每个adjustment必须包含：nodeId、nodeName、currentValue、recommendedValue、changePercent、changeReason、dataBasis、businessReason、riskWarning
4. 基于实际数据趋势，不要假设
5. 考虑季节性因素（如果有月度数据）
6. sensitivityScenario必须包含乐观/基准/悲观三种情况
7. 置信度(0-1)反映你对建议的信心程度
8. **JSON格式严格规范**：
   - 所有键名必须用双引号包裹
   - 字符串值必须用双引号包裹
   - 最后一个元素后面不能有逗号（不能是尾随逗号）
   - 不要包含任何注释
   - 不要返回 markdown 代码块（三个反引号+json），只返回纯JSON
9. **示例检查**：{"key": "value"} ✓ 正确，{key: 'value'} ✗ 错误
10. **强制要求**：如果驱动因子列表中有可调整的因子，adjustments数组中至少要有2-5个调整建议，涵盖收入类、成本类、费用类等多个维度
11. **多指标联动原则**：
    - 如果增加营业收入，通常需要增加销售费用来支撑
    - 如果优化管理费用，需要单独调整管理费用因子
    - 营业成本应与营业收入保持合理比例（维持毛利率稳定）
12. **【关键】调整示例 - 多因子联动**（必须参考此模式，返回多个adjustment）：
    ---
    正确示例（adjustments数组包含4个对象）：
    [
      {
        "nodeId": "revenue",
        "nodeName": "营业收入",
        "currentValue": 1450,
        "recommendedValue": 1650,
        "changePercent": 13.8,
        "changeReason": "Q4销售旺季，加大市场推广力度"
      },
      {
        "nodeId": "cogs",
        "nodeName": "营业成本",
        "currentValue": 725,
        "recommendedValue": 990,
        "changePercent": 36.6,
        "changeReason": "与营业收入挂钩，维持40%毛利率"
      },
      {
        "nodeId": "sales_expense",
        "nodeName": "销售费用",
        "currentValue": 231,
        "recommendedValue": 256,
        "changePercent": 10.8,
        "changeReason": "加大市场推广投入，支持Q4冲刺"
      },
      {
        "nodeId": "mgmt_expense",
        "nodeName": "管理费用",
        "currentValue": 144,
        "recommendedValue": 136,
        "changePercent": -5.6,
        "changeReason": "数字化工具上线，流程优化见效"
      }
    ]
    ---

    错误示例（只返回1个adjustment - 这是不允许的！）：
    ---
    [
      {
        "nodeId": "revenue",
        "nodeName": "营业收入",
        ...
      }
    ]
    ---

【模型数据】
驱动因子(${modelStructure.drivers.length}个)：
${JSON.stringify(modelStructure.drivers, null, 2)}

计算指标(${modelStructure.computed.length}个)：
${JSON.stringify(modelStructure.computed.slice(0, 5), null, 2)}${modelStructure.computed.length > 5 ? '\n...(还有' + (modelStructure.computed.length - 5) + '个指标)' : ''}
${targetNodeId && nodes[targetNodeId] ? `
【目标指标公式】（重要！）
${nodes[targetNodeId].name} = ${nodes[targetNodeId].formula || "无公式"}
注意：公式中的系数（如税率、毛利率等）已经内置，计算时必须考虑！` : ""}

【公式计算链与逆向推导】（极其重要！）
${calculationChainPrompt || '无计算链，目标指标直接由驱动因子计算得出'}

三态数据（初始→当前）：
${JSON.stringify(valueComparison, null, 2)}

敏感性分析：
${JSON.stringify(sensitivity.slice(0, 5), null, 2)}

数据洞察：
${JSON.stringify(dataInsights, null, 2)}`;

  // 如果有一致性验证结果，添加警告
  let consistencyWarning = '';
  if (consistencyResult && !consistencyResult.isConsistent && consistencyResult.warnings.length > 0) {
    consistencyWarning = `


【⚠️ 一致性警告】
检测到以下不匹配情况，请谨慎处理：
${consistencyResult.warnings.map(w => '- ' + w.message).join('\n')}

建议：
1. 检查是否选择了正确的知识库
2. 确认指标模型是否符合当前业务场景
3. 如果确认无误，可忽略此警告继续执行

`;
    console.log('[buildSmartTuningPrompt] 检测到一致性警告:', consistencyResult.warnings.length);
  }

  // 如果有场景模板，将场景模板作为补充说明追加
  const systemPrompt = (consistencyWarning + knowledgeBasePrompt + scenarioPrompt)
    ? `${baseSystemPrompt}

【场景模板补充说明】
${scenarioPrompt}`
    : baseSystemPrompt;

  // 构建用户Prompt
  let userPrompt = '';

  if (businessContext?.rawText) {
    userPrompt += `【业务背景】\n${businessContext.rawText}\n\n`;
  }

  if (businessContext?.summary) {
    userPrompt += `【关键信息】\n${businessContext.summary}\n\n`;
  }

  // 场景判断：如果没有目标值，明确告诉 AI 这是约束驱动型
  if (!targetNode && businessContext?.rawText) {
    userPrompt += `【场景类型判断】
**约束驱动型**：用户未指定明确的目标值，只给出了调整约束。
**处理规则**：直接根据用户约束调整驱动因子，无需逆向推导，不要编造目标值！

`;
  }

  if (targetNode) {
    userPrompt += `【优化目标】\n目标指标：${targetNode.name}\n`;
    if (targetValue !== null && targetValue !== undefined) {
      userPrompt += `目标值：${targetValue}${targetNode.unit || ''}\n`;
      userPrompt += `当前值：${targetNode.value ?? 0}${targetNode.unit || ''}\n`;
      userPrompt += `差距：${targetValue - (targetNode.value ?? 0)}${targetNode.unit || ''}\n`;
      userPrompt += `**说明**：这是一个**目标优化型**场景，请使用逆向推导规则。\n`;
    } else {
      userPrompt += `**说明**：未指定具体目标值，这是一个**约束驱动型**场景，请直接根据约束条件调整。\n`;
    }
    userPrompt += '\n';
  }

  if (constraints && constraints.length > 0) {
    userPrompt += `【约束条件】\n`;
    constraints.forEach((c, i) => {
      userPrompt += `${i + 1}. ${c.raw || c}\n`;
    });
    userPrompt += '\n';
  }

  // 特殊约束（B+C+D 方案）
  if (specialConstraints && specialConstraints.length > 0) {
    userPrompt += `【用户指定的特殊约束】（必须严格遵守！）\n`;
    specialConstraints.forEach((c, i) => {
      // 使用语义化的约束描述
      const constraintDesc = formatConstraintDescription(c);
      userPrompt += `${i + 1}. ${c.factorName}: ${constraintDesc}\n`;
    });

    // 如果有计算指标约束，添加逆向推导说明
    const hasComputedConstraints = specialConstraints.some(c => c.isComputed);
    if (hasComputedConstraints) {
      userPrompt += `\n**重要**：
- 上述约束中涉及计算指标（如毛利率、净利率等），请根据【公式计算链】逆向推导驱动因子！
- 例如："毛利率增加 5 个百分点" →
  1. 先计算新毛利率 = 原毛利率 (50%) + 5% = 55%
  2. 根据公式"毛利率 = 毛利润/营业收入"推导
  3. 如果营业收入保持 1450 万，则毛利润 = 1450 × 55% = 797.5 万
  4. 营业成本 = 营业收入 - 毛利润 = 1450 - 797.5 = 652.5 万
  5. **不要直接把毛利润设为 100 万**！这是错误的！
- 这些约束优先于默认约束范围，AI 分析时必须首先满足！\n\n`;
    } else {
      userPrompt += `\n**重要**：上述特殊约束优先于默认约束范围（±5%/±10%/±30%/±50%），AI 分析时必须首先满足这些约束！\n\n`;
    }
  }

  // 方案 3：让 AI 也从业务背景中自动提取约束（双重保障）
  if (enableAIFallback) {
    userPrompt += `【AI 自动提取约束】（辅助功能）
除了上述用户明确指定的约束外，请你还必须：
1. 仔细阅读业务背景描述，识别其中隐含的约束条件
2. 注意以下关键词可能表示约束：
   - 范围类：控制在、不超过、不低于、至少、最多、在...之间、≥、≤、>、<
   - 趋势类：增长、降低、提升、减少、增加、压缩、削减
   - 允许类：允许、可以、可、能
   - 强制类：必须、需要、要、应、务必
3. 例如："毛利率增加 5%"可能是从 50%→55%（百分点），也可能是 50%→52.5%（增幅 5%）
   - 如果是百分点变化：新值 = 原值 + 5
   - 如果是百分比增幅：新值 = 原值 × (1 + 5%)
4. 对于"XX 万"、"XX 元"等绝对额约束，请直接使用数值
5. 将提取到的约束应用到调整方案中

`;
  } else {
    userPrompt += `【AI 自动提取约束】已禁用
用户未启用 AI 语义兜底功能，请仅根据上述用户明确指定的约束进行分析。

`;
  }

  // 调整模式约束（B+C+D 方案）
  const modeDescriptions = {
    auto: { desc: '自动模式（根据目标差距动态调整）', range: '动态' },
    conservative: { desc: '保守型', range: '±10%' },
    moderate: { desc: '稳健型', range: '±30%' },
    aggressive: { desc: '进取型', range: '±50%' },
    custom: { desc: '自定义', range: customRange ? `${customRange.min}% ~ ${customRange.max}%` : '±50%' }
  };
  const currentMode = modeDescriptions[adjustmentMode] || modeDescriptions.auto;

  userPrompt += `【调整幅度约束】
用户选择的调整模式：**${currentMode.desc}**
- 所有驱动因子的调整幅度应在 **${currentMode.range}** 范围内
- 这是用户对调整可行性的要求，请务必遵守
- 如果业务目标需要超出此范围的调整，请在 explanation 中说明理由

`;

  userPrompt += `请基于以上信息，生成完整的智能调参方案。

【输出数量要求】（必须遵守！）
- 必须返回 **至少 3-5 个驱动因子的调整方案**
- 如果返回的调整方案少于 2 个，系统会自动使用兜底策略（可能不遵守您的约束）
- 因此，请务必分析多个驱动因子，提供充足的调整建议

【计算规则】（根据场景类型选择适用规则！）

**场景判断**（首先判断用户输入属于哪种类型！）：
1. **目标优化型**：用户明确指定了目标值
   - 识别关键词："达到"、"目标"、"提升至"、"突破"、"不低于"
   - 例如："净利润达到 500 万"、"毛利率提升至 55%"、"收入突破 2000 万"
   - 特征：有明确的数字目标

2. **约束驱动型**：用户只指定了调整约束，没有目标值
   - 识别关键词："增加"、"减少"、"控制在"、"不超过"、"降低"
   - 例如："毛利率增加 5 个百分点"、"管理费用控制在 100 万以内"
   - 特征：只有调整方向/幅度，没有最终目标值

**目标优化型 - 逆向推导规则**（仅当识别到明确目标值时使用！）：
1. 从上述【优化目标】中获取用户目标值
2. 从【公式计算链】中查找目标指标的公式
3. 使用逆运算计算中间变量（例如：目标 = 中间值 × 系数 → 中间值 = 目标 / 系数）
4. 从中间变量推导驱动因子的调整值
5. 正向验证：计算结果是否等于用户目标？

**约束驱动型 - 直接调整规则**（当用户只给出约束时使用！）：
1. 直接从【用户指定的特殊约束】或【业务背景】中提取调整指令
2. **区分计算指标和驱动因子**：
   - 如果约束涉及计算指标（如毛利率、净利率、人均效能等）：
     * 步骤 1：先计算计算指标的新值（如：新毛利率 = 原毛利率 + 5%）
     * 步骤 2：根据公式逆向推导需要调整的驱动因子
     * 例如："毛利率增加 5 个百分点" → 新毛利率 = 50% + 5% = 55%
     * 公式：毛利率 = 毛利润 / 营业收入
     * 推导：要保持毛利率 55%，如果营业收入=1450 万，则毛利润=1450×0.55=797.5 万
     * 营业成本 = 营业收入 - 毛利润 = 1450 - 797.5 = 652.5 万
   - 如果约束涉及驱动因子（如管理费用、销售费用等）：
     * 直接应用约束到对应因子
     * 例如："管理费用控制在 100 万以内" → 管理费用 ≤ 100
3. 验证：调整后的值是否满足约束条件？

**重要提醒**：
- 如果【优化目标】为空或没有明确目标值，请使用**约束驱动型**规则！
- 不要编造目标值！如果用户没有说"净利润达到 X 万"，就不要假设！

【极其重要的多因子要求】
1. **不要只调整一个营业收入！** 业务目标需要多个因子协同调整
2. **必须同时调整**：营业收入、营业成本、销售费用、管理费用（如果模型中有这些因子）
3. **每个因子都是一个独立的 adjustment 对象**，adjustments数组应该包含多个对象
4. 如果 AI 只返回了 1 个 adjustment，这是错误的，请重新分析并返回至少 3-4 个

【多因子调整逻辑】
- 营业收入：基于业务目标调整（如增长15-20%）
- 营业成本：与收入联动，维持毛利率稳定
- 销售费用：如果提到推广/市场，必须增加
- 管理费用：如果提到优化/降本，应该降低

【强制要求 - 必须遵守】
1. **必须从业务背景中提取所有涉及的可调因子**
   - 仔细阅读业务描述，找出用户提到的每个需要调整的业务模块
   - 例如：提到"推广"→销售费用；提到"优化"→管理费用；提到"产量"→生产成本

2. **adjustments数组必须包含至少3-4个调整项**
   - 不要只返回营业收入/主要指标一个！
   - 业务目标通常需要多个因子协同配合

3. **如何从模型数据中选择要调整的因子**：
   - 查看【模型数据】中的驱动因子列表
   - 根据业务背景判断哪些因子与用户目标相关
   - 为每个相关因子生成一个adjustment对象

4. **【超级重要】多因子调整原则**：
   - 营业收入：必须调整（基于业务目标）
   - 营业成本：如果收入变化，成本必须联动调整（维持毛利率）
   - 销售费用：如果提到推广、市场、广告，必须调整
   - 管理费用：如果提到优化、降本、效率，必须调整
   - 财务费用：如果提到利率、融资，需要调整

5. **检查点**：返回前务必确认 adjustments.length >= 3，如果只生成了1-2个，请立即补充其他因子！

【检查清单 - 返回前确认】
- [ ] adjustments数组长度 >= 3？
- [ ] 是否包含营业收入？
- [ ] 是否包含相关的成本/费用因子？
- [ ] 每个adjustment都有完整的字段（nodeId, nodeName, currentValue, recommendedValue等）？
- [ ] monthlyFactors是12个数字的数组？

请确保返回的JSON中，adjustments数组包含多个调整项（至少3-4个）。`;

  userPrompt += `

分析要求：
1. 充分理解业务背景中的时间、目标、涉及的业务模块
2. 从背景中提取所有可调因子，为每个因子生成调整建议
3. 结合数据洞察分析（趋势、敏感性、风险）
4. 每个调整建议都有数据依据和业务理由
5. 提供乐观/基准/悲观三种情景的预期效果


【关键计算验证】（仅当用户明确指定目标值时才执行！）

**判断：用户是否指定了明确的目标值？**
- 检查【优化目标】部分是否有内容
- 检查业务背景中是否有"达到"、"提升至"、"突破"等关键词 + 数字

**如果用户指定了目标值**（目标优化型）

1. **公式系数识别**（极其重要！）
   - 如果目标指标公式中包含系数（如税率、毛利率等），计算时**必须使用这些系数**！
   - 例如：如果公式是"目标 = 中间值 × 系数"（税率 25%）
     - **正向计算**：营业利润 Y × 0.75 = 净利润 X ✓
     - **反向推导**：如果目标净利润 X，则 所需营业利润 = X ÷ 0.75 = Y

2. **计算验证**：根据调整方案计算预期结果
   - 如果公式是 A = B × C，则 B = A / C，C = A / B
   - 如果公式是 A = B × 系数，则 B = A / 系数
   - 例如：
     - 净利润 = 营业利润 × 0.75 → 营业利润 = 净利润 / 0.75
     - 毛利润 = 营业收入 × 毛利率 → 营业收入 = 毛利润 / 毛利率
   - 根据 adjustments 中的推荐值，使用正确的公式计算目标指标的预期值

3. **差距分析**：对比预期值与目标值
   - 如果预期值 >= 目标值：说明方案可以达成目标
   - 如果预期值 < 目标值：说明方案**无法达成目标**，必须在 explanation 中明确说明

4. **不达标处理**：如果无法达成目标，必须在 explanation 中说明：
   - 当前方案的预期结果是什么
   - 距离目标还差多少
   - 建议用户如何调整

**如果用户没有指定目标值**（约束驱动型）

1. **约束满足验证**（必须执行！）
   - 检查每个调整后的驱动因子是否满足用户指定的约束
   - 例如：用户说"管理费用控制在 100 万以内" → 调整后管理费用 ≤ 100
   - 例如：用户说"毛利率增加 5 个百分点" → 新毛利率 = 原毛利率 + 5%

2. **直接应用约束**：
   - "增加 X 个百分点" → 新值 = 原值 + X（用于比率类指标）
   - "增加 X%" → 新值 = 原值 × (1 + X%)（用于绝对值指标）
   - "控制在 X 以内" → 新值 ≤ X
   - "降低到 X" → 新值 = X

3. **在 explanation 中说明**：
   - 说明这是约束驱动型调整
   - 列出所有约束条件及其满足情况
   - 说明调整后的预期效果（如净利润变化）`;
  return {
    system: systemPrompt,
    user: userPrompt,
    modelStructure,
    valueComparison,
    sensitivity,
    dataInsights
  };
};

// ==================== 向后兼容 ====================

/**
 * 解析约束条件（兼容旧版本）
 */
const parseConstraint = (constraintText) => {
  const text = constraintText.toLowerCase().trim();

  const reachMatch = text.match(/(.+?)(必须|要|需|必须|务必)(?:达到|等于|为)(.+)/);
  if (reachMatch) {
    const nodeName = reachMatch[1].trim();
    const targetValue = parseFloat(reachMatch[3].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_reach', nodeName, targetValue, raw: constraintText };
    }
  }

  const exceedMatch = text.match(/(.+?)(必须|要|需|必须|务必)(?:超过|大于|不小于|至少|最低|最少)(.+)/);
  if (exceedMatch) {
    const nodeName = exceedMatch[1].trim();
    const targetValue = parseFloat(exceedMatch[3].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_exceed', nodeName, minValue: targetValue, raw: constraintText };
    }
  }

  const belowMatch = text.match(/(.+?)(?:不能超过|必须小于|不大于|最多|最高|不超过|不超过)(.+)/);
  if (belowMatch) {
    const nodeName = belowMatch[1].trim();
    const targetValue = parseFloat(belowMatch[2].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_not_exceed', nodeName, maxValue: targetValue, raw: constraintText };
    }
  }

  const changeMatch = text.match(/(.+?)(增加|减少|提高|降低|提升|下降)([\d.,]+)(万|千|亿|元|%|百分比)?/);
  if (changeMatch) {
    const nodeName = changeMatch[1].trim();
    const direction = changeMatch[2];
    const amount = parseFloat(changeMatch[3].replace(/,/g, ''));
    const unit = changeMatch[4] || '';
    const isPercent = unit.includes('%') || unit.includes('百分比');
    const multiplier = direction.includes('增') || direction.includes('提高') || direction.includes('提升') ? 1 : -1;

    if (!isNaN(amount)) {
      return {
        type: isPercent ? 'change_by_percent' : 'change_by_amount',
        nodeName,
        amount: amount * multiplier,
        unit,
        raw: constraintText
      };
    }
  }

  const rangeMatch = text.match(/(.+?)(?:在|范围|介于)([\d.,]+)(?:到|至|~|－|—|-)([\d.,]+)/);
  if (rangeMatch) {
    const nodeName = rangeMatch[1].trim();
    const minVal = parseFloat(rangeMatch[2].replace(/,/g, ''));
    const maxVal = parseFloat(rangeMatch[3].replace(/,/g, ''));
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      return { type: 'must_in_range', nodeName, minValue: minVal, maxValue: maxVal, raw: constraintText };
    }
  }

  return { type: 'text', raw: constraintText };
};

/**
 * 构建结构化约束描述（兼容旧版本）
 */
const buildStructuredConstraints = (constraints, nodes) => {
  const structured = constraints.map(c => typeof c === 'string' ? parseConstraint(c) : c);

  const enriched = structured.map(constraint => {
    if (constraint.type === 'text') return constraint;

    const matchedNode = Object.values(nodes).find(n =>
      n.name.toLowerCase().includes(constraint.nodeName?.toLowerCase() || '') ||
      (constraint.nodeName?.toLowerCase() || '').includes(n.name.toLowerCase())
    );

    if (matchedNode) {
      const currentVal = matchedNode.value ?? matchedNode.baseline ?? 0;
      return {
        ...constraint,
        nodeId: matchedNode.id,
        nodeName: matchedNode.name,
        currentValue: Math.round(currentVal * 100) / 100,
        unit: matchedNode.unit || ''
      };
    }

    return constraint;
  });

  return {
    raw: constraints,
    structured: enriched,
    summary: enriched.map(c => c.raw || c)
  };
};

/**
 * 传统模式系统指令（兼容旧版本）
 */
const MODE_INSTRUCTIONS = {
  initial: `请从零开始生成最优的驱动因子配置方案。

你的任务是：
1. 分析模型结构和各驱动因子的合理取值范围
2. 分析每个驱动因子从初始值到当前值的变化轨迹
3. 基于用户的目标和约束条件，计算最优的驱动因子配置
4. 对于有月度数据的驱动因子，建议调整权重分配
5. 确保所有建议值满足硬性约束
6. 解释为什么这样配置可以达到最优效果

【月度数据调整要求】
对于每个有月度数据的驱动因子，在monthlyAdjustment字段中提供分配策略和系数。`,

  partial: `用户已经调整了一部分驱动因子，对其中一些满意，对另一些不满意。

被锁定的驱动因子是用户满意的，请勿调整。
你的任务是：
1. 保持被锁定驱动因子的值不变
2. 分析未锁定驱动因子的调整空间
3. 只调整未被锁定的驱动因子来优化目标
4. 确保调整后的结果满足所有约束条件`,

  scan: `用户已完成人工调整，请全局扫描检查是否还有优化空间。

关键判断依据：
1. 目标差距分析：当前值 vs 目标值
2. 是否已达标：当前值是否已达到或超过目标值
3. 优化空间评估：各驱动因子还有多少调整空间

【重要警告】
- 禁止虚假最优：如果当前值明显低于目标值，绝对不能说"已达最优"
- 只有当前值 >= 目标值，且约束都满足时，才能说"已达最优"`
};

/**
 * 构建传统AI调参Prompt（兼容旧版本）
 * @param {Object} params - 参数对象
 * @returns {Object} {system, user}
 */
export const buildTuningPrompt = ({
  nodes,
  tuningMode = 'initial',
  userGoal = '',
  targetNodeId = null,
  targetValue = null,
  lockedNodes = [],
  constraints = [],
  knowledgeResults = [],
  selectedScenarios = []
}) => {
  const modelStructure = buildModelStructure(nodes);
  const valueComparison = buildValueComparison(nodes, targetNodeId, targetValue);
  const structuredConstraints = buildStructuredConstraints(constraints, nodes);

  const targetNode = targetNodeId ? nodes[targetNodeId] : null;

  const lockedNodesText = tuningMode === 'partial' && lockedNodes.length > 0
    ? `\n【已锁定的驱动因子】（请勿调整）：\n${JSON.stringify(
        lockedNodes.map((id) => {
          const node = nodes[id];
          return {
            id,
            name: node?.name || id,
            currentValue: valueComparison.drivers[id]?.currentValue ?? 0,
            locked: true
          };
        }),
        null,
        2
      )}`
    : '';

  let constraintsText = '';
  if (structuredConstraints.structured.length > 0) {
    constraintsText = `\n【约束条件】（必须满足）：\n`;
    constraintsText += structuredConstraints.summary.map((c, i) => `${i + 1}. ${c}`).join('\n');
  }

  const gapAnalysis = tuningMode === 'scan' && valueComparison.target
    ? `\n【目标差距分析】\n${JSON.stringify(valueComparison.target, null, 2)}`
    : '';

  const systemPrompt = `你是一位专业的财务分析和优化专家，擅长价值驱动树(VDT)模型的驱动因子配置优化。

${MODE_INSTRUCTIONS[tuningMode] || MODE_INSTRUCTIONS.initial}

【模型结构】
包含 ${modelStructure.drivers.length} 个驱动因子（可调整）和 ${modelStructure.computed.length} 个计算指标（公式计算）。

驱动因子：
${JSON.stringify(modelStructure.drivers, null, 2)}

计算指标：
${JSON.stringify(modelStructure.computed.slice(0, 10), null, 2)}${modelStructure.computed.length > 10 ? '\n...（还有' + (modelStructure.computed.length - 10) + '个指标）' : ''}

【三态数据对比】初始值 → 当前值 → 目标值
${JSON.stringify(valueComparison, null, 2)}
${gapAnalysis}${lockedNodesText}${constraintsText}

请严格按以下JSON格式返回结果（不要包含任何其他文字，只返回JSON）：
{
  "recommendations": [
    {
      "nodeId": "驱动因子ID",
      "nodeName": "驱动因子名称",
      "currentValue": 100,
      "recommendedValue": 120,
      "changePercent": 20,
      "reason": "调整理由",
      "status": "adjusted",
      "monthlyAdjustment": {
        "strategy": "分配策略",
        "factors": [1.0, 1.0, ...],
        "notes": "说明"
      }
    }
  ],
  "expectedResult": {
    "targetNodeId": "目标指标ID",
    "targetNodeName": "目标指标名称",
    "currentValue": 500,
    "predictedValue": 600,
    "improvementPercent": 20,
    "gapClosed": 80
  },
  "constraintStatus": {
    "allSatisfied": true,
    "violations": [],
    "notes": "约束满足情况说明"
  },
  "confidence": 0.85,
  "isOptimal": false,
  "optimizationSpace": "充足|有限|不足|无",
  "explanation": "整体优化方案的详细说明",
  "suggestions": ["建议1", "建议2"]
}

重要规则：
1. 只返回纯JSON，不要包含markdown代码块标记
2. 约束是硬性要求，必须优先满足
3. 【扫描模式】如果当前值 < 目标值，isOptimal必须为false`;

  return {
    system: systemPrompt,
    user: userGoal || '请优化当前模型配置'
  };
};

// ==================== 响应解析 ====================

/**
 * 清理和修复AI返回的JSON字符串
 * @param {string} jsonStr - JSON字符串
 * @returns {string} 修复后的字符串
 */
const cleanJsonString = (jsonStr) => {
  let cleaned = jsonStr;

  // 1. 移除可能的 BOM
  cleaned = cleaned.replace(/^\uFEFF/, '');

  // 2. 移除首尾空白
  cleaned = cleaned.trim();

  // 3. 移除可能的 markdown 代码块标记
  const backtick = String.fromCharCode(96); // `
  cleaned = cleaned.replace(new RegExp('^' + backtick + backtick + backtick + '(?:json)?\\s*'), '');
  cleaned = cleaned.replace(new RegExp(backtick + backtick + backtick + '\\s*$'), '');

  // 4. 修复常见的JSON语法错误
  // 4.1 修复尾随逗号（数组和对象）
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 4.2 修复单引号（应该是双引号）
  // 但要注意不要在字符串内部替换
  cleaned = cleaned.replace(/(['"])([^'"]*?)\1/g, (match, quote, content) => {
    if (quote === "'") {
      return `"${content.replace(/"/g, '\\"')}"`;
    }
    return match;
  });

  // 4.3 修复未加引号的键名（简单情况）
  cleaned = cleaned.replace(/(\{|,\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // 4.4 移除注释
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 4.5 修复缺失的逗号（在某些情况下）
  // 但这比较危险，暂时不做

  return cleaned;
};

/**
 * 尝试使用多种方法解析JSON
 * @param {string} response - AI返回的文本
 * @returns {Object|null} 解析结果
 */
const tryParseJson = (response) => {
  // 调试：打印原始响应的前500字符
  console.log('tryParseJson: 原始响应前500字符:', response.substring(0, 500));

  // 方法1: 直接解析
  try {
    const result = JSON.parse(response);
    console.log('tryParseJson: 方法1成功');
    return result;
  } catch {}

  // 方法2: 从markdown代码块提取
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1].trim());
      console.log('tryParseJson: 方法2成功（从markdown提取）');
      return result;
    }
  } catch {}

  // 方法3: 找到第一个 { 和最后一个 } 之间的内容
  try {
    const startIdx = response.indexOf('{');
    const endIdx = response.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = response.substring(startIdx, endIdx + 1);
      const result = JSON.parse(jsonStr);
      console.log('tryParseJson: 方法3成功（提取大括号内容）');
      return result;
    }
  } catch {}

  // 方法4: 清理后解析
  try {
    const cleaned = cleanJsonString(response);
    const result = JSON.parse(cleaned);
    console.log('tryParseJson: 方法4成功（清理后解析）');
    return result;
  } catch {}

  // 方法 5: 提取最大的 JSON 对象（顶层对象）
  try {
    // 找到第一个 { 和最后一个 } 之间的内容（这应该是最大的 JSON 对象）
    const startIdx = response.indexOf('{');
    const endIdx = response.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = response.substring(startIdx, endIdx + 1);
      const cleaned = cleanJsonString(jsonStr);
      const parsed = JSON.parse(cleaned);
      
      // 检查是否包含 understanding 和 adjustments
      if (parsed && (parsed.understanding || parsed.adjustments || parsed.recommendations)) {
        console.log('tryParseJson: 方法 5 成功（提取最大 JSON 对象）');
        console.log('方法 5 解析对象字段:', Object.keys(parsed).join(', '));
        return parsed;
      }
    }
  } catch (e) {
    console.log('方法 5 失败:', e.message);
  }

  // 方法6: 尝试修复常见AI返回的JSON错误

  // 方法 5.5: 尝试修复截断的 JSON（AI 响应长度限制）
  try {
    // 如果响应看起来像被截断的 JSON（有 understanding 但没有结尾）
    if (response.includes('"understanding"') && !response.trim().endsWith('}')) {
      console.log('tryParseJson: 检测到 JSON 可能被截断，尝试修复...');

      const truncated = response.trim();

      // 策略1：尝试简单的闭合
      const simpleFixes = [
        truncated + '}]\\n}\\n}\\n}\\n}',
        truncated + '}]\\n}\\n}',
        truncated + ']}\\n}',
        truncated + '}]}',
        truncated + '}}',
      ];

      for (const fix of simpleFixes) {
        try {
          const cleaned = cleanJsonString(fix);
          const parsed = JSON.parse(cleaned);
          if (parsed && (parsed.understanding || parsed.adjustments)) {
            console.log('tryParseJson: 方法 5.5 成功（简单闭合修复）');
            return parsed;
          }
        } catch {}
      }

      // 策略2：从后往前找最后一个完整的键值对，然后闭合
      console.log('tryParseJson: 简单闭合失败，尝试截断修复...');

      // 找到最后一个完整的"key": 结构
      const lastKeyMatch = [...truncated.matchAll(/"([a-zA-Z]+)":\s*/g)].pop();
      if (lastKeyMatch) {
        const cutPosition = lastKeyMatch.index;
        // 截断到最后一个完整键之前
        const partialJson = truncated.substring(0, cutPosition);

        // 尝试闭合
        const partialFixes = [
          partialJson + ']',
          partialJson + '}]',
          partialJson + '}}',
          partialJson + '}]\\n}\\n}',
        ];

        for (const fix of partialFixes) {
          try {
            const cleaned = cleanJsonString(fix);
            const parsed = JSON.parse(cleaned);
            if (parsed && (parsed.understanding || parsed.adjustments)) {
              console.log('tryParseJson: 方法 5.5 成功（截断修复）');
              // 添加警告说明数据可能不完整
              parsed._truncated = true;
              return parsed;
            }
          } catch {}
        }
      }

      // 策略 3：提取所有能解析的顶层字段
      console.log('tryParseJson: 截断修复失败，尝试提取部分数据...');
      const partialResult = {};

      // 使用正则表达式直接提取 understanding 对象
      // 匹配 "understanding": { ... } 直到下一个顶层字段
      const understandingRegex = /"understanding"\s*:\s*(\{(?:[^{}]+|\{(?:[^{}]+|\{[^{}]*\})*\})*\})/;
      const understandingMatch = truncated.match(understandingRegex);
      if (understandingMatch && understandingMatch[1]) {
        try {
          partialResult.understanding = JSON.parse(understandingMatch[1]);
          console.log('成功提取 understanding:', Object.keys(partialResult.understanding));
        } catch (e) {
          console.log('提取 understanding 失败:', e.message);
          // 尝试更简单的方式：找到最后一个完整的键值对
          const simpleUnderstanding = truncated.substring(
            truncated.indexOf('"understanding"'),
            truncated.indexOf('"dataAnalysis"') > 0 ? truncated.indexOf('"dataAnalysis"') : truncated.length
          ).trim();
          // 移除末尾的逗号
          const cleaned = simpleUnderstanding.replace(/,\s*$/, '');
          try {
            partialResult.understanding = JSON.parse('{' + cleaned + '}').understanding;
            console.log('成功提取 understanding (简化方式)');
          } catch {}
        }
      }

      // 新增策略 4：提取 expectedImpact 和 sensitivityScenario
      console.log('tryParseJson: 尝试提取 expectedImpact 和 sensitivityScenario...');

      // 提取 expectedImpact.keyMetrics
      const keyMetricsRegex = /"expectedImpact"\s*:\s*\{[^}]*"keyMetrics"\s*:\s*(\[[\s\S]*?\])/;
      const keyMetricsMatch = truncated.match(keyMetricsRegex);
      if (keyMetricsMatch && keyMetricsMatch[1]) {
        try {
          const cleanedKeyMetrics = keyMetricsMatch[1].replace(/\n/g, '').replace(/\s+/g, ' ');
          partialResult.expectedImpact = partialResult.expectedImpact || {};
          partialResult.expectedImpact.keyMetrics = JSON.parse(cleanedKeyMetrics);
          console.log('成功提取 expectedImpact.keyMetrics:', partialResult.expectedImpact.keyMetrics?.length, '个');
        } catch (e) {
          console.log('提取 keyMetrics 失败:', e.message);
        }
      }

      // 提取 expectedImpact.sensitivityScenario
      const sensitivityScenarioRegex = /"sensitivityScenario"\s*:\s*(\[[\s\S]*?\])/;
      const sensitivityScenarioMatch = truncated.match(sensitivityScenarioRegex);
      if (sensitivityScenarioMatch && sensitivityScenarioMatch[1]) {
        try {
          const cleanedScenario = sensitivityScenarioMatch[1].replace(/\n/g, '').replace(/\s+/g, ' ');
          if (!partialResult.expectedImpact) partialResult.expectedImpact = {};
          partialResult.expectedImpact.sensitivityScenario = JSON.parse(cleanedScenario);
          console.log('成功提取 sensitivityScenario:', partialResult.expectedImpact.sensitivityScenario?.length, '个');
        } catch (e) {
          console.log('提取 sensitivityScenario 失败:', e.message);
          // 尝试更简单的方式：找到数组开始和最近的有效结束
          const scenarioStart = truncated.indexOf('"sensitivityScenario"');
          if (scenarioStart !== -1) {
            const arrayStart = truncated.indexOf('[', scenarioStart);
            if (arrayStart !== -1) {
              // 尝试找到最近的有效结束位置
              const possibleEnds = ['}]', ']', '}'];
              for (const end of possibleEnds) {
                const endIndex = truncated.indexOf(end, arrayStart);
                if (endIndex !== -1) {
                  try {
                    const scenarioStr = truncated.substring(arrayStart, endIndex + (end === '}]' ? 2 : 1));
                    const cleaned = scenarioStr.replace(/\n/g, ' ').replace(/\s+/g, ' ');
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      partialResult.expectedImpact = partialResult.expectedImpact || {};
                      partialResult.expectedImpact.sensitivityScenario = parsed;
                      console.log('成功提取 sensitivityScenario (简化方式):', parsed.length, '个');
                      break;
                    }
                  } catch {}
                }
              }
            }
          }
        }
      }

      // 提取 expectedImpact.summary
      const summaryRegex = /"summary"\s*:\s*"([^"]+)"/;
      const summaryMatch = truncated.match(summaryRegex);
      if (summaryMatch && summaryMatch[1]) {
        if (!partialResult.expectedImpact) partialResult.expectedImpact = {};
        partialResult.expectedImpact.summary = summaryMatch[1];
        console.log('成功提取 summary:', partialResult.expectedImpact.summary);
      }

      // 提取 explanation
      const explanationRegex = /"explanation"\s*:\s*"([\s\S]*?)"/;
      const explanationMatch = truncated.match(explanationRegex);
      if (explanationMatch && explanationMatch[1]) {
        partialResult.explanation = explanationMatch[1];
        console.log('成功提取 explanation');
      }

      // 提取 adjustmentDetails
      const adjustmentDetailsRegex = /"adjustmentDetails"\s*:\s*(\[[\s\S]*?\])/;
      const adjustmentDetailsMatch = truncated.match(adjustmentDetailsRegex);
      if (adjustmentDetailsMatch && adjustmentDetailsMatch[1]) {
        try {
          const cleanedDetails = adjustmentDetailsMatch[1].replace(/\n/g, '').replace(/\s+/g, ' ');
          partialResult.adjustmentDetails = JSON.parse(cleanedDetails);
          console.log('成功提取 adjustmentDetails:', partialResult.adjustmentDetails?.length, '个');
        } catch (e) {
          console.log('提取 adjustmentDetails 失败:', e.message);
        }
      }

      // 提取 dataAnalysis
      const dataAnalysisRegex = /"dataAnalysis"\s*:\s*(\{[\s\S]*?\})/;
      const dataAnalysisMatch = truncated.match(dataAnalysisRegex);
      if (dataAnalysisMatch && dataAnalysisMatch[1]) {
        try {
          const cleanedDataAnalysis = dataAnalysisMatch[1].replace(/\n/g, '').replace(/\s+/g, ' ');
          partialResult.dataAnalysis = JSON.parse(cleanedDataAnalysis);
          console.log('成功提取 dataAnalysis');
        } catch (e) {
          console.log('提取 dataAnalysis 失败:', e.message);
        }
      }

      // 尝试提取 adjustments 数组
      const adjustmentsRegex = /"adjustments"\s*:\s*(\[(?:[^\[\]]+|\[(?:[^\[\]]+|\[[^\[\]]*\])*\])*\])/;
      const adjustmentsMatch = truncated.match(adjustmentsRegex);
      if (adjustmentsMatch && adjustmentsMatch[1]) {
        try {
          const adjustments = JSON.parse(adjustmentsMatch[1]);
          if (Array.isArray(adjustments) && adjustments.length > 0) {
            partialResult.adjustments = adjustments;
            partialResult.recommendations = adjustments;
            console.log('成功提取 adjustments:', adjustments.length, '个');
          }
        } catch (e) {
          console.log('提取 adjustments 失败:', e.message);
          // 尝试手动解析：找到每个完整的 adjustment 对象
          const adjRegex = /(\{"nodeId"[^}]*\}(?=\s*,\s*{"nodeId"}|\s*\]))/g;
          const adjMatches = [...truncated.matchAll(adjRegex)];
          const parsedAdjs = [];
          for (const m of adjMatches) {
            try {
              parsedAdjs.push(JSON.parse(m[1]));
            } catch {}
          }
          if (parsedAdjs.length > 0) {
            partialResult.adjustments = parsedAdjs;
            partialResult.recommendations = parsedAdjs;
            console.log('成功提取 adjustments (手动解析):', parsedAdjs.length, '个');
          }
        }
      }

      // 如果至少提取到一个字段，返回部分结果
      if (Object.keys(partialResult).length > 0) {
        console.log('tryParseJson: 方法 5.5 成功（提取部分数据）');
        partialResult._truncated = true;
        partialResult._warning = 'AI 响应被截断，部分数据可能丢失';
        return partialResult;
      }
    }
  } catch (e) {
    console.log('方法 5.5 失败:', e.message);
  }

  try {
    // 有时AI返回的是JavaScript对象字面量而非JSON
    // 尝试将单引号替换为双引号
    let fixed = response
      .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')  // 键的单引号
      .replace(/:\s*'([^']*)'/g, ': "$1"')  // 值的单引号
      .replace(/,\s*([}\]])/g, '$1');  // 尾随逗号

    const startIdx = fixed.indexOf('{');
    const endIdx = fixed.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      const jsonStr = fixed.substring(startIdx, endIdx + 1);
      const result = JSON.parse(jsonStr);
      console.log('tryParseJson: 方法6成功（修复JS对象字面量）');
      return result;
    }
  } catch {}

  console.log('tryParseJson: 所有方法都失败');
  return null;
};

/**
 * 解析AI响应
 * @param {string} response - AI返回的文本
 * @param {Object} options - 可选参数
 * @param {string} options.originalContext - 用户原始输入的业务背景
 * @returns {Object} 解析后的结果
 */
export const parseAIResponse = (response, options = {}) => {
  if (!response || typeof response !== 'string') {
    return { success: false, error: 'AI响应为空或格式错误' };
  }

  try {
    const parsed = tryParseJson(response);

    if (!parsed) {
      console.error('无法解析AI响应:', response.substring(0, 500));
      return { success: false, error: '无法解析AI响应，返回格式不符合JSON规范' };
    }

    // 调试：打印解析后的数据结构
    console.log('AI响应解析成功，字段:', Object.keys(parsed));
    console.log('AI响应类型:', Array.isArray(parsed) ? '数组' : typeof parsed);

    // **关键修复1**：如果 AI 返回的是数组，将其包装为标准格式
    if (Array.isArray(parsed)) {
      console.log('AI响应是数组，包含', parsed.length, '个元素');
      // 检查是否是 adjustments 数组
      if (parsed.length > 0 && parsed[0].nodeId && parsed[0].recommendedValue !== undefined) {
        return {
          success: true,
          data: {
            adjustments: parsed,
            recommendations: parsed,
            understanding: { businessContext: '从数组提取的调整建议' },
            explanation: 'AI返回了数组格式的调整建议'
          }
        };
      }
    }

    // **关键修复2**：如果 AI 返回的是单个调整对象（而非包含adjustments的对象）
    if (parsed.nodeId && parsed.recommendedValue !== undefined && !Array.isArray(parsed)) {
      // 检查是否有空的 adjustments 数组或根本没有 adjustments
      const hasValidAdjustments = parsed.adjustments && Array.isArray(parsed.adjustments) && parsed.adjustments.length > 0;

      if (!hasValidAdjustments) {
        console.log('AI响应是单个调整对象，包装为数组');
        const adjustmentItem = {
          nodeId: parsed.nodeId,
          nodeName: parsed.nodeName,
          currentValue: parsed.currentValue,
          recommendedValue: parsed.recommendedValue,
          changePercent: parsed.changePercent,
          changeReason: parsed.changeReason,
          dataBasis: parsed.dataBasis,
          businessReason: parsed.businessReason,
          riskWarning: parsed.riskWarning,
          monthlyStrategy: parsed.monthlyStrategy,
          monthlyFactors: parsed.monthlyFactors,
          confidence: parsed.confidence
        };

        // 包装为标准格式，但不要直接返回，继续执行后续逻辑
        parsed.adjustments = [adjustmentItem];
        parsed.recommendations = [adjustmentItem];
        console.log('已将单个调整对象包装为数组，继续执行智能推导');
      }
    }

    console.log('AI响应adjustments:', parsed.adjustments);
    console.log('AI响应recommendations:', parsed.recommendations);

    // 验证必要字段（只在完全没有 adjustments 且没有 expectedImpact 时才警告）
    if ((!parsed.recommendations && !parsed.adjustments) && !parsed.expectedImpact) {
      console.log('AI 响应缺少 recommendations/adjustments 字段，但可能有 expectedImpact（第二次请求）');
    }
    // 验证必要字段（只在完全没有 adjustments 且没有 expectedImpact 时才警告）
    if ((!parsed.recommendations && !parsed.adjustments) && !parsed.expectedImpact) {
      console.log('AI 响应缺少 recommendations/adjustments 字段，但可能有 expectedImpact（第二次请求）');
    }
    // 验证必要字段（只在完全没有 adjustments 且没有 expectedImpact 时才警告）
    if ((!parsed.recommendations && !parsed.adjustments) && !parsed.expectedImpact) {
      console.log('AI 响应缺少 recommendations/adjustments 字段，但可能有 expectedImpact（第二次请求）');
    }

    // 统一字段名（新旧版本兼容）
    if (parsed.adjustments && !parsed.recommendations) {
      parsed.recommendations = parsed.adjustments;
    }
    if (parsed.recommendations && !parsed.adjustments) {
      parsed.adjustments = parsed.recommendations;
    }

    // 确保有adjustments/recommendations字段
    if (!parsed.recommendations && !parsed.adjustments) {
      parsed.recommendations = [];
      parsed.adjustments = [];
    }

    // 如果adjustments/recommendations为空数组，记录警告
    if (parsed.adjustments?.length === 0) {
      console.warn('AI响应中adjustments为空数组，可能需要检查AI模型输出');
    }

    // **后备机制**：如果AI只返回1个adjustment，尝试智能推导其他因子
    if (parsed.adjustments?.length === 1 && parsed.dataAnalysis?.trends?.length > 1) {
      console.log('AI只返回了1个adjustment，但分析了', parsed.dataAnalysis.trends.length, '个因子');
      console.log('使用原始业务背景:', options.originalContext?.substring(0, 100));

      const existingAdjustment = parsed.adjustments[0];
      const analyzedFactors = parsed.dataAnalysis.trends.map(t => t.factor);
      const existingFactorName = existingAdjustment.nodeName;

      console.log('AI分析的因子:', analyzedFactors);
      console.log('已存在的调整:', existingFactorName);

      // 为每个分析过但未生成调整的因子创建调整
      const additionalAdjustments = [];

      analyzedFactors.forEach(factorName => {
        // 跳过已存在的因子
        if (factorName === existingFactorName ||
            (existingFactorName.includes(factorName)) ||
            (factorName.includes(existingFactorName))) {
          return;
        }

        // 根据因子名称创建对应的调整
        const trend = parsed.dataAnalysis.trends.find(t => t.factor === factorName);
        // 使用兜底策略引擎生成调整建议
        const fallbackResult = generateFallbackStrategy({
          nodes: options.nodes || {},
          sensitivityData: (parsed.dataAnalysis?.sensitivity || []).map(s => ({
            factorId: s.factorId || s.factor,
            factorName: s.factor,
            sensitivity: s.sensitivity || s.impact || 0.5,
            correlation: s.correlation || 'positive',
            elasticity: s.elasticity || 0.5
          })),
          stdDevData: []
        });
        const newAdjustments = fallbackResult?.allAdjustments || [];
        const newAdjustment = newAdjustments.find(a => a.nodeName === factorName) || null;

        if (newAdjustment) {
          additionalAdjustments.push(newAdjustment);
          console.log('智能推导：为', factorName, '创建调整', newAdjustment);
        }
      });

      if (additionalAdjustments.length > 0) {
        parsed.adjustments = [...parsed.adjustments, ...additionalAdjustments];
        parsed.recommendations = parsed.adjustments;
        console.log('智能推导完成，新增', additionalAdjustments.length, '个adjustments');
      } else {
        console.log('智能推导未找到需要补充的adjustments');
      }
    }


    // 扫描模式判断
    if (parsed.isOptimal && parsed.expectedResult?.gapClosed !== undefined) {
      if (parsed.expectedResult.gapClosed < 100) {
        parsed.isOptimal = false;
        parsed.optimizationSpace = parsed.optimizationSpace || '仍有空间';
      }
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error('解析AI响应失败:', error, '\n原始响应:', response.substring(0, 500));
    return { success: false, error: `解析失败: ${error.message}` };
  }
};

/**
 * 验证AI建议是否满足约束
 * @param {Array} recommendations - AI建议
 * @param {Object} nodes - 所有节点
 * @param {Array} constraints - 约束条件
 * @returns {Object} 验证结果
 */
export const validateRecommendations = (recommendations, nodes, constraints) => {
  const violations = [];

  recommendations.forEach((rec) => {
    if (rec.status !== 'adjusted') return;

    const node = nodes[rec.nodeId];
    if (!node) return;

    if (node.min !== undefined && node.min !== null && rec.recommendedValue < node.min) {
      violations.push({
        nodeId: rec.nodeId,
        nodeName: rec.nodeName,
        type: 'below_min',
        recommended: rec.recommendedValue,
        limit: node.min
      });
    }
    if (node.max !== undefined && node.max !== null && rec.recommendedValue > node.max) {
      violations.push({
        nodeId: rec.nodeId,
        nodeName: rec.nodeName,
        type: 'above_max',
        recommended: rec.recommendedValue,
        limit: node.max
      });
    }
  });

  return {
    valid: violations.length === 0,
    violations
  };
};

// 默认导出
export default {
  buildSmartTuningPrompt,
  buildTuningPrompt,
  buildModelStructure,
  buildValueComparison,
  parseAIResponse,
  validateRecommendations
};

/**
 * 为指定因子创建调整建议
 * @param {string} factorName - 因子名称
 * @param {Object} trend - 趋势数据
 * @param {Object} referenceAdjustment - 参考调整（用于计算联动）
 * @param {string} businessContext - 业务背景
 * @param {Object} dataAnalysis - 数据分析结果，包含nodes用于获取真实值
 * @returns {Object} 调整建议
 */


// ==================== 智能推导机制 ====================

/**
 * 从业务背景中提取关键词并匹配驱动因子
 * @param {string} businessContext - 业务背景描述
 * @returns {Array} 匹配到的因子类型列表
 */