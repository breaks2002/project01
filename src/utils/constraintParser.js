/**
 * 特殊约束解析引擎 - 配置化规则引擎 + AI 兜底
 *
 * 架构设计：
 * 1. 规则引擎优先（处理 90% 标准表达）
 * 2. AI 语义兜底（可选，处理 10% 复杂表达）
 * 3. 完全可配置，易于扩展
 */

import {
  ACTION_TYPES,
  UNIT_TYPES as DEFAULT_UNIT_TYPES,
  FACTOR_ALIASES,
  resolveUnitType,
  generateConstraintDescription,
  DEFAULT_AI_FALLBACK_CONFIG,
  CONSTRAINT_PATTERNS as DEFAULT_CONSTRAINT_PATTERNS
} from './constraintPatterns';

/**
 * 从 localStorage 加载用户配置的单位，如果不存在则使用默认单位
 */
const loadUnits = () => {
  try {
    const savedUnits = localStorage.getItem('vdt_constraint_units');
    if (savedUnits) {
      const units = JSON.parse(savedUnits);
      console.log('[单位引擎] 从 localStorage 加载了', units.length, '个用户单位');

      // 将用户单位转换为 UNIT_TYPES 格式
      const unitTypes = {};
      units.forEach(unit => {
        if (unit.enabled !== false) {
          unitTypes[unit.id] = {
            keywords: unit.keywords,
            conversion: unit.type === 'ratio' ? 'multiply' : 'absolute_value',
            multiplier: unit.multiplier,
            description: unit.name
          };
        }
      });

      // 如果没有用户单位，使用默认单位
      if (Object.keys(unitTypes).length === 0) {
        console.log('[单位引擎] 没有用户单位，使用默认单位');
        return DEFAULT_UNIT_TYPES;
      }

      return unitTypes;
    }
  } catch (err) {
    console.error('[单位引擎] 加载用户单位失败:', err);
  }

  console.log('[单位引擎] 使用默认单位');
  return DEFAULT_UNIT_TYPES;
};

/**
 * 从 localStorage 加载用户配置的规则，如果不存在则使用默认规则
 */
const loadConstraintPatterns = () => {
  try {
    const savedRules = localStorage.getItem('vdt_constraint_rules');
    if (savedRules) {
      const rules = JSON.parse(savedRules);
      console.log('[规则引擎] 从 localStorage 加载了', rules.length, '条用户规则');

      // 将用户规则转换为 CONSTRAINT_PATTERNS 格式
      const patterns = {};
      rules.forEach(rule => {
        if (!rule.enabled) return; // 跳过禁用的规则

        // 直接使用用户规则中的关键词和 triggerWords
        const actionKeywords = rule.keywords || [];
        const triggerWords = rule.triggerWords || [];

        console.log(`[规则引擎] 加载规则：${rule.name}, actionType: ${rule.actionType}, keywords: ${actionKeywords.join(',')}, triggerWords: ${triggerWords.join(',')}`);
        console.log(`[规则引擎] 规则完整数据:`, rule);

        // 根据 actionType 获取 pattern 模板和价值转换函数
        const patternConfig = getPatternConfigForActionType(rule.actionType);
        if (patternConfig) {
          console.log(`[规则引擎] 获取 patternConfig 成功，patterns 数量：${patternConfig.patterns.length}`);
          patterns[rule.id] = {
            ...patternConfig,
            type: rule.actionType,
            action: getActionForActionType(rule.actionType),
            // 使用用户规则的关键词
            _userKeywords: actionKeywords,
            _userTriggerWords: triggerWords
          };
        } else {
          console.warn(`[规则引擎] 未找到 actionType="${rule.actionType}"的 pattern 配置`);
        }
      });

      // 如果没有用户规则，使用默认规则
      if (Object.keys(patterns).length === 0) {
        console.log('[规则引擎] 没有用户规则，使用默认规则');
        return DEFAULT_CONSTRAINT_PATTERNS;
      }

      return patterns;
    }
  } catch (err) {
    console.error('[规则引擎] 加载用户规则失败:', err);
  }

  console.log('[规则引擎] 使用默认规则');
  return DEFAULT_CONSTRAINT_PATTERNS;
};

