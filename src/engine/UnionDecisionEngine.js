/**
 * 并集决策引擎
 * 整合 AI 建议、知识库命中结果和兜底策略候选，生成最终调参方案
 */

/**
 * 并集决策配置
 */
const DEFAULT_CONFIG = {
  maxFactors: 5,           // 最多同时调整的因子数（增加到 5 个）
  aiWeight: 0.5,           // AI 建议权重（最高，避免被覆盖）
  knowledgeBaseWeight: 0.35, // 知识库权重
  fallbackWeight: 0.15,      // 兜底策略权重
  crossBoost: 1.15,          // 同时出现的因子加成系数
  minPriorityThreshold: 0.3, // 最低优先级阈值（降低，保留更多候选）
  maxSameSource: 3           // 同一来源最多选几个
};

/**
 * 执行并集决策
 * @param {Array} aiAdjustments - AI 返回的调整建议
 * @param {Array} knowledgeResults - 知识库命中结果
 * @param {Array} fallbackResults - 兜底策略候选结果
 * @param {Object} config - 配置选项
 * @returns {Object} 并集决策结果
 */
export const executeUnionDecision = (
  aiAdjustments = [],
  knowledgeResults = [],
  fallbackResults = [],
  config = DEFAULT_CONFIG
) => {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };

  // 步骤 1：合并去重
  const candidateMap = new Map();

  // 添加 AI 建议（最高优先级）
  aiAdjustments.forEach(item => {
    candidateMap.set(item.nodeId, {
      ...item,
      source: 'ai',
      sources: ['ai'],
      aiData: item,
      knowledgeData: null,
      fallbackData: null
    });
  });

  // 添加知识库结果
  knowledgeResults.forEach(item => {
    const existing = candidateMap.get(item.nodeId);
    if (existing) {
      // 冲突：AI 和知识库都建议
      existing.source = 'ai+knowledge';
      existing.sources = ['ai', 'knowledge'];
      existing.knowledgeData = item;
      // 融合调整值
      fuseAdjustment(existing, item, effectiveConfig, 'knowledge');
    } else {
      candidateMap.set(item.nodeId, {
        ...item,
        source: 'knowledge',
        sources: ['knowledge'],
        aiData: null,
        knowledgeData: item,
        fallbackData: null
      });
    }
  });

  // 添加兜底策略结果
  fallbackResults.forEach(item => {
    const existing = candidateMap.get(item.nodeId);
    if (existing) {
      // 冲突：已存在，融合
      const prevSource = existing.source;
      existing.source = prevSource === 'ai' ? 'ai+fallback' :
                        prevSource === 'knowledge' ? 'knowledge+fallback' :
                        prevSource === 'ai+knowledge' ? 'all' : 'fallback';
      existing.sources = [...new Set([...existing.sources, 'fallback'])];
      existing.fallbackData = item;
      // 融合调整值
      fuseAdjustment(existing, item, effectiveConfig, 'fallback');
    } else {
      candidateMap.set(item.nodeId, {
        ...item,
        source: 'fallback',
        sources: ['fallback'],
        aiData: null,
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
    aiOnly: candidates.filter(c => c.source === 'ai').length,
    knowledgeOnly: candidates.filter(c => c.source === 'knowledge').length,
    fallbackOnly: candidates.filter(c => c.source === 'fallback').length,
    aiKnowledge: candidates.filter(c => c.source === 'ai+knowledge').length,
    aiFallback: candidates.filter(c => c.source === 'ai+fallback').length,
    all: candidates.filter(c => c.source === 'all').length,
    summary: generateUnionSummary(selectedCandidates),
    config: effectiveConfig
  };
};

/**
 * 融合调整值（支持 AI、知识库、兜底策略三方融合）
 * @param {Object} existingItem - 已存在的候选项
 * @param {Object} newItem - 新的候选项
 * @param {Object} config - 配置
 * @param {string} sourceType - 新增的来源类型 ('knowledge' 或 'fallback')
 */
const fuseAdjustment = (existingItem, newItem, config, sourceType) => {
  const { recommendedValue: currentValue } = existingItem;
  let totalWeight = 0;
  let weightedDelta = 0;

  // 如果已有 AI 数据，加入 AI 权重
  if (existingItem.aiData && sourceType !== 'ai') {
    const aiDelta = (existingItem.aiData.recommendedValue || 0) - (existingItem.aiData.currentValue || 0);
    weightedDelta += aiDelta * config.aiWeight;
    totalWeight += config.aiWeight;
  }

  // 如果已有知识库数据，加入知识库权重
  if (existingItem.knowledgeData && sourceType !== 'knowledge') {
    const kbDelta = (existingItem.knowledgeData.recommendedValue || 0) - (existingItem.knowledgeData.currentValue || 0);
    weightedDelta += kbDelta * config.knowledgeBaseWeight;
    totalWeight += config.knowledgeBaseWeight;
  }

  // 如果已有兜底数据，加入兜底权重
  if (existingItem.fallbackData && sourceType !== 'fallback') {
    const fbDelta = (existingItem.fallbackData.recommendedValue || 0) - (existingItem.fallbackData.currentValue || 0);
    weightedDelta += fbDelta * config.fallbackWeight;
    totalWeight += config.fallbackWeight;
  }

  // 添加新项目的贡献
  const newDelta = (newItem.recommendedValue || 0) - (newItem.currentValue || 0);
  if (sourceType === 'knowledge') {
    weightedDelta += newDelta * config.knowledgeBaseWeight;
    totalWeight += config.knowledgeBaseWeight;
  } else if (sourceType === 'fallback') {
    weightedDelta += newDelta * config.fallbackWeight;
    totalWeight += config.fallbackWeight;
  }

  // 计算融合值
  const fusedDelta = totalWeight > 0 ? weightedDelta / totalWeight : newDelta;
  const fusedValue = (existingItem.currentValue || 0) + fusedDelta;

  // 融合置信度（取较高值）
  const fusedConfidence = Math.max(
    existingItem.confidence || 0.7,
    newItem.confidence || 0.5
  );

  // 更新现有对象（不返回新对象，因为 existingItem 是引用）
  existingItem.recommendedValue = Math.round(fusedValue * 100) / 100;
  existingItem.changePercent = Math.round((fusedDelta / (existingItem.currentValue || 1)) * 100 * 100) / 100;
  existingItem.confidence = fusedConfidence;
  existingItem.fusionReason = generateFusionReason(existingItem, sourceType);

  return existingItem;
};

/**
 * 生成融合原因说明
 */
const generateFusionReason = (item, sourceType) => {
  const parts = [];

  if (item.aiData) {
    parts.push(`AI 分析 (${formatValue(item.aiData.recommendedValue)})`);
  }
  if (item.knowledgeData) {
    parts.push(`历史经验 (${formatValue(item.knowledgeData.recommendedValue)})`);
  }
  if (item.fallbackData) {
    parts.push(`数据分析 (${formatValue(item.fallbackData.recommendedValue)})`);
  }

  return parts.length > 1 ? `融合：${parts.join(' + ')}` : (item.changeReason || '基于数据分析');
};

/**
 * 计算综合优先级（AI 优先）
 */
const calculateCombinedPriority = (candidate, config) => {
  let priority = 0;

  // AI 独家的优先级最高
  if (candidate.source === 'ai') {
    priority = 0.9 + (candidate.confidence || 0.7) * 0.1;
  }
  // AI + 知识库融合：次高
  else if (candidate.source === 'ai+knowledge') {
    const similarity = candidate.similarity || 0.6;
    priority = (0.85 + similarity * 0.15) * config.crossBoost;
  }
  // AI + 兜底融合：次高
  else if (candidate.source === 'ai+fallback') {
    const fbPriority = candidate.confidence || candidate.priorityScore || 0.5;
    priority = Math.max(0.85, fbPriority) * config.crossBoost;
  }
  // AI + 知识库 + 兜底三方融合：最高
  else if (candidate.source === 'all') {
    const similarity = candidate.similarity || 0.6;
    const kbPart = 0.85 + similarity * 0.15;
    const fbPart = candidate.confidence || candidate.priorityScore || 0.5;
    priority = Math.max(kbPart, fbPart) * config.crossBoost * 1.05;
  }
  // 仅知识库
  else if (candidate.source === 'knowledge') {
    const similarity = candidate.similarity || 0.6;
    priority = 0.7 + similarity * 0.25;
  }
  // 仅兜底
  else if (candidate.source === 'fallback') {
    priority = candidate.confidence || candidate.priorityScore || 0.5;
  }
  // 知识库 + 兜底融合
  else if (candidate.source === 'knowledge+fallback' || candidate.source === 'both') {
    const similarity = candidate.similarity || 0.6;
    const kbPriority = 0.7 + similarity * 0.25;
    const fbPriority = candidate.confidence || candidate.priorityScore || 0.5;
    priority = Math.max(kbPriority, fbPriority) * config.crossBoost;
  }
  // 默认
  else {
    priority = candidate.confidence || 0.5;
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

  const aiCount = candidates.filter(c => c.source === 'ai').length;
  const knowledgeCount = candidates.filter(c => c.source === 'knowledge').length;
  const fallbackCount = candidates.filter(c => c.source === 'fallback').length;
  const aiKnowledgeCount = candidates.filter(c => c.source === 'ai+knowledge').length;
  const aiFallbackCount = candidates.filter(c => c.source === 'ai+fallback').length;
  const allCount = candidates.filter(c => c.source === 'all').length;

  const parts = [];
  if (aiCount > 0) parts.push(`AI 推荐 ${aiCount}个`);
  if (knowledgeCount > 0) parts.push(`知识库 ${knowledgeCount}个`);
  if (fallbackCount > 0) parts.push(`兜底策略 ${fallbackCount}个`);
  if (aiKnowledgeCount > 0) parts.push(`AI+ 知识库 ${aiKnowledgeCount}个`);
  if (aiFallbackCount > 0) parts.push(`AI+ 兜底 ${aiFallbackCount}个`);
  if (allCount > 0) parts.push(`三方融合 ${allCount}个`);

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
    const sourceLabel = candidate.source === 'ai' ? 'AI 推荐' :
                        candidate.source === 'knowledge' ? '知识库' :
                        candidate.source === 'fallback' ? '兜底策略' :
                        candidate.source === 'ai+knowledge' ? 'AI+ 知识库' :
                        candidate.source === 'ai+fallback' ? 'AI+ 兜底' :
                        candidate.source === 'all' ? '三方融合' : '融合';

    // 【业务合理性检查】确保建议值在目标值的±5% 范围内
    const targetValue = candidate.targetValue || candidate.currentValue;
    const minAllowed = targetValue * 0.95;
    const maxAllowed = targetValue * 1.05;
    let finalRecommendedValue = candidate.recommendedValue;
    let adjustedReason = candidate.fusionReason || candidate.changeReason || candidate.recommendation;

    if (finalRecommendedValue < minAllowed) {
      console.log(`[并集决策 - 业务合理性] ${candidate.nodeName} 建议值 ${finalRecommendedValue} 低于目标值 95% (${minAllowed})，调整为最低允许值`);
      finalRecommendedValue = Math.round(minAllowed * 100) / 100;
      adjustedReason = `基于业务目标，该${candidate.nodeName}需达到目标范围（目标值±5%），建议调整至${finalRecommendedValue}`;
    } else if (finalRecommendedValue > maxAllowed) {
      console.log(`[并集决策 - 业务合理性] ${candidate.nodeName} 建议值 ${finalRecommendedValue} 高于目标值 105% (${maxAllowed})，调整为最高允许值`);
      finalRecommendedValue = Math.round(maxAllowed * 100) / 100;
      adjustedReason = `基于业务目标，该${candidate.nodeName}需控制在目标范围（目标值±5%），建议调整至${finalRecommendedValue}`;
    }

    return {
      nodeId: candidate.nodeId,
      nodeName: candidate.nodeName,
      currentValue: candidate.currentValue,
      recommendedValue: finalRecommendedValue,
      changePercent: candidate.changePercent,
      changeReason: adjustedReason,
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
