/**
 * 一致性验证引擎
 * 功能：验证用户输入、知识库、场景与指标模型的一致性，防止错配
 *
 * 使用场景：
 * - 财务指标模型 + 质量场景 → 不匹配警告
 * - 餐饮知识库 + 研发提示词 → 不匹配警告
 * - 指标模型 + 用户输入 → 自动匹配验证
 *
 * 验证维度：
 * 1. 行业一致性 (Industry Consistency)
 * 2. 场景一致性 (Scenario Consistency)
 * 3. 领域一致性 (Domain Consistency)
 * 4. 指标匹配度 (Metric Matching)
 */

// ==================== 行业/领域分类体系 ====================

/**
 * 行业分类（用于知识库和指标模型打标）
 */
export const INDUSTRY_CATEGORIES = {
  FINANCE: '财务/金融',
  MANUFACTURING: '生产制造',
  RETAIL: '零售/电商',
  TECHNOLOGY: '科技/互联网',
  HEALTHCARE: '医疗/健康',
  EDUCATION: '教育/培训',
  FOOD_BEVERAGE: '餐饮/食品',
  SERVICE: '服务业',
  LOGISTICS: '物流/运输',
  ENERGY: '能源/化工',
  REAL_ESTATE: '房地产/建筑',
  MEDIA: '媒体/广告',
  GENERAL: '通用/跨行业'
};

/**
 * 业务领域分类
 */
export const DOMAIN_CATEGORIES = {
  FINANCE_ACCOUNTING: '财务/会计',
  SALES_MARKETING: '销售/市场',
  OPERATIONS: '运营管理',
  HR: '人力资源',
  RD: '研发/技术',
  PRODUCTION: '生产制造',
  QUALITY: '质量管理',
  SUPPLY_CHAIN: '供应链',
  CUSTOMER_SERVICE: '客户服务',
  STRATEGY: '战略/投资',
  GENERAL: '通用管理'
};

/**
 * 场景分类
 */
export const SCENARIO_CATEGORIES = {
  // 财务场景
  COST_OPTIMIZATION: '成本优化',
  PROFIT_IMPROVEMENT: '利润提升',
  REVENUE_GROWTH: '收入增长',
  CASH_FLOW: '现金流管理',
  BUDGET_CONTROL: '预算控制',

  // 生产场景
  CAPACITY_EXPANSION: '产能扩张',
  YIELD_IMPROVEMENT: '良率提升',
  EFFICIENCY: '效率提升',
  INVENTORY_CONTROL: '库存控制',
  QUALITY_CONTROL: '质量控制',

  // 销售场景
  MARKET_EXPANSION: '市场扩张',
  SALES_BOOST: '销售提升',
  CUSTOMER_ACQUISITION: '客户获取',
  BRAND_BUILDING: '品牌建设',

  // 人力场景
  RECRUITMENT: '招聘优化',
  RETENTION: '人才保留',
  EFFICIENCY_IMPROVEMENT: '人效提升',
  COST_CONTROL: '人力成本控制',

  // 研发场景
  PRODUCT_INNOVATION: '产品创新',
  TECHNOLOGY_UPGRADE: '技术升级',
  RD_EFFICIENCY: '研发效率',

  // 通用场景
  STRATEGIC_PLANNING: '战略规划',
  PERFORMANCE_IMPROVEMENT: '绩效改善',
  RISK_MANAGEMENT: '风险管理',
  DIGITAL_TRANSFORMATION: '数字化转型',
  GENERAL: '通用场景'
};

// ==================== 关键词映射 ====================

/**
 * 行业关键词映射
 */