/**
 * 根据 actionType 获取 pattern 配置
 */
const getPatternConfigForActionType = (actionType) => {
  const configMap = {
    max_override: {
      patterns: [
        '{factor}.*?{keywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{keywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}\\s*[>≥].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point' || unitType === 'percent') {
          return { max: value / 100, constraintType: 'max_relative' };
        }
        return { maxValue: value, constraintType: 'max_absolute' };
      }
    },
    max_limit: {
      patterns: [
        '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{keywords}.*?{factor}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}\\s*[≤<].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point' || unitType === 'percent') {
          return { max: value / 100, constraintType: 'max_relative' };
        }
        return { maxValue: value, constraintType: 'max_absolute' };
      }
    },
    increase: {
      patterns: [
        '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{keywords}.*?{factor}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}\\s*[>≥↑].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point') {
          // 百分点：直接加减，例如从 50% → 55%
          return { delta: value / 100, deltaType: 'percentage_point', constraintType: 'delta_point' };
        } else if (unitType === 'percent') {
          // 百分比增幅：乘法，例如 50% × (1+5%) = 52.5%
          return { delta: value / 100, deltaType: 'percent', constraintType: 'delta_percent' };
        }
        return { minValue: value, constraintType: 'min_absolute' };
      }
    },
    decrease: {
      patterns: [
        '{factor}.*?{keywords}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{keywords}.*?{factor}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}\\s*[<≤↓].*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point') {
          return { delta: -value / 100, deltaType: 'percentage_point', constraintType: 'delta_point' };
        } else if (unitType === 'percent') {
          return { delta: -value / 100, deltaType: 'percent', constraintType: 'delta_percent' };
        }
        return { maxValue: -value, constraintType: 'max_absolute' };
      }
    },
    must_reduce: {
      patterns: [
        '{factor}.*?{actionKeywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{actionKeywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point' || unitType === 'percent') {
          return { max: -value / 100, constraintType: 'max_relative' };
        }
        return { maxValue: -value, constraintType: 'max_absolute' };
      }
    },
    must_reach: {
      patterns: [
        '{factor}.*?{actionKeywords}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{actionKeywords}.*?{factor}.*?{trigger}.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}.*?至少.*?(\\d+(?:\\.\\d+)?)\\s*{unit}',
        '{factor}.*?不低于.*?(\\d+(?:\\.\\d+)?)\\s*{unit}'
      ],
      valueTransform: (value, unitType) => {
        if (unitType === 'percentage_point' || unitType === 'percent') {
          return { min: value / 100, constraintType: 'min_relative' };
        }
        return { minValue: value, constraintType: 'min_absolute' };
      }
    }
  };

  return configMap[actionType] || null;
};

/**
 * 根据 actionType 获取 action
 */
const getActionForActionType = (actionType) => {
  const actionMap = {
    max_override: 'allow_override',
    max_limit: 'control_limit',
    increase: 'increase',
    decrease: 'decrease',
    must_reduce: 'must_reduce',
    must_reach: 'must_reach'
  };
  return actionMap[actionType] || 'control_limit';
};

/**
 * 检查用户输入是否包含动作关键词（增强版：避免误匹配，如"控制在"中的"在"）
 * @param {string} context - 用户输入
 * @param {string[]} actionKeywords - 动作关键词列表
 * @param {string[]} triggerWords - 触发词列表
 * @returns {boolean} 是否包含
 */
