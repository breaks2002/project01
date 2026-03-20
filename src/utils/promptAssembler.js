/**
 * AI Prompt 组装工具 - 纯数据驱动版本
 *
 * 设计理念：
 * 1. 只负责组装数据，不硬编码任何业务逻辑
 * 2. 支持用户自定义 Prompt 模板（从 promptTemplateService 动态加载）
 * 3. 支持多场景自动识别（基于用户模型中的因子/指标名称智能匹配）
 * 4. 支持任意行业、任意场景的自适应 Prompt 生成
 *
 * 架构：方案 A + B + C 结合
 * - 方案 A：用户自定义 prompt 作为 system prompt 的一部分传入
 * - 方案 B：支持多场景 Prompt 模板（从服务动态加载）
 * - 方案 C：纯数据驱动，只组装 JSON 数据结构
 */

// ==================== 动态模板加载 ====================

/**
 * 模板服务引用（延迟加载，避免循环依赖）
 */
let _templateService = null;

/**
 * 获取或初始化模板服务
 * @returns {Promise<Object>} 模板服务实例
 */
const getTemplateService = async () => {
  if (!_templateService) {
    try {
      const { default: service } = await import('../services/promptTemplateService.js');
      await service.initialize();
      _templateService = service;
    } catch (error) {
      console.error('[promptAssembler] 加载模板服务失败:', error);
      // 返回一个空的实现
      _templateService = {
        getAllTemplates: () => [],
        getTemplate: () => null,
        matchTemplate: () => null
      };
    }
  }
  return _templateService;
};

/**
 * 根据用户输入和模型数据智能识别场景
 *
 * 识别策略：
 * 1. 优先匹配用户自定义模板中的关键词
 * 2. 基于用户模型中的因子/指标名称进行智能匹配
 * 3. 基于用户输入的业务关键词进行匹配
 * 4. 支持多场景匹配（返回所有匹配的场景）
 *
 * @param {string} userInput - 用户输入的业务背景
 * @param {Object} nodes - 用户模型中的所有节点（用于智能匹配）
 * @returns {Promise<Array>} 匹配的场景模板列表（按匹配度排序）
 */
export const identifyScenarios = async (userInput, nodes = {}) => {
  const service = await getTemplateService();
  const templates = service.getAllTemplates();

  if (templates.length === 0) {
    // 如果没有自定义模板，使用内置的简单匹配逻辑
    return [getDefaultTemplate()];
  }

  const inputLower = userInput.toLowerCase();

  // 从模型中提取所有因子和指标名称
  const modelNames = [];
  Object.values(nodes || {}).forEach(node => {
    if (node.name) modelNames.push(node.name.toLowerCase());
  });

  // 统计各模板匹配度
  const scores = templates.map(template => {
    let score = 0;
    const keywords = template.keywords || [];

    // 匹配用户输入中的关键词
    keywords.forEach(word => {
      if (inputLower.includes(word.toLowerCase())) {
        score += 2;
      }
    });

    // 匹配模型中的因子/指标名称
    keywords.forEach(word => {
      if (modelNames.some(name => name.includes(word.toLowerCase()))) {
        score += 1;
      }
    });

    return {
      template,
      score
    };
  });

  // 按匹配度排序
  scores.sort((a, b) => b.score - a.score);

  // 返回匹配度 >= 1 的模板，如果没有则返回通用模板
  const matched = scores.filter(s => s.score >= 1).map(s => s.template);

  if (matched.length > 0) {
    return matched;
  }

  // 无匹配时返回通用模板
  return [getDefaultTemplate()];
};

/**
 * 获取默认/通用模板
 * @returns {Object} 默认模板
 */
