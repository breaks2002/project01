import { create } from 'zustand';
import { Calculator } from '../engine/Calculator';
import { FormulaParser } from '../engine/FormulaParser';
import { aggregateTimeData } from '../utils/formatters';
import { encryptApiKey, decryptApiKey } from '../services/aiService';

// localStorage key 和数据版本
const STORAGE_KEY = 'vdt-store-data';
const DATA_VERSION_KEY = 'vdt-data-version';
const CURRENT_DATA_VERSION = '3.4'; // 更新数据时修改版本号
const AI_CONFIG_KEY = 'vdt-ai-config';

/**
 * 计算 MONTHLY 公式的初始值（用原始月度数据）
 * 返回 { value, timeData }
 */
function calculateMonthlyInitialValue(node, allNodes, allNodeIds) {
  if (!node.formula || !FormulaParser.hasMonthlyFunction(node.formula)) {
    return null;
  }

  const detected = FormulaParser.detectMonthlyFunction(node.formula);
  if (!detected) return null;

  const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
  const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);
  const monthValuesArray = [];
  const timeData = {};

  // 收集所有月份标签（实际+预测，不包括目标）
  const monthKeys = new Set();
  innerDeps.forEach(depId => {
    const depNode = allNodes[depId];
    if (depNode && depNode.originalTimeData) {
      Object.keys(depNode.originalTimeData).forEach(key => {
        if (!key.includes('目标')) {
          monthKeys.add(key);
        }
      });
    }
  });

  // 检查是否有外层公式需要应用
  const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(node.formula);
  const hasOuterFormula = formulaWithPlaceholder !== placeholder;
  let outerCompileFn = null;
  if (hasOuterFormula) {
    try {
      outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
    } catch (e) {
      // 忽略
    }
  }

  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = allNodes[depId];
        if (depNode) {
          // 检查这个依赖是不是 MONTHLY 节点
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            // 是 MONTHLY 节点，我们需要计算它在这个月的值！
            const depMonthlyValue = calculateSingleMonthValueForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
            monthValues[depId] = depMonthlyValue;
          } else if (depNode.originalTimeData && depNode.originalTimeData[monthKey] !== undefined) {
            // 普通节点，有月度数据
            monthValues[depId] = depNode.originalTimeData[monthKey];
          } else {
            // 兜底
            monthValues[depId] = depNode.baseline ?? depNode.value ?? 0;
          }
        }
      });
      let monthValue = innerCompileFn(monthValues);

      // 如果有外层公式，也应用到这个月的值上！
      if (hasOuterFormula && outerCompileFn) {
        try {
          monthValue = outerCompileFn({ [placeholder]: monthValue });
        } catch (e) {
          // 忽略
        }
      }

      timeData[monthKey] = monthValue;
      monthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略
    }
  });

  // 重新计算：先聚合内部表达式的值，再应用外层公式（用于最终 value）
  const innerMonthValuesArray = [];
  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = allNodes[depId];
        if (depNode) {
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            const depMonthlyValue = calculateSingleMonthValueForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
            monthValues[depId] = depMonthlyValue;
          } else if (depNode.originalTimeData && depNode.originalTimeData[monthKey] !== undefined) {
            monthValues[depId] = depNode.originalTimeData[monthKey];
          } else {
            monthValues[depId] = depNode.baseline ?? depNode.value ?? 0;
          }
        }
      });
      const monthValue = innerCompileFn(monthValues);
      innerMonthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略
    }
  });

  let aggregatedValue = aggregateMonthlyValues(innerMonthValuesArray, detected.type);
  let finalValue = aggregatedValue;
  if (hasOuterFormula && outerCompileFn) {
    try {
      finalValue = outerCompileFn({ [placeholder]: aggregatedValue });
    } catch (e) {
      finalValue = aggregatedValue;
    }
  }

  return {
    value: isNaN(finalValue) ? null : finalValue,
    timeData: timeData
  };
}

/**
 * 计算某个 MONTHLY 节点在指定月份的值（用于嵌套 MONTHLY 计算）
 * 注意：如果这个 MONTHLY 节点有外层公式（如 "/ 100"），也需要应用到单月值上
 */
function calculateSingleMonthValueForMonthlyNode(monthlyNode, allNodes, allNodeIds, monthKey) {
  const detected = FormulaParser.detectMonthlyFunction(monthlyNode.formula);
  if (!detected) return monthlyNode.initialBaseline ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;

  const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
  const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);

  try {
    const monthValues = {};
    innerDeps.forEach(depId => {
      const depNode = allNodes[depId];
      if (depNode) {
        // 递归检查：如果依赖也是 MONTHLY 节点
        if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
          monthValues[depId] = calculateSingleMonthValueForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
        } else if (depNode.originalTimeData && depNode.originalTimeData[monthKey] !== undefined) {
          monthValues[depId] = depNode.originalTimeData[monthKey];
        } else {
          monthValues[depId] = depNode.baseline ?? depNode.value ?? 0;
        }
      }
    });
    let innerValue = innerCompileFn(monthValues);

    // 检查是否有外层公式，如果有也需要应用！
    // 例如公式是 "MONTHLY_SUM(A * B) / 100"，那么每个月的值也需要除以 100
    const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(monthlyNode.formula);
    if (formulaWithPlaceholder !== placeholder) {
      try {
        const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        innerValue = outerCompileFn({ [placeholder]: innerValue });
      } catch (e) {
        // 忽略外层公式错误
      }
    }

    return innerValue;
  } catch (e) {
    return monthlyNode.initialBaseline ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;
  }
}

// 生成唯一ID
function generateId() {
  return 'scenario_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 获取默认方案名称
function getDefaultScenarioName(scenarios) {
  const names = Object.values(scenarios).map(s => s.name);
  let index = 1;
  while (names.includes(`方案${index}`)) {
    index++;
  }
  return `方案${index}`;
}

// 检查方案名称是否重复
function isNameDuplicate(scenarios, name, excludeId = null) {
  return Object.entries(scenarios).some(([id, s]) => id !== excludeId && s.name === name);
}

// 解析层级字符串，返回 { column: number, order: number }
function parseLevel(levelStr) {
  if (!levelStr && levelStr !== 0) return { column: 1, order: 0 };
  const parts = String(levelStr).split('.');
  return {
    column: parseInt(parts[0]) || 1,
    order: parseInt(parts[1]) || 0
  };
}

// 比较两个层级字符串
function compareLevels(a, b) {
  const pa = parseLevel(a);
  const pb = parseLevel(b);
  if (pa.column !== pb.column) return pa.column - pb.column;
  return pa.order - pb.order;
}

// 迁移数据：将数值型 level 转为字符串
function migrateLevelData(nodes) {
  const newNodes = {};
  Object.entries(nodes).forEach(([id, node]) => {
    let level = node.level;
    if (typeof level === 'number') {
      level = String(level);
    }
    newNodes[id] = { ...node, level };
  });
  return newNodes;
}

// 全局计算器实例
const calculator = new Calculator();

/**
 * 递归计算所有依赖节点的 timeData，确保计算时所有依赖都已就绪
 * 返回一个完整的 nodes 副本，其中所有计算节点的 timeData 都已计算
 * 注意：MONTHLY 节点的 timeData 会在后续步骤中单独计算
 */
function ensureAllTimeDataComputed(startNodes, allNodeIds) {
  const nodes = { ...startNodes };
  const computed = new Set(); // 记录已经计算过 timeData 的节点

  // 递归计算节点及其依赖的 timeData
  const computeNodeTimeData = (nodeId) => {
    if (computed.has(nodeId)) return;
    const node = nodes[nodeId];
    if (!node) return;

    // 如果是驱动因子，不需要计算
    if (node.type === 'driver') {
      computed.add(nodeId);
      return;
    }

    // 如果是 MONTHLY 节点，先跳过，后续单独处理
    if (FormulaParser.hasMonthlyFunction(node.formula)) {
      computed.add(nodeId);
      return;
    }

    // 先计算所有依赖的 timeData
    const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);
    deps.forEach(depId => computeNodeTimeData(depId));

    // 现在计算这个节点的 timeData
    const timeData = {};
    const monthKeys = new Set();

    // 收集所有月份标签
    deps.forEach(depId => {
      const depNode = nodes[depId];
      if (depNode && depNode.timeData) {
        Object.keys(depNode.timeData).forEach(key => monthKeys.add(key));
      }
    });

    // 对每个月份单独计算
    const compileFn = FormulaParser.compile(node.formula, allNodeIds);
    monthKeys.forEach(monthKey => {
      try {
        const monthValues = {};
        deps.forEach(depId => {
          const depNode = nodes[depId];
          if (depNode) {
            if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.timeData[monthKey];
            } else {
              monthValues[depId] = node.value ?? 0;
            }
          }
        });
        timeData[monthKey] = compileFn(monthValues);
      } catch (e) {
        // 忽略
      }
    });

    // 更新节点的 timeData
    nodes[nodeId] = { ...node, timeData };
    computed.add(nodeId);
  };

  // 对所有节点执行计算
  allNodeIds.forEach(nodeId => computeNodeTimeData(nodeId));

  return nodes;
}

