/**
 * AI Prompt构建工具 - 增强版
 * 支持完整的三态数据（初始→当前→目标）和结构化约束
 */

/**
 * 解析约束条件为结构化格式
 * @param {string} constraintText - 约束文本
 * @returns {Object} 结构化约束
 */
const parseConstraint = (constraintText) => {
  const text = constraintText.toLowerCase().trim();

  // 匹配模式：X 必须/要/需 达到/超过/不小于 Y
  const reachMatch = text.match(/(.+?)(必须|要|需|必须|务必)(?:达到|等于|为)(.+)/);
  if (reachMatch) {
    const nodeName = reachMatch[1].trim();
    const targetValue = parseFloat(reachMatch[3].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_reach', nodeName, targetValue, raw: constraintText };
    }
  }

  // 匹配模式：X 必须/要/需 超过/大于/不小于 Y
  const exceedMatch = text.match(/(.+?)(必须|要|需|必须|务必)(?:超过|大于|不小于|至少|最低|最少)(.+)/);
  if (exceedMatch) {
    const nodeName = exceedMatch[1].trim();
    const targetValue = parseFloat(exceedMatch[3].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_exceed', nodeName, minValue: targetValue, raw: constraintText };
    }
  }

  // 匹配模式：X 不能超过/必须小于/最大 Y
  const belowMatch = text.match(/(.+?)(?:不能超过|必须小于|不大于|最多|最高|不超过|不超过)(.+)/);
  if (belowMatch) {
    const nodeName = belowMatch[1].trim();
    const targetValue = parseFloat(belowMatch[2].replace(/[^\d.-]/g, ''));
    if (!isNaN(targetValue)) {
      return { type: 'must_not_exceed', nodeName, maxValue: targetValue, raw: constraintText };
    }
  }

  // 匹配模式：X 增加/减少 Y（金额或百分比）
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

  // 匹配模式：X 在 A 到 B 之间
  const rangeMatch = text.match(/(.+?)(?:在|范围|介于)([\d.,]+)(?:到|至|~|－|—|-)([\d.,]+)/);
  if (rangeMatch) {
    const nodeName = rangeMatch[1].trim();
    const minVal = parseFloat(rangeMatch[2].replace(/,/g, ''));
    const maxVal = parseFloat(rangeMatch[3].replace(/,/g, ''));
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      return { type: 'must_in_range', nodeName, minValue: minVal, maxValue: maxVal, raw: constraintText };
    }
  }

  // 默认返回原始文本约束
  return { type: 'text', raw: constraintText };
};

/**
 * 构建月度数据摘要（避免数据过大）
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

  // 按实际/预测分类
  const actualKeys = Object.keys(timeData).filter(k => k.includes('实际'));
  const forecastKeys = Object.keys(timeData).filter(k => k.includes('预测'));

  const actualSum = actualKeys.reduce((sum, key) => {
    const v = parseFloat(timeData[key]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const forecastSum = forecastKeys.reduce((sum, key) => {
    const v = parseFloat(timeData[key]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  return {
    months: Object.keys(timeData),
    count: values.length,
    total: Math.round(sum * 100) / 100,
    average: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    actualTotal: Math.round(actualSum * 100) / 100,
    forecastTotal: Math.round(forecastSum * 100) / 100,
    sample: Object.entries(timeData).slice(0, 3).reduce((obj, [k, v]) => {
      obj[k] = v;
      return obj;
    }, {})
  };
};

/**
 * 计算节点初始值（基于 initialBaseline 或 timeData 原始聚合）
 * @param {Object} node - 节点
 * @returns {number} 初始值
 */
