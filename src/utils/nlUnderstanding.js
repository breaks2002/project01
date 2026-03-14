/**
 * 自然语言理解模块 - 智能版
 * 用于AI调参功能，支持业务背景理解、自然约束表达
 */

/**
 * 提取数字（支持中文数字单位）
 * @param {string} text - 文本
 * @returns {number|null} 提取的数值
 */
const extractNumber = (text) => {
  if (!text) return null;

  // 处理中文数字格式：280万、1.5亿、3000千等
  const chineseNumMatch = text.match(/([\d.,]+)\s*(万|亿|千|百万|千万)/);
  if (chineseNumMatch) {
    const num = parseFloat(chineseNumMatch[1].replace(/,/g, ''));
    const unit = chineseNumMatch[2];
    const multipliers = {
      '千': 1000,
      '万': 10000,
      '百万': 1000000,
      '千万': 10000000,
      '亿': 100000000
    };
    return num * (multipliers[unit] || 1);
  }

  // 普通数字格式
  const normalMatch = text.match(/([\d,]+(?:\.\d+)?)/);
  if (normalMatch) {
    return parseFloat(normalMatch[1].replace(/,/g, ''));
  }

  return null;
};

/**
 * 提取百分比
 * @param {string} text - 文本
 * @returns {number|null} 提取的百分比数值
 */
const extractPercent = (text) => {
  if (!text) return null;
  const match = text.match(/(\d+\.?\d*)\s*%/);
  if (match) {
    return parseFloat(match[1]);
  }
  // 中文百分比
  const chineseMatch = text.match(/(\d+\.?\d*)\s*百分点/);
  if (chineseMatch) {
    return parseFloat(chineseMatch[1]);
  }
  return null;
};

/**
 * 查找节点ID（模糊匹配）
 * @param {string} name - 节点名称
 * @param {Object} nodes - 所有节点
 * @returns {string|null} 节点ID
 */
const findNodeId = (name, nodes) => {
  if (!name || !nodes) return null;

  const lowerName = name.toLowerCase().trim();
  const nodeList = Object.values(nodes);

  // 1. 精确匹配
  const exactMatch = nodeList.find(n =>
    n.name.toLowerCase() === lowerName
  );
  if (exactMatch) return exactMatch.id;

  // 2. 包含匹配（节点名包含输入）
  const containsMatch = nodeList.find(n =>
    n.name.toLowerCase().includes(lowerName)
  );
  if (containsMatch) return containsMatch.id;

  // 3. 被包含匹配（输入包含节点名）
  const containedMatch = nodeList.find(n =>
    lowerName.includes(n.name.toLowerCase())
  );
  if (containedMatch) return containedMatch.id;

  // 4. 关键词匹配
  const keywords = {
    '净利润': ['净利润', '净利', '利润', '收益'],
    '营业收入': ['营业收入', '收入', '营收', '销售额', '营业额'],
    '销售费用': ['销售费用', '销售成本', '营销费用', '推广费用'],
    '管理费用': ['管理费用', '管理费', '行政费用'],
    '财务费用': ['财务费用', '财务成本', '利息费用'],
    '营业成本': ['营业成本', '成本'],
    '毛利润': ['毛利润', '毛利'],
    '营业利润': ['营业利润', '营业收益'],
    '毛利率': ['毛利率', '毛利'],
    '净利率': ['净利率', '净利润率']
  };

  for (const [key, aliases] of Object.entries(keywords)) {
    if (aliases.some(a => lowerName.includes(a))) {
      const matched = nodeList.find(n =>
        aliases.some(alias => n.name.toLowerCase().includes(alias))
      );
      if (matched) return matched.id;
    }
  }

  return null;
};

/**
 * 从文本中提取时间节点信息
 * @param {string} text - 文本
 * @returns {Object} 时间节点信息
 */