const getDefaultTemplate = () => {
  return {
    id: 'general',
    name: '通用场景',
    description: '默认模板，适用于不确定场景或跨部门综合优化',
    keywords: [],
    systemPrompt: `你是一位资深的业务分析和规划专家，擅长基于数据进行驱动因子优化。

【核心任务】
用户提供了业务背景和未来计划，你需要：
1. 深入理解业务背景中的关键信息
2. 全面分析模型数据的完整画像（实际 vs 预测、趋势、敏感性、差距）
3. 根据业务背景识别所有需要调整的驱动因子
4. 为每个识别出的因子生成专业的调整建议

【关键原则】
1. 多因子联动：业务目标通常需要多个因子协同调整
2. 从业务背景推导：仔细阅读用户的业务描述
3. 数据驱动：基于实际数据趋势，不要假设
4. 场景自适应：根据用户描述和模型数据自动识别场景类型
5. **知识库参考**：如果 User Prompt 中包含【知识库参考】部分，务必参考历史案例中的调整方案

【强制要求 - 必须遵守】
1. adjustments 数组必须包含至少 3-5 个调整项（不能只返回 1 个！）
2. 每个 adjustment 必须包含完整的字段
3. monthlyFactors 必须是 12 个数字的数组
4. **重要：业务目标需要多个因子协同才能实现，请分析模型数据找出所有相关的驱动因子**
5. **如果只返回 1-2 个因子，说明分析不充分，请重新分析并补充完整**`,
    isBuiltIn: true
  };
};

/**
 * 根据模板 ID 获取单个模板
 * @param {string} templateId - 模板 ID
 * @returns {Promise<Object|null>} 模板对象
 */
export const getTemplate = async (templateId) => {
  const service = await getTemplateService();
  return service.getTemplate(templateId) || getDefaultTemplate();
};

// ==================== 数据组装（纯数据驱动） ====================

/**
 * 构建模型结构数据
 * @param {Object} nodes - 所有节点
 * @returns {Object} 模型结构
 */
export const buildModelData = (nodes) => {
  const drivers = [];
  const computed = [];

  Object.values(nodes).forEach(node => {
    const nodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      value: node.value,
      baseline: node.baseline,
      targetValue: node.targetValue,
      unit: node.unit,
      range: node.range,
      timeData: node.timeData
    };

    if (node.type === 'driver') {
      drivers.push(nodeData);
    } else {
      computed.push(nodeData);
    }
  });

  return { drivers, computed };
};

/**
 * 构建数据分析结果
 * @param {Object} nodes - 所有节点
 * @param {Array} sensitivityData - 敏感性分析数据
 * @param {Array} stdDevData - 标准差分析数据
 * @returns {Object} 数据分析结果
 */
export const buildAnalysisData = (nodes, sensitivityData = [], stdDevData = []) => {
  return {
    sensitivity: sensitivityData.slice(0, 10),
    stdDev: stdDevData.slice(0, 10),
    summary: {
      totalFactors: Object.values(nodes).filter(n => n.type === 'driver').length,
      totalComputed: Object.values(nodes).filter(n => n.type === 'computed').length
    }
  };
};

// ==================== 主函数：组装 Prompt ====================

/**
 * 组装 AI Prompt（纯数据驱动）
 *
 * @param {Object} params - 参数
 * @param {Object} params.nodes - 所有节点数据
 * @param {string} params.businessContext - 用户输入的业务背景
 * @param {Array} params.knowledgeResults - 知识库检索结果（可选）
 * @param {Array} params.sensitivityData - 敏感性分析数据（可选）
 * @param {Array} params.stdDevData - 标准差分析数据（可选）
 * @param {string} params.customSystemPrompt - 用户自定义 System Prompt（可选，优先级最高）
 * @param {string} params.scenarioType - 指定场景类型（可选，不指定则自动识别）
 * @param {Array} params.selectedScenarios - 用户选中的场景列表（多选，可选）
 *
 * @returns {Promise<Object>} { system, user, scenario, template }
 */