const calculateInitialValue = (node) => {
  // 优先使用 initialBaseline（节点创建时的原始基准）
  if (node.initialBaseline !== undefined && node.initialBaseline !== null) {
    return node.initialBaseline;
  }

  // 其次使用 baseline
  if (node.baseline !== undefined && node.baseline !== null) {
    return node.baseline;
  }

  // 最后使用 timeData 的聚合
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
 * 构建增强的模型结构描述
 * @param {Object} nodes - 所有节点
 * @returns {Object} 增强的模型结构
 */
export const buildModelStructure = (nodes) => {
  const structure = {
    drivers: [], // 驱动因子（可调整）
    computed: [], // 计算指标（公式计算）
    relationships: [], // 依赖关系
    targetNodes: [] // 可作为目标的指标
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

      structure.drivers.push({
        ...nodeInfo,
        initialValue: Math.round(initialValue * 100) / 100,      // 初始导入值
        originalBaseline: node.baseline ?? initialValue,         // 原始基线
        currentValue: Math.round(currentValue * 100) / 100,      // 当前值
        editable: true,
        aggregationType: node.aggregationType || 'sum',          // 聚合方式
        monthlySummary: buildMonthlySummary(node.timeData)       // 月度数据摘要
      });
    } else if (node.type === 'computed') {
      const currentValue = node.value ?? 0;

      structure.computed.push({
        ...nodeInfo,
        formula: node.formula || '',
        currentValue: Math.round(currentValue * 100) / 100,
        isTargetCandidate: true  // 可作为优化目标
      });

      structure.targetNodes.push({
        id: node.id,
        name: node.name,
        currentValue: Math.round(currentValue * 100) / 100,
        unit: node.unit || ''
      });
    }

    // 记录依赖关系
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
 * 构建完整的状态对比（初始→当前→目标）
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

  // 目标节点信息
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
      isReached: gap !== null && gap <= 0.01  // 容差 0.01
    };
  }

  return comparison;
};

/**
 * 构建结构化约束描述
 * @param {Array} constraints - 约束条件列表
 * @param {Object} nodes - 所有节点
 * @returns {Object} 结构化约束
 */
const buildStructuredConstraints = (constraints, nodes) => {
  const structured = constraints.map(c => parseConstraint(c));

  // 为每个约束找到匹配的节点
  const enriched = structured.map(constraint => {
    if (constraint.type === 'text') return constraint;

    // 尝试匹配节点名称
    const matchedNode = Object.values(nodes).find(n =>
      n.name.toLowerCase().includes(constraint.nodeName.toLowerCase()) ||
      constraint.nodeName.toLowerCase().includes(n.name.toLowerCase())
    );

    if (matchedNode) {
      const currentVal = matchedNode.value ?? matchedNode.baseline ?? 0;
      const enrichedConstraint = {
        ...constraint,
        nodeId: matchedNode.id,
        nodeName: matchedNode.name,
        currentValue: Math.round(currentVal * 100) / 100,
        unit: matchedNode.unit || ''
      };

      // 对于增量约束，计算实际的限制值
      if (constraint.type === 'increase_max') {
        // 增加不超过 X → 最终值不能超过 当前值 + X
        enrichedConstraint.maxValue = Math.round((currentVal + constraint.amount) * 100) / 100;
        enrichedConstraint.calculation = `${currentVal} + ${constraint.amount} = ${enrichedConstraint.maxValue}`;
      } else if (constraint.type === 'increase_min') {
        // 增加至少 X → 最终值至少为 当前值 + X
        enrichedConstraint.minValue = Math.round((currentVal + constraint.amount) * 100) / 100;
        enrichedConstraint.calculation = `${currentVal} + ${constraint.amount} = ${enrichedConstraint.minValue}`;
      } else if (constraint.type === 'decrease_max') {
        // 减少不超过 X → 最终值不能低于 当前值 - X
        enrichedConstraint.minValue = Math.round((currentVal - constraint.amount) * 100) / 100;
        enrichedConstraint.calculation = `${currentVal} - ${constraint.amount} = ${enrichedConstraint.minValue}`;
      } else if (constraint.type === 'decrease_min') {
        // 减少至少 X → 最终值至多为 当前值 - X
        enrichedConstraint.maxValue = Math.round((currentVal - constraint.amount) * 100) / 100;
        enrichedConstraint.calculation = `${currentVal} - ${constraint.amount} = ${enrichedConstraint.maxValue}`;
      }

      return enrichedConstraint;
    }

    return constraint;
  });

  return {
    raw: constraints,
    structured: enriched,
    summary: enriched.map(c => {
      switch (c.type) {
        case 'must_reach':
          return `${c.nodeName} 必须达到 ${c.targetValue}${c.unit || ''}`;
        case 'must_exceed':
          return `${c.nodeName} 必须超过 ${c.minValue}${c.unit || ''}`;
        case 'must_not_exceed':
          return `${c.nodeName} 不能超过 ${c.maxValue}${c.unit || ''}`;
        case 'increase_max':
          return `${c.nodeName} 增加不超过 ${c.amount}${c.unit || ''}（即不超过 ${c.maxValue}${c.unit || ''}）`;
        case 'increase_min':
          return `${c.nodeName} 增加至少 ${c.amount}${c.unit || ''}（即至少为 ${c.minValue}${c.unit || ''}）`;
        case 'decrease_max':
          return `${c.nodeName} 减少不超过 ${c.amount}${c.unit || ''}（即不低于 ${c.minValue}${c.unit || ''}）`;
        case 'decrease_min':
          return `${c.nodeName} 减少至少 ${c.amount}${c.unit || ''}（即不超过 ${c.maxValue}${c.unit || ''}）`;
        case 'max_value':
          return `${c.nodeName} 不能超过 ${c.value}${c.unit || ''}`;
        case 'min_value':
          return `${c.nodeName} 不能低于 ${c.value}${c.unit || ''}`;
        case 'range':
          return `${c.nodeName} 必须在 ${c.minValue}-${c.maxValue}${c.unit || ''} 之间`;
        case 'change_by_amount':
          return `${c.nodeName} ${c.amount > 0 ? '增加' : '减少'} ${Math.abs(c.amount)}${c.unit || ''}`;
        case 'change_by_percent':
          return `${c.nodeName} ${c.amount > 0 ? '增加' : '减少'} ${Math.abs(c.amount)}%`;
        case 'must_in_range':
          return `${c.nodeName} 必须在 ${c.minValue}-${c.maxValue}${c.unit || ''} 之间`;
        default:
          return c.raw;
      }
    })
  };
};