const INDUSTRY_KEYWORDS = {
  [INDUSTRY_CATEGORIES.FINANCE]: ['财务', '金融', '银行', '保险', '证券', '投资', '基金', '信托', '信贷', '利率', '汇率'],
  [INDUSTRY_CATEGORIES.MANUFACTURING]: ['制造', '生产', '工厂', '车间', '设备', '产线', '产能', '良率', '工序', '加工'],
  [INDUSTRY_CATEGORIES.RETAIL]: ['零售', '电商', '商城', '店铺', '门店', '超市', '连锁', 'GMV', '客流', '复购'],
  [INDUSTRY_CATEGORIES.TECHNOLOGY]: ['科技', '互联网', '软件', 'SaaS', '平台', 'APP', '用户', '流量', 'DAU', 'MAU'],
  [INDUSTRY_CATEGORIES.HEALTHCARE]: ['医疗', '健康', '医院', '诊所', '药品', '器械', '患者', '诊疗', '护理'],
  [INDUSTRY_CATEGORIES.EDUCATION]: ['教育', '培训', '学校', '课程', '学员', '教师', '升学', '考试'],
  [INDUSTRY_CATEGORIES.FOOD_BEVERAGE]: ['餐饮', '食品', '餐厅', '菜品', '口味', '食材', '菜单', '翻台'],
  [INDUSTRY_CATEGORIES.SERVICE]: ['服务', '咨询', '代理', '中介', '客服', '售后'],
  [INDUSTRY_CATEGORIES.LOGISTICS]: ['物流', '运输', '快递', '仓储', '配送', '货运', '供应链'],
  [INDUSTRY_CATEGORIES.ENERGY]: ['能源', '化工', '石油', '电力', '煤炭', '燃气', '环保'],
  [INDUSTRY_CATEGORIES.REAL_ESTATE]: ['房地产', '建筑', '房产', '物业', '工程', '施工', '装修'],
  [INDUSTRY_CATEGORIES.MEDIA]: ['媒体', '广告', '营销', '公关', '传播', '内容', '自媒体']
};

/**
 * 领域关键词映射
 */
const DOMAIN_KEYWORDS = {
  [DOMAIN_CATEGORIES.FINANCE_ACCOUNTING]: ['财务', '会计', '资金', '税务', '审计', '核算', '报表', '利润', '成本', '收入', '费用', '资产', '负债'],
  [DOMAIN_CATEGORIES.SALES_MARKETING]: ['销售', '市场', '营销', '推广', '客户', '渠道', '订单', '合同', '商务', '品牌'],
  [DOMAIN_CATEGORIES.OPERATIONS]: ['运营', '经营', '管理', '效率', '流程', 'KPI', '绩效', '目标', '计划'],
  [DOMAIN_CATEGORIES.HR]: ['人力', '招聘', '薪酬', '绩效', '培训', '员工', '离职', '考勤', '编制', '人效'],
  [DOMAIN_CATEGORIES.RD]: ['研发', '技术', '开发', '创新', '专利', '项目', '产品', '设计', '实验', '测试'],
  [DOMAIN_CATEGORIES.PRODUCTION]: ['生产', '制造', '产能', '产线', '设备', '工艺', '工序', '排产', '交付'],
  [DOMAIN_CATEGORIES.QUALITY]: ['质量', '品质', '良率', '缺陷', '检测', '标准', '认证', 'ISO', '合格率'],
  [DOMAIN_CATEGORIES.SUPPLY_CHAIN]: ['供应链', '采购', '供应商', '库存', '物流', '物料', '订货', '仓储'],
  [DOMAIN_CATEGORIES.CUSTOMER_SERVICE]: ['客服', '服务', '售后', '投诉', '满意度', '回访', '支持'],
  [DOMAIN_CATEGORIES.STRATEGY]: ['战略', '投资', '并购', '规划', '愿景', '使命', '目标', '布局']
};

/**
 * 场景关键词映射
 */
