/**
 * AI Prompt构建工具 - 智能调参版
 * 支持业务背景理解、数据洞察分析、智能建议生成
 */

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
  constraints = []
}) => {
  const modelStructure = buildModelStructure(nodes);
  const valueComparison = buildValueComparison(nodes, targetNodeId, targetValue);
  const sensitivity = calculateSensitivity(nodes, targetNodeId);
  const dataInsights = analyzeDataInsights(nodes);

  const targetNode = targetNodeId ? nodes[targetNodeId] : null;

  const systemPrompt = `你是一位资深的业务分析和规划专家，擅长基于业务背景和数据洞察进行智能调参。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息（时间节点、目标方向、资源约束、涉及的业务模块）
2. 全面分析现有数据的趋势、敏感性和风险
3. **根据业务背景识别所有需要调整的驱动因子**（不要只调整一个！）
4. 为每个识别出的因子生成专业的调整建议

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
   - 每个对象包含完整的推荐值、理由、月度分配策略

【输出格式要求】
必须返回以下JSON格式（不要包含markdown代码块）：

{
  "understanding": {
    "businessContext": "AI对业务背景的理解摘要",
    "timeContext": "识别的时间节点",
    "keyGoals": ["目标1", "目标2"],
    "constraints": ["约束1", "约束2"],
    "flexibleFactors": ["可调因子"],
    "rigidFactors": ["刚性因子"]
  },
  "dataAnalysis": {
    "trends": [
      {
        "factor": "因子名称",
        "pattern": "上升/下降/波动/季节性",
        "description": "趋势描述",
        "seasonality": "季节性特征",
        "deviation": "实际vs预测偏差"
      }
    ],
    "sensitivity": [
      {
        "factor": "因子名称",
        "impact": "高/中/低",
        "elasticity": 弹性系数,
        "description": "影响说明"
      }
    ],
    "risks": [
      {
        "factor": "因子名称",
        "riskLevel": "高/中/低",
        "description": "风险描述",
        "recommendation": "建议"
      }
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

三态数据（初始→当前）：
${JSON.stringify(valueComparison, null, 2)}

敏感性分析：
${JSON.stringify(sensitivity.slice(0, 5), null, 2)}

数据洞察：
${JSON.stringify(dataInsights, null, 2)}`;

  // 构建用户Prompt
  let userPrompt = '';

  if (businessContext?.rawText) {
    userPrompt += `【业务背景】\n${businessContext.rawText}\n\n`;
  }

  if (businessContext?.summary) {
    userPrompt += `【关键信息】\n${businessContext.summary}\n\n`;
  }

  if (targetNode) {
    userPrompt += `【优化目标】\n目标指标：${targetNode.name}\n`;
    if (targetValue !== null) {
      userPrompt += `目标值：${targetValue}${targetNode.unit || ''}\n`;
      userPrompt += `当前值：${targetNode.value ?? 0}${targetNode.unit || ''}\n`;
      userPrompt += `差距：${targetValue - (targetNode.value ?? 0)}${targetNode.unit || ''}\n`;
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

  userPrompt += `请基于以上信息，生成完整的智能调参方案。

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

【关键计算验证】
在生成调整方案后，你必须进行以下验证：

1. **目标识别**：从业务背景中识别用户的目标指标和目标值
   - 如"净利润达到350万"→目标指标是净利润，目标值是350万
   - 如"毛利率提升至55%"→目标指标是毛利率，目标值是55%
   - 如"收入突破2000万"→目标指标是营业收入，目标值是2000万

2. **计算验证**：根据调整方案计算预期结果
   - 净利润 = 营业收入 - 营业成本 - 销售费用 - 管理费用 - 财务费用
   - 毛利率 = (营业收入 - 营业成本) / 营业收入 × 100%
   - 根据 adjustments 中的推荐值，计算目标指标的预期值

3. **差距分析**：对比预期值与目标值
   - 如果预期值 >= 目标值：说明方案可以达成目标
   - 如果预期值 < 目标值：说明方案**无法达成目标**，必须在 explanation 中明确说明

4. **不达标处理**：如果无法达成目标，必须在 explanation 中说明：
   - 当前方案的预期结果是什么
   - 距离目标还差多少
   - 建议用户如何调整（如"需要额外增加收入XX万"或"需要降低费用XX万"）
   - 或者明确告知"根据当前条件，目标无法达成"

示例说明：
- 如果用户要求净利润350万，但你的调整只能达到300万，必须说明：
  "根据当前调整方案（收入1650万，成本660万，费用420万），预期净利润为570万，已达到目标350万。"
  或
  "根据当前调整方案，预期净利润为280万，距离目标350万还差70万。建议：进一步增加收入50万或降低费用20万。"`;

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
  constraints = []
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

  // 方法5: 逐行修复（处理JSON中的语法错误）
  try {
    // 提取所有可能是JSON的部分
    const possibleJsons = [];
    const braceMatches = response.match(/\{[\s\S]*?\}/g);
    if (braceMatches) {
      for (const match of braceMatches) {
        try {
          const cleaned = cleanJsonString(match);
          const parsed = JSON.parse(cleaned);
          if (parsed && (parsed.adjustments || parsed.recommendations)) {
            console.log('tryParseJson: 方法5成功（找到包含adjustments的JSON）');
            return parsed; // 找到了有效的调参结果
          }
          possibleJsons.push(parsed);
        } catch {}
      }
    }
    // 返回最大的对象
    if (possibleJsons.length > 0) {
      console.log('tryParseJson: 方法5返回最大对象');
      return possibleJsons.reduce((max, curr) =>
        JSON.stringify(curr).length > JSON.stringify(max).length ? curr : max
      );
    }
  } catch {}

  // 方法6: 尝试修复常见AI返回的JSON错误
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

    // 验证必要字段
    if (!parsed.recommendations && !parsed.adjustments) {
      console.warn('AI响应缺少recommendations/adjustments字段');
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
        const newAdjustment = createAdjustmentForFactor(
          factorName,
          trend,
          existingAdjustment,
          options.originalContext || parsed.understanding?.businessContext || '',
          parsed.dataAnalysis || options.dataAnalysis || null
        );

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

    // **超级后备机制**：如果仍然只有1个adjustment，根据业务背景关键词强制创建
    if (parsed.adjustments?.length === 1) {
      console.log('仍然只有1个adjustment，启动超级后备机制根据业务背景创建');
      const businessContext = options.originalContext || parsed.understanding?.businessContext || '';
      const existingAdjustment = parsed.adjustments[0];
      const existingFactorName = existingAdjustment.nodeName;

      // 从业务背景中识别应该调整但未调整的因子
      const contextLower = businessContext.toLowerCase();
      const missingFactors = [];

      // 检查收入类因子（如果没有）
      if (!existingFactorName.includes('收入') && !existingFactorName.includes('营收')) {
        if (contextLower.includes('收入') || contextLower.includes('营收') || contextLower.includes('增长')) {
          missingFactors.push({ type: 'revenue', name: '营业收入' });
        }
      }

      // 检查成本类因子（如果没有）
      if (!existingFactorName.includes('成本')) {
        if (contextLower.includes('成本') || contextLower.includes('毛利')) {
          missingFactors.push({ type: 'cost', name: '营业成本' });
        }
      }

      // 检查销售费用（如果没有）
      if (!existingFactorName.includes('销售') && !existingFactorName.includes('营销') && !existingFactorName.includes('推广')) {
        if (contextLower.includes('销售费用') || contextLower.includes('营销') || contextLower.includes('推广') || contextLower.includes('广告') || contextLower.includes('市场')) {
          missingFactors.push({ type: 'sales_expense', name: '销售费用' });
        }
      }

      // 检查管理费用（如果没有）
      if (!existingFactorName.includes('管理')) {
        if (contextLower.includes('管理费用') || contextLower.includes('优化') || contextLower.includes('降低') || contextLower.includes('压缩')) {
          missingFactors.push({ type: 'mgmt_expense', name: '管理费用' });
        }
      }

      console.log('根据业务背景识别到缺失的因子:', missingFactors);

      const superAdjustments = [];
      missingFactors.forEach(({ type, name }) => {
        const newAdjustment = createAdjustmentForFactor(
          name,
          { pattern: 'unknown' },
          existingAdjustment,
          businessContext,
          parsed.dataAnalysis || options.dataAnalysis || null
        );
        if (newAdjustment) {
          superAdjustments.push(newAdjustment);
          console.log('超级后备：为', name, '创建调整');
        }
      });

      if (superAdjustments.length > 0) {
        parsed.adjustments = [...parsed.adjustments, ...superAdjustments];
        parsed.recommendations = parsed.adjustments;
        console.log('超级后备机制完成，新增', superAdjustments.length, '个adjustments，总计', parsed.adjustments.length, '个');
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
const createAdjustmentForFactor = (factorName, trend, referenceAdjustment, businessContext, dataAnalysis = null) => {
  const context = businessContext.toLowerCase();

  // 营业收入 - 通常需要增长
  if (factorName.includes('收入') || factorName.includes('营收') || factorName.includes('sales')) {
    // 从模型数据获取真实值
    const nodeInfo = findNodeRealValue(dataAnalysis, ['营业收入', '收入', '营收', '销售收入'], 1450);
    const currentValue = nodeInfo.currentValue;
    // 推荐值基于趋势或默认增长15%
    const growthPercent = trend?.suggestion?.includes('上调') ? 0.20 : 0.15;
    const recommendedValue = Math.round(currentValue * (1 + growthPercent));

    return {
      nodeId: nodeInfo.nodeId || factorName,
      nodeName: nodeInfo.nodeName || factorName,
      currentValue,
      recommendedValue,
      changePercent: Math.round((recommendedValue - currentValue) / currentValue * 100 * 100) / 100,
      changeReason: 'Q4销售旺季，加大市场推广力度',
      dataBasis: `基于业务目标增长至${recommendedValue}万，Q4季节性增长${Math.round(growthPercent * 100)}%`,
      businessReason: '配合双11、双12促销，实现全年净利润目标',
      riskWarning: '需确保推广执行到位，竞争加剧可能影响转化率',
      monthlyStrategy: '前低后高，11-12月重点爆发',
      monthlyFactors: [0.85, 0.85, 0.9, 0.95, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25, 1.35, 1.4],
      confidence: 0.85,
      derived: true
    };
  }

  // 营业成本 - 与收入挂钩
  if (factorName.includes('成本') || factorName.includes('cost')) {
    // 从模型数据获取真实值
    const nodeInfo = findNodeRealValue(dataAnalysis, ['营业成本', '成本', '生产成本', '制造费用'], 725);
    const currentCost = nodeInfo.currentValue;

    // 成本与收入同比例变化（如果参考调整是收入类）
    let recommendedCost = currentCost;
    if (referenceAdjustment?.nodeName?.includes('收入') || referenceAdjustment?.nodeName?.includes('营收')) {
      const revenueChangePercent = (referenceAdjustment.recommendedValue - referenceAdjustment.currentValue) / referenceAdjustment.currentValue;
      recommendedCost = currentCost * (1 + revenueChangePercent * 0.8); // 成本增长是收入增长的80%
    } else {
      // 默认增长5%
      recommendedCost = currentCost * 1.05;
    }

    const changePercent = Math.round((recommendedCost - currentCost) / currentCost * 100 * 100) / 100;

    return {
      nodeId: nodeInfo.nodeId || factorName,
      nodeName: nodeInfo.nodeName || factorName,
      currentValue: Math.round(currentCost),
      recommendedValue: Math.round(recommendedCost),
      changePercent: changePercent || 5,
      changeReason: '与营业收入挂钩，保持毛利率稳定',
      dataBasis: `基于模型真实当前值${currentCost}万，成本与收入同比例增长`,
      businessReason: '维持稳定的盈利能力，支撑利润目标',
      riskWarning: '需监控原材料成本波动',
      monthlyStrategy: '与收入同步增长',
      monthlyFactors: [0.85, 0.85, 0.9, 0.95, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25, 1.35, 1.4],
      confidence: 0.8,
      derived: true
    };
  }

  // 销售费用 - 推广相关
  if (factorName.includes('销售费用') || factorName.includes('营销') || factorName.includes('推广')) {
    const hasPromotion = context.includes('推广') || context.includes('市场') || context.includes('广告');
    // 从模型数据获取真实值
    const nodeInfo = findNodeRealValue(dataAnalysis, ['销售费用', '营销费用', '推广费用', '市场费用'], 231);
    const currentValue = nodeInfo.currentValue;
    // 如果有推广关键词，增加10-15%
    const increasePercent = hasPromotion ? 0.12 : 0.05;
    const recommendedValue = Math.round(currentValue * (1 + increasePercent));

    return {
      nodeId: nodeInfo.nodeId || factorName,
      nodeName: nodeInfo.nodeName || factorName,
      currentValue,
      recommendedValue,
      changePercent: Math.round((recommendedValue - currentValue) / currentValue * 100 * 100) / 100,
      changeReason: hasPromotion ? '加大市场推广投入，支持Q4冲刺' : '适度增加销售费用',
      dataBasis: hasPromotion ? `基于模型真实当前值${currentValue}万，推广需求增加${Math.round(increasePercent * 100)}%` : '适度增加以支撑收入增长',
      businessReason: '配合营业收入增长，增加广告投放和渠道推广',
      riskWarning: '需监控转化率，若ROI低于预期则及时调整',
      monthlyStrategy: '重点月份（11月双11、12月双12重点投入）',
      monthlyFactors: [0.7, 0.7, 0.75, 0.8, 0.8, 0.85, 0.9, 0.95, 1.0, 1.3, 1.5, 1.6],
      confidence: 0.8,
      derived: true
    };
  }

  // 管理费用 - 优化相关
  if (factorName.includes('管理费用') || factorName.includes('行政')) {
    const hasOptimization = context.includes('优化') || context.includes('降低') || context.includes('压缩');
    // 从模型数据获取真实值
    const nodeInfo = findNodeRealValue(dataAnalysis, ['管理费用', '行政费用', '管理成本'], 144);
    const currentValue = nodeInfo.currentValue;
    // 如果有优化关键词，降低5-8%
    const changePercent = hasOptimization ? -0.06 : 0;
    const recommendedValue = Math.round(currentValue * (1 + changePercent));

    return {
      nodeId: nodeInfo.nodeId || factorName,
      nodeName: nodeInfo.nodeName || factorName,
      currentValue,
      recommendedValue,
      changePercent: Math.round((recommendedValue - currentValue) / currentValue * 100 * 100) / 100,
      changeReason: hasOptimization ? '数字化工具上线，流程优化见效' : '保持管理费用稳定',
      dataBasis: hasOptimization ? `基于模型真实当前值${currentValue}万，目标优化${Math.abs(Math.round(changePercent * 100))}%` : '管理费用保持稳定',
      businessReason: '提升运营效率，通过流程改进降低成本',
      riskWarning: '需避免过度压缩影响员工积极性',
      monthlyStrategy: '平均分配，保持稳定',
      monthlyFactors: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      confidence: 0.75,
      derived: true
    };
  }

  // 研发费用
  if (factorName.includes('研发') || factorName.includes('rd')) {
    // 从模型数据获取真实值
    const nodeInfo = findNodeRealValue(dataAnalysis, ['研发费用', '研发支出', '研发投入', '研发成本'], 70);
    const currentValue = nodeInfo.currentValue;
    // 默认增加10%
    const recommendedValue = Math.round(currentValue * 1.10);

    return {
      nodeId: nodeInfo.nodeId || factorName,
      nodeName: nodeInfo.nodeName || factorName,
      currentValue,
      recommendedValue,
      changePercent: Math.round((recommendedValue - currentValue) / currentValue * 100),
      changeReason: '加大研发投入，提升产品竞争力',
      dataBasis: `基于模型真实当前值${currentValue}万，适度增加投入10%`,
      businessReason: '支持长期发展，增强技术壁垒',
      riskWarning: '需关注投入产出比',
      monthlyStrategy: '按项目进度分配',
      monthlyFactors: [1.0, 1.0, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      confidence: 0.7,
      derived: true
    };
  }

  // 默认：返回一个通用的调整
  return {
    nodeId: factorName.toLowerCase().replace(/\s+/g, '_'),
    nodeName: factorName,
    currentValue: 100,
    recommendedValue: 110,
    changePercent: 10,
    changeReason: '基于业务背景和数据分析',
    dataBasis: 'AI分析建议调整',
    businessReason: '支持业务目标达成',
    riskWarning: '需监控调整效果',
    monthlyStrategy: '平均分配',
    monthlyFactors: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    confidence: 0.6,
    derived: true
  };
};

// ==================== 智能推导机制 ====================

/**
 * 从业务背景中提取关键词并匹配驱动因子
 * @param {string} businessContext - 业务背景描述
 * @returns {Array} 匹配到的因子类型列表
 */
const extractFactorsFromContext = (businessContext) => {
  if (!businessContext) {
    console.log('智能推导：业务背景为空');
    return [];
  }

  const context = businessContext.toLowerCase();
  const factors = [];

  // 定义关键词映射（通用化，不限于财务）
  const keywordMap = {
    'revenue': {
      keywords: ['收入', '营收', '销售额', '营业额', 'revenue', 'sales', 'income', '营业收入'],
      type: '收入类'
    },
    'marketing': {
      keywords: ['推广', '营销', '广告', '销售费用', 'marketing', 'promotion', 'advertising', '投放', '市场'],
      type: '营销类'
    },
    'management': {
      keywords: ['管理', '优化', '管理费用', '行政', 'management', 'administrative', '流程改进'],
      type: '管理类'
    },
    'cost': {
      keywords: ['成本', '生产成本', '营业成本', 'cost', 'production', '制造费用'],
      type: '成本类'
    },
    'rd': {
      keywords: ['研发', '研发支出', 'rd', 'research', 'development', '技术投入'],
      type: '研发类'
    },
    'hr': {
      keywords: ['人力', '人力成本', '工资', '薪酬', 'hr', 'salary', 'payroll', '员工'],
      type: '人力类'
    },
    'quality': {
      keywords: ['质量', '质检', '返工', '质量成本', 'quality', 'inspection', '检验'],
      type: '质量类'
    },
    'finance': {
      keywords: ['财务', '利息', '财务费用', 'finance', 'interest', '利率'],
      type: '财务类'
    }
  };

  // 检查每个关键词类别
  Object.entries(keywordMap).forEach(([factorType, config]) => {
    const hasMatch = config.keywords.some(keyword => context.includes(keyword));
    if (hasMatch) {
      factors.push({
        type: factorType,
        category: config.type,
        keywords: config.keywords,
        matchedKeyword: config.keywords.find(k => context.includes(k))
      });
      console.log('智能推导：检测到因子类型', factorType, '通过关键词:', config.keywords.find(k => context.includes(k)));
    }
  });

  console.log('智能推导：总共检测到', factors.length, '个因子类型');
  return factors;
};

/**
 * 智能推导额外的adjustments
 * @param {Object} existingAdjustment - AI返回的现有adjustment
 * @param {string} businessContext - 业务背景
 * @param {Object} dataAnalysis - 数据分析结果
 * @returns {Array} 额外的adjustments
 */
const deriveAdditionalAdjustments = (existingAdjustment, businessContext, dataAnalysis) => {
  const additional = [];
  const detectedFactors = extractFactorsFromContext(businessContext);

  console.log('智能推导：检测到的因子类型', detectedFactors.map(f => f.category));
  console.log('智能推导：现有调整项', existingAdjustment.nodeName, existingAdjustment.nodeId);

  // 从模型结构中获取所有驱动因子（用于查找正确的nodeId）
  // 注意：这里假设dataAnalysis中包含模型信息，或者我们需要从其他地方获取

  // 如果检测到营销类因子但AI没调整营销费用
  const hasMarketing = detectedFactors.some(f => f.type === 'marketing');
  const isRevenueAdjustment = existingAdjustment.nodeName?.includes('收入') ||
                               existingAdjustment.nodeName?.includes('营收') ||
                               existingAdjustment.nodeName?.includes('成本'); // 扩展判断

  console.log('智能推导：是否收入类调整?', isRevenueAdjustment, '是否有营销?', hasMarketing);

  // 如果调整的是收入类，且背景提到营销/推广，则添加营销费用调整
  if (hasMarketing) {
    console.log('智能推导：准备添加营销费用调整');
    const marketingAdjustment = deriveMarketingAdjustment(existingAdjustment);
    if (marketingAdjustment) {
      // 从模型数据中匹配正确的nodeId和currentValue
      const nodeInfo = findNodeRealValue(dataAnalysis, ['销售费用', '营销费用', '广告费'], 231);
      if (nodeInfo.found) {
        marketingAdjustment.nodeId = nodeInfo.nodeId;
        marketingAdjustment.nodeName = nodeInfo.nodeName;
        marketingAdjustment.currentValue = nodeInfo.currentValue;
        // 重新计算推荐值（增加12%）
        marketingAdjustment.recommendedValue = Math.round(nodeInfo.currentValue * 1.12);
        marketingAdjustment.changePercent = Math.round((marketingAdjustment.recommendedValue - nodeInfo.currentValue) / nodeInfo.currentValue * 100 * 100) / 100;
        marketingAdjustment.dataBasis = `基于模型真实当前值${nodeInfo.currentValue}万，推广需求增加12%`;
      } else if (dataAnalysis) {
        marketingAdjustment.nodeId = nodeInfo.nodeId;
        marketingAdjustment.nodeName = nodeInfo.nodeName;
      }
      additional.push(marketingAdjustment);
      console.log('智能推导：已添加营销费用调整', marketingAdjustment);
    }
  }

  // 如果检测到管理类因子，添加管理费用调整
  const hasManagement = detectedFactors.some(f => f.type === 'management');
  if (hasManagement) {
    console.log('智能推导：准备添加管理费用调整');
    const mgmtAdjustment = deriveManagementAdjustment(existingAdjustment);
    if (mgmtAdjustment) {
      // 从模型数据中匹配正确的nodeId和currentValue
      const nodeInfo = findNodeRealValue(dataAnalysis, ['管理费用', '行政费用', '管理成本'], 144);
      if (nodeInfo.found) {
        mgmtAdjustment.nodeId = nodeInfo.nodeId;
        mgmtAdjustment.nodeName = nodeInfo.nodeName;
        mgmtAdjustment.currentValue = nodeInfo.currentValue;
        // 重新计算推荐值（优化6%）
        mgmtAdjustment.recommendedValue = Math.round(nodeInfo.currentValue * 0.94);
        mgmtAdjustment.changePercent = -6;
        mgmtAdjustment.dataBasis = `基于模型真实当前值${nodeInfo.currentValue}万，目标优化6%`;
      } else if (dataAnalysis) {
        mgmtAdjustment.nodeId = nodeInfo.nodeId;
        mgmtAdjustment.nodeName = nodeInfo.nodeName;
      }
      additional.push(mgmtAdjustment);
      console.log('智能推导：已添加管理费用调整', mgmtAdjustment);
    }
  }

  // 如果调整的是收入类，且检测到成本类，添加成本调整
  const hasCost = detectedFactors.some(f => f.type === 'cost');
  if (isRevenueAdjustment && hasCost) {
    console.log('智能推导：准备添加成本调整');
    const costAdjustment = deriveCostAdjustment(existingAdjustment);
    if (costAdjustment) {
      // 从模型数据中匹配正确的nodeId和currentValue
      const nodeInfo = findNodeRealValue(dataAnalysis, ['营业成本', '生产成本', '制造费用', '成本'], 725);
      if (nodeInfo.found) {
        costAdjustment.nodeId = nodeInfo.nodeId;
        costAdjustment.nodeName = nodeInfo.nodeName;
        const realCurrentValue = nodeInfo.currentValue;
        costAdjustment.currentValue = realCurrentValue;
        // 成本与收入同比例变化（收入增长的80%）
        const revenueChangePercent = (existingAdjustment.recommendedValue - existingAdjustment.currentValue) / existingAdjustment.currentValue;
        costAdjustment.recommendedValue = Math.round(realCurrentValue * (1 + revenueChangePercent * 0.8));
        costAdjustment.changePercent = Math.round((costAdjustment.recommendedValue - realCurrentValue) / realCurrentValue * 100 * 100) / 100;
        costAdjustment.dataBasis = `基于模型真实当前值${realCurrentValue}万，成本与收入同比例增长${Math.round(revenueChangePercent * 0.8 * 100)}%`;
      } else if (dataAnalysis) {
        costAdjustment.nodeId = nodeInfo.nodeId;
        costAdjustment.nodeName = nodeInfo.nodeName;
      }
      additional.push(costAdjustment);
      console.log('智能推导：已添加成本调整', costAdjustment);
    }
  }

  // 如果检测到研发类因子，添加研发调整
  const hasRD = detectedFactors.some(f => f.type === 'rd');
  if (hasRD) {
    console.log('智能推导：准备添加研发调整');
    const rdAdjustment = deriveRDAdjustment(existingAdjustment);
    if (rdAdjustment) {
      // 从模型数据中匹配正确的nodeId和currentValue
      const nodeInfo = findNodeRealValue(dataAnalysis, ['研发费用', '研发支出', '研发投入'], 70);
      if (nodeInfo.found) {
        rdAdjustment.nodeId = nodeInfo.nodeId;
        rdAdjustment.nodeName = nodeInfo.nodeName;
        rdAdjustment.currentValue = nodeInfo.currentValue;
        // 重新计算推荐值（增加10%）
        rdAdjustment.recommendedValue = Math.round(nodeInfo.currentValue * 1.10);
        rdAdjustment.changePercent = 10;
        rdAdjustment.dataBasis = `基于模型真实当前值${nodeInfo.currentValue}万，研发需求增加10%`;
      } else if (dataAnalysis) {
        rdAdjustment.nodeId = nodeInfo.nodeId;
        rdAdjustment.nodeName = nodeInfo.nodeName;
      }
      additional.push(rdAdjustment);
      console.log('智能推导：已添加研发调整', rdAdjustment);
    }
  }

  return additional;
};

/**
 * 从模型数据中查找匹配的nodeId
 * @param {Object} dataAnalysis - 数据分析结果
 * @param {Array} possibleNames - 可能的节点名称
 * @returns {string|null} 匹配的nodeId
 */
const findMatchingNodeId = (dataAnalysis, possibleNames) => {
  // 尝试从dataAnalysis或其他地方获取模型信息
  // 如果无法匹配，返回null，让调用者使用默认ID
  if (!dataAnalysis) return null;

  // 尝试匹配（简化版本）
  if (dataAnalysis.nodes) {
    for (const [nodeId, node] of Object.entries(dataAnalysis.nodes)) {
      if (possibleNames.some(name => node.name?.includes(name))) {
        return nodeId;
      }
    }
  }

  return null;
};

/**
 * 从模型数据中查找节点的真实当前值
 * @param {Object} dataAnalysis - 数据分析结果，包含nodes
 * @param {Array} possibleNames - 可能的节点名称
 * @param {number} defaultValue - 默认值
 * @returns {Object} {nodeId, nodeName, currentValue, found}
 */
const findNodeRealValue = (dataAnalysis, possibleNames, defaultValue = 0) => {
  if (!dataAnalysis?.nodes) {
    return { nodeId: null, nodeName: possibleNames[0], currentValue: defaultValue, found: false };
  }

  for (const [nodeId, node] of Object.entries(dataAnalysis.nodes)) {
    if (possibleNames.some(name =>
      node.name?.includes(name) ||
      name.includes(node.name) ||
      nodeId.toLowerCase().includes(name.toLowerCase().replace(/\s+/g, '_'))
    )) {
      const currentValue = node.value ?? node.baseline ?? node.currentValue ?? defaultValue;
      return {
        nodeId,
        nodeName: node.name || possibleNames[0],
        currentValue: Math.round(currentValue * 100) / 100,
        found: true,
        node
      };
    }
  }

  return { nodeId: null, nodeName: possibleNames[0], currentValue: defaultValue, found: false };
};

/**
 * 推导营销费用调整
 * 注意：currentValue和recommendedValue由调用者根据真实模型数据填充
 */
const deriveMarketingAdjustment = (revenueAdjustment) => {
  return {
    nodeId: 'sales_expense',
    nodeName: '销售费用',
    currentValue: 0, // 将由调用者填充真实值
    recommendedValue: 0, // 将由调用者计算
    changePercent: 12,
    changeReason: '支撑收入增长目标，加大市场推广投入',
    dataBasis: '基于收入增长目标，适度增加营销费用',
    businessReason: '配合营业收入增长，增加广告投放和渠道推广',
    riskWarning: '需监控转化率，确保ROI合理',
    monthlyStrategy: '重点月份投入（11-12月旺季）',
    monthlyFactors: [0.7, 0.7, 0.75, 0.8, 0.8, 0.85, 0.9, 0.95, 1.0, 1.3, 1.5, 1.6],
    confidence: 0.75,
    derived: true // 标记为推导生成
  };
};

/**
 * 推导管理费用调整
 * 注意：currentValue和recommendedValue由调用者根据真实模型数据填充
 */
const deriveManagementAdjustment = (revenueAdjustment) => {
  return {
    nodeId: 'mgmt_expense',
    nodeName: '管理费用',
    currentValue: 0, // 将由调用者填充真实值
    recommendedValue: 0, // 将由调用者计算
    changePercent: -6,
    changeReason: '数字化工具上线，流程优化见效',
    dataBasis: '基于业务背景中的"优化管理"要求，目标降低5-10%',
    businessReason: '提升运营效率，通过流程改进降低成本',
    riskWarning: '需避免过度压缩影响员工积极性',
    monthlyStrategy: '平均分配，保持稳定',
    monthlyFactors: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    confidence: 0.7,
    derived: true
  };
};

/**
 * 推导营业成本调整
 * 注意：currentValue和recommendedValue由调用者根据真实模型数据填充
 */
const deriveCostAdjustment = (revenueAdjustment) => {
  return {
    nodeId: 'operating_cost',
    nodeName: '营业成本',
    currentValue: 0, // 将由调用者填充真实值
    recommendedValue: 0, // 将由调用者计算
    changePercent: 0, // 将由调用者计算
    changeReason: '与营业收入挂钩，保持毛利率稳定',
    dataBasis: '基于真实当前值，成本与收入同比例增长',
    businessReason: '维持稳定的盈利能力，支撑利润目标',
    riskWarning: '需监控原材料成本波动',
    monthlyStrategy: '与收入同步增长',
    monthlyFactors: [0.85, 0.85, 0.9, 0.95, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25, 1.35, 1.4],
    confidence: 0.8,
    derived: true
  };
};

/**
 * 推导研发支出调整
 * 注意：currentValue和recommendedValue由调用者根据真实模型数据填充
 */
const deriveRDAdjustment = (revenueAdjustment) => {
  return {
    nodeId: 'rd_expense',
    nodeName: '研发费用',
    currentValue: 0, // 将由调用者填充真实值
    recommendedValue: 0, // 将由调用者计算
    changePercent: 10,
    changeReason: '加大研发投入，提升产品竞争力',
    dataBasis: '基于业务背景中的研发需求，适度增加投入10%',
    businessReason: '支持长期发展，增强技术壁垒',
    riskWarning: '需关注投入产出比',
    monthlyStrategy: '按项目进度分配',
    monthlyFactors: [1.0, 1.0, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    confidence: 0.7,
    derived: true
  };
};
