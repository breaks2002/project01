/**
 * 数值格式化工具
 */

/**
 * 格式化数值显示
 * @param {number} value - 数值
 * @param {string} format - 格式字符串
 * @param {string} unit - 单位
 * @returns {string} 格式化后的字符串
 */
export function formatValue(value, format = '', unit = '') {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }

  let formatted = value;
  let skipUnit = false;

  // 处理数字格式化
  if (format.includes('#,##0')) {
    // 千分位分隔
    formatted = value.toLocaleString('zh-CN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
  } else if (format.includes('0.00')) {
    // 两位小数
    formatted = value.toFixed(2);
  } else if (format.includes('0%')) {
    // 百分比格式 - 只要格式是百分比，就乘以100
    formatted = (value * 100).toFixed(1) + '%';
    skipUnit = true;
  } else if (unit === '%') {
    // 单位是%但格式不是百分比 - 也乘以100
    formatted = (value * 100).toFixed(1);
  } else {
    // 默认格式
    formatted = Number(value).toLocaleString('zh-CN', {
      maximumFractionDigits: 2
    });
  }

  // 添加单位
  if (unit && !skipUnit) {
    if (unit === '￥' || unit === '$' || unit === '€') {
      return `${unit}${formatted}`;
    }
    return `${formatted}${unit}`;
  }

  return formatted;
}

/**
 * 计算变化百分比
 * @param {number} current - 当前值
 * @param {number} baseline - 基准值
 * @returns {number | null} 变化百分比（小数形式，如 0.1 表示 10%）
 */
export function calculateChangePercent(current, baseline) {
  if (baseline === null || baseline === undefined || baseline === 0) {
    return null;
  }
  return (current - baseline) / baseline;
}

/**
 * 获取变化颜色类名
 * @param {number} current - 当前值
 * @param {number} previous - 前一个值
 * @returns {string} Tailwind 颜色类名
 */
export function getChangeColorClass(current, previous) {
  if (previous === null || previous === undefined) {
    return '';
  }
  const diff = current - previous;
  if (diff > 0.0001) {
    return 'text-green-600 bg-green-50';
  }
  if (diff < -0.0001) {
    return 'text-red-600 bg-red-50';
  }
  return '';
}

/**
 * 获取差异显示颜色类名（考虑指标方向）
 * @param {number} diff - 差异值（实际 - 目标）
 * @param {string} direction - 指标方向：'auto'|'positive'|'negative'
 * @param {string} nodeName - 节点名称（用于自动判断）
 * @returns {string} Tailwind 颜色类名
 */
export function getDiffColorClass(diff, direction = 'auto', nodeName = '') {
  if (diff === null || diff === undefined || isNaN(diff)) {
    return '';
  }

  let isPositive = true;

  if (direction === 'positive') {
    isPositive = true;
  } else if (direction === 'negative') {
    isPositive = false;
  } else {
    // 自动判断
    isPositive = isPositiveIndicator(nodeName);
  }

  const absDiff = Math.abs(diff);
  if (absDiff < 0.0001) {
    return 'text-gray-600';
  }

  if (isPositive) {
    // 正向指标：增长好
    return diff > 0 ? 'text-green-600' : 'text-red-600';
  } else {
    // 反向指标：增长不好
    return diff > 0 ? 'text-red-600' : 'text-green-600';
  }
}

/**
 * 判断是否为正向指标
 * @param {string} name - 指标名称
 * @returns {boolean} 是否正向指标
 */
export function isPositiveIndicator(name) {
  if (!name) return true;

  const positiveKeywords = [
    '收入', '收益', '利润', '净利润', '利润总额', '营业利润',
    '其他收益', '投资收益', '营业外收入', '毛利', '贡献',
    '增长', '增加', '提升', '提高'
  ];

  const negativeKeywords = [
    '成本', '费用', '支出', '税金', '营业外支出', '所得税',
    '损耗', '损失', '减少', '下降', '折旧', '摊销', '负债'
  ];

  const lowerName = name.toLowerCase();

  for (const keyword of negativeKeywords) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  for (const keyword of positiveKeywords) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return true; // 默认正向
}

