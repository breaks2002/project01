/**
 * 自然语言理解模块 - 从用户输入提取结构化目标
 * 用于AI调参功能
 */

import { FormulaParser } from '../engine/FormulaParser';

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
    '成本': ['成本', '总成本'],
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
 * 从优化目标文本提取目标信息
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
  let direction = 'reach'; // 默认：达到目标值
  if (lowerText.includes('最大') || lowerText.includes('最高') || lowerText.includes('尽量高')) {
    direction = 'maximize';
  } else if (lowerText.includes('最小') || lowerText.includes('最低') || lowerText.includes('尽量低')) {
    direction = 'minimize';
  } else if (lowerText.includes('超过') || lowerText.includes('大于') || lowerText.includes('至少') || lowerText.includes('不低于')) {
    direction = 'exceed';
  }

  // 提取目标指标名称
  // 模式1："X必须达到Y"、"X要达到Y"、"X需要达到Y"
  const targetPatterns = [
    /(.+?)(?:必须|要|需要|务必|应|应该|得|要)(?:达到|做到|实现|达成|为|等于)(.+)/i,
    /(?:让|使|把)(.+?)(?:达到|做到|实现|达成|为|等于)(.+)/i,
    /(.+?)(?:优化到|调整到|提高到|提升到|增加到|降低到|下降到)(.+)/i,
    /(.+?)(?:超过|大于|不小于|至少|多于)(.+)/i,
    /(?:最大化|最大化|最大化)(.+)/i,
    /(?:最小化|最小化|最小化)(.+)/i,
  ];

  let targetNodeName = null;

  for (const pattern of targetPatterns) {
    const match = text.match(pattern);
    if (match) {
      targetNodeName = match[1].trim();
      // 清理常见前缀
      targetNodeName = targetNodeName.replace(/^(让|使|把|的|将)/, '').trim();
      break;
    }
  }

  // 如果没有匹配到模式，尝试关键词提取
  if (!targetNodeName) {
    // 检查是否包含已知指标关键词
    const keywords = ['净利润', '营业收入', '销售费用', '管理费用', '成本', '毛利率', '净利率', '毛利润'];
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        targetNodeName = keyword;
        break;
      }
    }
  }

  // 查找节点ID
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
 * 从约束文本提取结构化约束
 * @param {string} text - 约束文本
 * @param {Object} nodes - 所有节点
 * @returns {Object} 结构化约束
 */