/**
 * 为计算指标计算每个月的 timeData（已废弃，改用 ensureAllTimeDataComputed）
 */
function calculateComputedTimeData(node, nodes, allNodeIds) {
  if (node.type === 'driver' || !node.formula) {
    return node.timeData || {};
  }

  const timeData = {};

  // 收集所有依赖节点的所有月份标签
  const monthKeys = new Set();
  const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);

  deps.forEach(depId => {
    const depNode = nodes[depId];
    if (depNode && depNode.timeData) {
      Object.keys(depNode.timeData).forEach(key => {
        monthKeys.add(key);
      });
    }
  });

  // 对每个月份单独计算公式
  const compileFn = FormulaParser.compile(node.formula, allNodeIds);

  monthKeys.forEach(monthKey => {
    try {
      // 构建这个月的数值上下文
      const monthValues = {};
      deps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
            monthValues[depId] = depNode.timeData[monthKey];
          } else {
            monthValues[depId] = depNode.value ?? 0;
          }
        }
      });

      // 计算这个月的值
      timeData[monthKey] = compileFn(monthValues);
    } catch (e) {
      // 忽略计算失败的月份
    }
  });

  return timeData;
}

/**
 * 聚合月度值
 * @param {Array} values - 各月值数组
 * @param {string} aggregationType - 聚合类型：SUM、AVG、AVERAGE、MIN、MAX、COUNT、COUNT_NONZERO、COUNT_EXISTS、DISTINCT
 * @returns {number} 聚合结果
 */
function aggregateMonthlyValues(values, aggregationType) {
  // 筛选有效数字（排除 null/undefined/NaN）
  const validNumbers = values.filter(v => {
    const num = parseFloat(v);
    return !isNaN(num) && isFinite(num);
  }).map(v => parseFloat(v));

  switch (aggregationType.toUpperCase()) {
    case 'SUM':
      return validNumbers.reduce((a, b) => a + b, 0);

    case 'AVG':
      return validNumbers.length > 0
        ? validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length
        : 0;

    case 'MIN':
      return validNumbers.length > 0 ? Math.min(...validNumbers) : 0;

    case 'MAX':
      return validNumbers.length > 0 ? Math.max(...validNumbers) : 0;

    case 'COUNT':
      // 统计有效数字（包含 0，排除 null/undefined/NaN）
      return validNumbers.length;

    case 'COUNT_NONZERO':
      // 统计非零有效数字（排除 0、null、undefined、NaN）
      return validNumbers.filter(v => v !== 0).length;

    case 'COUNT_EXISTS':
      // 统计所有存在的月份（只要月份存在就计数，包括 null/undefined/NaN）
      return values.length;

    case 'DISTINCT':
      // 统计不同值的数量
      return new Set(validNumbers).size;

    default:
      // 默认用 SUM
      return validNumbers.reduce((a, b) => a + b, 0);
  }
}

/**
 * 使用原始目标数据计算节点的目标值
 * 这个值在节点创建/导入时计算一次，之后不再变化
 * @param {object} node - 节点
 * @param {object} allNodes - 所有节点（用于获取依赖的原始目标数据）
 * @param {Array<string>} allNodeIds - 所有节点 ID
 * @returns {number} 计算出的目标值
 */
function calculateTargetValue(node, allNodes, allNodeIds) {
  // 驱动因子：直接返回 originalTimeData 中目标月份的聚合值
  if (node.type === 'driver') {
    if (!node.originalTimeData) return node.baseline ?? node.value ?? 0;

    let targetSum = 0;
    let targetCount = 0;
    Object.entries(node.originalTimeData).forEach(([key, value]) => {
      if (key.includes('目标')) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          targetSum += num;
          targetCount++;
        }
      }
    });

    if (targetCount === 0) return node.baseline ?? node.value ?? 0;

    // 根据 aggregationType 决定是求和还是平均
    let aggType = node.aggregationType;
    if (!aggType) {
      aggType = node.unit === '%' ? 'average' : 'sum';
    }

    if (aggType === 'average') {
      return Math.round(targetSum / targetCount * 100) / 100;
    } else {
      return targetSum;
    }
  }

  // 计算指标
  if (!node.formula) return node.baseline ?? node.value ?? 0;

  // 检查是否是 MONTHLY 节点
  if (FormulaParser.hasMonthlyFunction(node.formula)) {
    const detected = FormulaParser.detectMonthlyFunction(node.formula);
    if (!detected) return node.baseline ?? node.value ?? 0;

    // 1. 提取内部表达式的依赖
    const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
    const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);
    const monthValuesArray = [];

    // 收集所有目标月份
    const monthKeys = new Set();
    innerDeps.forEach(depId => {
      const depNode = allNodes[depId];
      if (depNode && depNode.originalTimeData) {
        Object.keys(depNode.originalTimeData).forEach(key => {
          if (key.includes('目标')) {
            monthKeys.add(key);
          }
        });
      }
    });

    monthKeys.forEach(monthKey => {
      try {
        const monthValues = {};
        innerDeps.forEach(depId => {
          const depNode = allNodes[depId];
          if (depNode) {
            // 检查这个依赖是不是 MONTHLY 节点
            if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
              // 是 MONTHLY 节点，递归计算它的目标月值
              const depMonthlyValue = calculateSingleMonthTargetForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
              monthValues[depId] = depMonthlyValue;
            } else if (depNode.originalTimeData && depNode.originalTimeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.originalTimeData[monthKey];
            } else {
              monthValues[depId] = depNode.targetValue ?? depNode.baseline ?? depNode.value ?? 0;
            }
          }
        });
        const monthValue = innerCompileFn(monthValues);
        monthValuesArray.push(monthValue);
      } catch (e) {
        // 忽略
      }
    });

    // 4. 按聚合类型计算
    const aggregatedValue = aggregateMonthlyValues(monthValuesArray, detected.type);

    // 5. 计算外层公式
    let finalValue = aggregatedValue;
    const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(node.formula);
    if (formulaWithPlaceholder !== placeholder) {
      try {
        const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        finalValue = outerCompileFn({ [placeholder]: aggregatedValue });
      } catch (e) {
        finalValue = aggregatedValue;
      }
    }

    return isNaN(finalValue) ? (node.baseline ?? node.value ?? 0) : finalValue;
  }

  // 普通计算指标（非 MONTHLY）
  // 直接用依赖节点的 targetValue 来计算（不按月计算再求和）
  // 因为依赖的 targetValue 已经按它们自己的 aggregationType 聚合好了
  const deps = FormulaParser.extractDependencies(node.formula, allNodeIds);
  const compileFn = FormulaParser.compile(node.formula, allNodeIds);
  const targetValues = {};
  deps.forEach(depId => {
    const depNode = allNodes[depId];
    if (depNode) {
      targetValues[depId] = depNode.targetValue ?? depNode.baseline ?? depNode.value ?? 0;
    }
  });

  try {
    const result = compileFn(targetValues);
    return isNaN(result) ? (node.baseline ?? node.value ?? 0) : result;
  } catch (e) {
    return node.baseline ?? node.value ?? 0;
  }
}

/**
 * 计算某个 MONTHLY 节点在指定目标月份的值（用于嵌套 MONTHLY 计算目标值）
 * 注意：如果这个 MONTHLY 节点有外层公式（如 "/ 100"），也需要应用到单月值上
 */