const SCENARIO_KEYWORDS = {
  [SCENARIO_CATEGORIES.COST_OPTIMIZATION]: ['成本', '费用', '节约', '降低', '优化', '控制', '缩减'],
  [SCENARIO_CATEGORIES.PROFIT_IMPROVEMENT]: ['利润', '盈利', '收益', '回报', '毛利', '净利', 'EBITDA'],
  [SCENARIO_CATEGORIES.REVENUE_GROWTH]: ['收入', '销售', '增长', '营收', '业绩', '销售额'],
  [SCENARIO_CATEGORIES.CASH_FLOW]: ['现金', '资金', '流动', '回款', '账期', '融资'],
  [SCENARIO_CATEGORIES.BUDGET_CONTROL]: ['预算', '决算', '额度', '审批', '超支'],

  [SCENARIO_CATEGORIES.CAPACITY_EXPANSION]: ['产能', '扩张', '扩建', '增产', '规模'],
  [SCENARIO_CATEGORIES.YIELD_IMPROVEMENT]: ['良率', '良品', '合格率', '直通率', '一次通过率'],
  [SCENARIO_CATEGORIES.EFFICIENCY]: ['效率', '效能', '产出', '人均', '工时', '稼动'],
  [SCENARIO_CATEGORIES.INVENTORY_CONTROL]: ['库存', '周转', '呆滞', '安全库存', '库龄'],
  [SCENARIO_CATEGORIES.QUALITY_CONTROL]: ['质量', '品质', '不良', '缺陷', '客诉', '退货'],

  [SCENARIO_CATEGORIES.MARKET_EXPANSION]: ['市场', '拓展', '开拓', '覆盖', '渗透', '新市场'],
  [SCENARIO_CATEGORIES.SALES_BOOST]: ['销售', '提升', '冲量', '业绩', '签单', '转化'],
  [SCENARIO_CATEGORIES.CUSTOMER_ACQUISITION]: ['客户', '获客', '拉新', '转化', '线索'],
  [SCENARIO_CATEGORIES.BRAND_BUILDING]: ['品牌', '知名度', '影响力', '口碑', '形象'],

  [SCENARIO_CATEGORIES.RECRUITMENT]: ['招聘', '招人', '面试', 'Offer', '到岗', '编制'],
  [SCENARIO_CATEGORIES.RETENTION]: ['离职', '流失', '保留', '稳定', '留存'],
  [SCENARIO_CATEGORIES.EFFICIENCY_IMPROVEMENT]: ['人效', '人均', '产出', '效率', '饱和度'],
  [SCENARIO_CATEGORIES.COST_CONTROL]: ['人力成本', '薪酬', '工资', '奖金', '加班'],

  [SCENARIO_CATEGORIES.PRODUCT_INNOVATION]: ['产品', '创新', '新品', '迭代', '升级', '研发'],
  [SCENARIO_CATEGORIES.TECHNOLOGY_UPGRADE]: ['技术', '升级', '改造', '引进', '消化', '吸收'],
  [SCENARIO_CATEGORIES.RD_EFFICIENCY]: ['研发效率', '项目', '周期', '进度', '交付'],

  [SCENARIO_CATEGORIES.STRATEGIC_PLANNING]: ['战略', '规划', '愿景', '目标', '路径', '布局'],
  [SCENARIO_CATEGORIES.PERFORMANCE_IMPROVEMENT]: ['绩效', '改善', '提升', '考核', '指标'],
  [SCENARIO_CATEGORIES.RISK_MANAGEMENT]: ['风险', '风控', '合规', '安全', '防范'],
  [SCENARIO_CATEGORIES.DIGITAL_TRANSFORMATION]: ['数字化', '信息化', '系统', '智能', '自动', 'AI']
};

// ==================== 工具函数 ====================

/**
 * 文本分词（简化版中文分词）
 */
const tokenize = (text) => {
  if (!text) return [];
  // 转为小写
  const lowerText = text.toLowerCase();
  // 按空格、标点分割
  const tokens = lowerText.split(/[\s,;,.!?.,\n\r]+/).filter(t => t.trim().length > 0);
  // 同时返回单个字符的关键词（用于中文匹配）
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  return [...tokens, ...chineseChars];
};