export const extractConstraintFromText = (text, nodes) => {
  if (!text || !text.trim()) {
    return null;
  }

  const lowerText = text.toLowerCase();
  const result = {
    raw: text,
    type: 'text',
    nodeId: null,
    nodeName: null,
    parsed: false
  };

  // 提取数值
  const value = extractNumber(text);

  // 1. 增加/减少/提高/降低 类约束（必须放在范围约束之前）
  const changePatterns = [
    {
      // 增加不超过 X（X可以是数字，后面可选单位）
      regex: /(.+?)(增加|提高|提升|增长)(?:不超过|不大于|最多|最高)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'increase_max',
      extract: (m) => ({ nodeName: m[1].trim(), amount: extractNumber(m[3]) })
    },
    {
      // 增加至少 X
      regex: /(.+?)(增加|提高|提升|增长)(?:至少|最少|最低|不少于)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'increase_min',
      extract: (m) => ({ nodeName: m[1].trim(), amount: extractNumber(m[3]) })
    },
    {
      // 减少不超过 X
      regex: /(.+?)(减少|降低|下降|缩减)(?:不超过|不大于|最多|最高)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'decrease_max',
      extract: (m) => ({ nodeName: m[1].trim(), amount: extractNumber(m[3]) })
    },
    {
      // 减少至少 X
      regex: /(.+?)(减少|降低|下降|缩减)(?:至少|最少|最低|不少于)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'decrease_min',
      extract: (m) => ({ nodeName: m[1].trim(), amount: extractNumber(m[3]) })
    },
    {
      // 单纯增加/减少 X（没有不超过/至少）
      regex: /(.+?)(增加|提高|提升|增长|减少|降低|下降)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)(?!\s*(?:不超过|不大于|最多|最高|至少|最少|最低|不少于))/i,
      type: 'change_by',
      extract: (m) => {
        const direction = m[2].match(/增加|提高|提升|增长/) ? 1 : -1;
        return { nodeName: m[1].trim(), amount: extractNumber(m[3]) * direction };
      }
    }
  ];

  for (const pattern of changePatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match);
      result.type = pattern.type;
      result.nodeName = extracted.nodeName;
      result.nodeId = findNodeId(extracted.nodeName, nodes);
      result.amount = extracted.amount;
      result.parsed = true;
      return result;
    }
  }

  // 2. 范围约束（不超过/不小于/在...之间）
  // 注意：这些正则要避免匹配已经包含"增加/减少"的文本
  const rangePatterns = [
    {
      // X 不能超过/必须小于/不大于 Y（X后面不能有增加/减少等动词）
      regex: /^(?!.*(?:增加|减少|提高|降低|提升|下降))(.+?)(?:不能超过|必须小于|不大于|不超过|控制在|保持在)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)(?:以内|以下|之内|以下)?/i,
      type: 'max_value',
      extract: (m) => ({ nodeName: m[1].trim(), value: extractNumber(m[2]) })
    },
    {
      // X 不能低于/必须大于/不小于 Y
      regex: /^(?!.*(?:增加|减少|提高|降低|提升|下降))(.+?)(?:不能低于|必须大于|不小于|不低于|至少|最少)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'min_value',
      extract: (m) => ({ nodeName: m[1].trim(), value: extractNumber(m[2]) })
    },
    {
      // X 在 A 到 B 之间
      regex: /^(?!.*(?:增加|减少|提高|降低|提升|下降))(.+?)(?:在|介于|范围|保持|维持)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)\s*(?:到|至|~|－|—|-)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'range',
      extract: (m) => ({
        nodeName: m[1].trim(),
        minValue: extractNumber(m[2]),
        maxValue: extractNumber(m[3])
      })
    }
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match);
      result.type = pattern.type;
      result.nodeName = extracted.nodeName;
      result.nodeId = findNodeId(extracted.nodeName, nodes);

      if (pattern.type === 'range') {
        result.minValue = extracted.minValue;
        result.maxValue = extracted.maxValue;
      } else {
        result.value = extracted.value;
      }
      result.parsed = true;
      return result;
    }
  }

  // 3. 目标达成类约束
  const targetPatterns = [
    {
      regex: /(.+?)(?:必须达到|要达到|需要达到|务必达到)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'must_reach',
      extract: (m) => ({ nodeName: m[1].trim(), value: extractNumber(m[2]) })
    },
    {
      regex: /(.+?)(?:必须超过|要超过|需要超过|务必超过)\s*([\d.,]+(?:\s*[万|亿|千|百万|千万])?)/i,
      type: 'must_exceed',
      extract: (m) => ({ nodeName: m[1].trim(), value: extractNumber(m[2]) })
    }
  ];

  for (const pattern of targetPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match);
      result.type = pattern.type;
      result.nodeName = extracted.nodeName;
      result.nodeId = findNodeId(extracted.nodeName, nodes);
      result.targetValue = extracted.value;
      result.parsed = true;
      return result;
    }
  }

  // 4. 百分比变化约束
  const percentPatterns = [
    {
      regex: /(.+?)(?:增长|提高|提升|增加)(?:率)?(?:不超过|不大于|最多|最高)?([\d.]+)%/i,
      type: 'increase_percent_max',
      extract: (m) => ({ nodeName: m[1].trim(), percent: parseFloat(m[2]) })
    },
    {
      regex: /(.+?)(?:下降|降低|减少)(?:率)?(?:不超过|不大于|最多|最高)?([\d.]+)%/i,
      type: 'decrease_percent_max',
      extract: (m) => ({ nodeName: m[1].trim(), percent: parseFloat(m[2]) })
    },
    {
      regex: /(.+?)(?:增长|提高|提升|增加)(?:率)?([\d.]+)%/i,
      type: 'increase_percent',
      extract: (m) => ({ nodeName: m[1].trim(), percent: parseFloat(m[2]) })
    }
  ];

  for (const pattern of percentPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match);
      result.type = pattern.type;
      result.nodeName = extracted.nodeName;
      result.nodeId = findNodeId(extracted.nodeName, nodes);
      result.percent = extracted.percent;
      result.parsed = true;
      return result;
    }
  }

  // 尝试只提取节点名
  const nodeName = extractNodeName(text, nodes);
  if (nodeName) {
    result.nodeName = nodeName;
    result.nodeId = findNodeId(nodeName, nodes);
  }

  return result;
};

