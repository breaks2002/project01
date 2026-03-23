/**
 * 特殊约束解析 - 配置化映射表
 * 用于将用户自然语言转换为结构化约束数据
 *
 * 设计原则：
 * 1. 规则引擎优先（处理 90% 标准表达）
 * 2. AI 语义兜底（可选，处理 10% 复杂表达）
 * 3. 完全可配置，易于扩展
 */

// ==================== 动作类型定义 ====================
export const ACTION_TYPES = {
  // 增加类动作
  increase: {
    keywords: ['增加', '增长', '提升', '提高', '拉升', '拉动', '往上拉', '上调'],
    symbols: ['>', '≥', '↑', '>='],
    deltaType: 'add'  // 加法：原值 + delta（用于百分点）
  },

  // 降低类动作
  decrease: {
    keywords: ['降低', '减少', '削减', '压缩', '下降', '下调', '压缩', '缩减'],
    symbols: ['<', '≤', '↓', '<='],
    deltaType: 'multiply'  // 乘法：原值 × (1 - delta)（用于百分比）
  },

  // 允许超出类动作
  allow_override: {
    keywords: ['允许', '可', '可以', '能', '容许'],
    triggerWords: ['超出', '超过', '超支', '超预算', '突破'],
    deltaType: 'max_limit'
  },

  // 控制限制类动作
  control_limit: {
    keywords: ['控制在', '不超过', '最多', '至多', '不大于', '不高于', '封顶', '以内'],
    deltaType: 'cap'
  },

  // 必须达到类动作
  must_reach: {
    keywords: ['必须', '需要', '要', '务必', '力争', '力求'],
    triggerWords: ['达到', '达成', '完成', '实现', '不低于', '不少于'],
    deltaType: 'min_limit'
  },

  // 必须降低类动作
  must_reduce: {
    keywords: ['必须', '需要', '要', '务必', '力争', '力求'],
    triggerWords: ['降低', '减少', '削减', '压缩', '下降'],
    deltaType: 'force_reduce'
  }
};

// ==================== 单位类型定义 ====================
export const UNIT_TYPES = {
  // 百分点（直接加减）
  percentage_point: {
    keywords: ['个百分点', '个点', 'pp', 'PP'],
    conversion: 'direct',  // 直接加减：20% + 5 个百分点 = 25%
    description: '百分点'
  },

  // 百分比（乘法）
  percent: {
    keywords: ['%', '百分之', 'percent'],
    conversion: 'multiply',  // 乘法：20 万 × (1 + 5%) = 21 万
    description: '百分比增幅'
  },

  // 绝对额 - 万
  ten_thousand: {
    keywords: ['万', '万元'],
    conversion: 'absolute_value',
    description: '万元'
  },

  // 绝对额 - 元
  yuan: {
    keywords: ['元', '块钱'],
    conversion: 'absolute_value',
    description: '元'
  },

  // 绝对额 - 百万
  million: {
    keywords: ['百万'],
    conversion: 'absolute_value',
    multiplier: 100,
    description: '百万元'
  },

  // 绝对额 - 亿
  hundred_million: {
    keywords: ['亿', '亿元'],
    conversion: 'absolute_value',
    multiplier: 10000,
    description: '亿元'
  }
};

// ==================== 因子别名表 ====================
// 用于模糊匹配，解决用户输入与模型因子名称不一致的问题
// 注意：别名必须是真正的同义词，不能是相似但不同的指标（如"毛利率"≠"毛利润"）
export const FACTOR_ALIASES = {
  // 财务指标
  '毛利率': ['毛利点', '毛利%', '盈利点', '毛利率%'],  // 删除"利润率"（可能指净利润率）
  '毛利润': ['毛利', '毛利润额'],  // 删除"毛利率"（这是不同的指标！）
  '营业收入': ['收入', '营收', '销售额', '营业额', '销售收入'],
  '净利润': ['利润', '净利', '纯利润', '赚钱', '利润额'],
  '营业成本': ['成本', '营业成本', '直接成本', '生产成本'],
  '销售费用': ['销售费', '推广费', '广告费', '市场费用', '营销费用'],
  '管理费用': ['管理费', '行政费', '办公费', '管理费用'],
  '研发费用': ['研发费', '开发费', '技术研究费', '研发支出'],
  '财务费用': ['财务费', '利息支出', '融资费用'],

  // 人力指标
  '人力成本': ['人工成本', '工资', '薪酬', '人工费', '人力费用'],
  '人均效能': ['人效', '人均产出', '人均贡献', '人均利润'],
  '员工总数': ['员工数', '人数', '团队规模', '人员数量'],

  // 生产指标
  '产能': ['产量', '生产能力', '产出量'],
  '良率': ['良品率', '合格率', '质量合格率'],
  '生产效率': ['效率', '产出效率', '单位时间产出']
};

// ==================== 特殊约束模式定义 ====================
/**
 * 每个模式包含：
 * - patterns: 正则模板数组（支持多种词序）
 * - action: 动作类型
 * - unitPriority: 单位匹配优先级（用于解决歧义）
 */