const containsActionKeywords = (context, actionKeywords, triggerWords) => {
  if (actionKeywords.length === 0 && triggerWords.length === 0) return false;

  const combined = [...actionKeywords, ...triggerWords];

  // 使用正则表达式进行完整词匹配，避免部分匹配
  // 例如："控制在"不应该匹配"在"，"增加到"不应该匹配"到"
  for (const kw of combined) {
    // 对于单字词，需要更严格的匹配 - 必须单独出现或者是动作词的核心
    if (kw.length === 1) {
      // 单字词（如"要"）需要是独立的动作词，不能是其他词的一部分
      // 匹配：单独使用的"要"（如"要达到"），不匹配："控制在"中的"在"
      const wordBoundaryPattern = new RegExp(`(^|[^a-zA-Z\\u4e00-\\u9fa5])${kw}(?=[^a-zA-Z\\u4e00-\\u9fa5]|$|达到|完成|实现)`, 'i');
      if (wordBoundaryPattern.test(context)) {
        console.log(`[关键词检查] 匹配到单字词：${kw}`);
        return true;
      }
    } else {
      // 多字词（2 字及以上）直接匹配，因为不太可能是其他词的一部分
      if (context.toLowerCase().includes(kw.toLowerCase())) {
        console.log(`[关键词检查] 匹配到多字词：${kw}`);
        return true;
      }
    }
  }

  console.log(`[关键词检查] 未匹配到任何动作词，actionKeywords=${actionKeywords.join(',')}, triggerWords=${triggerWords.join(',')}`);
  return false;
};

/**
 * 规则引擎解析
 */