/**
 * 不同调参模式的系统指令 - 增强版
 */
const MODE_INSTRUCTIONS = {
  initial: `请从零开始生成最优的驱动因子配置方案。

你的任务是：
1. 分析模型结构和各驱动因子的合理取值范围（考虑min/max约束）
2. 分析每个驱动因子从初始值到当前值的变化轨迹
3. 基于用户的目标和约束条件，计算最优的驱动因子配置
4. 对于有月度数据的驱动因子，建议调整权重分配
5. 确保所有建议值满足硬性约束（must_exceed/must_not_exceed等）
6. 解释为什么这样配置可以达到最优效果

【月度数据调整要求】
对于每个有月度数据的驱动因子，在monthlyAdjustment字段中提供：
- strategy: 分配策略名称（"平均分配"|"前高后低"|"前低后高"|"重点月份"|"保持当前"）
- factors: 12个月的分配系数数组，如[0.8, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1]
- notes: 调整说明（如"Q4销售旺季，建议增加11-12月投入"）

特别注意：
- 约束条件是硬性要求，必须满足，不能违反
- 如果约束条件冲突或无法同时满足，请明确指出`,

  partial: `用户已经调整了一部分驱动因子，对其中一些满意，对另一些不满意。

被锁定的驱动因子是用户满意的，请勿调整。
你的任务是：
1. 保持被锁定驱动因子的值不变
2. 分析未锁定驱动因子的调整空间（初始→当前→可调范围）
3. 只调整未被锁定的驱动因子来优化目标
4. 确保调整后的结果满足所有约束条件
5. 如果被锁定的因子限制了优化空间，请明确说明
6. 对于未锁定且有月度数据的因子，可以建议调整月度权重

【月度数据调整要求】
对于建议调整的驱动因子，在monthlyAdjustment字段中提供：
- strategy: 分配策略名称
- factors: 12个月的分配系数数组
- notes: 调整说明

特别注意：
- 约束条件是硬性要求，必须满足
- 如果仅靠未锁定因子无法满足约束，请明确说明`,

  scan: `用户已完成人工调整，请全局扫描检查是否还有优化空间。

关键判断依据：
1. 【目标差距分析】当前值 vs 目标值，差距是多少？
2. 【是否已达标】当前值是否已达到或超过目标值？
3. 【优化空间评估】各驱动因子还有多少调整空间？

你的任务是：
1. 对比目标节点的当前值和目标值
2. 如果当前值 < 目标值：
   - 分析还需要增加多少才能达到目标
   - 识别哪些驱动因子还有上调空间
   - 计算每个驱动因子对目标的贡献度
   - 给出具体的调整建议
3. 如果当前值 >= 目标值：
   - 检查是否还能进一步优化（更高/更低）
   - 评估当前配置的质量
4. 如果有约束条件，检查是否都被满足

【约束检查重点】
- 增量约束（increase_max/decrease_max）：最终值 = 当前值 + 增量限制
- 绝对值约束（max_value/min_value）：最终值直接受限制
- 必须满足所有约束，否则在constraintStatus中标记违反

重要警告：
- 【禁止虚假最优】如果当前值明显低于目标值，绝对不能说"已达最优"
- 只有当前值 >= 目标值，且约束都满足时，才能说"已达最优"
- 扫描的目的是找优化空间，不是为了说"已经很好了"`
};