function calculateSingleMonthTargetForMonthlyNode(monthlyNode, allNodes, allNodeIds, monthKey) {
  const detected = FormulaParser.detectMonthlyFunction(monthlyNode.formula);
  if (!detected) return monthlyNode.targetValue ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;

  const innerDeps = FormulaParser.extractDependencies(detected.inner, allNodeIds);
  const innerCompileFn = FormulaParser.compile(detected.inner, allNodeIds);

  try {
    const monthValues = {};
    innerDeps.forEach(depId => {
      const depNode = allNodes[depId];
      if (depNode) {
        // 递归检查：如果依赖也是 MONTHLY 节点
        if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
          monthValues[depId] = calculateSingleMonthTargetForMonthlyNode(depNode, allNodes, allNodeIds, monthKey);
        } else if (depNode.originalTimeData && depNode.originalTimeData[monthKey] !== undefined) {
          monthValues[depId] = depNode.originalTimeData[monthKey];
        } else {
          monthValues[depId] = depNode.targetValue ?? depNode.baseline ?? depNode.value ?? 0;
        }
      }
    });
    let innerValue = innerCompileFn(monthValues);

    // 检查是否有外层公式，如果有也需要应用！
    // 例如公式是 "MONTHLY_SUM(A * B) / 100"，那么每个月的值也需要除以 100
    const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(monthlyNode.formula);
    if (formulaWithPlaceholder !== placeholder) {
      try {
        const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
        innerValue = outerCompileFn({ [placeholder]: innerValue });
      } catch (e) {
        // 忽略外层公式错误
      }
    }

    return innerValue;
  } catch (e) {
    return monthlyNode.targetValue ?? monthlyNode.baseline ?? monthlyNode.value ?? 0;
  }
}

/**
 * 计算带有 MONTHLY_* 函数的节点值（运行时）
 * 前提：所有依赖节点的 timeData 都已经计算完成
 */
function calculateMonthlyValue(node, nodes, allNodeIds) {
  if (node.type === 'driver' || !node.formula) {
    return null;
  }

  // 检查是否包含任意 MONTHLY 函数
  if (!FormulaParser.hasMonthlyFunction(node.formula)) {
    return null;
  }

  // 1. 检测并提取 MONTHLY 函数
  const {
    formula: formulaWithPlaceholder,
    placeholder,
    inner: innerFormula,
    type: aggregationType
  } = FormulaParser.replaceMonthlyWithPlaceholder(node.formula);

  if (!innerFormula || !placeholder) {
    return null;
  }

  // 2. 收集所有依赖节点的月份标签（只收集「实际」和「预测」，排除「目标」）
  const innerDeps = FormulaParser.extractDependencies(innerFormula, allNodeIds);
  const monthKeys = new Set();
  innerDeps.forEach(depId => {
    const depNode = nodes[depId];
    if (depNode && depNode.timeData) {
      Object.keys(depNode.timeData).forEach(key => {
        if (!key.includes('目标')) {
          monthKeys.add(key);
        }
      });
    }
  });

  // 3. 对每个月单独计算内部表达式
  const innerCompileFn = FormulaParser.compile(innerFormula, allNodeIds);
  const timeData = {};
  const monthValuesArray = [];

  // 检查是否有外层公式需要应用
  const hasOuterFormula = formulaWithPlaceholder !== placeholder;
  let outerCompileFn = null;
  if (hasOuterFormula) {
    try {
      outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
    } catch (e) {
      // 忽略外层公式编译错误
    }
  }

  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          // 检查这个依赖是不是 MONTHLY 节点
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            // 是 MONTHLY 节点，直接用它的 timeData（已经应用过外层公式了）
            if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.timeData[monthKey];
            } else {
              monthValues[depId] = depNode.value ?? 0;
            }
          } else if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
            // 普通节点，有月度数据
            monthValues[depId] = depNode.timeData[monthKey];
          } else {
            monthValues[depId] = depNode.value ?? 0;
          }
        }
      });
      let monthValue = innerCompileFn(monthValues);

      // 如果有外层公式，也应用到这个月的值上！
      // 这样 timeData 里存储的就是完整计算后的值，aggregateTimeData 可以直接用
      if (hasOuterFormula && outerCompileFn) {
        try {
          monthValue = outerCompileFn({ [placeholder]: monthValue });
        } catch (e) {
          // 忽略外层公式错误
        }
      }

      timeData[monthKey] = monthValue;
      monthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略计算失败的月份
    }
  });

  // 4. 根据聚合类型计算聚合值
  // 注意：因为 monthValuesArray 里的值已经应用过外层公式了，
  // 但等等，不对！外层公式是对聚合后的值应用的，不是对每个月的值应用！
  // 哦，这里需要小心处理！

  // 重新计算：先聚合内部表达式的值，再应用外层公式
  const innerTimeData = {}; // 存储没有应用外层公式的内部值
  const innerMonthValuesArray = [];

  monthKeys.forEach(monthKey => {
    try {
      const monthValues = {};
      innerDeps.forEach(depId => {
        const depNode = nodes[depId];
        if (depNode) {
          if (FormulaParser.hasMonthlyFunction(depNode.formula || '')) {
            // 对于 MONTHLY 依赖，我们需要获取它未应用外层公式的值来重新计算？
            // 不，实际上我们应该用之前的递归方式来计算聚合值
            // 让我们简化：直接用 timeData 来聚合，因为 timeData 现在是正确的了
            if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
              monthValues[depId] = depNode.timeData[monthKey];
            } else {
              monthValues[depId] = depNode.value ?? 0;
            }
          } else if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
            monthValues[depId] = depNode.timeData[monthKey];
          } else {
            monthValues[depId] = depNode.value ?? 0;
          }
        }
      });
      const monthValue = innerCompileFn(monthValues);
      innerTimeData[monthKey] = monthValue;
      innerMonthValuesArray.push(monthValue);
    } catch (e) {
      // 忽略
    }
  });

  // 先聚合内部表达式的值
  const innerAggregatedValue = aggregateMonthlyValues(innerMonthValuesArray, aggregationType);

  // 再应用外层公式得到最终值
  let finalValue = innerAggregatedValue;
  if (hasOuterFormula && outerCompileFn) {
    try {
      finalValue = outerCompileFn({ [placeholder]: innerAggregatedValue });
    } catch (e) {
      finalValue = innerAggregatedValue;
    }
  }

  return { total: isNaN(finalValue) ? 0 : finalValue, timeData };
}

/**
 * 检查数据版本是否匹配
 */
function checkDataVersion() {
  try {
    const storedVersion = localStorage.getItem(DATA_VERSION_KEY);
    return storedVersion === CURRENT_DATA_VERSION;
  } catch (e) {
    return false;
  }
}

/**
 * 从 localStorage 加载数据
 */
function loadFromStorage() {
  try {
    const storedVersion = localStorage.getItem(DATA_VERSION_KEY);

    // 版本 1.5 → 1.6 迁移：数值 level → 字符串 level
    if (storedVersion === '1.5') {
      console.log('数据迁移: 1.5 → 1.6');
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // 迁移 level 数据
        if (data.nodes) {
          data.nodes = migrateLevelData(data.nodes);
        }
        // 恢复 collapsedNodeIds 为 Set
        if (data.collapsedNodeIds) {
          data.collapsedNodeIds = new Set(data.collapsedNodeIds);
        }
        // 更新版本号
        localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...data,
          collapsedNodeIds: data.collapsedNodeIds ? Array.from(data.collapsedNodeIds) : []
        }));
        // 再次读取恢复 Set
        data.collapsedNodeIds = data.collapsedNodeIds || new Set();
        return data;
      }
    }

    // 检查数据版本，版本不匹配时清除旧数据
    if (!checkDataVersion()) {
      console.log('数据版本不匹配，清除旧缓存');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DATA_VERSION_KEY);
      return null;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // 恢复 collapsedNodeIds 为 Set
      if (data.collapsedNodeIds) {
        data.collapsedNodeIds = new Set(data.collapsedNodeIds);
      }
      return data;
    }
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
  }
  return null;
}

/**
 * 保存到 localStorage
 */