const extractTimeContext = (text) => {
  if (!text) return { type: null, description: null };

  const lowerText = text.toLowerCase();

  // 季度匹配
  const quarterPatterns = [
    { regex: /q1|第一季度|一季度|首季度/, type: 'Q1', name: '第一季度' },
    { regex: /q2|第二季度|二季度/, type: 'Q2', name: '第二季度' },
    { regex: /q3|第三季度|三季度/, type: 'Q3', name: '第三季度' },
    { regex: /q4|第四季度|四季度|年末|年底/, type: 'Q4', name: '第四季度' }
  ];

  for (const pattern of quarterPatterns) {
    if (pattern.regex.test(lowerText)) {
      return { type: pattern.type, name: pattern.name, description: `${pattern.name}` };
    }
  }

  // 上半年/下半年
  if (/上半年|前半/.test(lowerText)) {
    return { type: 'H1', name: '上半年', description: '上半年' };
  }
  if (/下半年|后半/.test(lowerText)) {
    return { type: 'H2', name: '下半年', description: '下半年' };
  }

  // 全年
  if (/全年|全年?|年度|今年|明年/.test(lowerText)) {
    return { type: 'FULL_YEAR', name: '全年', description: '全年' };
  }

  // 特定月份
  const monthMatch = lowerText.match(/(\d{1,2})月/);
  if (monthMatch) {
    const month = parseInt(monthMatch[1]);
    if (month >= 1 && month <= 12) {
      return { type: 'MONTH', month, name: `${month}月`, description: `${month}月` };
    }
  }

  // 未来时间段
  if (/未来|接下来|今后|往后|今后一段/.test(lowerText)) {
    const futureMatch = lowerText.match(/(\d+)\s*(个?月|天|周|年)/);
    if (futureMatch) {
      return {
        type: 'FUTURE',
        period: futureMatch[0],
        name: `未来${futureMatch[1]}${futureMatch[2]}`,
        description: `未来${futureMatch[1]}${futureMatch[2]}`
      };
    }
    return { type: 'FUTURE', name: '未来', description: '未来' };
  }

  return { type: null, name: null, description: null };
};

/**
 * 从文本中提取业务目标
 * @param {string} text - 文本
 * @returns {Array} 业务目标列表
 */
const extractBusinessGoals = (text) => {
  if (!text) return [];

  const goals = [];
  const lowerText = text.toLowerCase();

  // 增长目标
  const growthPatterns = [
    { regex: /(净利润|营业收入|收入|营收|销售额)(?:增长|提高|提升)(\d+(?:\.\d+)?)%?/, type: 'growth', factor: '收入' },
    { regex: /(销售|市场)(?:推广|投入|费用)?(?:加大|增加|强化)/, type: 'increase_activity', factor: '销售费用' },
    { regex: /(成本|费用)(?:控制|降低|减少|优化)/, type: 'control_cost', factor: '成本' },
    { regex: /(管理|运营)(?:优化|提升|改善|效率)/, type: 'optimize', factor: '管理费用' }
  ];

  for (const pattern of growthPatterns) {
    const match = lowerText.match(pattern.regex);
    if (match) {
      const percent = extractPercent(match[0]);
      goals.push({
        type: pattern.type,
        description: match[0],
        targetFactor: pattern.factor,
        targetPercent: percent,
        direction: pattern.type.includes('growth') || pattern.type.includes('increase') ? 'increase' : 'decrease'
      });
    }
  }

  // 通用目标识别
  if (/目标|计划|期望|希望|要|需/.test(lowerText)) {
    // 净利润目标
    const profitMatch = lowerText.match(/(?:净利润|利润|收益)(?:目标|达到|做到|实现)?[:是为\s]*([\d.,]+(?:\s*[万亿])?)/);
    if (profitMatch) {
      const value = extractNumber(profitMatch[1]);
      goals.push({
        type: 'target_profit',
        description: `净利润达到${profitMatch[1]}`,
        targetFactor: '净利润',
        targetValue: value
      });
    }

    // 增长率目标
    const growthMatch = lowerText.match(/(?:增长|提高|提升|增幅)(?:目标|达到)?[:是为\s]*([\d.]+)%?/);
    if (growthMatch) {
      const percent = parseFloat(growthMatch[1]);
      goals.push({
        type: 'target_growth_rate',
        description: `增长${growthMatch[1]}%`,
        targetPercent: percent
      });
    }
  }

  return goals;
};

/**
 * 从文本中提取自然约束（支持模糊表达）
 * @param {string} text - 文本
 * @param {Object} nodes - 所有节点
 * @returns {Array} 约束列表
 */