export const CONSTRAINT_PATTERNS = {
  // 1. 允许超出/超过
  allow_override: {
    type: 'max_override',
    action: 'allow_override',
    patterns: [
      // 因子在前：管理费用允许超出 10%
      '{factor}.*?{keywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      // 允许在前：允许管理费用超出 10%
      '{keywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      // 符号格式：管理费用>100 万
      '{factor}\\s*[>≥].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point' || unitType === 'percent') {
        return { max: value / 100 };
      }
      return { maxValue: value };
    }
  },

  // 2. 控制在/不超过
  control_limit: {
    type: 'max_limit',
    action: 'control_limit',
    patterns: [
      // 因子在前：管理费用控制在 100 万
      '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      // 关键词在前：控制在管理费用 100 万 - 限制数字必须在因子附近（不能有逗号）
      '{keywords}\\s*{factor}[^,，。]*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point' || unitType === 'percent') {
        return { max: value / 100 };
      }
      return { maxValue: value };
    }
  },

  // 3. 增加/增长（需要区分百分点和百分比）
  increase: {
    type: 'min_increase',
    action: 'increase',
    patterns: [
      // 因子在前：毛利率增加 5 个百分点
      '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      // 关键词在前：增加毛利率 5 个百分点 - 限制数字必须在因子附近（不能有逗号）
      '{keywords}\\s*{factor}[^,，。]*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point') {
        // 百分点：直接加
        return { min: value / 100, unit: 'percentage_point' };
      } else if (unitType === 'percent') {
        // 百分比增幅
        return { min: value / 100, unit: 'percent' };
      }
      // 绝对额
      return { minValue: value };
    }
  },

  // 4. 降低/减少
  decrease: {
    type: 'max_decrease',
    action: 'decrease',
    patterns: [
      '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{keywords}.*?{factor}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{factor}\\s*[<≤↓].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point') {
        return { max: -value / 100, unit: 'percentage_point' };
      } else if (unitType === 'percent') {
        return { max: -value / 100, unit: 'percent' };
      }
      return { maxValue: -value };
    }
  },

  // 5. 必须降低/力求降低
  must_reduce: {
    type: 'force_reduce',
    action: 'must_reduce',
    patterns: [
      '{factor}.*?{actionKeywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{actionKeywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point' || unitType === 'percent') {
        return { max: -value / 100 };
      }
      return { maxValue: -value };
    }
  },

  // 6. 必须达到/至少达到
  must_reach: {
    type: 'min_force',
    action: 'must_reach',
    patterns: [
      '{factor}.*?{actionKeywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{actionKeywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{factor}.*?至少.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
      '{factor}.*?不低于.*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
    ],
    valueTransform: (value, unitType) => {
      if (unitType === 'percentage_point' || unitType === 'percent') {
        return { min: value / 100 };
      }
      return { minValue: value };
    }
  },

  // 7. 在±X% 范围内调整
  range_adjust: {
    type: 'custom_range',
    action: 'range',
    patterns: [
      '{factor}[允许可以]?[在 ±]?(\\d+(?:\\.\\d+)?)\\s*%[范内]?围 [内中]?调 [整节]'
    ],
    valueTransform: (value) => {
      return { min: -value / 100, max: value / 100 };
    }
  },

  // 8. 控制在 X 万以内（绝对额）
  absolute_max: {
    type: 'absolute_max',
    action: 'cap',
    patterns: [
      '{factor}[控制保]?[持在]?\\s*(\\d+(?:\\.\\d+)?)\\s*万 [以内下]',
      '{factor}.*?控制在.*?(\\d+(?:\\.\\d+)?)\\s*万'
    ],
    valueTransform: (value) => {
      return { maxValue: value };
    }
  },

  // 9. 至少达到 X 万（绝对额）
  absolute_min: {
    type: 'absolute_min',
    action: 'min_absolute',
    patterns: [
      '{factor}[至少最]?[达至]?\\s*(\\d+(?:\\.\\d+)?)\\s*万'
    ],
    valueTransform: (value) => {
      return { minValue: value };
    }
  },

  // 10. 不惜代价削减
  no_limit_reduce: {
    type: 'no_limit',
    action: 'no_limit',
    patterns: [
      '[不惜无论] 代价 [削减降].*?{factor}',
      '[削减降].*?{factor}.*?[不惜无论] 代价'
    ],
    valueTransform: () => {
      return { min: -1, max: 0 };  // 只允许降低，无下限
    }
  },

  // 11. 保持稳定
  keep_stable: {
    type: 'stable',
    action: 'stable',
    patterns: [
      '[尽量尽] 可能？保持{factor}[稳稳]?定',
      '{factor}.*?[尽量尽] 可能？[稳稳]?定'
    ],
    valueTransform: () => {
      return { min: -0.05, max: 0.05 };  // ±5%
    }
  }
};

// ==================== 工具函数 ====================

/**
 * 将关键词数组转换为正则 OR 表达式
 * @param {string[]} keywords - 关键词数组
 * @returns {string} 正则 OR 字符串
 */
export const keywordsToRegex = (keywords) => {
  return keywords.join('|');
};

