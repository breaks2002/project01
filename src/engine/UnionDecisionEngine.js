/**
 * 并集决策引擎
 * 整合知识库命中结果和兜底策略候选，生成最终调参方案
 */

/**
 * 并集决策配置
 */
const DEFAULT_CONFIG = {
  maxFactors: 3,           // 最多同时调整的因子数
  knowledgeBaseWeight: 0.7, // 知识库权重
  fallbackWeight: 0.3,      // 兜底策略权重
  crossBoost: 1.1,          // 同时出现的因子加成系数
  minPriorityThreshold: 0.5, // 最低优先级阈值
  maxSameSource: 2          // 同一来源最多选几个
};

/**
 * 执行并集决策
 * @param {Array} knowledgeResults - 知识库命中结果
 * @param {Array} fallbackResults - 兜底策略候选结果
 * @param {Object} config - 配置选项
 * @returns {Object} 并集决策结果
 */
export const executeUnionDecision = (
  knowledgeResults = [],
  fallbackResults = [],
  config = DEFAULT_CONFIG
) => {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };

  // 步骤 1：合并去重
  const candidateMap = new Map();

  // 添加知识库结果
  knowledgeResults.forEach(item => {
    candidateMap.set(item.nodeId, {
      ...item,
      source: 'knowledge',
      sources: ['knowledge'],
      knowledgeData: item,
      fallbackData: null
    });
  });

  // 添加兜底策略结果
  fallbackResults.forEach(item => {
    const existing = candidateMap.get(item.nodeId);
    if (existing) {
      // 冲突：同时存在于知识库和兜底
      existing.source = 'both';
      existing.sources = ['knowledge', 'fallback'];
      existing.fallbackData = item;
      // 融合调整值
      existing = fuseAdjustment(existing, item, effectiveConfig);
    } else {
      candidateMap.set(item.nodeId, {
        ...item,
        source: 'fallback',
        sources: ['fallback'],
        knowledgeData: null,
        fallbackData: item
      });
    }
  });

  // 步骤 2：计算综合优先级
  const candidates = Array.from(candidateMap.values()).map(candidate => {
    const priority = calculateCombinedPriority(candidate, effectiveConfig);
    return {
      ...candidate,
      combinedPriority: priority
    };
  });

  // 步骤 3：排序和筛选
  candidates.sort((a, b) => b.combinedPriority - a.combinedPriority);

  // 应用最低优先级阈值
  const qualifiedCandidates = candidates.filter(
    c => c.combinedPriority >= effectiveConfig.minPriorityThreshold
  );

  // 应用同来源限制
  const finalCandidates = applySourceLimit(qualifiedCandidates, effectiveConfig);

  // 步骤 4：截取 Top N
  const selectedCandidates = finalCandidates.slice(0, effectiveConfig.maxFactors);

  return {
    success: true,
    totalCandidates: candidates.length,
    selectedCount: selectedCandidates.length,
    selectedCandidates,
    knowledgeOnly: knowledgeResults.length,
    fallbackOnly: fallbackResults.length,
    bothCount: candidates.filter(c => c.source === 'both').length,
    summary: generateUnionSummary(selectedCandidates),
    config: effectiveConfig
  };
};

/**
 * 融合知识库和兜底策略的调整值
 */
const fuseAdjustment = (knowledgeItem, fallbackItem, config) => {
  const { recommendedValue: kbValue, currentValue } = knowledgeItem;
  const { recommendedValue: fbValue } = fallbackItem;

  // 计算调整幅度
  const kbDelta = kbValue - currentValue;
  const fbDelta = fbValue - currentValue;

  // 加权融合
  const fusedDelta = kbDelta * config.knowledgeBaseWeight + fbDelta * config.fallbackWeight;
  const fusedValue = currentValue + fusedDelta;

  // 融合置信度（取较高值）
  const fusedConfidence = Math.max(
    knowledgeItem.confidence || 0.7,
    fallbackItem.confidence || 0.5
  );

  return {
    ...knowledgeItem,
    recommendedValue: Math.round(fusedValue * 100) / 100,
    changePercent: Math.round((fusedDelta / currentValue) * 100 * 100) / 100,
    confidence: fusedConfidence,
    fusedFrom: {
      knowledge: { value: kbValue, delta: kbDelta },
      fallback: { value: fbValue, delta: fbDelta }
    },
    fusionReason: `结合历史经验（${formatValue(kbValue)}）和当前分析（${formatValue(fbValue)}）`
  };
};