const extractNaturalConstraints = (text, nodes) => {
  if (!text) return [];

  const constraints = [];
  const lowerText = text.toLowerCase();

  // 范围类约束（A到B之间）
  const rangeMatch = lowerText.match(/(.+?)(?:在|介于|范围|保持|维持|控制)?\s*([\d.,]+(?:\s*[万亿])?)\s*(?:到|至|~|－|—|-)\s*([\d.,]+(?:\s*[万亿])?)/);
  if (rangeMatch) {
    const nodeName = rangeMatch[1].trim();
    const nodeId = findNodeId(nodeName, nodes);
    const minValue = extractNumber(rangeMatch[2]);
    const maxValue = extractNumber(rangeMatch[3]);
    constraints.push({
      type: 'natural_range',
      nodeName,
      nodeId,
      minValue,
      maxValue,
      raw: rangeMatch[0],
      flexibility: 'explicit'
    });
  }

  // 模糊约束：适度、合理、适当
  const vaguePatterns = [
    { regex: /(.+?)(?:可以|可|能够)?(?:适度|适当|合理|小幅|略微|稍微|适当)(?:增加|提高|提升|增长)/, type: 'increase_moderate', direction: 'increase' },
    { regex: /(.+?)(?:可以|可|能够)?(?:适度|适当|合理|小幅|略微|稍微)(?:减少|降低|下降|压缩)/, type: 'decrease_moderate', direction: 'decrease' },
    { regex: /(.+?)(?:控制|保持|维持)(?:在|于)?(?:合理|适当|适度|正常|预算)?(?:范围|水平|区间|之内|以内)?/, type: 'control_range', direction: 'control' },
    { regex: /(.+?)(?:不能|不可|勿|禁止)(?:超过|高于|大于|突破)/, type: 'must_not_exceed', direction: 'limit' },
    { regex: /(.+?)(?:不能|不可|勿|禁止)(?:低于|少于|小于)/, type: 'must_not_below', direction: 'limit' },
    { regex: /(.+?)(?:尽量|力争|争取)(?:减少|降低|压缩|节约)/, type: 'try_reduce', direction: 'decrease' },
    { regex: /(.+?)(?:尽量|力争|争取)(?:增加|提高|提升|扩大)/, type: 'try_increase', direction: 'increase' }
  ];

  for (const pattern of vaguePatterns) {
    const match = lowerText.match(pattern.regex);
    if (match) {
      const nodeName = match[1].trim();
      const nodeId = findNodeId(nodeName, nodes);
      constraints.push({
        type: pattern.type,
        nodeName,
        nodeId,
        raw: match[0],
        direction: pattern.direction,
        flexibility: 'vague',
        aiInstruction: getVagueInstruction(pattern.type)
      });
    }
  }

  // 数值约束（带明确数字）
  const specificPatterns = [
    { regex: /(.+?)(?:增加|提高|提升|增长)(?:至少|最少|最低|不少于)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'increase_at_least' },
    { regex: /(.+?)(?:增加|提高|提升|增长)(?:不超过|最多|最高|不大于)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'increase_at_most' },
    { regex: /(.+?)(?:减少|降低|下降|压缩)(?:至少|最少)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'decrease_at_least' },
    { regex: /(.+?)(?:减少|降低|下降|压缩)(?:不超过|最多)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'decrease_at_most' },
    { regex: /(.+?)(?:必须|务必|需要|要)(?:达到|做到|实现|为)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'must_reach' },
    { regex: /(.+?)(?:不能超过|必须小于|不大于|不超过|控制在)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'max_limit' },
    { regex: /(.+?)(?:不能低于|必须大于|不小于|不低于|至少)\s*([\d.,]+(?:\s*[万亿])?)/, type: 'min_limit' }
  ];

  for (const pattern of specificPatterns) {
    const match = lowerText.match(pattern.regex);
    if (match) {
      const nodeName = match[1].trim();
      const nodeId = findNodeId(nodeName, nodes);
      const value = extractNumber(match[2]);
      constraints.push({
        type: pattern.type,
        nodeName,
        nodeId,
        value,
        raw: match[0],
        flexibility: 'explicit'
      });
    }
  }

  // 百分比约束
  const percentPatterns = [
    { regex: /(.+?)(?:增长|提高|提升|增加)(?:率)?(?:目标|达到)?[:是为\s]*([\d.]+)%/, type: 'growth_target' },
    { regex: /(.+?)(?:下降|降低|减少)(?:率)?(?:目标|达到)?[:是为\s]*([\d.]+)%/, type: 'reduction_target' },
    { regex: /(.+?)(?:不超过|控制在|小于|低于)([\d.]+)%/, type: 'percent_limit' }
  ];

  for (const pattern of percentPatterns) {
    const match = lowerText.match(pattern.regex);
    if (match) {
      const nodeName = match[1].trim();
      const nodeId = findNodeId(nodeName, nodes);
      const percent = parseFloat(match[2]);
      constraints.push({
        type: pattern.type,
        nodeName,
        nodeId,
        percent,
        raw: match[0],
        flexibility: 'explicit'
      });
    }
  }

  return constraints;
};