function saveToStorage(state) {
  try {
    const data = {
      nodes: state.nodes,
      selectedNodeId: state.selectedNodeId,
      scale: state.scale,
      showDataPanel: state.showDataPanel,
      collapsedNodeIds: Array.from(state.collapsedNodeIds),
      scenarios: state.scenarios,
      currentScenarioId: state.currentScenarioId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

/**
 * VDT 应用状态管理
 */
const useVDTStore = create((set, get) => {
  // 尝试从 localStorage 加载初始数据
  const storedData = loadFromStorage();

  // 加载AI配置
  const loadAIConfig = () => {
    try {
      const stored = localStorage.getItem(AI_CONFIG_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return {
          url: config.url || '',
          apiKey: config.apiKey ? decryptApiKey(config.apiKey) : '',
          model: config.model || '',
          provider: config.provider || 'custom',
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 2000,
          systemPrompt: config.systemPrompt || ''
        };
      }
    } catch (e) {
      console.warn('加载AI配置失败:', e);
    }
    return {
      url: '',
      apiKey: '',
      model: '',
      provider: 'custom',
      temperature: 0.7,
      maxTokens: 2000,
      systemPrompt: ''
    };
  };

  const initialAIConfig = loadAIConfig();

  // 初始化默认方案
  const defaultScenarioId = 'scenario_default';
  const initialScenarios = storedData?.scenarios || {
    [defaultScenarioId]: {
      id: defaultScenarioId,
      name: '方案1',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: storedData?.nodes || {}
    }
  };
  const initialScenarioId = storedData?.currentScenarioId || defaultScenarioId;
  // 确保当前方案的 nodes 是激活的
  const initialNodes = initialScenarios[initialScenarioId]?.nodes || storedData?.nodes || {};

  return {
    nodes: initialNodes,
    selectedNodeId: storedData?.selectedNodeId || null,
    scale: storedData?.scale || 1,
    showDataPanel: storedData?.showDataPanel ?? true,
    collapsedNodeIds: storedData?.collapsedNodeIds || new Set(),
    hasLoadedFromStorage: !!storedData,
    scenarios: initialScenarios,
    currentScenarioId: initialScenarioId,

    // AI配置状态
    aiConfig: initialAIConfig,
    setAIConfig: (config) => {
      const newConfig = { ...get().aiConfig, ...config };
      set({ aiConfig: newConfig });
      // 保存到localStorage（API Key加密）
      try {
        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({
          url: newConfig.url,
          apiKey: newConfig.apiKey ? encryptApiKey(newConfig.apiKey) : '',
          model: newConfig.model,
          provider: newConfig.provider,
          temperature: newConfig.temperature,
          maxTokens: newConfig.maxTokens,
          systemPrompt: newConfig.systemPrompt
        }));
      } catch (e) {
        console.warn('保存AI配置失败:', e);
      }
    },

    // 保存到 localStorage 的辅助函数
    _persist: () => {
      const state = get();
      // 直接保存，不自动更新当前方案的 nodes（只有用户主动保存方案时才更新）
      saveToStorage(state);
    },

    // 设置缩放比例
    setScale: (scale) => {
      set({ scale: Math.max(0.5, Math.min(2, scale)) });
      get()._persist();
    },

    // 切换数据面板显示
    toggleDataPanel: () => {
      set((state) => ({ showDataPanel: !state.showDataPanel }));
      get()._persist();
    },

    // 初始化计算器并计算
    _recalculate: (saveOriginalTimeData = false) => {
      const state = get();
      if (Object.keys(state.nodes).length === 0) return;

      const allNodeIds = Object.keys(state.nodes);
      const newNodes = {};

      // === 步骤 0: 备份所有 originalTimeData，确保它们不会被修改 ===
      const originalTimeDataBackup = {};
      allNodeIds.forEach((id) => {
        const node = state.nodes[id];
        if (node && node.originalTimeData) {
          originalTimeDataBackup[id] = JSON.parse(JSON.stringify(node.originalTimeData));
        }
      });

      // === 步骤 1: 先复制所有节点，更新 dependsOn ===
      allNodeIds.forEach((id) => {
        const node = state.nodes[id];
        if (node.type !== 'driver') {
          const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);
          newNodes[id] = { ...node, dependsOn: deps };
        } else {
          newNodes[id] = { ...node };
        }
      });

      // === 步骤 2: 拓扑排序，确定计算顺序 ===
      const inDegree = {};
      const adjacency = {};
      allNodeIds.forEach(id => {
        inDegree[id] = 0;
        adjacency[id] = [];
      });
      allNodeIds.forEach(id => {
        const node = newNodes[id];
        if (node.type === 'driver') return;
        const deps = node.dependsOn || [];
        deps.forEach(depId => {
          if (adjacency[depId]) {
            adjacency[depId].push(id);
            inDegree[id]++;
          }
        });
      });

      const queue = [];
      const order = [];
      allNodeIds.forEach(id => {
        if (inDegree[id] === 0) queue.push(id);
      });
      while (queue.length > 0) {
        const nodeId = queue.shift();
        order.push(nodeId);
        adjacency[nodeId].forEach(nextId => {
          inDegree[nextId]--;
          if (inDegree[nextId] === 0) queue.push(nextId);
        });
      }

      // === 步骤 3: 先按 aggregationType 更新所有驱动因子的 value ===
      // 注意：只有当驱动因子的 value 与 timeData 聚合值一致时（即timeData驱动value），才更新
      // 如果 value 已被用户或AI手动设置（与聚合值不同），则保留当前 value
      allNodeIds.forEach(id => {
        const node = newNodes[id];
        if (node.type === 'driver' && node.timeData) {
          let aggType = node.aggregationType;
          if (!aggType) {
            aggType = node.unit === '%' ? 'average' : 'sum';
          }
          // 用 aggregateTimeData 计算实际+预测的聚合值
          const aggregated = aggregateTimeData(node.timeData, aggType);

          // 获取原始节点（更新前的状态）
          const originalNode = state.nodes[id];
          const originalValue = originalNode?.value;
          const originalBaseline = originalNode?.baseline ?? originalNode?.initialBaseline;

          // 判断 value 是否被手动修改过：
          // 1. 如果当前 value 等于 baseline/initialBaseline（默认值），说明未被手动修改，用 timeData 聚合值
          // 2. 如果当前 value 与 timeData 聚合值差距很小（<0.01），说明是一致的
          // 3. 否则，说明 value 已被手动设置，保留当前 value
          const isValueFromTimeData = originalValue === undefined ||
            Math.abs(originalValue - aggregated.actualPlusForecastTotal) < 0.01 ||
            (originalBaseline !== undefined && Math.abs(originalValue - originalBaseline) < 0.01);

          if (isValueFromTimeData) {
            // value 来自 timeData 聚合，正常更新
            newNodes[id] = { ...node, value: aggregated.actualPlusForecastTotal };
          }
          // 否则：保留当前的 value（node.value 已经在 newNodes 中）
        }
      });

      // === 步骤 4: 计算所有节点的 value（非 timeData）===
      // 先用 Calculator 计算一遍，获得所有节点的初始 value
      calculator.buildFromNodes(newNodes);
      const calculatorValues = calculator.computeAll(newNodes);

      // 把驱动因子的值和 Calculator 计算出的值放进去
      const nodeValues = {};
      allNodeIds.forEach(id => {
        const node = newNodes[id];
        if (node.type === 'driver') {
          nodeValues[id] = node.value ?? 0;
        } else {
          nodeValues[id] = calculatorValues[id] ?? 0;
        }
      });

      // === 步骤 5: 按拓扑顺序计算所有节点的 timeData ===
      order.forEach(nodeId => {
        const node = newNodes[nodeId];
        if (!node || node.type === 'driver') return;

        // 如果是 MONTHLY 节点，timeData 在后面单独处理
        if (FormulaParser.hasMonthlyFunction(node.formula)) return;

        // 计算普通节点的 timeData
        const deps = node.dependsOn || [];
        const monthKeys = new Set();

        deps.forEach(depId => {
          const depNode = newNodes[depId];
          if (depNode && depNode.timeData) {
            Object.keys(depNode.timeData).forEach(key => monthKeys.add(key));
          }
        });

        const compileFn = FormulaParser.compile(node.formula, allNodeIds);
        const timeData = {};

        monthKeys.forEach(monthKey => {
          try {
            const monthValues = {};
            deps.forEach(depId => {
              const depNode = newNodes[depId];
              if (depNode) {
                if (depNode.timeData && depNode.timeData[monthKey] !== undefined) {
                  monthValues[depId] = depNode.timeData[monthKey];
                } else {
                  monthValues[depId] = nodeValues[depId] ?? 0;
                }
              }
            });
            timeData[monthKey] = compileFn(monthValues);
          } catch (e) {
            // 忽略
          }
        });

        // 对于普通计算指标，如果还没有 originalTimeData，用第一次计算出的 timeData
        const nodeUpdates = { ...node, timeData };
        if (!node.originalTimeData && timeData && Object.keys(timeData).length > 0) {
          nodeUpdates.originalTimeData = JSON.parse(JSON.stringify(timeData));
        }
        newNodes[nodeId] = nodeUpdates;
      });

      // === 步骤 6: 计算 MONTHLY 节点的 timeData 和 value ===
      // 注意：按拓扑顺序计算，确保依赖先算好
      order.forEach(nodeId => {
        const node = newNodes[nodeId];
        if (!node || node.type === 'driver') return;
        if (!FormulaParser.hasMonthlyFunction(node.formula)) return;

        // 使用新的 calculateMonthlyValue 函数
        const result = calculateMonthlyValue(node, newNodes, allNodeIds);
        if (result) {
          // 对于 MONTHLY 计算指标，如果还没有 originalTimeData，用第一次计算出的 timeData
          const nodeUpdates = { ...node, value: result.total, timeData: result.timeData };
          if (!node.originalTimeData && result.timeData && Object.keys(result.timeData).length > 0) {
            nodeUpdates.originalTimeData = JSON.parse(JSON.stringify(result.timeData));
          }
          newNodes[nodeId] = nodeUpdates;
          nodeValues[nodeId] = result.total;
        }
      });

      // === 步骤 7: 重新计算所有节点的最终 value（确保引用 MONTHLY 节点的也正确）===
      // 现在 MONTHLY 节点的值已经在 nodeValues 中了，重新计算所有节点
      order.forEach(nodeId => {
        const node = newNodes[nodeId];
        if (!node || node.type === 'driver') return;
        if (FormulaParser.hasMonthlyFunction(node.formula)) return;

        const compileFn = FormulaParser.compile(node.formula, allNodeIds);
        try {
          const newValue = compileFn(nodeValues);
          nodeValues[nodeId] = isNaN(newValue) ? 0 : newValue;
          newNodes[nodeId].value = nodeValues[nodeId];
        } catch (e) {
          // 忽略
        }
      });

      // === 步骤 8: 更新状态 ===
      set((state) => {
        const resultNodes = { ...state.nodes };
        allNodeIds.forEach((id) => {
          if (resultNodes[id]) {
            const node = resultNodes[id];
            const updates = {
              ...node,
              value: newNodes[id].value,
              previousValue: node.value,
              dependsOn: newNodes[id].dependsOn,
              timeData: newNodes[id].timeData
            };

            // === 关键修复：originalTimeData 的处理逻辑 ===
            // 优先级（最高优先级在前）：
            // 1. 使用步骤0备份的 originalTimeData（最优先！）
            // 2. 如果 newNodes 有 originalTimeData（比如从方案新加载的），使用它
            // 3. 否则如果当前 node 已有 originalTimeData，保留它
            // 4. 否则如果 saveOriginalTimeData 为 true，用当前 timeData 初始化

            if (originalTimeDataBackup[id]) {
              // 最高优先级：使用备份的 originalTimeData（确保它不会被修改）
              updates.originalTimeData = originalTimeDataBackup[id];
            } else if (newNodes[id].originalTimeData) {
              // 从 newNodes 继承 originalTimeData（例如：刚从方案加载时）
              updates.originalTimeData = JSON.parse(JSON.stringify(newNodes[id].originalTimeData));
            } else if (node.originalTimeData) {
              // 保留已有的 originalTimeData
              updates.originalTimeData = node.originalTimeData;
            } else if (saveOriginalTimeData && newNodes[id].timeData && node.type !== 'driver') {
              // saveOriginalTimeData 模式：首次初始化 originalTimeData
              updates.originalTimeData = JSON.parse(JSON.stringify(newNodes[id].timeData));
            }

            resultNodes[id] = updates;
          }
        });
        return { nodes: resultNodes };
      });

      get()._persist();
    },

    addNode: (node) => {
      // 计算初始基准值
      let initialBaseline = node.baseline ?? node.value;
      if (node.timeData) {
        let actualTotal = 0;
        let forecastTotal = 0;
        let actualCount = 0;
        let forecastCount = 0;

        Object.entries(node.timeData).forEach(([key, value]) => {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            if (key.includes('实际')) {
              actualTotal += numValue;
              actualCount++;
            }
            if (key.includes('预测')) {
              forecastTotal += numValue;
              forecastCount++;
            }
          }
        });

        // 根据 aggregationType 决定聚合方式
        let aggType = node.aggregationType;
        if (!aggType) {
          aggType = node.unit === '%' ? 'average' : 'sum';
        }

        const totalCount = actualCount + forecastCount;
        if (totalCount > 0) {
          if (aggType === 'average') {
            initialBaseline = Math.round((actualTotal + forecastTotal) / totalCount * 100) / 100;
          } else {
            initialBaseline = actualTotal + forecastTotal;
          }
        }
      }

      // 先添加节点（暂时不计算 targetValue）
      const tempNodes = {};
      set((state) => {
        const newNodes = {
          ...state.nodes,
          [node.id]: {
            size: { width: 520, height: 'auto' },
            direction: 'auto',
            initialBaseline,
            originalTimeData: node.timeData ? { ...node.timeData } : undefined,
            ...node
          }
        };
        Object.assign(tempNodes, newNodes);
        return { nodes: newNodes };
      });

      // 计算所有节点的 targetValue（需要依赖关系）
      setTimeout(() => {
        const state = get();
        const allNodeIds = Object.keys(state.nodes);

        // 拓扑排序确保计算顺序正确
        const inDegree = {};
        const adjacency = {};
        allNodeIds.forEach(id => {
          inDegree[id] = 0;
          adjacency[id] = [];
        });
        allNodeIds.forEach(id => {
          const n = state.nodes[id];
          if (n.type === 'driver') return;
          const deps = FormulaParser.extractDependencies(n.formula || '', allNodeIds);
          deps.forEach(depId => {
            if (adjacency[depId]) {
              adjacency[depId].push(id);
              inDegree[id]++;
            }
          });
        });

        const queue = [];
        const order = [];
        allNodeIds.forEach(id => {
          if (inDegree[id] === 0) queue.push(id);
        });
        while (queue.length > 0) {
          const nodeId = queue.shift();
          order.push(nodeId);
          adjacency[nodeId].forEach(nextId => {
            inDegree[nextId]--;
            if (inDegree[nextId] === 0) queue.push(nextId);
          });
        }

        // 按拓扑顺序计算 targetValue 和 initialBaseline
        const newNodes = { ...state.nodes };
        order.forEach(nodeId => {
          const n = newNodes[nodeId];
          if (!n) return;

          // 计算 targetValue
          const targetVal = calculateTargetValue(n, newNodes, allNodeIds);

          // 对于计算指标，计算自己的 initialBaseline
          let initialBaseline = n.initialBaseline;
          if (n.type !== 'driver' && n.formula) {
            // 检查是否有 MONTHLY 函数
            if (FormulaParser.hasMonthlyFunction(n.formula)) {
              // 有 MONTHLY 函数：用原始月度数据按月计算
              const monthlyResult = calculateMonthlyInitialValue(n, newNodes, allNodeIds);
              if (monthlyResult && monthlyResult.value !== null && !isNaN(monthlyResult.value)) {
                initialBaseline = monthlyResult.value;
              }
            } else {
              // 普通公式：用依赖的 initialBaseline 计算
              const deps = FormulaParser.extractDependencies(n.formula, allNodeIds);
              const compileFn = FormulaParser.compile(n.formula, allNodeIds);
              const initialValues = {};
              deps.forEach(depId => {
                const depNode = newNodes[depId];
                if (depNode) {
                  initialValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                }
              });
              try {
                const result = compileFn(initialValues);
                if (!isNaN(result)) {
                  initialBaseline = result;
                }
              } catch (e) {
                // 忽略错误，保持原值
              }
            }
          }

          newNodes[nodeId] = {
            ...n,
            targetValue: targetVal,
            initialBaseline
          };
        });

        set({ nodes: newNodes });
        // 调用 _recalculate 并传入 true，计算 timeData 并保存所有计算指标的 originalTimeData
        get()._recalculate(true);
      }, 0);
    },

    updateNode: (id, updates) => {
      set((state) => {
        const existingNode = state.nodes[id];
        if (!existingNode) return state;

        let newInitialBaseline = existingNode.initialBaseline;

        // 如果是驱动因子且 aggregationType 变化，需要重新计算 initialBaseline
        if (existingNode.type === 'driver' &&
            updates.aggregationType !== undefined &&
            updates.aggregationType !== existingNode.aggregationType &&
            existingNode.timeData) {

          let actualTotal = 0;
          let forecastTotal = 0;
          let actualCount = 0;
          let forecastCount = 0;

          Object.entries(existingNode.timeData).forEach(([key, value]) => {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              if (key.includes('实际')) {
                actualTotal += numValue;
                actualCount++;
              }
              if (key.includes('预测')) {
                forecastTotal += numValue;
                forecastCount++;
              }
            }
          });

          // 根据新的 aggregationType 计算 initialBaseline
          const newAggType = updates.aggregationType || (existingNode.unit === '%' ? 'average' : 'sum');
          const totalCount = actualCount + forecastCount;
          if (totalCount > 0) {
            if (newAggType === 'average') {
              newInitialBaseline = Math.round((actualTotal + forecastTotal) / totalCount * 100) / 100;
            } else {
              newInitialBaseline = actualTotal + forecastTotal;
            }
          }
        }

        // 构建安全的 updates 对象
        const safeUpdates = { ...updates };

        // 如果需要更新 initialBaseline，则保留；否则删除以防止覆盖
        if (newInitialBaseline !== undefined && newInitialBaseline !== existingNode.initialBaseline) {
          safeUpdates.initialBaseline = newInitialBaseline;
        } else if (existingNode.initialBaseline !== undefined) {
          delete safeUpdates.initialBaseline;
        }

        return {
          nodes: { ...state.nodes, [id]: { ...existingNode, ...safeUpdates } }
        };
      });

      // 如果是公式变化，需要重新计算 targetValue 和 initialBaseline（包括所有依赖它的节点）
      if (updates.formula !== undefined) {
        setTimeout(() => {
          const state = get();
          const allNodeIds = Object.keys(state.nodes);

          // 拓扑排序
          const inDegree = {};
          const adjacency = {};
          allNodeIds.forEach(nodeId => {
            inDegree[nodeId] = 0;
            adjacency[nodeId] = [];
          });
          allNodeIds.forEach(nodeId => {
            const n = state.nodes[nodeId];
            if (n.type === 'driver') return;
            const deps = FormulaParser.extractDependencies(n.formula || '', allNodeIds);
            deps.forEach(depId => {
              if (adjacency[depId]) {
                adjacency[depId].push(nodeId);
                inDegree[nodeId]++;
              }
            });
          });

          const queue = [];
          const order = [];
          allNodeIds.forEach(nodeId => {
            if (inDegree[nodeId] === 0) queue.push(nodeId);
          });
          while (queue.length > 0) {
            const nodeId = queue.shift();
            order.push(nodeId);
            adjacency[nodeId].forEach(nextId => {
              inDegree[nextId]--;
              if (inDegree[nextId] === 0) queue.push(nextId);
            });
          }

          // 重新计算所有节点的 targetValue 和 initialBaseline
          const newNodes = { ...state.nodes };
          order.forEach(nodeId => {
            const n = newNodes[nodeId];
            if (!n) return;

            // 计算 targetValue
            const targetVal = calculateTargetValue(n, newNodes, allNodeIds);

            // 对于计算指标，重新计算 initialBaseline
            let initialBaseline = n.initialBaseline;
            let nodeTimeData = n.timeData;
            if (n.type !== 'driver' && n.formula) {
              if (FormulaParser.hasMonthlyFunction(n.formula)) {
                // 有 MONTHLY 函数：用原始月度数据按月计算
                const monthlyResult = calculateMonthlyInitialValue(n, newNodes, allNodeIds);
                if (monthlyResult && monthlyResult.value !== null && !isNaN(monthlyResult.value)) {
                  initialBaseline = monthlyResult.value;
                  nodeTimeData = monthlyResult.timeData;
                }
              } else {
                // 普通公式：用依赖的 initialBaseline 计算
                const deps = FormulaParser.extractDependencies(n.formula, allNodeIds);
                const compileFn = FormulaParser.compile(n.formula, allNodeIds);
                const initialValues = {};
                deps.forEach(depId => {
                  const depNode = newNodes[depId];
                  if (depNode) {
                    initialValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                  }
                });
                try {
                  const result = compileFn(initialValues);
                  if (!isNaN(result)) {
                    initialBaseline = result;
                  }
                } catch (e) {
                  // 忽略错误
                }
              }
            }

            // 对于计算指标，确保 originalTimeData 也被设置为初始计算出的 timeData
          const nodeUpdates = {
            ...n,
            targetValue: targetVal,
            initialBaseline,
            timeData: nodeTimeData
          };
          // 如果还没有 originalTimeData，用初始计算出的 timeData 作为 originalTimeData
          if (!nodeUpdates.originalTimeData && nodeTimeData) {
            nodeUpdates.originalTimeData = JSON.parse(JSON.stringify(nodeTimeData));
          }
          newNodes[nodeId] = nodeUpdates;
          });

          set({ nodes: newNodes });
          get()._recalculate();
        }, 0);
      } else if (updates.value !== undefined || updates.aggregationType !== undefined) {
        // 驱动因子值变化 OR 聚合方式变化，需要重新计算
        setTimeout(() => get()._recalculate(), 0);
      } else {
        get()._persist();
      }
    },

    deleteNode: (id) => {
      set((state) => {
        const { [id]: _, ...rest } = state.nodes;
        return { nodes: rest };
      });
      setTimeout(() => get()._recalculate(), 0);
    },

    setSelectedNode: (id) => {
      set({ selectedNodeId: id });
      get()._persist();
    },

    // 高亮节点状态
    highlightedNodeId: null,
    setHighlightedNode: (id) => {
      set({ highlightedNodeId: id });
    },

    // 获取从某个节点出发的所有上游节点（该节点依赖的节点，及其依赖的节点...）
    getAffectedNodes: (nodeId) => {
      const state = get();
      const nodes = state.nodes;
      const affected = new Set();

      if (!nodeId) return affected;

      // 使用 BFS 遍历所有上游节点（当前节点依赖的节点）
      const queue = [nodeId];
      const visited = new Set([nodeId]);

      while (queue.length > 0) {
        const current = queue.shift();
        const currentNode = nodes[current];
        if (!currentNode) continue;

        // 查找当前节点依赖的所有节点（上游节点）
        const deps = currentNode.dependsOn || [];
        deps.forEach(depId => {
          if (!visited.has(depId)) {
            visited.add(depId);
            affected.add(depId);
            queue.push(depId);
          }
        });
      }

      return affected;
    },

    // 获取某个节点的直接下游节点（只获取直接依赖该节点的节点，不递归）
    getDownstreamNodes: (nodeId) => {
      const state = get();
      const nodes = state.nodes;
      const downstream = new Set();

      if (!nodeId) return downstream;

      // 只查找直接依赖当前节点的节点（直接下游）
      for (const [id, node] of Object.entries(nodes)) {
        if (node.dependsOn?.includes(nodeId)) {
          downstream.add(id);
        }
      }

      return downstream;
    },

    // 获取某个节点的所有直接依赖节点（上游节点）
    getDependencyNodes: (nodeId) => {
      const state = get();
      const node = state.nodes[nodeId];
      if (!node || !node.dependsOn) return new Set();
      return new Set(node.dependsOn);
    },

    // 切换节点折叠状态
    toggleCollapse: (nodeId) => {
      set((state) => {
        const newCollapsed = new Set(state.collapsedNodeIds);
        if (newCollapsed.has(nodeId)) {
          newCollapsed.delete(nodeId);
        } else {
          newCollapsed.add(nodeId);
        }
        return { collapsedNodeIds: newCollapsed };
      });
      get()._persist();
    },

    // 检查节点是否可见（没有被任何上级折叠）
    isNodeVisible: (nodeId) => {
      const state = get();
      const { nodes, collapsedNodeIds } = state;

      // 递归检查是否有上级被折叠
      const check = (currentId, visited = new Set()) => {
        if (visited.has(currentId)) return false; // 防止循环依赖
        visited.add(currentId);

        // 查找哪些计算指标依赖了这个节点
        for (const [id, node] of Object.entries(nodes)) {
          if (node.type !== 'driver' && node.dependsOn?.includes(currentId)) {
            // 如果这个上级被折叠了，当前节点不可见
            if (collapsedNodeIds.has(id)) return false;
            // 继续向上检查
            if (!check(id, visited)) return false;
          }
        }
        return true;
      };

      return check(nodeId);
    },

    importModel: (modelData, options = {}) => {
      const { append = false } = options;

      // 确保导入的节点有默认字段，并且按 id 去重
      const nodes = modelData.nodes || {};
      const normalizedNodes = {};
      Object.values(nodes).forEach((node) => {
        if (node && node.id) {
          // 计算初始基准值：
          // - 驱动因子：用 timeData 的实际+预测按 aggregationType 聚合
          // - 计算指标：用 node.value（公式计算出的初始值）
          let initialBaseline = node.value;
          if (node.type === 'driver' && node.timeData) {
            let actualTotal = 0;
            let forecastTotal = 0;
            let actualCount = 0;
            let forecastCount = 0;

            Object.entries(node.timeData).forEach(([key, value]) => {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                if (key.includes('实际')) {
                  actualTotal += numValue;
                  actualCount++;
                }
                if (key.includes('预测')) {
                  forecastTotal += numValue;
                  forecastCount++;
                }
              }
            });

            // 根据 aggregationType 决定聚合方式
            let aggType = node.aggregationType;
            if (!aggType) {
              aggType = node.unit === '%' ? 'average' : 'sum';
            }

            const totalCount = actualCount + forecastCount;
            if (totalCount > 0) {
              if (aggType === 'average') {
                initialBaseline = Math.round((actualTotal + forecastTotal) / totalCount * 100) / 100;
              } else {
                initialBaseline = actualTotal + forecastTotal;
              }
            }
          }

          normalizedNodes[node.id] = {
            size: { width: 520, height: 'auto' },
            direction: 'auto',
            initialBaseline,
            originalTimeData: node.timeData ? { ...node.timeData } : undefined,
            ...node
          };
        }
      });

      if (append) {
        // 追加模式：合并到现有节点
        set((state) => ({
          nodes: { ...state.nodes, ...normalizedNodes }
        }));
      } else {
        // 覆盖模式：替换所有节点
        set({ nodes: normalizedNodes });
      }

      // 等待 set 完成后计算 targetValue 和其他字段
      setTimeout(() => {
        const stateAfterSet = get();
        if (Object.keys(stateAfterSet.nodes).length > 0) {
          const allNodeIds = Object.keys(stateAfterSet.nodes);

          // 拓扑排序确保计算顺序正确
          const inDegree = {};
          const adjacency = {};
          allNodeIds.forEach(id => {
            inDegree[id] = 0;
            adjacency[id] = [];
          });
          allNodeIds.forEach(id => {
            const n = stateAfterSet.nodes[id];
            if (n.type === 'driver') return;
            const deps = FormulaParser.extractDependencies(n.formula || '', allNodeIds);
            deps.forEach(depId => {
              if (adjacency[depId]) {
                adjacency[depId].push(id);
                inDegree[id]++;
              }
            });
          });

          const queue = [];
          const order = [];
          allNodeIds.forEach(id => {
            if (inDegree[id] === 0) queue.push(id);
          });
          while (queue.length > 0) {
            const nodeId = queue.shift();
            order.push(nodeId);
            adjacency[nodeId].forEach(nextId => {
              inDegree[nextId]--;
              if (inDegree[nextId] === 0) queue.push(nextId);
            });
          }

          // 先计算所有节点的 targetValue 和 initialBaseline（计算指标）
          const nodesWithTarget = { ...stateAfterSet.nodes };
          order.forEach(nodeId => {
            const n = nodesWithTarget[nodeId];
            if (!n) return;

            // 计算 targetValue
            const targetVal = calculateTargetValue(n, nodesWithTarget, allNodeIds);

            // 对于计算指标，计算自己的 initialBaseline
            let initialBaseline = n.initialBaseline;
            let nodeTimeData = n.timeData;
            if (n.type !== 'driver' && n.formula) {
              // 检查是否有 MONTHLY 函数
              if (FormulaParser.hasMonthlyFunction(n.formula)) {
                // 有 MONTHLY 函数：用原始月度数据按月计算
                const monthlyResult = calculateMonthlyInitialValue(n, nodesWithTarget, allNodeIds);
                if (monthlyResult && monthlyResult.value !== null && !isNaN(monthlyResult.value)) {
                  initialBaseline = monthlyResult.value;
                  nodeTimeData = monthlyResult.timeData;
                }
              } else {
                // 普通公式：用依赖的 initialBaseline 计算
                const deps = FormulaParser.extractDependencies(n.formula, allNodeIds);
                const compileFn = FormulaParser.compile(n.formula, allNodeIds);
                const initialValues = {};
                deps.forEach(depId => {
                  const depNode = nodesWithTarget[depId];
                  if (depNode) {
                    initialValues[depId] = depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                  }
                });
                try {
                  const result = compileFn(initialValues);
                  if (!isNaN(result)) {
                    initialBaseline = result;
                  }
                } catch (e) {
                  // 忽略错误，保持原值
                }
              }
            }

            // 对于计算指标，确保 originalTimeData 也被设置为初始计算出的 timeData
            const nodeUpdates = {
              ...n,
              targetValue: targetVal,
              initialBaseline,
              timeData: nodeTimeData
            };
            // 如果还没有 originalTimeData，用初始计算出的 timeData 作为 originalTimeData
            if (!nodeUpdates.originalTimeData && nodeTimeData) {
              nodeUpdates.originalTimeData = JSON.parse(JSON.stringify(nodeTimeData));
            }
            nodesWithTarget[nodeId] = nodeUpdates;
          });

          // 预处理节点，确保 dependsOn 是最新的
          const processed = {};
          Object.keys(nodesWithTarget).forEach((id) => {
            const node = nodesWithTarget[id];
            if (node.type !== 'driver') {
              const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);
              processed[id] = { ...node, dependsOn: deps };
            } else {
              processed[id] = node;
            }
          });

          // 构建并计算
          calculator.buildFromNodes(processed);
          const values = calculator.computeAll(processed);

          // 计算计算指标的 timeData
          const newNodes = { ...nodesWithTarget };
          Object.keys(processed).forEach((id) => {
            if (newNodes[id]) {
              const node = newNodes[id];
              let computedTimeData = node.timeData;
              let nodeValue = values[id] ?? node.value;

              if (node.type !== 'driver') {
                // 检查是否是 MONTHLY 节点
                if (FormulaParser.hasMonthlyFunction(node.formula)) {
                  // MONTHLY 节点：
                  // - timeData 已经在前面用 calculateMonthlyInitialValue 算好了，保持不变
                  // - value 用 initialBaseline（也是 calculateMonthlyInitialValue 算好的）
                  computedTimeData = node.timeData;
                  nodeValue = node.initialBaseline;
                } else {
                  // 普通节点：正常计算
                  computedTimeData = calculateComputedTimeData(node, newNodes, allNodeIds);
                }
              }

              newNodes[id] = {
                ...node,
                value: nodeValue,
                previousValue: node.value,
                dependsOn: processed[id].dependsOn,
                timeData: computedTimeData
              };
            }
          });

          set({ nodes: newNodes });
          saveToStorage(get());

          // 再运行一次 _recalculate 确保所有值正确
          setTimeout(() => get()._recalculate(), 0);
        }
      }, 0);
    },

    exportModel: () => {
      const state = get();
      return {
        modelName: 'VDT Model',
        version: '1.0',
        createdAt: new Date().toISOString(),
        nodes: state.nodes
      };
    },

    // 重置所有驱动因子到初始值
    resetAllDrivers: () => {
      const state = get();

      set((state) => {
        const newNodes = { ...state.nodes };

        Object.values(newNodes).forEach(node => {
          if (node.type === 'driver') {
            // 恢复初始值
            if (node.initialBaseline !== null && node.initialBaseline !== undefined && !isNaN(node.initialBaseline)) {
              newNodes[node.id].value = node.initialBaseline;
            }

            // 恢复原始 timeData
            if (node.originalTimeData) {
              newNodes[node.id].timeData = { ...node.originalTimeData };
            }
          }
        });

        return { nodes: newNodes };
      });

      // 重新计算
      setTimeout(() => get()._recalculate(), 0);
    },

    // 清除 localStorage 数据，重置为初始状态
    clearStorage: () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DATA_VERSION_KEY);
      set({
        nodes: {},
        selectedNodeId: null,
        scale: 1,
        showDataPanel: true,
        collapsedNodeIds: new Set(),
        hasLoadedFromStorage: false
      });
    },

    // 布局整理：按层级从左到右排列，同层级内计算指标在上、驱动因子在下
    rearrangeLayout: () => {
      const state = get();
      const nodesArray = Object.values(state.nodes);

      // 1. 按 level 的整数部分分组节点（默认 level 为 1）
      const nodesByColumn = {};
      nodesArray.forEach(node => {
        const parsed = parseLevel(node.level);
        const columnLevel = parsed.column;
        if (!nodesByColumn[columnLevel]) {
          nodesByColumn[columnLevel] = [];
        }
        nodesByColumn[columnLevel].push(node);
      });

      // 2. 获取所有列层级并排序（从小到大）
      const columnLevels = Object.keys(nodesByColumn).map(Number).sort((a, b) => a - b);

      // 3. 网格参数
      const columnWidth = 620;           // 每列宽度（节点520 + 间距100）
      const computedRowHeight = 220;     // 计算指标行高
      const driverRowHeight = 320;       // 驱动因子行高
      const startX = 100;                 // 起始 X
      const startY = 100;                 // 起始 Y

      const newNodes = { ...state.nodes };

      // 4. 按列排列（整数 level 小的在左边）
      columnLevels.forEach((columnLevel, columnIndex) => {
        const columnNodes = nodesByColumn[columnLevel];

        // 对同一列内的节点排序：先按完整 level 值，再按类型（计算指标在上）
        const sortedNodes = [...columnNodes].sort((a, b) => {
          const levelCmp = compareLevels(a.level, b.level);
          if (levelCmp !== 0) return levelCmp;
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'computed' ? -1 : 1;
        });

        // 排列节点 - 根据节点类型使用不同的行高
        let currentY = startY;
        sortedNodes.forEach((node) => {
          newNodes[node.id] = {
            ...newNodes[node.id],
            position: {
              x: startX + columnIndex * columnWidth,
              y: currentY
            }
          };
          // 根据节点类型累加不同的行高
          currentY += node.type === 'driver' ? driverRowHeight : computedRowHeight;
        });
      });

      set({ nodes: newNodes });
      get()._persist();
    },

    // === 方案管理 ===

    // 获取当前方案
    getCurrentScenario: () => {
      const state = get();
      return state.scenarios[state.currentScenarioId];
    },

    // 保存当前状态为方案（新建或覆盖）
    saveScenario: (name, description = '', overwriteCurrent = false) => {
      const state = get();

      // 检查名称重复
      if (isNameDuplicate(state.scenarios, name, overwriteCurrent ? state.currentScenarioId : null)) {
        return { success: false, error: '方案名称已存在，请使用其他名称' };
      }

      let scenarioId;
      let nodesToSave;

      if (overwriteCurrent) {
        // 覆盖当前方案
        scenarioId = state.currentScenarioId;

        // 关键：保留原方案的 originalTimeData（初始数据），只更新其他字段
        const originalScenario = state.scenarios[scenarioId];
        const currentNodes = state.nodes;

        nodesToSave = {};
        Object.keys(currentNodes).forEach(nodeId => {
          const currentNode = currentNodes[nodeId];
          const originalNode = originalScenario?.nodes?.[nodeId];

          if (originalNode && originalNode.originalTimeData) {
            // 保留原方案的 originalTimeData
            nodesToSave[nodeId] = {
              ...currentNode,
              originalTimeData: JSON.parse(JSON.stringify(originalNode.originalTimeData))
            };
          } else {
            // 没有原数据，使用当前的（作为初始数据）
            nodesToSave[nodeId] = { ...currentNode };
          }
        });
      } else {
        // 创建新方案：当前状态就是初始状态
        scenarioId = generateId();
        nodesToSave = JSON.parse(JSON.stringify(state.nodes));
      }

      const now = Date.now();
      const scenario = {
        id: scenarioId,
        name: name || getDefaultScenarioName(state.scenarios),
        description,
        createdAt: overwriteCurrent ? state.scenarios[scenarioId]?.createdAt : now,
        updatedAt: now,
        nodes: nodesToSave
      };

      // 更新 scenarios，把当前状态保存进去
      set((state) => ({
        scenarios: { ...state.scenarios, [scenarioId]: scenario },
        currentScenarioId: scenarioId
      }));

      get()._persist();
      return { success: true, scenarioId };
    },

    // 切换到指定方案
    loadScenario: (scenarioId) => {
      const state = get();
      const scenario = state.scenarios[scenarioId];
      if (!scenario) {
        return { success: false, error: '方案不存在' };
      }

      // 直接切换到目标方案，不保存当前修改（只有用户主动点击保存时才保存）
      set((state) => ({
        currentScenarioId: scenarioId,
        nodes: JSON.parse(JSON.stringify(scenario.nodes))
      }));

      get()._persist();
      return { success: true };
    },

    // 删除方案
    deleteScenario: (scenarioId) => {
      const state = get();
      const scenarioIds = Object.keys(state.scenarios);

      // 至少保留一个方案
      if (scenarioIds.length <= 1) {
        return { success: false, error: '至少需要保留一个方案' };
      }

      // 不能删除当前激活的方案
      if (scenarioId === state.currentScenarioId) {
        return { success: false, error: '不能删除当前正在使用的方案' };
      }

      const newScenarios = { ...state.scenarios };
      delete newScenarios[scenarioId];

      set({ scenarios: newScenarios });
      get()._persist();
      return { success: true };
    },

    // 重命名方案
    renameScenario: (scenarioId, newName) => {
      const state = get();
      const scenario = state.scenarios[scenarioId];
      if (!scenario) {
        return { success: false, error: '方案不存在' };
      }

      // 检查名称重复
      if (isNameDuplicate(state.scenarios, newName, scenarioId)) {
        return { success: false, error: '方案名称已存在，请使用其他名称' };
      }

      set((state) => ({
        scenarios: {
          ...state.scenarios,
          [scenarioId]: {
            ...state.scenarios[scenarioId],
            name: newName,
            updatedAt: Date.now()
          }
        }
      }));

      get()._persist();
      return { success: true };
    },

    // 复制方案
    duplicateScenario: (scenarioId, newName) => {
      const state = get();
      const sourceScenario = state.scenarios[scenarioId];
      if (!sourceScenario) {
        return { success: false, error: '源方案不存在' };
      }

      // 检查名称重复
      const nameToUse = newName || `${sourceScenario.name} (副本)`;
      if (isNameDuplicate(state.scenarios, nameToUse)) {
        return { success: false, error: '方案名称已存在，请使用其他名称' };
      }

      const newId = generateId();
      const now = Date.now();
      const newScenario = {
        id: newId,
        name: nameToUse,
        description: sourceScenario.description,
        createdAt: now,
        updatedAt: now,
        nodes: JSON.parse(JSON.stringify(sourceScenario.nodes))
      };

      set((state) => ({
        scenarios: { ...state.scenarios, [newId]: newScenario }
      }));

      get()._persist();
      return { success: true, scenarioId: newId };
    },

    // 创建新方案（基于当前状态）
    createScenario: (name, description = '') => {
      return get().saveScenario(name, description, false);
    },

    // 更新当前方案的 nodes（内部使用，在 nodes 变化时调用）
    _updateCurrentScenarioNodes: () => {
      const state = get();
      const currentScenario = state.scenarios[state.currentScenarioId];
      if (currentScenario) {
        set((state) => ({
          scenarios: {
            ...state.scenarios,
            [state.currentScenarioId]: {
              ...currentScenario,
              nodes: JSON.parse(JSON.stringify(state.nodes)),
              updatedAt: Date.now()
            }
          }
        }));
      }
    },

    // ========== 标准差分析相关状态 ==========
    showStdDevAnalysis: false,
    isStdDevAnalysisMinimized: false,
    stdDevAnalysisZIndex: 50,
    stdDevOptions: {
      dataMode: 'mixed',           // mixed | actual-only | forecast-only
      minMonths: 6,
      thresholds: { A: 0.1, B: 0.1 },
      compareInitial: true,       // 是否对比初始版本（默认开启）
      selectedScenarios: [],       // 选中的方案列表
      selectedIndicators: [],       // 选中的指标列表（空数组表示全部）
      thresholdMode: 'fixed'       // fixed | dynamic
    },
    stdDevData: [],                // 计算结果
    selectedStdDevNode: null,      // 选中的节点（详情面板显示）

    setShowStdDevAnalysis: (show) => set({ showStdDevAnalysis: show }),
    setStdDevOptions: (options) => set((state) => ({
      stdDevOptions: { ...state.stdDevOptions, ...options }
    })),
    setStdDevData: (data) => set({ stdDevData: data }),
    setSelectedStdDevNode: (node) => set({ selectedStdDevNode: node }),
    toggleStdDevAnalysis: () => set((state) => ({
      showStdDevAnalysis: !state.showStdDevAnalysis,
      isStdDevAnalysisMinimized: false
    })),
    setStdDevAnalysisMinimized: (minimized) => set({ isStdDevAnalysisMinimized: minimized }),
    bringStdDevAnalysisToFront: () => {
      const state = get();
      const maxZ = Math.max(
        state.stdDevAnalysisZIndex,
        state.dataPanelZIndex || 40,
        state.formulaEditorZIndex || 45,
        state.nodeEditorZIndex || 50,
        state.trendChartZIndex || 30,
        state.waterfallChartZIndex || 35,
        state.nodeTreeListZIndex || 35,
        state.scenarioCompareZIndex || 40,
        state.sensitivityAnalysisZIndex || 40
      );
      set({ stdDevAnalysisZIndex: maxZ + 1 });
    }
  };
});

export default useVDTStore;