const parseWithRules = (context, driverNodes, customPatterns = null) => {
  const ruleConstraints = [];

  console.log('[规则引擎] 开始解析，因子数量:', driverNodes.length);
  console.log('[规则引擎] 因子列表:', driverNodes.map(n => n.name).join(', '));
  console.log('[规则引擎] 用户输入:', context);

  // 同时遍历驱动因子和计算指标（因为用户可能说"毛利率增加 5%"）
  const allNodes = [...driverNodes];
  console.log('[规则引擎] 所有节点（含计算指标）:', allNodes.map(n => n.name).join(', '));

  // 使用自定义规则或加载用户规则
  const patterns = customPatterns || loadConstraintPatterns();

  // 用于去重的 Set（基于 factorId + type + value 的组合）
  const seenConstraints = new Set();

  // 遍历所有约束模式
  for (const [patternName, patternConfig] of Object.entries(patterns)) {
    // 遍历所有因子（包括别名）
    allNodes.forEach(node => {
      const canonicalName = node.name;
      // 获取因子的所有匹配名称（标准名 + 别名）
      const allNames = [canonicalName, ...(FACTOR_ALIASES[canonicalName] || [])];

      // 【关键修复】检查用户输入是否包含此因子的任何名称（标准名或别名）
      // 使用更精确的匹配：因子名称必须是完整的词，不能是其他词的一部分
      // 例如："毛利" 不应该匹配 "毛利率"，"管理费" 不应该匹配 "管理费用"
      const factorMatchedName = allNames.find(name => {
        if (context.includes(name)) {
          // 对于短别名（2 字及以下），需要更严格的边界检查
          if (name.length <= 2) {
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // 检查前后是否也是中文字符（如果是，说明是其他词的一部分）
            const wordBoundaryRegex = new RegExp(`(^|[^\u4e00-\u9fa5])${escapedName}([^\u4e00-\u9fa5]|$)`, 'i');
            return wordBoundaryRegex.test(context);
          }
          // 3 字及以上直接认为匹配
          return true;
        }
        return false;
      });
      if (!factorMatchedName) {
        console.log(`[规则引擎] 跳过因子 ${canonicalName} - 用户输入不包含此因子名称`);
        return; // 跳过此因子的所有规则
      }
      console.log(`[规则引擎] 因子 ${canonicalName} 匹配成功，使用名称：${factorMatchedName}`);

      allNames.forEach(factorName => {
        // 优先使用用户规则中的关键词，否则从 ACTION_TYPES 获取
        const actionKeywords = patternConfig._userKeywords || ACTION_TYPES[patternConfig.action]?.keywords || [];
        const triggerWords = patternConfig._userTriggerWords || ACTION_TYPES[patternConfig.action]?.triggerWords || [];
        const symbols = ACTION_TYPES[patternConfig.action]?.symbols || [];

        // 【关键修复】动作词验证 - 只有当用户输入中包含动作关键词时才匹配
        // 防止规则爆炸：例如用户说"毛利率增加 5%"，不会匹配到"毛利润至少 100 万"
        if (!containsActionKeywords(context, actionKeywords, triggerWords)) {
          console.log(`[规则引擎] 跳过规则 ${patternName}（因子=${factorName}）- 用户输入不包含动作关键词`);
          return; // 跳过此规则的匹配
        }

        // 检查 pattern 是否包含 {unit} 占位符
        const hasUnitPlaceholder = patternConfig.patterns.some(p => p.includes('{unit}'));

        if (!hasUnitPlaceholder) {
          // 不包含 {unit} 的 pattern（如 absolute_max），直接匹配
          patternConfig.patterns.forEach(patternTemplate => {
            // 关键词需要添加括号分组，避免 OR 优先级问题
            const keywordsGroup = actionKeywords.length > 0 ? `(?:${actionKeywords.join('|')})` : '';
            const triggerGroup = triggerWords.length > 0 ? `(?:${triggerWords.join('|')})` : '';
            const actionKeywordsGroup = (actionKeywords.length > 0 || triggerWords.length > 0) ? `(?:${[...actionKeywords, ...triggerWords].join('|')})` : '';

            let pattern = patternTemplate
              .replace('{factor}', escapeRegex(factorName))
              .replace('{keywords}', keywordsGroup)
              .replace('{trigger}', triggerGroup)
              .replace('{actionKeywords}', actionKeywordsGroup);

            const regex = new RegExp(pattern, 'i');
            console.log(`[规则引擎] 尝试匹配（无单位）：因子=${factorName}, 规则=${patternName}, pattern=${pattern}`);
            const match = context.match(regex);

            if (match && match[1]) {
              const value = parseFloat(match[1]);
              // 从 pattern 中提取单位信息
              let unitTypeResolved = 'ten_thousand'; // 默认为"万"
              if (pattern.includes('万')) unitTypeResolved = 'ten_thousand';
              if (pattern.includes('亿')) unitTypeResolved = 'hundred_million';
              if (pattern.includes('百分比') || pattern.includes('%')) unitTypeResolved = 'percent';

              console.log(`[规则引擎] 匹配成功（无单位占位符）！因子：${factorName}, 模式：${patternName}, 值：${value}, 单位：${unitTypeResolved}`);
              console.log(`[规则引擎] 完整匹配：${match[0]}`);

              // 转换约束值
              const constraint = patternConfig.valueTransform(value, unitTypeResolved);

              ruleConstraints.push({
                factorId: node.id,
                factorName: canonicalName,
                matchedName: factorName,
                type: patternConfig.type,
                action: patternConfig.action,
                value: value,
                unitType: unitTypeResolved,
                unit: unitTypeResolved === 'ten_thousand' ? '万' : unitTypeResolved,
                description: generateConstraintDescription(canonicalName, patternConfig.action, value, unitTypeResolved),
                constraint: constraint,
                source: 'rule',
                isComputed: node.type === 'computed'
              });
            }
          });
        } else {
          // 包含 {unit} 的 pattern，遍历所有单位类型
          const units = loadUnits(); // 加载用户配置的单位
          for (const [unitType, unitConfig] of Object.entries(units)) {
            unitConfig.keywords.forEach(unitKeyword => {
              // 动态生成正则
              patternConfig.patterns.forEach(patternTemplate => {
                // 关键词需要添加括号分组，避免 OR 优先级问题
                const keywordsGroup = actionKeywords.length > 0 ? `(?:${actionKeywords.join('|')})` : '';
                const triggerGroup = triggerWords.length > 0 ? `(?:${triggerWords.join('|')})` : '';
                const actionKeywordsGroup = (actionKeywords.length > 0 || triggerWords.length > 0) ? `(?:${[...actionKeywords, ...triggerWords].join('|')})` : '';

                let pattern = patternTemplate
                  .replace('{factor}', escapeRegex(factorName))
                  .replace('{keywords}', keywordsGroup)
                  .replace('{trigger}', triggerGroup)
                  .replace('{actionKeywords}', actionKeywordsGroup)
                  .replace('{unit}', escapeRegex(unitKeyword));

                // 如果有符号，添加符号匹配
                if (symbols.length > 0) {
                  pattern = pattern.replace(/[>≥]/g, `[${symbols.map(escapeRegex).join('')}>≥]`);
                  pattern = pattern.replace(/[<≤]/g, `[${symbols.map(escapeRegex).join('')}<≤]`);
                }

                const regex = new RegExp(pattern, 'i');
                console.log(`[规则引擎] 尝试匹配（有单位）：因子=${factorName}, 规则=${patternName}, 单位=${unitKeyword}, pattern=${pattern}`);
                const match = context.match(regex);

                if (match && match[1]) {
                  const value = parseFloat(match[1]);
                  const unitTypeResolved = resolveUnitType(unitKeyword);

                  console.log(`[规则引擎] 匹配成功！因子：${factorName}, 模式：${patternName}, 值：${value}, 单位：${unitTypeResolved}`);
                  console.log(`[规则引擎] 完整匹配：${match[0]}`);
                  console.log(`[规则引擎] 捕获组 1: ${match[1]}`);
                  console.log(`[规则引擎] 单位关键词：${unitKeyword}`);

                  // 转换约束值
                  const constraint = patternConfig.valueTransform(value, unitTypeResolved);

                  // 【关键修复】去重检查 - 基于 factorId + type + value 的组合
                  const constraintKey = `${node.id}|${patternConfig.type}|${value}|${unitKeyword}`;
                  if (seenConstraints.has(constraintKey)) {
                    console.log(`[规则引擎] 跳过重复约束：${constraintKey}`);
                    return;
                  }
                  seenConstraints.add(constraintKey);

                  ruleConstraints.push({
                    factorId: node.id,
                    factorName: canonicalName,  // 使用标准名称
                    matchedName: factorName,    // 记录匹配到的名称
                    type: patternConfig.type,
                    action: patternConfig.action,
                    value: value,
                    unitType: unitTypeResolved,
                    unit: unitKeyword,
                    description: generateConstraintDescription(canonicalName, patternConfig.action, value, unitTypeResolved),
                    constraint: constraint,
                    source: 'rule',
                    isComputed: node.type === 'computed'  // 标记是否为计算指标
                  });
                }
              });
            });
          }
        }
      });
    });
  }

  // 全局约束："所有费用必须降低 X%"
  const globalReduce = context.match(/所有费用必须 [减降] 低 [至到]?(\d+(?:\.\d+)?)\s*%/);
  if (globalReduce) {
    const expenseNodes = driverNodes.filter(n => /费用 | 成本 | 支出/i.test(n.name));
    expenseNodes.forEach(node => {
      ruleConstraints.push({
        factorId: node.id,
        factorName: node.name,
        type: 'global_reduce',
        value: -parseFloat(globalReduce[1]),
        description: `所有费用必须降低${globalReduce[1]}%`,
        constraint: { min: -parseFloat(globalReduce[1]) / 100 },
        source: 'rule'
      });
    });
  }

  return ruleConstraints;
};