/**
 * 获取模糊约束的AI指令说明
 * @param {string} type - 约束类型
 * @returns {string} AI指令
 */
const getVagueInstruction = (type) => {
  const instructions = {
    'increase_moderate': '基于历史数据和业务规律，判断"适度"增加的具体范围。考虑因素：历史增长率、行业标准、季节性因素。建议增幅范围：5%-30%',
    'decrease_moderate': '基于历史数据和成本结构，判断"适度"减少的具体范围。考虑因素：成本弹性、运营效率、历史最低水平。建议降幅范围：5%-20%',
    'control_range': '保持在合理范围内，基于历史波动区间和预算目标确定上下限。考虑历史均值±1个标准差',
    'try_reduce': '在不损害核心业务的前提下尽可能优化，给出保守和积极两种方案',
    'try_increase': '在资源允许范围内积极提升，给出合理和激进两种方案'
  };
  return instructions[type] || '基于业务常识和历史数据合理推断';
};

/**
 * 从文本中提取关键业务上下文
 * @param {string} text - 业务背景文本
 * @param {Object} nodes - 所有节点
 * @returns {Object} 提取的业务上下文
 */
export const extractBusinessContext = (text, nodes) => {
  if (!text || !text.trim()) {
    return {
      timeContext: null,
      goals: [],
      constraints: [],
      factors: [],
      summary: ''
    };
  }

  // 提取时间节点
  const timeContext = extractTimeContext(text);

  // 提取业务目标
  const goals = extractBusinessGoals(text);

  // 提取约束
  const constraints = extractNaturalConstraints(text, nodes);

  // 识别涉及的驱动因子
  const factors = [];
  const driverNodes = Object.values(nodes).filter(n => n.type === 'driver');
  const lowerText = text.toLowerCase();

  driverNodes.forEach(node => {
    const aliases = getNodeAliases(node.name);
    if (aliases.some(alias => lowerText.includes(alias.toLowerCase()))) {
      factors.push({
        id: node.id,
        name: node.name,
        currentValue: node.value ?? node.baseline ?? 0,
        mentioned: true
      });
    }
  });

  // 生成摘要
  const summary = generateContextSummary(timeContext, goals, constraints, factors);

  return {
    timeContext,
    goals,
    constraints,
    factors,
    summary,
    rawText: text
  };
};

/**
 * 获取节点的别名
 * @param {string} nodeName - 节点名称
 * @returns {Array} 别名列表
 */
const getNodeAliases = (nodeName) => {
  const aliasMap = {
    '销售费用': ['销售费用', '营销费用', '推广费用', '市场费用', '销售成本'],
    '管理费用': ['管理费用', '管理费', '行政费用', '管理成本'],
    '财务费用': ['财务费用', '财务成本', '利息费用', '利息支出'],
    '营业成本': ['营业成本', '成本', '生产成本', '制造成本'],
    '营业收入': ['营业收入', '收入', '营收', '销售额', '营业额', '销售收入'],
    '净利润': ['净利润', '净利', '利润', '净收益', '收益']
  };
  return aliasMap[nodeName] || [nodeName];
};

/**
 * 生成业务上下文摘要
 * @param {Object} timeContext - 时间上下文
 * @param {Array} goals - 目标列表
 * @param {Array} constraints - 约束列表
 * @param {Array} factors - 涉及的因子
 * @returns {string} 摘要
 */
const generateContextSummary = (timeContext, goals, constraints, factors) => {
  const parts = [];

  if (timeContext?.name) {
    parts.push(`时间：${timeContext.name}`);
  }

  if (goals.length > 0) {
    const goalDescs = goals.map(g => {
      if (g.targetPercent) return `${g.targetFactor || '指标'}${g.direction === 'increase' ? '增长' : '降低'}${g.targetPercent}%`;
      if (g.targetValue) return `${g.targetFactor}达到${g.targetValue}`;
      return g.description;
    });
    parts.push(`目标：${goalDescs.join('、')}`);
  }

  if (constraints.length > 0) {
    const constraintFactors = constraints
      .filter(c => c.nodeName)
      .map(c => c.nodeName);
    if (constraintFactors.length > 0) {
      parts.push(`约束：${constraintFactors.join('、')}需调整`);
    }
  }

  if (factors.length > 0) {
    const factorNames = factors.map(f => f.name);
    parts.push(`涉及：${factorNames.join('、')}`);
  }

  return parts.join(' | ');
};