/**
 * 解析简单的除法公式，提取分子和分母
 * 只支持简单格式："分子 / 分母"
 * @param {string} formula - 公式字符串
 * @returns {Object|null} { numerator: string, denominator: string } 或 null
 */
function parseDivisionFormula(formula) {
  if (!formula) return null;

  // 简单的除法公式解析：只支持 "A / B" 格式
  // 移除多余空格
  const cleanFormula = formula.trim();

  // 查找不在括号内的除号
  let parenCount = 0;
  let divisionIndex = -1;

  for (let i = 0; i < cleanFormula.length; i++) {
    const char = cleanFormula[i];
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === '/' && parenCount === 0) {
      divisionIndex = i;
      break;
    }
  }

  if (divisionIndex === -1) return null;

  const numerator = cleanFormula.substring(0, divisionIndex).trim();
  const denominator = cleanFormula.substring(divisionIndex + 1).trim();

  // 检查分子和分母是否都是简单的节点ID（不包含运算符）
  const hasOperator = (str) => /[+\-*/^()]/.test(str);
  if (hasOperator(numerator) || hasOperator(denominator)) {
    return null; // 太复杂了，不支持
  }

  return { numerator, denominator };
}

/**
 * 聚合时间序列数据
 * @param {Object} timeData - 时间序列数据 { '1月实际': 100, '2月实际': 200, ... }
 * @param {string} aggregationType - 聚合方式：'sum'（加总）或 'average'（平均）
 * @returns {Object} 聚合结果
 */
export function aggregateTimeData(timeData = {}, aggregationType = 'sum') {
  const result = {
    actualTotal: 0,    // 实际汇总（1-8月）
    forecastTotal: 0,  // 预测汇总（9-12月）
    targetTotal: 0,     // 目标汇总（1-12月）
    actualPlusForecastTotal: 0, // 实际+预测合计
    diffVsTarget: 0,    // 实际+预测 vs 目标的差额
    diffPercentVsTarget: null, // 实际+预测 vs 目标的差额百分比
    actualMonths: [],   // 实际月份数据
    forecastMonths: [], // 预测月份数据
    targetMonths: [],    // 目标月份数据
    actualCount: 0,      // 实际月份数
    forecastCount: 0,    // 预测月份数
    targetCount: 0       // 目标月份数
  };

  if (!timeData || typeof timeData !== 'object') {
    return result;
  }

  let actualSum = 0;
  let forecastSum = 0;
  let targetSum = 0;

  Object.keys(timeData).forEach((key) => {
    const value = parseFloat(timeData[key]);
    if (isNaN(value)) return;

    if (key.includes('实际')) {
      result.actualMonths.push({ month: key, value });
      actualSum += value;
      result.actualCount++;
    } else if (key.includes('预测')) {
      result.forecastMonths.push({ month: key, value });
      forecastSum += value;
      result.forecastCount++;
    } else if (key.includes('目标')) {
      result.targetMonths.push({ month: key, value });
      targetSum += value;
      result.targetCount++;
    }
  });

  // 根据聚合方式计算结果
  if (aggregationType === 'average') {
    // 平均模式
    result.actualTotal = result.actualCount > 0 ? actualSum / result.actualCount : 0;
    result.forecastTotal = result.forecastCount > 0 ? forecastSum / result.forecastCount : 0;
    result.targetTotal = result.targetCount > 0 ? targetSum / result.targetCount : 0;

    // 实际+预测的平均（如果都有数据的话）
    const totalCount = result.actualCount + result.forecastCount;
    result.actualPlusForecastTotal = totalCount > 0
      ? (actualSum + forecastSum) / totalCount
      : 0;
  } else {
    // 加总模式（默认）
    result.actualTotal = actualSum;
    result.forecastTotal = forecastSum;
    result.targetTotal = targetSum;
    result.actualPlusForecastTotal = actualSum + forecastSum;
  }

  // 计算实际+预测 vs 目标的差额
  result.diffVsTarget = result.actualPlusForecastTotal - result.targetTotal;
  if (result.targetTotal !== 0) {
    result.diffPercentVsTarget = (result.diffVsTarget / result.targetTotal) * 100;
  }

  return result;
}