/**
 * 生成因子的所有匹配名称（包括别名）
 * @param {string} canonicalName - 标准因子名称
 * @returns {string[]} 所有匹配名称
 */
export const getAllFactorNames = (canonicalName) => {
  const aliases = FACTOR_ALIASES[canonicalName] || [];
  return [canonicalName, ...aliases];
};

/**
 * 根据因子名称查找标准名称（反向查找别名表）
 * @param {string} inputName - 用户输入的因子名称
 * @returns {string|null} 标准因子名称
 */
export const findCanonicalFactorName = (inputName) => {
  for (const [canonical, aliases] of Object.entries(FACTOR_ALIASES)) {
    if (inputName === canonical || aliases.includes(inputName)) {
      return canonical;
    }
  }
  // 尝试模糊匹配（包含匹配）
  for (const [canonical, aliases] of Object.entries(FACTOR_ALIASES)) {
    if (canonical.includes(inputName) || aliases.some(a => a.includes(inputName))) {
      return canonical;
    }
  }
  return null;
};

/**
 * 判断单位类型优先级（用于解决歧义）
 * 例如："5 个点"可能是百分点或百分比
 * @param {string} unitKeyword - 匹配到的单位关键词
 * @returns {string} 单位类型
 */
export const resolveUnitType = (unitKeyword) => {
  if (!unitKeyword) return 'percent';  // 默认百分比

  const unit = unitKeyword.trim().toLowerCase();

  // 明确匹配
  for (const [type, config] of Object.entries(UNIT_TYPES)) {
    if (config.keywords.some(k => k.toLowerCase() === unit || unit.includes(k.toLowerCase()))) {
      return type;
    }
  }

  // 模糊匹配
  if (unit.includes('个点') || unit === 'pp') {
    return 'percentage_point';
  }
  if (unit === '%' || unit.includes('%')) {
    return 'percent';
  }
  if (unit.includes('万')) {
    return 'ten_thousand';
  }
  if (unit.includes('元')) {
    return 'yuan';
  }

  return 'percent';  // 默认百分比
};

/**
 * 计算目标值（考虑单位类型）
 * @param {number} currentValue - 当前值
 * @param {number} value - 用户输入的数值
 * @param {string} unitType - 单位类型
 * @returns {Object} { targetValue, changePercent }
 */
export const calculateTargetValue = (currentValue, value, unitType) => {
  let targetValue;
  let changePercent;

  switch (unitType) {
    case 'percentage_point':
      // 百分点：直接加减
      targetValue = currentValue + value;
      changePercent = currentValue !== 0 ? (targetValue - currentValue) / currentValue : 0;
      break;

    case 'percent':
      // 百分比增幅：乘法
      targetValue = currentValue * (1 + value / 100);
      changePercent = value / 100;
      break;

    case 'ten_thousand':
    case 'yuan':
    case 'million':
    case 'hundred_million':
      // 绝对额
      const multiplier = UNIT_TYPES[unitType].multiplier || 1;
      targetValue = value * multiplier;
      changePercent = currentValue !== 0 ? (targetValue - currentValue) / currentValue : 0;
      break;

    default:
      targetValue = currentValue * (1 + value / 100);
      changePercent = value / 100;
  }

  return {
    targetValue: Math.round(targetValue * 100) / 100,
    changePercent: Math.round(changePercent * 100 * 100) / 100
  };
};

/**
 * 生成约束描述
 * @param {string} factorName - 因子名称
 * @param {string} actionType - 动作类型
 * @param {number} value - 数值
 * @param {string} unitType - 单位类型
 * @returns {string} 描述文本
 */
export const generateConstraintDescription = (factorName, actionType, value, unitType) => {
  const unitDesc = UNIT_TYPES[unitType]?.description || '';

  const actionDescriptions = {
    allow_override: `允许${factorName}超出目标${value}${unitDesc}`,
    control_limit: `${factorName}不超过${value}${unitDesc}`,
    increase: `${factorName}增加${value}${unitDesc}`,
    decrease: `${factorName}降低${value}${unitDesc}`,
    must_reduce: `${factorName}必须降低${value}${unitDesc}`,
    must_reach: `${factorName}至少达到${value}${unitDesc}`,
    range: `允许${factorName}在±${value}${unitDesc}范围内调整`,
    absolute_max: `${factorName}控制在${value}${unitDesc}以内`,
    absolute_min: `${factorName}至少达到${value}${unitDesc}`,
    no_limit: `不惜代价削减${factorName}`,
    stable: `尽量保持${factorName}稳定`
  };

  return actionDescriptions[actionType] || `${factorName}调整${value}${unitDesc}`;
};

// ==================== 默认配置 ====================
export const DEFAULT_AI_FALLBACK_CONFIG = {
  enabled: true,              // 默认启用 AI 兜底
  timeout: 5000,              // 超时 5 秒
  showLoading: true,          // 显示加载动画
  maxRetries: 1,              // 重试 1 次
  costWarning: true,          // 显示成本提示
  threshold: 0.7              // 规则匹配置信度低于此值时使用 AI
};