// ==================== 向后兼容的函数 ====================

/**
 * 从优化目标文本提取目标信息（兼容旧版本）
 * @param {string} text - 用户输入的优化目标
 * @param {Object} nodes - 所有节点
 * @returns {Object} 提取的目标信息
 */
export const extractGoalFromText = (text, nodes) => {
  if (!text || !text.trim()) {
    return { targetNodeId: null, targetNodeName: null, targetValue: null, direction: null };
  }

  const lowerText = text.toLowerCase();

  // 提取目标数值
  const targetValue = extractNumber(text);

  // 提取优化方向
  let direction = 'reach';
  if (lowerText.includes('最大') || lowerText.includes('最高') || lowerText.includes('尽量高')) {
    direction = 'maximize';
  } else if (lowerText.includes('最小') || lowerText.includes('最低') || lowerText.includes('尽量低')) {
    direction = 'minimize';
  } else if (lowerText.includes('超过') || lowerText.includes('大于') || lowerText.includes('至少')) {
    direction = 'exceed';
  }

  // 提取目标指标名称
  let targetNodeName = null;
  const targetPatterns = [
    /(.+?)(?:必须|要|需要|务必|应|应该|得|要)(?:达到|做到|实现|达成|为|等于)(.+)/i,
    /(?:让|使|把)(.+?)(?:达到|做到|实现|达成|为|等于)(.+)/i,
    /(.+?)(?:优化到|调整到|提高到|提升到|增加到|降低到|下降到)(.+)/i,
    /(.+?)(?:超过|大于|不小于|至少|多于)(.+)/i,
    /(?:最大化|最大化|最大化)(.+)/i,
    /(?:最小化|最小化|最小化)(.+)/i,
  ];

  for (const pattern of targetPatterns) {
    const match = text.match(pattern);
    if (match) {
      targetNodeName = match[1].trim();
      targetNodeName = targetNodeName.replace(/^(让|使|把|的|将)/, '').trim();
      break;
    }
  }

  if (!targetNodeName) {
    const keywords = ['净利润', '营业收入', '销售费用', '管理费用', '成本', '毛利率', '净利率', '毛利润'];
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        targetNodeName = keyword;
        break;
      }
    }
  }

  const targetNodeId = targetNodeName ? findNodeId(targetNodeName, nodes) : null;

  return {
    targetNodeId,
    targetNodeName,
    targetValue,
    direction,
    originalText: text
  };
};

/**
 * 从约束文本提取结构化约束（兼容旧版本）
 * @param {string} text - 约束文本
 * @param {Object} nodes - 所有节点
 * @returns {Object} 结构化约束
 */
export const extractConstraintFromText = (text, nodes) => {
  if (!text || !text.trim()) {
    return null;
  }

  // 使用新的自然约束提取
  const naturalConstraints = extractNaturalConstraints(text, nodes);
  if (naturalConstraints.length > 0) {
    const constraint = naturalConstraints[0];
    return {
      raw: text,
      type: constraint.type,
      nodeId: constraint.nodeId,
      nodeName: constraint.nodeName,
      parsed: !!constraint.nodeId,
      ...constraint
    };
  }

  return {
    raw: text,
    type: 'text',
    nodeId: null,
    nodeName: null,
    parsed: false
  };
};

/**
 * 解析完整的调参请求（兼容旧版本）
 * @param {string} goalText - 优化目标文本
 * @param {Array} constraintTexts - 约束条件文本数组
 * @param {Object} nodes - 所有节点
 * @returns {Object} 完整的解析结果
 */