/**
 * AI 语义兜底解析
 */
const parseWithAI = async (context, allNodes, aiConfig, callAIFunction) => {
  try {
    console.log('[AI 兜底] 开始调用 AI 语义解析...');
    console.log('[AI 兜底] aiConfig:', aiConfig);

    // 构建 AI Prompt - 包含所有节点（驱动因子 + 计算指标）
    const factorList = allNodes.map(n => n.name).join(', ');
    const aiPrompt = {
      system: `你是一个语义解析助手，负责将用户的自然语言约束转换为结构化数据。

请识别以下内容：
1. factorName: 用户提到的因子名称（从以下列表中选择：${factorList}）
2. action: 动作类型（increase=增加/增长/提升，decrease=降低/减少/削减，allow_override=允许超出，control_limit=控制在/不超过）
3. value: 数值
4. unit: 单位类型（percentage_point=百分点，percent=百分比，ten_thousand=万，yuan=元）

重要：
- "增加 5 个百分点" → action: "increase", value: 5, unit: "percentage_point"
- "增加 5%" → action: "increase", value: 5, unit: "percent"
- "控制在 100 万" → action: "control_limit", value: 100, unit: "ten_thousand"
- "毛利率增加 5 个百分点" → 如果是百分比指标，直接加 5

返回 JSON 数组格式，不要多余解释。`,
      user: context
    };

    // 注意：callAI 的参数顺序是 (config, messages)
    // 将 aiPrompt 转换为标准 messages 数组格式
    const messages = [
      { role: 'system', content: aiPrompt.system },
      { role: 'user', content: aiPrompt.user }
    ];
    const aiResponse = await callAIFunction(aiConfig, messages);
    console.log('[AI 兜底] AI 响应:', aiResponse);

    // 解析 AI 响应 - aiResponse 已经是 {content, usage} 格式
    let aiConstraints;
    try {
      // 从 content 字段提取 JSON
      const content = typeof aiResponse === 'string' ? aiResponse : aiResponse.content;
      const cleanedResponse = content.replace(/```json\s*|\s*```/g, '').trim();
      aiConstraints = JSON.parse(cleanedResponse);
    } catch (parseErr) {
      console.error('[AI 兜底] JSON 解析失败:', parseErr);
      console.log('[AI 兜底] 原始响应:', aiResponse);
      throw new Error('AI 返回格式错误');
    }

    // 转换 AI 约束为内部格式
    const transformedConstraints = aiConstraints.map(aiC => {
      // 在所有节点中查找（包括计算指标）
      const node = allNodes.find(n =>
        n.name === aiC.factorName ||
        (FACTOR_ALIASES[n.name] || []).includes(aiC.factorName)
      );

      if (!node) {
        console.warn('[AI 兜底] 未找到匹配的因子:', aiC.factorName);
        return null;
      }

      const constraintMap = {
        increase: { type: 'min_increase', constraint: { min: aiC.value / 100 } },
        decrease: { type: 'max_decrease', constraint: { max: -aiC.value / 100 } },
        allow_override: { type: 'max_override', constraint: { max: aiC.value / 100 } },
        control_limit: { type: 'max_limit', constraint: { max: aiC.value / 100 } },
        must_reduce: { type: 'force_reduce', constraint: { max: -aiC.value / 100 } },
        must_reach: { type: 'min_force', constraint: { min: aiC.value / 100 } }
      };

      const { type, constraint } = constraintMap[aiC.action] || {};

      return {
        factorId: node.id,
        factorName: node.name,
        type: type,
        value: aiC.value,
        unitType: aiC.unit || 'percent',
        description: generateConstraintDescription(node.name, aiC.action, aiC.value, aiC.unit || 'percent'),
        constraint: constraint,
        source: 'ai'
      };
    }).filter(Boolean);

    console.log('[AI 兜底] 转换后的约束:', transformedConstraints);
    return transformedConstraints;

  } catch (aiErr) {
    console.error('[AI 兜底] 失败:', aiErr.message);
    return [];
  }
};