/**
 * 构建AI调参Prompt - 增强版
 * @param {Object} params - 参数对象
 * @param {Object} params.nodes - 所有节点
 * @param {string} params.tuningMode - 调参模式 ('initial' | 'partial' | 'scan')
 * @param {string} params.userGoal - 用户目标描述
 * @param {string} params.targetNodeId - 目标指标节点ID
 * @param {number} params.targetValue - 目标值
 * @param {Array} params.lockedNodes - 锁定的驱动因子ID列表（部分调整模式用）
 * @param {Array} params.constraints - 约束条件列表
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

  // 构建锁定节点描述（部分调整模式）
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

  // 构建约束条件文本
  let constraintsText = '';
  if (structuredConstraints.structured.length > 0) {
    constraintsText = `\n【约束条件】（必须满足）：\n`;
    constraintsText += structuredConstraints.summary.map((c, i) => `${i + 1}. ${c}`).join('\n');
    constraintsText += `\n\n约束详情（含计算过程）：\n${JSON.stringify(structuredConstraints.structured, null, 2)}`;
    constraintsText += `\n\n【约束理解说明】\n`;
    constraintsText += `- increase_max（增加不超过X）：最终值 ≤ 当前值 + X\n`;
    constraintsText += `- increase_min（增加至少X）：最终值 ≥ 当前值 + X\n`;
    constraintsText += `- decrease_max（减少不超过X）：最终值 ≥ 当前值 - X\n`;
    constraintsText += `- decrease_min（减少至少X）：最终值 ≤ 当前值 - X\n`;
    constraintsText += `- max_value（不能超过X）：最终值 ≤ X\n`;
    constraintsText += `- min_value（不能低于X）：最终值 ≥ X\n`;
    constraintsText += `\n请务必确保所有推荐值满足上述约束！`;
  }

  // 目标差距分析（扫描模式专用）
  const gapAnalysis = tuningMode === 'scan' && valueComparison.target
    ? `\n【目标差距分析】\n${JSON.stringify(valueComparison.target, null, 2)}`
    : '';

  const systemPrompt = `你是一位专业的财务分析和优化专家，擅长价值驱动树(VDT)模型的驱动因子配置优化。

${MODE_INSTRUCTIONS[tuningMode] || MODE_INSTRUCTIONS.initial}

【模型结构】
包含 ${modelStructure.drivers.length} 个驱动因子（可调整）和 ${modelStructure.computed.length} 个计算指标（公式计算）。

驱动因子：
\`\`\`json
${JSON.stringify(modelStructure.drivers, null, 2)}
\`\`\`

计算指标：
\`\`\`json
${JSON.stringify(modelStructure.computed.slice(0, 10), null, 2)}${modelStructure.computed.length > 10 ? '\n...（还有' + (modelStructure.computed.length - 10) + '个指标）' : ''}
\`\`\`

【三态数据对比】初始值 → 当前值 → 目标值
\`\`\`json
${JSON.stringify(valueComparison, null, 2)}
\`\`\`
${gapAnalysis}${lockedNodesText}${constraintsText}

请严格按以下JSON格式返回结果（不要包含任何其他文字，只返回JSON）：
\`\`\`json
{
  "recommendations": [
    {
      "nodeId": "驱动因子ID",
      "nodeName": "驱动因子名称",
      "currentValue": 100,
      "recommendedValue": 120,
      "changePercent": 20,
      "reason": "调整理由（基于什么分析和约束）",
      "status": "adjusted", // adjusted(已调整)|locked(已锁定)|optimal(已最优)|constrained(受约束限制无法调整)
      "monthlyAdjustment": { // 如果有月度数据，建议如何调整权重
        "strategy": "平均分配|前高后低|前低后高|重点月份|保持当前",
        "factors": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], // 12个月的分配系数
        "notes": "月度调整说明"
      }
    }
  ],
  "expectedResult": {
    "targetNodeId": "目标指标ID",
    "targetNodeName": "目标指标名称",
    "currentValue": 500,
    "predictedValue": 600,
    "improvementPercent": 20,
    "gapClosed": 80 // 目标差距关闭百分比（扫描模式重要）
  },
  "constraintStatus": {
    "allSatisfied": true, // 是否满足所有约束
    "violations": [], // 如有违反，列出详情
    "notes": "约束满足情况说明"
  },
  "confidence": 0.85,
  "isOptimal": false, // 是否已达到最优（扫描模式专用：只有达到目标且无优化空间时才为true）
  "optimizationSpace": "充足|有限|不足|无", // 优化空间评估
  "explanation": "整体优化方案的详细说明，包括：1.分析过程 2.为什么这样调整 3.约束满足情况 4.如果没达到目标请说明原因",
  "suggestions": [ // 额外建议
    "建议1：...",
    "建议2：..."
  ]
}
\`\`\`

重要规则：
1. 只返回纯JSON，不要包含markdown代码块标记或其他说明文字
2. recommendations数组只包含驱动因子（driver类型）
3. status字段：adjusted-已调整|locked-用户锁定|optimal-已达最优无需调整|constrained-受约束限制
4. 数值计算要准确，changePercent和improvementPercent要正确计算
5. 【约束优先】必须优先满足约束条件，约束是硬性要求
6. 【扫描模式】如果当前值 < 目标值，isOptimal必须为false，并给出具体调整建议
7. 【扫描模式】gapClosed字段表示目标差距关闭了多少百分比（重要）`;

  return {
    system: systemPrompt,
    user: userGoal || '请优化当前模型配置'
  };
};

/**
 * 解析AI响应 - 增强版
 * @param {string} response - AI返回的文本
 * @returns {Object} 解析后的结果
 */
