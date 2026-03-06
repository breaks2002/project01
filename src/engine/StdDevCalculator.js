/**
 * 标准差分析计算器
 * 用于分析各节点的业绩稳定性（A 维度）和目标达成度（B 维度）
 */
import { FormulaParser } from './FormulaParser';

/**
 * 计算单个节点的标准差分析数据
 * @param {Object} node - 节点对象
 * @param {string[]} months - 月份数组 ['1月', '2月', ...]
 * @param {Object} options - 配置选项
 * @returns {Object} 标准差分析结果
 */
export function calculateStdDev(node, months, options = {}) {
  const {
    dataMode = 'mixed',           // 'mixed' | 'actual-only' | 'forecast-only'
    minMonths = 6,                // 最少月份要求
    thresholds = { A: 0.1, B: 0.1 }, // 阈值
    scenarioName = null           // 方案名称
  } = options;

  // 1. 提取数据
  const data = extractData(node, months, dataMode);

  // 2. 检查数据是否充足
  if (data.values.length < minMonths) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      scenarioId: node.scenarioId || 'current',
      scenarioName: scenarioName || node.scenarioId || '当前方案',
      isInsufficient: true,
      message: `有效数据仅${data.values.length}个月，需至少${minMonths}个月`,
      dataComposition: data.composition,
      quadrant: null,
      insight: null
    };
  }

  // 3. 计算 A 维度：波动性（标准差 + 变异系数）
  const avg = sum(data.values) / data.values.length;
  const variance = sum(data.values.map(v => Math.pow(v - avg, 2))) / data.values.length;
  const stdDevA = Math.sqrt(variance);
  const cvA = avg !== 0 ? stdDevA / Math.abs(avg) : 0;

  // 4. 计算 B 维度：目标偏离（标准差 + 变异系数）
  const deviations = data.values.map((v, i) => v - data.targets[i]);
  const varianceB = sum(deviations.map(d => Math.pow(d, 2))) / deviations.length;
  const stdDevB = Math.sqrt(varianceB);
  const targetAvg = sum(data.targets) / data.targets.length;
  const cvB = targetAvg !== 0 ? stdDevB / Math.abs(targetAvg) : 0;

  // 5. 判定象限
  const quadrant = determineQuadrant(cvA, cvB, thresholds);

  // 6. 生成洞察
  const insight = generateInsight(quadrant, cvA, cvB);

  // 7. 返回结果
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    scenarioId: node.scenarioId || 'current',
    scenarioName: scenarioName || node.scenarioId || '当前方案',
    isInitialVersion: options.isInitialVersion || false,

    // 计算结果
    cvA,
    cvB,
    stdDevA,
    stdDevB,
    avg,
    targetAvg,

    // 数据构成
    dataComposition: data.composition,
    totalMonths: data.values.length,
    isMixed: data.composition.hasActual && data.composition.hasForecast,

    // 象限与洞察
    quadrant,
    insight,

    // 可视化属性
    visual: {
      color: getNodeCategoryColor(node),
      symbol: getScenarioSymbol(node.scenarioId, options.scenarioIndex),
      fill: options.isInitialVersion ? 'light' : 'dark'
    },

    // 明细数据（用于表格导出）
    monthlyData: data.monthlyDetail
  };
}

/**
 * 提取数据（支持自动识别混合模式）
 */