/**
 * 转义正则表达式特殊字符
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * 解析特殊约束（主函数）
 * @param {string} context - 用户输入的文本
 * @param {Array} allNodes - 所有节点列表（包括驱动因子和计算指标）
 * @param {Object} aiConfig - AI 配置
 * @param {boolean} enableAI - 是否启用 AI 兜底
 * @param {Function} callAIFunction - AI 调用函数
 * @returns {Promise<{constraints: Array, source: string}>} 解析结果
 */
export const parseConstraints = async (
  context,
  allNodes = [],
  aiConfig = {},
  enableAI = true,
  callAIFunction = null
) => {
  if (!context || !context.trim()) {
    return { constraints: [], source: 'empty' };
  }

  console.log('[特殊约束解析引擎] 开始解析，context:', context.substring(0, 100));

  // Step 1: 规则引擎匹配（优先）
  const ruleConstraints = parseWithRules(context, allNodes);
  console.log('[规则引擎] 匹配完成，约束数量:', ruleConstraints.length);

  // 规则匹配成功，直接返回
  if (ruleConstraints.length > 0) {
    return { constraints: ruleConstraints, source: 'rule' };
  }

  console.log('[规则引擎] 匹配失败，尝试 AI 兜底...');

  // Step 2: AI 语义兜底（可选）
  if (enableAI && callAIFunction) {
    const aiConstraints = await parseWithAI(context, allNodes, aiConfig, callAIFunction);
    if (aiConstraints.length > 0) {
      return { constraints: aiConstraints, source: 'ai' };
    }
  } else {
    console.log('[AI 兜底] 未启用，跳过');
  }

  // Step 3: 都失败，返回空
  return { constraints: [], source: 'none' };
};