export const parseTuningRequest = (goalText, constraintTexts, nodes) => {
  // 使用新的业务上下文提取
  const businessContext = extractBusinessContext(goalText, nodes);

  // 保持向后兼容
  const goal = extractGoalFromText(goalText, nodes);

  const constraints = (constraintTexts || [])
    .filter(c => c.trim())
    .map(c => extractConstraintFromText(c, nodes));

  const validation = {
    hasGoal: !!goal.targetNodeId || !!goal.targetNodeName || businessContext.goals.length > 0,
    hasTargetValue: goal.targetValue !== null,
    constraintCount: constraints.length,
    parsedConstraintCount: constraints.filter(c => c.parsed).length,
    hasBusinessContext: !!goalText?.trim()
  };

  // 生成AI友好的描述
  const buildAIDescription = () => {
    let desc = '';

    // 添加业务背景
    if (businessContext.summary) {
      desc += `【业务背景】\n${goalText}\n\n`;
      desc += `【关键信息提取】\n${businessContext.summary}\n\n`;
    }

    if (goal.targetNodeName) {
      if (goal.targetValue !== null) {
        const unit = (goal.targetNodeId && nodes[goal.targetNodeId]?.unit) || '';
        desc += `【优化目标】将"${goal.targetNodeName}"`;
        if (goal.direction === 'exceed') {
          desc += `超过 ${goal.targetValue}${unit}`;
        } else if (goal.direction === 'maximize') {
          desc += `最大化`;
        } else if (goal.direction === 'minimize') {
          desc += `最小化`;
        } else {
          desc += `达到 ${goal.targetValue}${unit}`;
        }
      } else {
        desc += `【优化目标】优化"${goal.targetNodeName}"`;
      }
      desc += '\n';
    }

    if (constraints.length > 0) {
      desc += '\n【约束条件】\n';
      constraints.forEach((c, i) => {
        desc += `${i + 1}. ${c.raw}`;
        if (c.parsed && c.nodeName) {
          desc += ` [已识别：${c.nodeName}]`;
        }
        desc += '\n';
      });
    }

    return desc || '请描述您的业务背景和调整目标';
  };

  return {
    goal,
    constraints,
    businessContext,
    validation,
    aiDescription: buildAIDescription(),
    isValid: validation.hasGoal || validation.hasBusinessContext
  };
};

/**
 * 获取解析结果的中文描述
 * @param {Object} parsed - 解析结果
 * @returns {string} 中文描述
 */
export const getParsedDescription = (parsed) => {
  if (!parsed) return '等待输入...';

  const parts = [];

  // 业务上下文摘要
  if (parsed.businessContext?.summary) {
    parts.push(`📝 业务理解：${parsed.businessContext.summary}`);
  }

  // 目标描述
  if (parsed.goal?.targetNodeName) {
    let goalDesc = `🎯 目标指标：${parsed.goal.targetNodeName}`;
    if (parsed.goal.targetValue !== null) {
      goalDesc += ` → ${parsed.goal.targetValue.toLocaleString()}`;
    }
    if (parsed.goal.direction) {
      const dirMap = {
        reach: '达到目标值',
        exceed: '超过目标值',
        maximize: '最大化',
        minimize: '最小化'
      };
      goalDesc += ` (${dirMap[parsed.goal.direction]})`;
    }
    parts.push(goalDesc);
  }

  // 约束描述
  if (parsed.constraints && parsed.constraints.length > 0) {
    const constraintDescs = parsed.constraints.map((c, i) => {
      if (c.parsed && c.nodeName) {
        return `✓ ${c.raw} [识别：${c.nodeName}]`;
      }
      return `? ${c.raw} [未识别]`;
    });
    parts.push(`🔒 约束条件：\n${constraintDescs.join('\n')}`);
  }

  return parts.join('\n\n') || '请输入业务背景和优化目标';
};

/**
 * 检查是否为自然调参模式（新智能模式）
 * @param {string} text - 输入文本
 * @returns {boolean} 是否为自然模式
 */
export const isNaturalTuningMode = (text) => {
  if (!text || text.length < 10) return false;

  // 如果包含多个句子、段落，或有业务背景描述的特征
  const businessKeywords = [
    '公司', '业务', '市场', '销售', '生产', '研发', '财务',
    '计划', '目标', '季度', '年度', 'Q1', 'Q2', 'Q3', 'Q4',
    '增加', '减少', '提高', '降低', '控制', '优化',
    '旺季', '淡季', '周期', '趋势'
  ];

  const lowerText = text.toLowerCase();
  const hasBusinessContext = businessKeywords.some(kw => lowerText.includes(kw.toLowerCase()));

  // 如果文本较长（超过30字）且有业务关键词，认为是自然模式
  return text.length > 30 && hasBusinessContext;
};

export default {
  extractBusinessContext,
  extractGoalFromText,
  extractConstraintFromText,
  parseTuningRequest,
  getParsedDescription,
  isNaturalTuningMode
};