function extractData(node, months, dataMode) {
  const values = [];
  const targets = [];
  const monthlyDetail = [];
  let hasActual = false;
  let hasForecast = false;

  // 使用 JSON.parse(JSON.stringify()) 来获取纯对象
  let timeDataObj = node.timeData;
  try {
    // 如果是响应式对象，尝试转换为纯对象
    if (timeDataObj && typeof timeDataObj === 'object') {
      timeDataObj = JSON.parse(JSON.stringify(timeDataObj));
    }
  } catch (e) {
    console.warn('[StdDevCalculator] 无法转换 timeData 为纯对象:', e);
  }

  console.log('[StdDevCalculator.extractData] timeDataObj:', timeDataObj);
  console.log('[StdDevCalculator.extractData] timeDataObj keys:', timeDataObj ? Object.keys(timeDataObj) : []);

  months.forEach(month => {
    // 从 "1 月" 或 "1月" 提取月份数字 "1"
    const monthNum = month.replace(/[^0-9]/g, '');

    // 尝试多种可能的键名格式
    const findMatchingKey = (baseName) => {
      const patterns = [
        `${monthNum}月${baseName}`,      // 1月实际 (最常见格式，来自 TrendChart)
        `${monthNum}月 ${baseName}`,     // 1月 实际
        month + baseName,                 // 1 月实际
        month + ' ' + baseName,           // 1 月 实际
        month.trim() + baseName,
        month.trim() + ' ' + baseName
      ];

      for (const pattern of patterns) {
        if (timeDataObj?.[pattern] !== undefined) {
          return { key: pattern, value: timeDataObj[pattern] };
        }
      }

      // 尝试从 Object.keys 中模糊查找
      const keys = timeDataObj ? Object.keys(timeDataObj) : [];
      const foundKey = keys.find(key =>
        (key.includes(monthNum) || key.includes(month)) && key.includes(baseName)
      );
      if (foundKey) {
        return { key: foundKey, value: timeDataObj[foundKey] };
      }

      return null;
    };

    const actualResult = findMatchingKey('实际');
    const forecastResult = findMatchingKey('预测');
    const targetResult = findMatchingKey('目标');

    const actual = actualResult?.value ?? null;
    const forecast = forecastResult?.value ?? null;
    const target = targetResult?.value ?? null;

    console.log(`[StdDevCalculator.extractData] ${month} (${monthNum}月):`, {
      actual,
      forecast,
      target,
      actualKey: actualResult?.key,
      forecastKey: forecastResult?.key,
      targetKey: targetResult?.key
    });

    let value = null;
    let source = null;

    // 处理可能的对象格式
    const getNumericValue = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object' && v.value !== undefined) return parseFloat(v.value);
      return parseFloat(v);
    };

    const actualVal = getNumericValue(actual);
    const forecastVal = getNumericValue(forecast);
    const targetVal = getNumericValue(target);

    if (dataMode === 'mixed') {
      // 自动识别：实际优先
      if (actualVal != null && !isNaN(actualVal)) {
        value = actualVal;
        source = 'actual';
        hasActual = true;
      } else if (forecastVal != null && !isNaN(forecastVal)) {
        value = forecastVal;
        source = 'forecast';
        hasForecast = true;
      }
    } else if (dataMode === 'actual-only') {
      if (actualVal != null && !isNaN(actualVal)) {
        value = actualVal;
        source = 'actual';
        hasActual = true;
      }
    } else if (dataMode === 'forecast-only') {
      if (forecastVal != null && !isNaN(forecastVal)) {
        value = forecastVal;
        source = 'forecast';
        hasForecast = true;
      }
    }

    if (value != null && targetVal != null && !isNaN(value) && !isNaN(targetVal)) {
      values.push(value);
      targets.push(targetVal);
      monthlyDetail.push({
        month,
        value,
        target: targetVal,
        deviation: value - targetVal,
        source
      });
    }
  });

  console.log('[StdDevCalculator.extractData] result:', {
    values: values.length,
    targets: targets.length,
    hasActual,
    hasForecast,
    values,
    targets
  });

  return {
    values,
    targets,
    monthlyDetail,
    composition: {
      hasActual,
      hasForecast,
      actualCount: monthlyDetail.filter(d => d.source === 'actual').length,
      forecastCount: monthlyDetail.filter(d => d.source === 'forecast').length
    }
  };
}

/**
 * 批量计算所有节点
 */
export function calculateAllStdDev(nodes, scenarios, months, options) {
  const results = [];
  const currentScenarioId = options.currentScenarioId || 'current';

  // 获取选中的方案，如果没有选中则使用当前方案
  const selectedScenarios = options.selectedScenarios || [];
  const scenariosToProcess = selectedScenarios.length > 0
    ? selectedScenarios
    : [currentScenarioId];

  console.log('[StdDevCalculator] 计算方案:', scenariosToProcess);

  // 遍历每个选中的方案
  scenariosToProcess.forEach((scenarioId, scenarioIndex) => {
    // 获取该方案的信息
    const scenario = scenarios?.[scenarioId];
    const scenarioName = scenario?.name || `方案${scenarioIndex + 1}`;

    console.log('[StdDevCalculator] 处理方案:', scenarioId, scenarioName, 'nodes:', scenario?.nodes);

    // 获取该方案的节点数据
    let scenarioNodes;
    if (scenarioId === options.currentScenarioId) {
      // 对于当前方案，优先使用传入的 nodes（画布上的实时数据，可能包含未保存的调整）
      scenarioNodes = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
    } else if (scenario && scenario.nodes) {
      // 对于其他方案，从 scenarios 对象中获取保存的节点数据
      scenarioNodes = Object.values(scenario.nodes);
    } else {
      // 降级：使用传入的 nodes
      scenarioNodes = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
    }

    console.log('[StdDevCalculator] 节点数量:', scenarioNodes.length);

    // 获取需要分析的节点（排除聚合节点）
    const nodesToAnalyze = scenarioNodes.filter(node => node && node.type !== 'aggregate');

    console.log('[StdDevCalculator] 需要分析的节点（非聚合）:', nodesToAnalyze.length);

    // 如果需要对比初始版本，先计算初始版本
    if (options.compareInitial) {
      nodesToAnalyze.forEach(node => {
        const initialNode = getInitialVersionNode(node, scenarioNodes);
        if (initialNode) {
          results.push(calculateStdDev(initialNode, months, {
            ...options,
            isInitialVersion: true,
            scenarioId: scenarioId,
            scenarioName: scenarioName,
            scenarioIndex: scenarioIndex
          }));
        }
      });
    }

    // 计算当前版本
    nodesToAnalyze.forEach(node => {
      const result = calculateStdDev(node, months, {
        ...options,
        isInitialVersion: false,
        scenarioId: scenarioId,
        scenarioName: scenarioName,
        scenarioIndex: scenarioIndex
      });
      results.push(result);
    });
  });

  console.log('[StdDevCalculator] 计算结果总数:', results.length);
  return results;
}