export const parseAIResponse = (response) => {
  try {
    let parsed = null;

    // 尝试直接解析JSON
    try {
      parsed = JSON.parse(response);
    } catch {}

    // 尝试从markdown代码块中提取
    if (!parsed) {
      const jsonMatch = response.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      }
    }

    // 尝试找到JSON对象
    if (!parsed) {
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        parsed = JSON.parse(objectMatch[0]);
      }
    }

    if (!parsed) {
      return { success: false, error: '无法解析AI响应' };
    }

    // 验证必要字段
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      console.warn('AI响应缺少recommendations字段');
      parsed.recommendations = [];
    }

    // 增强扫描模式判断
    if (parsed.isOptimal && parsed.expectedResult?.gapClosed !== undefined) {
      // 如果gapClosed < 100%，说明还有差距，不能算最优
      if (parsed.expectedResult.gapClosed < 100) {
        parsed.isOptimal = false;
        parsed.optimizationSpace = parsed.optimizationSpace || '仍有空间';
      }
    }

    return { success: true, data: parsed };
  } catch (error) {
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

  // 检查每个建议
  recommendations.forEach((rec) => {
    if (rec.status !== 'adjusted') return;

    const node = nodes[rec.nodeId];
    if (!node) return;

    // 检查min/max约束
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