export const buildPrompt = async ({
  nodes,
  businessContext,
  knowledgeResults = [],
  sensitivityData = [],
  stdDevData = [],
  customSystemPrompt = '',
  scenarioType = '',
  selectedScenarios = []
}) => {
  console.log('[promptAssembler] buildPrompt 被调用');
  console.log('[promptAssembler] selectedScenarios:', selectedScenarios);
  console.log('[promptAssembler] selectedScenarios 类型:', Array.isArray(selectedScenarios));
  if (selectedScenarios.length > 0) {
    console.log('[promptAssembler] 第一个场景:', selectedScenarios[0]);
    console.log('[promptAssembler] 第一个场景的 id:', selectedScenarios[0].id);
    console.log('[promptAssembler] 第一个场景的 systemPrompt:', selectedScenarios[0].systemPrompt?.substring(0, 100));
  }

  // 1. 组装模型数据
  const modelData = buildModelData(nodes);

  // 2. 组装分析数据
  const analysisData = buildAnalysisData(nodes, sensitivityData, stdDevData);

  // 3. 识别或指定场景
  let scenarioNames = [];
  let systemPrompt = customSystemPrompt;

  if (!customSystemPrompt) {
    if (selectedScenarios && selectedScenarios.length > 0) {
      // 使用用户选中的场景（支持多选）
      const templates = selectedScenarios
        .map(s => {
          // 支持传入场景对象或场景 ID
          const scenarioId = s.id || s;
          // 从服务中获取模板
          const service = _templateService;
          if (service && service.getTemplate) {
            return service.getTemplate(scenarioId);
          }
          // 如果服务不可用，尝试从选中对象中获取
          return s.systemPrompt ? s : null;
        })
        .filter(Boolean);

      if (templates.length > 0) {
        scenarioNames = templates.map(t => t.name);
        // 合并多个场景的 System Prompt
        systemPrompt = templates.map(t => t.systemPrompt).join('\n\n---\n\n');
      } else {
        // 如果没有有效模板，使用通用模板
        const defaultTemplate = getDefaultTemplate();
        scenarioNames = [defaultTemplate.name];
        systemPrompt = defaultTemplate.systemPrompt;
      }
    } else {
      // 用户未选择场景，基于输入和模型数据智能识别
      const matchedTemplates = await identifyScenarios(businessContext, nodes);
      scenarioNames = matchedTemplates.map(t => t.name);

      if (matchedTemplates.length > 0) {
        // 合并匹配的场景模板
        systemPrompt = matchedTemplates.map(t => t.systemPrompt).join('\n\n---\n\n');
      } else {
        const defaultTemplate = getDefaultTemplate();
        scenarioNames = [defaultTemplate.name];
        systemPrompt = defaultTemplate.systemPrompt;
      }
    }
  }

  // 4. 构建 User Prompt
  let userPrompt = '';

  // 业务背景
  userPrompt += `【业务背景】
${businessContext}

`;

  // 场景识别结果
  userPrompt += `【场景类型】${scenarioNames.join(' + ')}

`;

  // 模型数据
  userPrompt += `【模型数据】
驱动因子（${modelData.drivers.length}个）：
${JSON.stringify(modelData.drivers, null, 2)}

计算指标（${modelData.computed.length}个）：
${JSON.stringify(modelData.computed.slice(0, 5), null, 2)}
${modelData.computed.length > 5 ? `...(还有 ${modelData.computed.length - 5} 个)` : ''}

`;

  // 数据分析
  userPrompt += `【数据分析】
${JSON.stringify(analysisData, null, 2)}

`;

  // 知识库结果（如果有）
  if (knowledgeResults && knowledgeResults.length > 0) {
    userPrompt += `【知识库参考】已找到 ${knowledgeResults.length} 个相关历史案例：

`;
    knowledgeResults.forEach((item, i) => {
      userPrompt += `${i + 1}. **${item.title || item.scenario}** (相似度${(item.similarity * 100).toFixed(0)}%)
   - 行业：${item.industry || 'N/A'}
   - 场景：${item.scenario || 'N/A'}
   - 相关因子：${item.factors?.map(f => f.factorName).join('、') || '暂无数据'}
`;
      // 如果有调整方案详情，也展示出来
      if (item.factors && item.factors.length > 0 && item.factors[0].adjustment) {
        userPrompt += `   - 历史调整方案：
`;
        item.factors.forEach((factor, j) => {
          if (factor.adjustment) {
            userPrompt += `     * ${factor.factorName}: ${factor.adjustment.from} → ${factor.adjustment.to} (${factor.adjustment.changePercent > 0 ? '+' : ''}${factor.adjustment.changePercent}%)
`;
          }
        });
      }
      userPrompt += '\n';
    });
    userPrompt += `
【知识库使用指引】
以上是历史案例中的调整方案，请参考这些经验来指导当前的驱动因子调整。
特别关注：
1. 相似场景下的因子调整方向（提升/降低）
2. 调整幅度的参考范围
3. 多因子联动的协同策略

`;
  }

  // 输出格式要求
  userPrompt += `【输出格式要求】
请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：
{
  "understanding": {
    "businessContext": "AI 对业务背景的理解摘要",
    "keyGoals": ["目标 1", "目标 2"],
    "constraints": ["约束 1", "约束 2"],
    "scenarioType": "${scenarioNames.join(' + ')}"
  },
  "adjustments": [
    {
      "nodeId": "驱动因子 ID",
      "nodeName": "驱动因子名称",
      "currentValue": 数值，
      "recommendedValue": 数值，
      "changePercent": 数值，
      "changeReason": "调整理由",
      "dataBasis": "数据依据（基于模型数据）",
      "businessReason": "业务理由（基于用户背景）",
      "riskWarning": "风险提示",
      "monthlyStrategy": "月度分配策略",
      "monthlyFactors": [1.0, 1.1, ...],  // 12 个月
      "confidence": 0.85
    }
  ],
  "expectedImpact": {
    "keyMetrics": [
      {"name": "核心指标", "before": 数值，"after": 数值，"change": "+XX%"}
    ],
    "sensitivityScenario": [
      {"scenario": "乐观", "result": 数值，"assumption": "..."},
      {"scenario": "基准", "result": 数值，"assumption": "..."},
      {"scenario": "悲观", "result": 数值，"assumption": "..."}
    ],
    "summary": "整体影响说明"
  },
  "explanation": "详细的调整思路和分析过程"
}

【重要】
1. 只返回纯 JSON，不要包含任何其他文字
2. adjustments 数组必须包含至少 3 个调整项
3. 基于模型数据中的真实 currentValue，不要估算`;

  return {
    system: systemPrompt,
    user: userPrompt,
    scenario: scenarioNames.join(' + '),
    template: scenarioNames.join(' + ')
  };
};