/**
 * 从文本提取节点名称
 * @param {string} text - 文本
 * @param {Object} nodes - 所有节点
 * @returns {string|null} 节点名称
 */
const extractNodeName = (text, nodes) => {
  const nodeNames = Object.values(nodes).map(n => n.name);

  // 按名称长度降序，优先匹配更长的名称
  const sortedNames = nodeNames.sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    if (text.toLowerCase().includes(name.toLowerCase())) {
      return name;
    }
  }

  // 尝试关键词匹配
  const keywords = {
    '净利润': ['净利润', '净利', '利润', '净收益'],
    '营业收入': ['营业收入', '收入', '营收', '销售额', '营业额', '销售收入'],
    '销售费用': ['销售费用', '销售成本', '营销费用', '推广费用', '市场费用'],
    '管理费用': ['管理费用', '管理费', '行政费用', '管理成本'],
    '财务费用': ['财务费用', '财务成本', '利息费用'],
    '成本': ['成本', '总成本', '营业成本'],
    '毛利率': ['毛利率', '毛利'],
    '净利率': ['净利率', '净利润率']
  };

  const lowerText = text.toLowerCase();
  for (const [key, aliases] of Object.entries(keywords)) {
    if (aliases.some(a => lowerText.includes(a))) {
      return key;
    }
  }

  return null;
};

/**
 * 解析完整的调参请求
 * @param {string} goalText - 优化目标文本
 * @param {Array} constraintTexts - 约束条件文本数组
 * @param {Object} nodes - 所有节点
 * @returns {Object} 完整的解析结果
 */
export const parseTuningRequest = (goalText, constraintTexts, nodes) => {
  // 解析目标
  const goal = extractGoalFromText(goalText, nodes);

  // 解析约束
  const constraints = (constraintTexts || [])
    .filter(c => c.trim())
    .map(c => extractConstraintFromText(c, nodes));

  // 验证提取结果
  const validation = {
    hasGoal: !!goal.targetNodeId || !!goal.targetNodeName,
    hasTargetValue: goal.targetValue !== null,
    constraintCount: constraints.length,
    parsedConstraintCount: constraints.filter(c => c.parsed).length
  };

  // 生成AI友好的描述
  const buildAIDescription = () => {
    let desc = '';

    if (goal.targetNodeName) {
      if (goal.targetValue !== null) {
        const unit = goal.targetNodeId && nodes[goal.targetNodeId]?.unit || '';
        desc += `目标：将"${goal.targetNodeName}"`;
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
        desc += `目标：优化"${goal.targetNodeName}"`;
      }
    }

    if (constraints.length > 0) {
      desc += '\n约束条件：';
      constraints.forEach((c, i) => {
        desc += `\n${i + 1}. ${c.raw}`;
        if (c.parsed && c.nodeName) {
          desc += ` [已识别：${c.nodeName}]`;
        }
      });
    }

    return desc;
  };

  return {
    goal,
    constraints,
    validation,
    aiDescription: buildAIDescription(),
    isValid: validation.hasGoal || constraints.length > 0
  };
};

/**
 * 获取解析结果的中文描述
 * @param {Object} parsed - 解析结果
 * @returns {string} 中文描述
 */
export const getParsedDescription = (parsed) => {
  if (!parsed || !parsed.goal) return '等待输入...';

  const parts = [];
  const { goal, constraints } = parsed;

  // 目标描述
  if (goal.targetNodeName) {
    let goalDesc = `🎯 目标指标：${goal.targetNodeName}`;
    if (goal.targetValue !== null) {
      goalDesc += ` → ${goal.targetValue.toLocaleString()}`;
    }
    if (goal.direction) {
      const dirMap = {
        reach: '达到目标值',
        exceed: '超过目标值',
        maximize: '最大化',
        minimize: '最小化'
      };
      goalDesc += ` (${dirMap[goal.direction]})`;
    }
    parts.push(goalDesc);
  } else if (goal.originalText) {
    parts.push(`📝 优化目标：${goal.originalText}`);
  }

  // 约束描述
  if (constraints && constraints.length > 0) {
    const constraintDescs = constraints.map((c, i) => {
      if (c.parsed && c.nodeName) {
        return `✓ ${c.raw} [识别：${c.nodeName}]`;
      }
      return `? ${c.raw} [未识别]`;
    });
    parts.push(`🔒 约束条件：\n${constraintDescs.join('\n')}`);
  }

  return parts.join('\n\n') || '请输入优化目标和约束条件';
};