/**
 * 判定象限
 */
export function determineQuadrant(cvA, cvB, thresholds) {
  const { A: thresholdA, B: thresholdB } = thresholds;

  const isALow = cvA <= thresholdA;
  const isBLow = cvB <= thresholdB;

  if (isALow && isBLow) {
    return { id: 4, name: '理想区', label: '稳定且精准', color: '#d1fae5' };
  }
  if (isALow && !isBLow) {
    return { id: 3, name: '稳定区', label: '稳定但偏离', color: '#dbeafe' };
  }
  if (!isALow && isBLow) {
    return { id: 2, name: '风险区', label: '波动但接近', color: '#fef3c7' };
  }
  return { id: 1, name: '改进区', label: '波动且偏离', color: '#fee2e2' };
}

/**
 * 生成洞察建议
 */
export function generateInsight(quadrant, cvA, cvB) {
  const baseInsights = {
    1: {
      title: '需要重点关注和改进',
      desc: '波动大且偏离目标，建议分析原因并采取改进措施',
      priority: 'high'
    },
    2: {
      title: '警惕潜在风险',
      desc: '虽然接近目标，但波动较大，需关注稳定性',
      priority: 'medium'
    },
    3: {
      title: '需调整目标设定',
      desc: '表现稳定但系统性偏离，建议评估目标合理性',
      priority: 'medium'
    },
    4: {
      title: '表现优秀',
      desc: '业绩稳定且接近目标，保持现有策略',
      priority: 'low'
    }
  };

  return {
    ...baseInsights[quadrant.id],
    cvA: cvA.toFixed(3),
    cvB: cvB.toFixed(3),
    cvAInterp: interpretCV(cvA),
    cvBInterp: interpretCV(cvB)
  };
}

/**
 * 解释变异系数
 */
function interpretCV(cv) {
  if (cv < 0.05) return '极低';
  if (cv < 0.1) return '低';
  if (cv < 0.2) return '中等';
  if (cv < 0.3) return '高';
  return '极高';
}

/**
 * 获取节点类别颜色
 */
export function getNodeCategoryColor(node) {
  const name = node.name.toLowerCase();
  if (name.includes('净利润') || name.includes('利润')) return '#1e40af';
  if (name.includes('收入') || name.includes('销售')) return '#16a34a';
  if (name.includes('成本')) return '#dc2626';
  if (name.includes('毛利')) return '#9333ea';
  if (name.includes('费用')) return '#ea580c';
  return '#6b7280';
}

/**
 * 获取节点类别标签
 */
export function getNodeCategoryLabel(node) {
  const name = node.name.toLowerCase();
  if (name.includes('净利润') || name.includes('利润')) return '利润';
  if (name.includes('收入') || name.includes('销售')) return '收入';
  if (name.includes('成本')) return '成本';
  if (name.includes('毛利')) return '毛利';
  if (name.includes('费用')) return '费用';
  return '其他';
}

/**
 * 获取方案符号
 */
export function getScenarioSymbol(scenarioId, scenarioIndex = 0) {
  const symbols = ['triangle', 'circle', 'square', 'diamond', 'pentagon'];
  // 如果有索引，按索引取；否则按 id 哈希
  if (typeof scenarioIndex === 'number') {
    return symbols[scenarioIndex % symbols.length];
  }
  // 按 id 的字符编码来选择
  let hash = 0;
  const idStr = String(scenarioId);
  for (let i = 0; i < idStr.length; i++) {
    hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
    hash = hash & hash; // 转为 32 位整数
  }
  return symbols[Math.abs(hash) % symbols.length];
}