/**
 * 计算目标值（考虑单位类型）
 * @param {number} currentValue - 当前值
 * @param {Object} constraint - 约束对象
 * @returns {Object} { targetValue, changePercent, description }
 */
export const calculateTargetFromConstraint = (currentValue, constraint) => {
  const { value, unitType, action } = constraint;
  let targetValue;
  let changePercent;

  switch (unitType) {
    case 'percentage_point':
      // 百分点：直接加减
      if (action === 'increase') {
        targetValue = currentValue + value;
      } else if (action === 'decrease') {
        targetValue = currentValue - value;
      } else {
        targetValue = currentValue + value;
      }
      changePercent = currentValue !== 0 ? (targetValue - currentValue) / currentValue : 0;
      break;

    case 'percent':
      // 百分比增幅：乘法
      if (action === 'increase') {
        targetValue = currentValue * (1 + value / 100);
      } else if (action === 'decrease') {
        targetValue = currentValue * (1 - value / 100);
      } else {
        targetValue = currentValue * (1 + value / 100);
      }
      changePercent = value / 100;
      break;

    case 'ten_thousand':
    case 'yuan':
    case 'million':
    case 'hundred_million':
      // 绝对额
      const units = loadUnits();
      const multiplier = units[unitType]?.multiplier || 1;
      targetValue = value * multiplier;
      changePercent = currentValue !== 0 ? (targetValue - currentValue) / currentValue : 0;
      break;

    default:
      targetValue = currentValue * (1 + value / 100);
      changePercent = value / 100;
  }

  return {
    targetValue: Math.round(targetValue * 100) / 100,
    changePercent: Math.round(changePercent * 100 * 100) / 100,
    description: `从${currentValue}调整为${targetValue}（${(changePercent * 100).toFixed(1)}%）`
  };
};

/**
 * 检测预期与约束是否冲突
 * @param {Object} expectation - 预期目标 { value, node }
 * @param {Array} constraints - 约束列表
 * @param {string} adjustmentMode - 调整模式
 * @param {Object} customRange - 自定义范围
 * @returns {Object|null} 冲突信息或 null
 */
export const detectExpectationConflict = (
  expectation,
  constraints,
  adjustmentMode = 'auto',
  customRange = { min: -50, max: 50 }
) => {
  if (!expectation || !expectation.value) {
    return null;
  }

  const { value: expectedValue, node } = expectation;
  const currentValue = node?.value ?? 0;

  // 计算所需的增幅
  const requiredGap = currentValue !== 0 ? (expectedValue - currentValue) / currentValue : 0;

  // 获取调整模式允许的范围
  const getAllowedRange = () => {
    if (adjustmentMode === 'auto') {
      return { min: -0.30, max: 0.30 };
    }

    const presetRanges = {
      conservative: 0.10,  // ±10%
      moderate: 0.30,      // ±30%
      aggressive: 0.50     // ±50%
    };

    if (adjustmentMode === 'custom') {
      return {
        min: customRange.min / 100,
        max: customRange.max / 100
      };
    }

    const range = presetRanges[adjustmentMode] || 0.30;
    return { min: -range, max: range };
  };

  const allowedRange = getAllowedRange();
  const maxAllowed = Math.max(Math.abs(allowedRange.min), allowedRange.max);

  // 检测冲突
  if (Math.abs(requiredGap) > maxAllowed) {
    return {
      type: 'expectation_constraint_mismatch',
      expectation: expectedValue,
      currentValue: currentValue,
      targetValue: node?.targetValue,
      requiredGap: Math.round(requiredGap * 100),
      allowedRange: allowedRange,
      feasibleRange: {
        min: Math.round(currentValue * (1 + allowedRange.min)),
        max: Math.round(currentValue * (1 + allowedRange.max))
      },
      message: `预期需要${Math.round(requiredGap * 100)}%增长，但当前约束仅允许${Math.round(maxAllowed * 100)}%`,
      suggestions: [
        `切换到"进取型"可达成${expectedValue}万预期`,
        `或调整预期为${Math.round(currentValue * 1.1)}万 - ${Math.round(currentValue * (1 + maxAllowed))}万（可行范围内）`
      ]
    };
  }

  return null;
};