/**
 * 计算关键词匹配度
 */
const calculateKeywordMatch = (text, keywords) => {
  if (!text || !keywords || keywords.length === 0) return 0;
  const tokens = tokenize(text);
  const matchedKeywords = keywords.filter(kw =>
    tokens.some(token => token.includes(kw.toLowerCase()) || kw.toLowerCase().includes(token))
  );
  return matchedKeywords.length / Math.max(keywords.length, 1);
};

/**
 * 计算最佳匹配的行业
 */
const detectIndustry = (text) => {
  if (!text) return INDUSTRY_CATEGORIES.GENERAL;

  let bestMatch = { industry: INDUSTRY_CATEGORIES.GENERAL, score: 0 };

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    const score = calculateKeywordMatch(text, keywords);
    if (score > bestMatch.score) {
      bestMatch = { industry, score };
    }
  }

  return bestMatch.score > 0.1 ? bestMatch.industry : INDUSTRY_CATEGORIES.GENERAL;
};

/**
 * 计算最佳匹配的领域
 */
const detectDomain = (text) => {
  if (!text) return DOMAIN_CATEGORIES.GENERAL;

  let bestMatch = { domain: DOMAIN_CATEGORIES.GENERAL, score: 0 };

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = calculateKeywordMatch(text, keywords);
    if (score > bestMatch.score) {
      bestMatch = { domain, score };
    }
  }

  return bestMatch.score > 0.1 ? bestMatch.domain : DOMAIN_CATEGORIES.GENERAL;
};

/**
 * 计算最佳匹配的场景
 */
const detectScenario = (text) => {
  if (!text) return SCENARIO_CATEGORIES.GENERAL;

  let bestMatch = { scenario: SCENARIO_CATEGORIES.GENERAL, score: 0 };

  for (const [scenario, keywords] of Object.entries(SCENARIO_KEYWORDS)) {
    const score = calculateKeywordMatch(text, keywords);
    if (score > bestMatch.score) {
      bestMatch = { scenario, score };
    }
  }

  return bestMatch.score > 0.05 ? bestMatch.scenario : SCENARIO_CATEGORIES.GENERAL;
};

// ==================== 一致性验证引擎 ====================

/**
 * 一致性验证结果
 */
export class ConsistencyResult {
  constructor() {
    this.isConsistent = true;
    this.overallScore = 1.0;
    this.warnings = [];
    this.suggestions = [];
    this.details = {
      industry: { detected: '', expected: '', match: true, score: 0 },
      domain: { detected: '', expected: '', match: true, score: 0 },
      scenario: { detected: '', expected: '', match: true, score: 0 },
      metrics: { matched: [], unmatched: [], score: 0 }
    };
  }
}

/**
 * 一致性验证引擎类
 */