// ========================================================================
// 辅助函数：动态计算计算指标的初始 timeData（基于驱动因子的 originalTimeData）
// ========================================================================
function computeInitialTimeDataForComputed(targetNode, allNodesMap) {
  if (!targetNode || targetNode.type === 'driver' || !targetNode.formula) {
    return null;
  }

  try {
    const allNodeIds = Object.keys(allNodesMap);
    const deps = FormulaParser.extractDependencies(targetNode.formula, allNodeIds);

    // 收集所有月份标签
    const monthKeys = new Set();
    deps.forEach(depId => {
      const depNode = allNodesMap[depId];
      if (depNode) {
        const dataToUse = depNode.originalTimeData || depNode.timeData || {};
        Object.keys(dataToUse).forEach(key => monthKeys.add(key));
      }
    });

    // 检查是否是 MONTHLY 节点
    if (FormulaParser.hasMonthlyFunction(targetNode.formula)) {
      const detected = FormulaParser.detectMonthlyFunction(targetNode.formula);
      if (!detected) return null;

      const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
      const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);
      const timeDataResult = {};

      // 检查是否有外层公式
      const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
      const hasOuterFormula = formulaWithPlaceholder !== placeholder;
      let outerCompileFn = null;
      if (hasOuterFormula) {
        try {
          outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        } catch (e) {}
      }

      // 对每个月计算
      monthKeys.forEach(monthKey => {
        try {
          const monthValues = {};
          innerDeps.forEach(depId => {
            const depNode = allNodesMap[depId];
            if (depNode) {
              // 用依赖节点的 originalTimeData（如果是驱动因子）
              // 或者递归计算（如果是计算指标）
              if (depNode.type === 'driver') {
                const data = depNode.originalTimeData || depNode.timeData;
                if (data && data[monthKey] !== undefined) {
                  monthValues[depId] = data[monthKey];
                } else {
                  monthValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                }
              } else {
                // 递归计算计算指标的初始值
                const depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                if (depInitialData && depInitialData[monthKey] !== undefined) {
                  monthValues[depId] = depInitialData[monthKey];
                } else {
                  monthValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                }
              }
            }
          });

          let monthValue = innerCompileFn(monthValues);
          if (hasOuterFormula && outerCompileFn) {
            try {
              monthValue = outerCompileFn({ [placeholder]: monthValue });
            } catch (e) {}
          }
          timeDataResult[monthKey] = monthValue;
        } catch (e) {}
      });

      return timeDataResult;
    }

    // 普通计算指标（非 MONTHLY）
    const compileFn = FormulaParser.compile(targetNode.formula, allNodeIds);
    const timeDataResult = {};

    monthKeys.forEach(monthKey => {
      try {
        const monthValues = {};
        deps.forEach(depId => {
          const depNode = allNodesMap[depId];
          if (depNode) {
            if (depNode.type === 'driver') {
              // 驱动因子：用 originalTimeData
              const data = depNode.originalTimeData || depNode.timeData;
              if (data && data[monthKey] !== undefined) {
                monthValues[depId] = data[monthKey];
              } else {
                monthValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
              }
            } else {
              // 计算指标：递归计算初始值
              const depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
              if (depInitialData && depInitialData[monthKey] !== undefined) {
                monthValues[depId] = depInitialData[monthKey];
              } else {
                monthValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
              }
            }
          }
        });
        timeDataResult[monthKey] = compileFn(monthValues);
      } catch (e) {}
    });

    return timeDataResult;
  } catch (e) {
    console.error('computeInitialTimeDataForComputed error:', e);
    return null;
  }
}

/**
 * 获取初始版本节点
 */
function getInitialVersionNode(currentNode, allNodes) {
  // 构建 allNodesMap 用于递归计算
  const allNodesMap = {};
  allNodes.forEach(node => {
    if (node && node.id) {
      allNodesMap[node.id] = node;
    }
  });

  let initialTimeData = null;

  if (currentNode.type === 'driver') {
    // 驱动因子：直接使用 originalTimeData
    initialTimeData = currentNode.originalTimeData && Object.keys(currentNode.originalTimeData).length > 0
      ? currentNode.originalTimeData
      : currentNode.timeData;
  } else {
    // 计算指标：动态计算初始数据
    const computedInitial = computeInitialTimeDataForComputed(currentNode, allNodesMap);
    if (computedInitial && Object.keys(computedInitial).length > 0) {
      initialTimeData = computedInitial;
    } else {
      // 降级：如果动态计算失败，使用保存的 originalTimeData
      initialTimeData = currentNode.originalTimeData && Object.keys(currentNode.originalTimeData).length > 0
        ? currentNode.originalTimeData
        : currentNode.timeData;
    }
  }

  if (initialTimeData) {
    return {
      ...currentNode,
      timeData: initialTimeData,
      isInitialVersion: true
    };
  }
  return null;
}

/**
 * 辅助函数：求和
 */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * 辅助函数：格式化数值
 */
export function formatNumber(num, decimals = 4) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return num.toFixed(decimals);
}