// ==================== 同步版本（兼容旧代码） ====================

/**
 * 同步版本的 buildPrompt（用于不支持 async 的场景）
 * 注意：同步版本无法加载用户自定义模板，只使用内置逻辑
 */
export const buildPromptSync = ({
  nodes,
  businessContext,
  knowledgeResults = [],
  sensitivityData = [],
  stdDevData = [],
  customSystemPrompt = '',
  selectedScenarios = []
}) => {
  console.log('[promptAssembler] buildPromptSync 被调用');

  // 1. 组装模型数据
  const modelData = buildModelData(nodes);

  // 2. 组装分析数据
  const analysisData = buildAnalysisData(nodes, sensitivityData, stdDevData);

  // 3. 识别场景（使用简单的关键词匹配）
  let scenarioNames = [];
  let systemPrompt = customSystemPrompt;

  if (!customSystemPrompt) {
    if (selectedScenarios && selectedScenarios.length > 0) {
      // 使用用户选中的场景
      scenarioNames = selectedScenarios.map(s => s.name || '自定义场景');
      systemPrompt = selectedScenarios.map(s => s.systemPrompt).filter(Boolean).join('\n\n---\n\n');

      if (!systemPrompt) {
        const defaultTemplate = getDefaultTemplate();
        scenarioNames = [defaultTemplate.name];
        systemPrompt = defaultTemplate.systemPrompt;
      }
    } else {
      // 使用简单匹配
      const inputLower = businessContext.toLowerCase();
      const keywords = {
        '财务场景': ['成本', '利润', '收入', '费用', '毛利', '净利', '财务'],
        'HR 人力场景': ['招聘', '人力', '人效', '流失', '薪酬', '培训', '人力成本'],
        '生产制造场景': ['产能', '良率', '库存', '设备', '生产', '订单', '制造']
      };

      let bestMatch = { name: '通用场景', score: 0 };
      for (const [name, words] of Object.entries(keywords)) {
        const score = words.reduce((count, word) =>
          count + (inputLower.includes(word) ? 1 : 0), 0);
        if (score > bestMatch.score) {
          bestMatch = { name, score };
        }
      }

      if (bestMatch.score >= 2) {
        scenarioNames = [bestMatch.name];
        // 使用内置模板
        const templates = {
          '财务场景': `你是一位资深的财务分析和规划专家...`,
          'HR 人力场景': `你是一位资深的人力资源分析和规划专家...`,
          '生产制造场景': `你是一位资深的生产和运营规划专家...`
        };
        systemPrompt = templates[bestMatch.name] || getDefaultTemplate().systemPrompt;
      } else {
        const defaultTemplate = getDefaultTemplate();
        scenarioNames = [defaultTemplate.name];
        systemPrompt = defaultTemplate.systemPrompt;
      }
    }
  }

  // 构建 User Prompt（与 async 版本相同）
  let userPrompt = '';
  userPrompt += `【业务背景】
${businessContext}

【场景类型】${scenarioNames.join(' + ')}

【模型数据】
驱动因子（${modelData.drivers.length}个）：
${JSON.stringify(modelData.drivers, null, 2)}

计算指标（${modelData.computed.length}个）：
${JSON.stringify(modelData.computed.slice(0, 5), null, 2)}
${modelData.computed.length > 5 ? `...(还有 ${modelData.computed.length - 5} 个)` : ''}

【数据分析】
${JSON.stringify(analysisData, null, 2)}

`;

  if (knowledgeResults && knowledgeResults.length > 0) {
    userPrompt += `【知识库参考】已找到 ${knowledgeResults.length} 个相关历史案例：
${knowledgeResults.map((item, i) => `${i + 1}. ${item.title || item.scenario} (相似度${(item.similarity * 100).toFixed(0)}%)
   - 相关因子：${item.factors?.map(f => f.factorName).join('、') || 'N/A'}`).join('\n')}

`;
  }

  userPrompt += `【输出格式要求】
请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：
{
  "understanding": {
    "businessContext": "AI 对业务背景的理解摘要",
    "keyGoals": ["目标 1", "目标 2"],
    "constraints": ["约束 1", "约束 2"],
    "scenarioType": "${scenarioNames.join(' + ')}"
  },
  "adjustments": [
    {
      "nodeId": "驱动因子 ID",
      "nodeName": "驱动因子名称",
      "currentValue": 数值，
      "recommendedValue": 数值，
      "changePercent": 数值，
      "changeReason": "调整理由",
      "dataBasis": "数据依据（基于模型数据）",
      "businessReason": "业务理由（基于用户背景）",
      "riskWarning": "风险提示",
      "monthlyStrategy": "月度分配策略",
      "monthlyFactors": [1.0, 1.1, ...],  // 12 个月
      "confidence": 0.85
    }
  ],
  "expectedImpact": {
    "keyMetrics": [
      {"name": "核心指标", "before": 数值，"after": 数值，"change": "+XX%"}
    ],
    "sensitivityScenario": [
      {"scenario": "乐观", "result": 数值，"assumption": "..."},
      {"scenario": "基准", "result": 数值，"assumption": "..."},
      {"scenario": "悲观", "result": 数值，"assumption": "..."}
    ],
    "summary": "整体影响说明"
  },
  "explanation": "详细的调整思路和分析过程"
}

【重要】
1. 只返回纯 JSON，不要包含任何其他文字
2. adjustments 数组必须包含至少 3 个调整项
3. 基于模型数据中的真实 currentValue，不要估算`;

  return {
    system: systemPrompt,
    user: userPrompt,
    scenario: scenarioNames.join(' + '),
    template: scenarioNames.join(' + ')
  };
};

export default {
  buildPrompt,
  buildPromptSync,
  identifyScenarios,
  getTemplate,
  buildModelData,
  buildAnalysisData,
  getDefaultTemplate,
  getTemplateService
};