/**
 * 为比率型指标聚合时间序列数据
 * 先分别聚合分子和分母，再计算比率
 * @param {Object} node - 当前节点（比率型指标）
 * @param {Object} allNodes - 所有节点
 * @param {string} aggregationType - 聚合方式
 * @returns {Object} 聚合结果
 */
export function aggregateRatioIndicator(node, allNodes, aggregationType = 'sum') {
  const result = {
    actualTotal: 0,    // 实际汇总（分子实际合计 / 分母实际合计）
    forecastTotal: 0,  // 预测汇总（分子预测合计 / 分母预测合计）
    targetTotal: 0,     // 目标汇总
    actualPlusForecastTotal: 0, // 实际+预测合计
    diffVsTarget: 0,    // 实际+预测 vs 目标的差额
    diffPercentVsTarget: null, // 实际+预测 vs 目标的差额百分比
    actualMonths: [],   // 实际月份数据
    forecastMonths: [], // 预测月份数据
    targetMonths: [],    // 目标月份数据
    actualCount: 0,      // 实际月份数
    forecastCount: 0,    // 预测月份数
    targetCount: 0       // 目标月份数
  };

  if (!node || !allNodes) {
    return result;
  }

  // 解析公式，提取分子和分母
  const parsed = parseDivisionFormula(node.formula);
  if (!parsed) {
    // 解析失败，回退到普通聚合
    return aggregateTimeData(node.timeData, aggregationType);
  }

  const { numerator, denominator } = parsed;
  const numeratorNode = allNodes[numerator];
  const denominatorNode = allNodes[denominator];

  if (!numeratorNode || !denominatorNode) {
    // 找不到分子或分母节点，回退到普通聚合
    return aggregateTimeData(node.timeData, aggregationType);
  }

  // 获取分子和分母的聚合类型
  const getNodeAggType = (n) => {
    let aggType = n.aggregationType;
    if (!aggType) {
      aggType = n.unit === '%' ? 'average' : 'sum';
    }
    return aggType;
  };

  // 分别聚合分子和分母
  const numeratorAgg = aggregateTimeData(numeratorNode.timeData, getNodeAggType(numeratorNode));
  const denominatorAgg = aggregateTimeData(denominatorNode.timeData, getNodeAggType(denominatorNode));

  // 计算比率：分子合计 / 分母合计
  result.actualTotal = denominatorAgg.actualTotal !== 0
    ? numeratorAgg.actualTotal / denominatorAgg.actualTotal
    : 0;
  result.forecastTotal = denominatorAgg.forecastTotal !== 0
    ? numeratorAgg.forecastTotal / denominatorAgg.forecastTotal
    : 0;
  result.targetTotal = denominatorAgg.targetTotal !== 0
    ? numeratorAgg.targetTotal / denominatorAgg.targetTotal
    : 0;

  // 实际+预测合计
  const numeratorTotal = numeratorAgg.actualPlusForecastTotal;
  const denominatorTotal = denominatorAgg.actualPlusForecastTotal;
  result.actualPlusForecastTotal = denominatorTotal !== 0
    ? numeratorTotal / denominatorTotal
    : 0;

  // 从原节点的 timeData 中拷贝月份数据（用于显示）
  if (node.timeData) {
    Object.keys(node.timeData).forEach((key) => {
      const value = parseFloat(node.timeData[key]);
      if (isNaN(value)) return;

      if (key.includes('实际')) {
        result.actualMonths.push({ month: key, value });
        result.actualCount++;
      } else if (key.includes('预测')) {
        result.forecastMonths.push({ month: key, value });
        result.forecastCount++;
      } else if (key.includes('目标')) {
        result.targetMonths.push({ month: key, value });
        result.targetCount++;
      }
    });
  }

  // 计算实际+预测 vs 目标的差额
  result.diffVsTarget = result.actualPlusForecastTotal - result.targetTotal;
  if (result.targetTotal !== 0) {
    result.diffPercentVsTarget = (result.diffVsTarget / result.targetTotal) * 100;
  }

  return result;
}

/**
 * 生成唯一 ID
 * @returns {string} 唯一 ID
 */
export function generateId() {
  return 'node_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