export class ConsistencyValidationEngine {
  /**
   * 验证用户输入与知识库的一致性
   */
  validateUserInputWithKnowledge(userInput, knowledgeEntries) {
    const result = new ConsistencyResult();

    if (!userInput || !knowledgeEntries || knowledgeEntries.length === 0) {
      return result; // 没有知识库条目，无法验证
    }

    // 检测用户输入的行业、领域、场景
    const userInputIndustry = detectIndustry(userInput);
    const userInputDomain = detectDomain(userInput);
    const userInputScenario = detectScenario(userInput);

    // 检测知识库条目的行业、领域、场景
    const knowledgeIndustries = knowledgeEntries.map(k => k.industry).filter(Boolean);
    const knowledgeScenarios = knowledgeEntries.map(k => k.scenario).filter(Boolean);

    // 统计知识库中出现最多的行业
    const industryCount = {};
    knowledgeIndustries.forEach(ind => {
      industryCount[ind] = (industryCount[ind] || 0) + 1;
    });
    const dominantKnowledgeIndustry = Object.entries(industryCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // 验证行业一致性
    if (dominantKnowledgeIndustry &&
        userInputIndustry !== INDUSTRY_CATEGORIES.GENERAL &&
        userInputIndustry !== dominantKnowledgeIndustry) {
      result.isConsistent = false;
      result.warnings.push({
        type: 'INDUSTRY_MISMATCH',
        message: `用户输入的行业（${userInputIndustry}）与知识库行业（${dominantKnowledgeIndustry}）不匹配`,
        severity: 'high'
      });
      result.details.industry = {
        detected: userInputIndustry,
        expected: dominantKnowledgeIndustry,
        match: false,
        score: 0
      };
    } else {
      result.details.industry = {
        detected: userInputIndustry,
        expected: dominantKnowledgeIndustry || '未指定',
        match: true,
        score: 1
      };
    }

    return result;
  }

  /**
   * 验证用户输入与指标模型的一致性
   */
  validateUserInputWithModel(userInput, nodes) {
    const result = new ConsistencyResult();

    if (!userInput || !nodes || Object.keys(nodes).length === 0) {
      return result;
    }

    // 检测用户输入的行业、领域、场景
    const userInputIndustry = detectIndustry(userInput);
    const userInputDomain = detectDomain(userInput);
    const userInputScenario = detectScenario(userInput);

    // 分析指标模型中的指标名称
    const allNodeNames = Object.values(nodes).map(n => n.name || '').join(' ');
    const modelIndustry = detectIndustry(allNodeNames);
    const modelDomain = detectDomain(allNodeNames);

    // 验证行业一致性
    if (modelIndustry !== INDUSTRY_CATEGORIES.GENERAL &&
        userInputIndustry !== INDUSTRY_CATEGORIES.GENERAL &&
        modelIndustry !== userInputIndustry) {
      result.isConsistent = false;
      result.warnings.push({
        type: 'INDUSTRY_MISMATCH',
        message: `用户输入的行业（${userInputIndustry}）与指标模型行业（${modelIndustry}）不匹配`,
        severity: 'high'
      });
      result.details.industry = {
        detected: userInputIndustry,
        expected: modelIndustry,
        match: false,
        score: 0
      };
    } else {
      result.details.industry = {
        detected: userInputIndustry,
        expected: modelIndustry,
        match: true,
        score: 1
      };
    }

    // 验证领域一致性
    if (modelDomain !== DOMAIN_CATEGORIES.GENERAL &&
        userInputDomain !== DOMAIN_CATEGORIES.GENERAL &&
        modelDomain !== userInputDomain) {
      result.warnings.push({
        type: 'DOMAIN_MISMATCH',
        message: `用户输入的领域（${userInputDomain}）与指标模型领域（${modelDomain}）可能不匹配`,
        severity: 'medium'
      });
      result.details.domain = {
        detected: userInputDomain,
        expected: modelDomain,
        match: false,
        score: 0
      };
    } else {
      result.details.domain = {
        detected: userInputDomain,
        expected: modelDomain,
        match: true,
        score: 1
      };
    }

    result.details.scenario = {
      detected: userInputScenario,
      expected: '自动识别',
      match: true,
      score: 1
    };

    return result;
  }

  /**
   * 验证知识库与指标模型的一致性
   */
  validateKnowledgeWithModel(knowledgeEntries, nodes) {
    const result = new ConsistencyResult();

    if (!knowledgeEntries || knowledgeEntries.length === 0 ||
        !nodes || Object.keys(nodes).length === 0) {
      return result;
    }

    // 分析知识库的主导行业
    const knowledgeIndustries = knowledgeEntries.map(k => k.industry).filter(Boolean);
    const industryCount = {};
    knowledgeIndustries.forEach(ind => {
      industryCount[ind] = (industryCount[ind] || 0) + 1;
    });
    const dominantKnowledgeIndustry = Object.entries(industryCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // 分析指标模型的行业
    const allNodeNames = Object.values(nodes).map(n => n.name || '').join(' ');
    const modelIndustry = detectIndustry(allNodeNames);

    // 验证行业一致性
    if (dominantKnowledgeIndustry &&
        modelIndustry !== INDUSTRY_CATEGORIES.GENERAL &&
        dominantKnowledgeIndustry !== modelIndustry) {
      result.warnings.push({
        type: 'KNOWLEDGE_MODEL_MISMATCH',
        message: `知识库行业（${dominantKnowledgeIndustry}）与指标模型行业（${modelIndustry}）不匹配`,
        severity: 'medium'
      });
      result.details.industry = {
        detected: dominantKnowledgeIndustry,
        expected: modelIndustry,
        match: false,
        score: 0
      };
    } else {
      result.details.industry = {
        detected: dominantKnowledgeIndustry || '未指定',
        expected: modelIndustry,
        match: true,
        score: 1
      };
    }

    return result;
  }

  /**
   * 提取用户输入中的指标名称
   */
  extractMetricsFromText(text, nodes) {
    if (!text || !nodes) return { matched: [], unmatched: [] };

    const nodeNames = Object.values(nodes).map(n => n.name).filter(Boolean);
    const matched = [];
    const unmatched = [];

    // 检查用户输入中是否提到了模型中的指标
    nodeNames.forEach(name => {
      if (text.includes(name)) {
        matched.push(name);
      }
    });

    // 检查是否有未匹配的关键指标词
    const potentialMetrics = text.match(/[\u4e00-\u9fa5]{2,}(率 | 额 | 值 | 比 | 成本 | 费用 | 收入 | 利润| 产能 | 效率 | 质量)/g) || [];
    potentialMetrics.forEach(metric => {
      if (!nodeNames.some(name => name.includes(metric))) {
        unmatched.push(metric);
      }
    });

    return { matched, unmatched };
  }

  /**
   * 执行完整的一致性验证
   */
  validateAll({ userInput, knowledgeEntries, nodes, selectedScenario }) {
    const result = new ConsistencyResult();

    // 1. 用户输入 vs 知识库
    const userKnowledgeResult = this.validateUserInputWithKnowledge(userInput, knowledgeEntries);
    if (!userKnowledgeResult.isConsistent) {
      result.isConsistent = false;
      result.warnings.push(...userKnowledgeResult.warnings);
    }

    // 2. 用户输入 vs 指标模型
    const userModelResult = this.validateUserInputWithModel(userInput, nodes);
    if (!userModelResult.isConsistent) {
      result.isConsistent = false;
      result.warnings.push(...userModelResult.warnings);
    }

    // 3. 知识库 vs 指标模型
    const knowledgeModelResult = this.validateKnowledgeWithModel(knowledgeEntries, nodes);
    result.warnings.push(...knowledgeModelResult.warnings);

    // 计算总体一致性分数
    const warningScores = { high: 0.3, medium: 0.15, low: 0.05 };
    const totalDeduction = result.warnings.reduce(
      (sum, w) => sum + (warningScores[w.severity] || 0),
      0
    );
    result.overallScore = Math.max(0, 1 - totalDeduction);

    // 生成建议
    if (!result.isConsistent) {
      result.suggestions.push(
        '检测到输入与模型/知识库可能存在行业或领域不匹配，建议：',
        '1. 检查是否选择了正确的知识库',
        '2. 确认指标模型是否符合当前业务场景',
        '3. 如果确认无误，可忽略此警告继续执行'
      );
    }

    return result;
  }
}

/**
 * 单例导出
 */
export const consistencyValidationEngine = new ConsistencyValidationEngine();
export default {
  ConsistencyValidationEngine,
  consistencyValidationEngine,
  detectIndustry,
  detectDomain,
  detectScenario,
  INDUSTRY_CATEGORIES,
  DOMAIN_CATEGORIES,
  SCENARIO_CATEGORIES
};