/**
 * 从业务背景中提取预期目标
 * @param {string} context - 用户输入的文本
 * @param {Object} nodes - 模型节点
 * @returns {Object|null} { value, node } 或 null
 */
export const extractExpectation = (context, nodes) => {
  if (!context || !nodes) {
    return null;
  }

  console.log('[预期提取] 尝试匹配 context:', context.substring(0, 50));

  // 方法 1：从模型中查找有目标值的计算指标
  const targetNodes = Object.values(nodes).filter(n =>
    n.type === 'computed' && n.targetValue !== null && n.targetValue !== undefined
  );

  for (const node of targetNodes) {
    // 尝试匹配"目标指标名称 + 数值"
    const pattern1 = new RegExp(escapeRegex(node.name) + '.*?(\\d+(?:\\.\\d+)?)\\s*(?:万 | %)?', 'i');
    const match1 = context.match(pattern1);
    if (match1) {
      console.log('[预期提取] 匹配到目标指标:', node.name, '值:', match1[1]);
      return { value: parseFloat(match1[1]), node: node };
    }

    // 尝试匹配"目标 + 指标名称"
    const pattern2 = new RegExp('目标.*?' + escapeRegex(node.name) + '.*?(\\d+(?:\\.\\d+)?)\\s*(?:万 | %)?', 'i');
    const match2 = context.match(pattern2);
    if (match2) {
      console.log('[预期提取] 匹配到目标指标:', node.name, '值:', match2[1]);
      return { value: parseFloat(match2[1]), node: node };
    }
  }

  // 方法 2：通用匹配（任何"目标...XX 万/XX%"格式）
  const generalPattern = /目标.*?(\d+(?:\.\d+)?)\s*(?:万 | %)/;
  const generalMatch = context.match(generalPattern);
  if (generalMatch) {
    console.log('[预期提取] 通用匹配:', generalMatch[1]);
    return { value: parseFloat(generalMatch[1]), node: null };
  }

  console.log('[预期提取] 所有正则都失败');
  return null;
};

// ==================== React Hooks ====================

import { useState, useEffect, useCallback } from 'react';

/**
 * 使用特殊约束解析的 React Hook
 * @param {Object} nodes - 模型节点
 * @param {Object} aiConfig - AI 配置
 * @param {boolean} enableAI - 是否启用 AI 兜底
 * @param {Function} callAIFunction - AI 调用函数
 * @returns {Object} { constraints, parseSource, isParsing, parseConstraints }
 */
export const useConstraintParser = (nodes, aiConfig, enableAI, callAIFunction) => {
  const [constraints, setConstraints] = useState([]);
  const [parseSource, setParseSource] = useState('none');
  const [isParsing, setIsParsing] = useState(false);

  const parse = useCallback(async (context) => {
    if (!context || !context.trim()) {
      setConstraints([]);
      setParseSource('empty');
      return [];
    }

    setIsParsing(true);
    try {
      const driverNodes = Object.values(nodes).filter(n => n.type === 'driver');
      const result = await parseConstraints(context, driverNodes, aiConfig, enableAI, callAIFunction);
      setConstraints(result.constraints);
      setParseSource(result.source);
      return result.constraints;
    } catch (error) {
      console.error('[特殊约束解析] 失败:', error);
      setConstraints([]);
      setParseSource('error');
      return [];
    } finally {
      setIsParsing(false);
    }
  }, [nodes, aiConfig, enableAI, callAIFunction]);

  return {
    constraints,
    parseSource,
    isParsing,
    parse
  };
};