/**
 * 计算综合优先级
 */
const calculateCombinedPriority = (candidate, config) => {
  let priority = 0;

  if (candidate.source === 'knowledge') {
    // 仅知识库：P = 0.8 + (相似度 × 0.2)
    const similarity = candidate.similarity || 0.6;
    priority = 0.8 + similarity * 0.2;
  } else if (candidate.source === 'fallback') {
    // 仅兜底：使用原有的 priorityScore
    priority = candidate.confidence || candidate.priorityScore || 0.5;
  } else {
    // 同时出现：max(知识库分，兜底分) × 1.1
    const similarity = candidate.similarity || 0.6;
    const kbPriority = 0.8 + similarity * 0.2;
    const fbPriority = candidate.confidence || candidate.priorityScore || 0.5;
    priority = Math.max(kbPriority, fbPriority) * config.crossBoost;
  }

  return Math.round(priority * 100) / 100;
};

/**
 * 应用同来源限制
 */
const applySourceLimit = (candidates, config) => {
  let knowledgeCount = 0;
  let fallbackCount = 0;
  const result = [];

  for (const candidate of candidates) {
    if (candidate.source === 'knowledge' && knowledgeCount >= config.maxSameSource) {
      continue;
    }
    if (candidate.source === 'fallback' && fallbackCount >= config.maxSameSource) {
      continue;
    }

    if (candidate.source === 'knowledge') knowledgeCount++;
    if (candidate.source === 'fallback') fallbackCount++;

    result.push(candidate);
  }

  return result;
};

/**
 * 生成并集决策摘要
 */
const generateUnionSummary = (candidates) => {
  if (candidates.length === 0) {
    return '无符合条件的候选因子';
  }

  const knowledgeCount = candidates.filter(c => c.source === 'knowledge').length;
  const fallbackCount = candidates.filter(c => c.source === 'fallback').length;
  const bothCount = candidates.filter(c => c.source === 'both').length;

  const parts = [];
  if (knowledgeCount > 0) parts.push(`知识库 ${knowledgeCount}个`);
  if (fallbackCount > 0) parts.push(`兜底策略 ${fallbackCount}个`);
  if (bothCount > 0) parts.push(`融合 ${bothCount}个`);

  return `最终方案：${parts.join('，')}，共 ${candidates.length}个因子`;
};

/**
 * 格式化数值
 */
const formatValue = (value) => {
  if (!value && value !== 0) return 'N/A';
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + 'k';
  return value.toFixed(1);
};

/**
 * 将并集决策结果转换为 AI 调参格式
 */
export const convertToAIFORMat = (unionResult) => {
  return unionResult.selectedCandidates.map(candidate => {
    const sourceLabel = candidate.source === 'knowledge' ? '知识库' :
                        candidate.source === 'fallback' ? '兜底策略' : '融合';

    return {
      nodeId: candidate.nodeId,
      nodeName: candidate.nodeName,
      currentValue: candidate.currentValue,
      recommendedValue: candidate.recommendedValue,
      changePercent: candidate.changePercent,
      changeReason: candidate.fusionReason || candidate.changeReason || candidate.recommendation,
      dataBasis: candidate.dataBasis || '基于数据分析',
      businessReason: candidate.businessReason || '支持业务目标达成',
      riskWarning: candidate.riskWarning || '风险可控',
      monthlyStrategy: candidate.monthlyStrategy || '平均分配',
      monthlyFactors: candidate.monthlyFactors || new Array(12).fill(1.0),
      confidence: candidate.confidence,
      source: sourceLabel,
      similarity: candidate.similarity
    };
  });
};

/**
 * 并集决策引擎类
 */
class UnionDecisionEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lastResult = null;
  }

  /**
   * 执行并集决策
   */
  decide(knowledgeResults, fallbackResults) {
    const result = executeUnionDecision(
      knowledgeResults,
      fallbackResults,
      this.config
    );
    this.lastResult = result;
    return result;
  }

  /**
   * 获取最终调整方案
   */
  getAdjustments() {
    if (!this.lastResult) {
      return [];
    }
    return convertToAIFORMat(this.lastResult);
  }

  /**
   * 获取摘要
   */
  getSummary() {
    if (!this.lastResult) {
      return '未执行决策';
    }
    return this.lastResult.summary;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default UnionDecisionEngine;
