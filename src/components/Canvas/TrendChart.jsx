import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FormulaParser } from '../../engine/FormulaParser';
import { isPositiveIndicator, formatValue } from '../../utils/formatters';
import html2canvas from 'html2canvas';

// 通用期间排序函数：支持中文月份（1月~12月）和其他格式的正确排序
function sortPeriodKeys(keys) {
  return Array.from(keys).sort((a, b) => {
    // 中文月份：提取数字比较
    const aMatch = a.match(/^(\d+)月$/);
    const bMatch = b.match(/^(\d+)月$/);
    if (aMatch && bMatch) {
      return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
    }
    // 其他格式：字符串排序
    return a > b ? 1 : a < b ? -1 : 0;
  });
}

// 解析月份key，支持两种格式：
// 1. "1月实际", "2月预测"
// 解析月份 key，支持多种格式：
// 1. "1 月实际", "2 月预测" (旧格式)
// 2. "2024-01-实际", "2024-02-预测" (过渡格式)
// 3. "202601-AC", "202601-FC", "202601-BU" (新格式 - 标准)
// 4. "2026WK01-AC", "2026Q1-AC", "2026-AC" (周/季/年格式)
function parseMonthKey(key) {
  try {
    const matchShort = key.match(/^(\d{1,2})月 (实际 | 预测 | 目标)$/);
    if (matchShort) {
      const monthNum = parseInt(matchShort[1], 10);
      return {
        month: `${monthNum}月`,
        sortKey: String(monthNum).padStart(2, '0'),
        type: matchShort[2],
        fullKey: key,
        attr: matchShort[2] === '实际' ? 'AC' : matchShort[2] === '预测' ? 'FC' : 'BU'
      };
    }
    const matchLong = key.match(/^(\d{4}-\d{2})-(实际 | 预测 | 目标)$/);
    if (matchLong) {
      return {
        month: matchLong[1],
        sortKey: matchLong[1],
        type: matchLong[2],
        fullKey: key,
        attr: matchLong[2] === '实际' ? 'AC' : matchLong[2] === '预测' ? 'FC' : 'BU'
      };
    }
    const matchNew = key.match(/^(\d{6})-(AC|FC|BU)$/);
    if (matchNew) {
      const timeStr = matchNew[1];
      const attr = matchNew[2];
      return {
        month: timeStr,
        sortKey: timeStr,
        type: attr === 'AC' ? '实际' : attr === 'FC' ? '预测' : '目标',
        attr: attr,
        fullKey: key
      };
    }
    const matchDay = key.match(/^(\d{8})-(AC|FC|BU)$/);
    if (matchDay) {
      return {
        month: matchDay[1],
        sortKey: matchDay[1],
        type: matchDay[2] === 'AC' ? '实际' : matchDay[2] === 'FC' ? '预测' : '目标',
        attr: matchDay[2],
        fullKey: key
      };
    }
    const matchWeek = key.match(/^(\d{4}WK\d{2})-(AC|FC|BU)$/);
    if (matchWeek) {
      return {
        month: matchWeek[1],
        sortKey: matchWeek[1],
        type: matchWeek[2] === 'AC' ? '实际' : matchWeek[2] === 'FC' ? '预测' : '目标',
        attr: matchWeek[2],
        fullKey: key
      };
    }
    const matchQuarter = key.match(/^(\d{4}Q[1-4])-(AC|FC|BU)$/);
    if (matchQuarter) {
      return {
        month: matchQuarter[1],
        sortKey: matchQuarter[1],
        type: matchQuarter[2] === 'AC' ? '实际' : matchQuarter[2] === 'FC' ? '预测' : '目标',
        attr: matchQuarter[2],
        fullKey: key
      };
    }
    const matchYear = key.match(/^(\d{4})-(AC|FC|BU)$/);
    if (matchYear) {
      return {
        month: matchYear[1],
        sortKey: matchYear[1],
        type: matchYear[2] === 'AC' ? '实际' : matchYear[2] === 'FC' ? '预测' : '目标',
        attr: matchYear[2],
        fullKey: key
      };
    }
    // 中文月份 + AC/FC/BU 格式：1月-AC, 12月-FC, 9月-BU
    const matchCnMonth = key.match(/^(\d{1,2}月)-(AC|FC|BU)$/);
    if (matchCnMonth) {
      const monthNum = parseInt(matchCnMonth[1], 10);
      return {
        month: matchCnMonth[1],
        sortKey: String(monthNum).padStart(2, '0'),
        type: matchCnMonth[2] === 'AC' ? '实际' : matchCnMonth[2] === 'FC' ? '预测' : '目标',
        attr: matchCnMonth[2],
        fullKey: key
      };
    }
  } catch (e) {
    console.error('parseMonthKey error:', e);
  }
  return null;
}

// 检测时间维度类型
function detectTimeDimension(months) {
  if (!months || months.length === 0) return 'unknown';

  const firstMonth = months[0];

  // 日度格式：20260101
  if (/^\d{8}$/.test(firstMonth)) {
    return 'day';
  }

  // 周度格式：2026WK01
  if (/^\d{4}WK\d{2}$/.test(firstMonth)) {
    return 'week';
  }

  // 季度格式：2026Q1
  if (/^\d{4}Q[1-4]$/.test(firstMonth)) {
    return 'quarter';
  }

  // 年度格式：2026
  if (/^\d{4}$/.test(firstMonth)) {
    return 'year';
  }

  // 新月度格式：202601
  if (/^\d{6}$/.test(firstMonth)) {
    return 'month';
  }

  // 旧月度格式：1 月
  if (firstMonth.includes('月')) {
    return 'month';
  }

  // 过渡格式：2024-01
  if (/^\d{4}-\d{2}$/.test(firstMonth)) {
    return 'month';
  }

  return 'unknown';
}

// 获取时间维度的中文名称
function getTimeDimensionName(timeDim) {
  const names = {
    year: '年度',
    quarter: '季度',
    month: '月度',
    week: '周度',
    day: '日度',
    unknown: '分期'
  };
  return names[timeDim] || '分期';
}

// 格式化横坐标轴标签 - 支持稀疏显示
function formatXAxisLabel(month, timeDim) {
  if (!month) return '';

  switch (timeDim) {
    case 'year':
      return month; // 2026
    case 'quarter':
      // 2026Q1 -> 2026 Q1
      return month.replace('Q', ' Q');
    case 'week':
      // 2026WK01 -> WK01
      return month.replace(/^\d{4}/, '');
    case 'month':
      // 202601 -> 01 月 或 2026/01
      if (month.length === 6) {
        return `${month.slice(4)}月`;
      }
      return month;
    case 'day':
      // 20260101 -> 01/01
      if (month.length === 8) {
        return `${month.slice(4, 6)}/${month.slice(6)}`;
      }
      return month;
    default:
      return month;
  }
}

// 获取 X 轴标签显示间隔
function getXAxisLabelInterval(months, timeDim) {
  const count = months.length;

  // 如果月份数量较少，全部显示
  if (count <= 12) {
    return 1;
  }

  // 根据时间维度和数量决定间隔
  if (timeDim === 'day') {
    return Math.ceil(count / 15); // 最多显示 15 个标签
  }

  if (timeDim === 'week') {
    return Math.ceil(count / 10); // 最多显示 10 个标签
  }

  if (timeDim === 'month' && count > 12) {
    return Math.ceil(count / 12); // 最多显示 12 个标签
  }

  return 1;
}

function getSortedMonths(timeData) {
  try {
    const monthMap = new Map();
    Object.keys(timeData || {}).forEach(key => {
      const parsed = parseMonthKey(key);
      if (parsed && !monthMap.has(parsed.month)) {
        monthMap.set(parsed.month, parsed.sortKey);
      }
    });
    // 按 sortKey 排序
    return Array.from(monthMap.entries())
      .sort((a, b) => (a[1] > b[1] ? 1 : -1))
      .map(([month]) => month);
  } catch (e) {
    return [];
  }
}

// 颜色配置
const COLORS = {
  originalActual: '#3b82f6',      // 蓝色 - 初始实际（实线）
  originalForecast: '#3b82f6',    // 蓝色 - 初始预测（虚线）
  adjustedForecast: '#10b981',    // 绿色 - 调整后的预测（虚线）
  target: '#f59e0b',               // 橙色 - 目标（双实线）
};

// =======================================================================
// 双纵坐标柱状图组件 - 左轴累计值柱状图 + 右轴月度值折线图
// =======================================================================
function CumulativeBarChart({
  months,
  originalActualData,
  originalForecastData,
  adjustedForecastData,
  targetData,
  width,
  scenarioName,
  actualForecastSplitIndex,
  hasAdjustment,
  nodeName,
  onExport,
  node,
  allNodes,
  initialData,
  canExport,
  getDisableReason
}) {
  if (!months || months.length === 0) return null;

  // 检测时间维度
  const timeDimension = useMemo(() => detectTimeDimension(months), [months]);
  const timeDimensionName = getTimeDimensionName(timeDimension);
  const xAxisLabelInterval = useMemo(() => getXAxisLabelInterval(months, timeDimension), [months, timeDimension]);

  // 图表尺寸
  const chartHeight = 420;
  const padding = { top: 50, right: 90, bottom: 80, left: 100 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // 解析比率型指标的分子和分母
  const ratioComponents = useMemo(() => {
    if (!node || !node.formula) return null;

    const formula = node.formula.trim();
    // 匹配 A/B 或 A / B 形式的公式
    const ratioMatch = formula.match(/^(.+?)\s*\/\s*(.+?)$/);
    if (!ratioMatch) return null;

    const numeratorExpr = ratioMatch[1].trim();
    const denominatorExpr = ratioMatch[2].trim();

    // 提取分子和分母的节点ID
    const allNodeIds = Object.keys(allNodes || {});
    const numeratorIds = FormulaParser.extractDependencies(numeratorExpr, allNodeIds);
    const denominatorIds = FormulaParser.extractDependencies(denominatorExpr, allNodeIds);

    if (numeratorIds.length === 0 || denominatorIds.length === 0) return null;

    return {
      numeratorExpr,
      denominatorExpr,
      numeratorIds,
      denominatorIds
    };
  }, [node, allNodes]);

  // 递归解析公式，判断是否最终包含比率型公式（A/B 形式）
  // 返回：{ isRatio: boolean, numeratorIds: string[], denominatorIds: string[], constant: number|null }
  const resolveRatioFormula = (formula, allNodeIds, visited = new Set()) => {
    if (!formula || visited.has(formula)) {
      return { isRatio: false, numeratorIds: [], denominatorIds: [], constant: null };
    }
    visited.add(formula);

    // 匹配 A/B 形式的公式
    const ratioMatch = formula.match(/^(.+?)\s*\/\s*(.+)$/);
    if (ratioMatch) {
      const numeratorExpr = ratioMatch[1].trim();
      const denominatorExpr = ratioMatch[2].trim();

      const numeratorIds = FormulaParser.extractDependencies(numeratorExpr, allNodeIds);
      const denominatorIds = FormulaParser.extractDependencies(denominatorExpr, allNodeIds);
      const denominatorConstantMatch = denominatorExpr.match(/\/\s*(\d+\.?\d*)$/);
      const constant = denominatorConstantMatch ? parseFloat(denominatorConstantMatch[1]) : null;

      if (numeratorIds.length > 0 && denominatorIds.length > 0) {
        return { isRatio: true, numeratorIds, denominatorIds, constant };
      }
    }

    // 如果不是比率型，检查是否是乘法形式（如 chengjiaolvl*100）
    // 需要递归解析依赖节点的公式
    const depIds = FormulaParser.extractDependencies(formula, allNodeIds);
    for (const depId of depIds) {
      const depNode = allNodes[depId];
      if (depNode && depNode.type === 'computed' && depNode.formula) {
        const resolved = resolveRatioFormula(depNode.formula, allNodeIds, visited);
        if (resolved.isRatio) {
          return resolved;
        }
      }
    }

    return { isRatio: false, numeratorIds: [], denominatorIds: [], constant: null };
  };

  // 判断节点是否是比率型指标（有明确的分子分母）
  const isRatioIndicator = useMemo(() => {
    return ratioComponents !== null;
  }, [ratioComponents]);

  // 判断节点是否是平均类型指标
  const isAverageIndicator = useMemo(() => {
    if (!node) return false;
    const aggType = node.aggregationType;
    if (aggType === 'average') return true;
    if (node.unit === '%') return true;
    const ratioKeywords = ['率', 'ratio', 'percent', '毛利率', '净利率', '增长率', '占比'];
    const name = (node.name || nodeName || '').toLowerCase();
    return ratioKeywords.some(kw => name.includes(kw.toLowerCase()));
  }, [node, nodeName]);

  // 计算累计值函数 - 实际期用实际值，预测期用对应类型的值
  // 对于比率型指标，使用分子分母分别累加后相除
  // 对于计算指标节点，直接使用节点的 timeData 值（已计算公式）
  const calculateCumulativeWithActual = (forecastDataArray, adjustedForecastDataArray, isAdjusted = false) => {
    const cumulativeMap = new Map();

    months.forEach((month, index) => {
      // 对于计算指标节点，需要递归解析公式链，判断是否包含比率型依赖
      if (node?.type === 'computed' && node?.formula) {
        // 判断方式 1：用户手动勾选了比率型选项
        const isUserDefinedRatio = node.isRatio === true;

        // 判断方式 2：公式是 A/B 形式
        let resolvedRatio = null;
        if (!isUserDefinedRatio) {
          const ratioMatch = node.formula.match(/^(.+?)\s*\/\s*(.+)$/);
          if (ratioMatch) {
            const numeratorExpr = ratioMatch[1].trim();
            const denominatorExpr = ratioMatch[2].trim();
            const allNodeIds = Object.keys(allNodes || {});
            const numeratorIds = FormulaParser.extractDependencies(numeratorExpr, allNodeIds);
            const denominatorNodeIds = FormulaParser.extractDependencies(denominatorExpr, allNodeIds);
            const denominatorConstantMatch = denominatorExpr.match(/\/\s*(\d+\.?\d*)$/);
            const denominatorConstant = denominatorConstantMatch ? parseFloat(denominatorConstantMatch[1]) : null;

            if (numeratorIds.length > 0 && denominatorNodeIds.length > 0) {
              resolvedRatio = { isRatio: true, numeratorIds, denominatorIds: denominatorNodeIds, constant: denominatorConstant };
            }
          } else {
            // 如果不是 A/B 形式，递归解析依赖节点的公式（如 chengjiaolvl*100）
            resolvedRatio = resolveRatioFormula(node.formula, Object.keys(allNodes || {}), new Set());
          }
        } else {
          // 用户已勾选比率型，但需要从公式中提取分子分母
          const ratioMatch = node.formula.match(/^(.+?)\s*\/\s*(.+)$/);
          if (ratioMatch) {
            const numeratorExpr = ratioMatch[1].trim();
            const denominatorExpr = ratioMatch[2].trim();
            const allNodeIds = Object.keys(allNodes || {});
            const numeratorIds = FormulaParser.extractDependencies(numeratorExpr, allNodeIds);
            const denominatorNodeIds = FormulaParser.extractDependencies(denominatorExpr, allNodeIds);
            const denominatorConstantMatch = denominatorExpr.match(/\/\s*(\d+\.?\d*)$/);
            const denominatorConstant = denominatorConstantMatch ? parseFloat(denominatorConstantMatch[1]) : null;
            resolvedRatio = { isRatio: true, numeratorIds, denominatorIds: denominatorNodeIds, constant: denominatorConstant };
          }
        }

        // 如果解析出比率型公式（或用户手动勾选），使用Σ分子/Σ分母的累计方式
        if (isUserDefinedRatio || (resolvedRatio && resolvedRatio.isRatio)) {
          const { numeratorIds, denominatorIds, constant } = resolvedRatio || { numeratorIds: [], denominatorIds: [], constant: null };
          let numeratorSum = 0;
          let denominatorSum = 0;

          // 累计从第一期到当前期的所有分子和分母值
          for (let i = 0; i <= index; i++) {
            const checkMonth = months[i];
            const checkIsActual = i <= actualForecastSplitIndex;

            // 构造 key
            let dataKey;
            if (checkMonth.includes('月')) {
              const monthNum = parseInt(checkMonth, 10);
              dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
            } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
              dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
            } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
              dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
            } else if (/^\d{4}$/.test(checkMonth)) {
              dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
            } else if (/^\d{6,8}$/.test(checkMonth)) {
              dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
            } else {
              dataKey = checkIsActual ? `${checkMonth}-实际` : `${checkMonth}-预测`;
            }

            // 累加分子节点的值
            numeratorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const timeData = isAdjusted ? depNode.timeData : (depNode.originalTimeData || depNode.timeData);
                const value = timeData?.[dataKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  numeratorSum += parseFloat(value);
                }
              }
            });

            // 累加分母节点的值
            denominatorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const timeData = isAdjusted ? depNode.timeData : (depNode.originalTimeData || depNode.timeData);
                const value = timeData?.[dataKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  denominatorSum += parseFloat(value);
                }
              }
            });
          }

          // 计算累计比率：Σ分子 / (Σ分母 * 常数)
          if (denominatorSum !== 0) {
            let ratio = numeratorSum / denominatorSum;
            // 如果分母包含常数（如 1000），需要再除以它
            if (constant) {
              ratio = ratio / constant;
            }
            cumulativeMap.set(month, ratio);
          } else {
            cumulativeMap.set(month, 0);
          }
          return;
        }

        // 不是比率型公式，直接累加节点的 timeData 值
        // 对于计算指标（如 成交率*100），timeData 已经是公式计算后的结果，直接累加即可
        let sum = 0;

        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const checkIsActual = i <= actualForecastSplitIndex;

          // 构造 key
          let dataKey;
          if (checkMonth.includes('月')) {
            const monthNum = parseInt(checkMonth, 10);
            dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
          } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
            dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
          } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
            dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
          } else if (/^\d{4}$/.test(checkMonth)) {
            dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
          } else if (/^\d{6,8}$/.test(checkMonth)) {
            dataKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
          } else {
            dataKey = checkIsActual ? `${checkMonth}-实际` : `${checkMonth}-预测`;
          }

          // 根据 isAdjusted 选择数据源
          // isAdjusted=true 时使用 timeData（调整后），否则使用 originalTimeData（初始）
          const dataToUse = isAdjusted ? node.timeData : node.originalTimeData;
          const value = dataToUse?.[dataKey];
          if (value !== undefined && !isNaN(parseFloat(value))) {
            sum += parseFloat(value);
          }
        }

        cumulativeMap.set(month, sum);
        return;
      }

      // 对于驱动因子节点，使用原来的累计逻辑
      // 对于比率型指标：累计分子/累计分母
      if (isRatioIndicator && ratioComponents) {
        let numeratorSum = 0;
        let denominatorSum = 0;
        let hasData = false;

        // 获取需要累加的节点数据
        const { numeratorIds, denominatorIds } = ratioComponents;

        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const checkIsActual = i <= actualForecastSplitIndex;

          // 获取分子节点的累计值
          let monthNumerator = 0;
          let monthDenominator = 0;

          // 从依赖节点的 timeData 中获取数据
          numeratorIds.forEach(depId => {
            const depNode = allNodes[depId];
            if (depNode) {
              let monthKey;
              // 支持多种时间格式
              if (checkMonth.includes('月')) {
                // 旧格式：1 月
                const monthNum = parseInt(checkMonth, 10);
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
                // 周度格式：2026WK01
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
                // 季度格式：2026Q1
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}$/.test(checkMonth)) {
                // 年度格式：2026
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{6,8}$/.test(checkMonth)) {
                // 新月度格式：202601
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else {
                // 过渡格式：2024-01
                monthKey = checkIsActual ? `${checkMonth}-实际` : `${checkMonth}-预测`;
              }

              let timeValue;
              if (checkIsActual) {
                // 实际期：使用 actual timeData
                timeValue = depNode.timeData?.[monthKey];
              } else {
                // 预测期：根据 isAdjusted 选择使用 originalTimeData 还是 timeData
                if (isAdjusted) {
                  // 调整后：使用当前 timeData（已调整）
                  timeValue = depNode.timeData?.[monthKey];
                } else {
                  // 初始：使用 originalTimeData（未调整）
                  timeValue = depNode.originalTimeData?.[monthKey] ?? depNode.timeData?.[monthKey];
                }
              }
              if (timeValue !== undefined && !isNaN(parseFloat(timeValue))) {
                monthNumerator += parseFloat(timeValue);
              }
            }
          });

          // 从分母节点的 timeData 中获取数据
          denominatorIds.forEach(depId => {
            const depNode = allNodes[depId];
            if (depNode) {
              let monthKey;
              // 支持多种时间格式
              if (checkMonth.includes('月')) {
                // 旧格式：1 月
                const monthNum = parseInt(checkMonth, 10);
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
                // 周度格式：2026WK01
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
                // 季度格式：2026Q1
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{4}$/.test(checkMonth)) {
                // 年度格式：2026
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else if (/^\d{6,8}$/.test(checkMonth)) {
                // 新月度格式：202601
                monthKey = checkIsActual ? `${checkMonth}-AC` : `${checkMonth}-FC`;
              } else {
                // 过渡格式：2024-01
                monthKey = checkIsActual ? `${checkMonth}-实际` : `${checkMonth}-预测`;
              }

              let timeValue;
              if (checkIsActual) {
                // 实际期：使用 actual timeData
                timeValue = depNode.timeData?.[monthKey];
              } else {
                // 预测期：根据 isAdjusted 选择使用 originalTimeData 还是 timeData
                if (isAdjusted) {
                  // 调整后：使用当前 timeData（已调整）
                  timeValue = depNode.timeData?.[monthKey];
                } else {
                  // 初始：使用 originalTimeData（未调整）
                  timeValue = depNode.originalTimeData?.[monthKey] ?? depNode.timeData?.[monthKey];
                }
              }
              if (timeValue !== undefined && !isNaN(parseFloat(timeValue))) {
                monthDenominator += parseFloat(timeValue);
              }
            }
          });

          if (monthNumerator !== 0 || monthDenominator !== 0) {
            numeratorSum += monthNumerator;
            denominatorSum += monthDenominator;
            hasData = true;
          }
        }

        if (hasData && denominatorSum !== 0) {
          let ratio = numeratorSum / denominatorSum;
          // 如果分母表达式是常数（如 1000），需要再除以它
          if (ratioComponents && !isNaN(ratioComponents.denominatorConstant)) {
            ratio = ratio / ratioComponents.denominatorConstant;
          }
          cumulativeMap.set(month, ratio);
        } else {
          cumulativeMap.set(month, 0);
        }
      } else if (isAverageIndicator) {
        // 平均型指标：使用移动平均
        let sum = 0;
        let count = 0;

        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const checkIsActual = i <= actualForecastSplitIndex;

          if (checkIsActual) {
            const actualData = originalActualData.find(d => d.month === checkMonth);
            if (actualData && !isNaN(actualData.value)) {
              sum += actualData.value;
              count++;
            }
          } else {
            const dataArray = isAdjusted ? adjustedForecastDataArray : forecastDataArray;
            const data = dataArray.find(d => d.month === checkMonth);
            if (data && !isNaN(data.value)) {
              sum += data.value;
              count++;
            }
          }
        }

        cumulativeMap.set(month, count > 0 ? sum / count : 0);
      } else {
        // 普通指标：简单累加
        let sum = 0;
        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const checkIsActual = i <= actualForecastSplitIndex;

          if (checkIsActual) {
            const actualData = originalActualData.find(d => d.month === checkMonth);
            if (actualData && !isNaN(actualData.value)) {
              sum += actualData.value;
            }
          } else {
            const dataArray = isAdjusted ? adjustedForecastDataArray : forecastDataArray;
            const data = dataArray.find(d => d.month === checkMonth);
            if (data && !isNaN(data.value)) {
              sum += data.value;
            }
          }
        }
        cumulativeMap.set(month, sum);
      }
    });

    return cumulativeMap;
  };

  // 计算目标累计值 - 所有月份都使用目标值计算累计
  const calculateTargetCumulative = () => {
    const cumulativeMap = new Map();

    months.forEach((month, index) => {
      // 对于计算指标节点，需要递归解析公式链，判断是否包含比率型依赖
      if (node?.type === 'computed' && node?.formula) {
        // 首先尝试直接匹配 A/B 形式的公式
        const ratioMatch = node.formula.match(/^(.+?)\s*\/\s*(.+)$/);

        let resolvedRatio = null;
        if (ratioMatch) {
          const numeratorExpr = ratioMatch[1].trim();
          const denominatorExpr = ratioMatch[2].trim();
          const allNodeIds = Object.keys(allNodes || {});
          const numeratorIds = FormulaParser.extractDependencies(numeratorExpr, allNodeIds);
          const denominatorNodeIds = FormulaParser.extractDependencies(denominatorExpr, allNodeIds);
          const denominatorConstantMatch = denominatorExpr.match(/\/\s*(\d+\.?\d*)$/);
          const denominatorConstant = denominatorConstantMatch ? parseFloat(denominatorConstantMatch[1]) : null;

          if (numeratorIds.length > 0 && denominatorNodeIds.length > 0) {
            resolvedRatio = { isRatio: true, numeratorIds, denominatorIds: denominatorNodeIds, constant: denominatorConstant };
          }
        } else {
          // 如果不是 A/B 形式，递归解析依赖节点的公式（如 chengjiaolvl*100）
          resolvedRatio = resolveRatioFormula(node.formula, Object.keys(allNodes || {}), new Set());
        }

        // 如果解析出比率型公式（或用户手动勾选），使用Σ分子/Σ分母的累计方式
        if (node.isRatio === true || (resolvedRatio && resolvedRatio.isRatio)) {
          const { numeratorIds, denominatorIds, constant } = resolvedRatio || { numeratorIds: [], denominatorIds: [], constant: null };
          let numeratorSum = 0;
          let denominatorSum = 0;

          // 累计从第一期到当前期的所有分子和分母的目标值
          for (let i = 0; i <= index; i++) {
            const checkMonth = months[i];

            // 构造目标 key
            let targetKey;
            if (checkMonth.includes('月')) {
              const monthNum = parseInt(checkMonth, 10);
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{6,8}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else {
              targetKey = `${checkMonth}-目标`;
            }

            let monthNumerator = 0;
            let monthDenominator = 0;

            // 累加分子节点的目标值
            numeratorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const value = depNode.timeData?.[targetKey] ?? depNode.originalTimeData?.[targetKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  monthNumerator += parseFloat(value);
                }
              }
            });

            // 累加分母节点的目标值
            denominatorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const value = depNode.timeData?.[targetKey] ?? depNode.originalTimeData?.[targetKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  monthDenominator += parseFloat(value);
                }
              }
            });

            // 累加到总和
            numeratorSum += monthNumerator;
            denominatorSum += monthDenominator;
          }

          // 计算累计比率：Σ分子 / (Σ分母 * 常数)
          if (denominatorSum !== 0) {
            let ratio = numeratorSum / denominatorSum;
            if (constant) {
              ratio = ratio / constant;
            }
            cumulativeMap.set(month, ratio);
          } else {
            cumulativeMap.set(month, 0);
          }
          return;
        }

        // 不是比率型公式，直接累加节点的目标值
        let sum = 0;

        // 检查当前节点或依赖节点是否包含特殊函数（如 MONTHLY_SUM）
        const checkHasSpecialFunction = (formula, allNodesLocal, visited = new Set()) => {
          if (!formula || visited.has(formula)) return false;
          visited.add(formula);

          if (FormulaParser.hasMonthlyFunction(formula)) return true;

          // 递归检查依赖节点
          const deps = FormulaParser.extractDependencies(formula, Object.keys(allNodesLocal));
          for (const depId of deps) {
            const depNode = allNodesLocal[depId];
            if (depNode && depNode.type === 'computed' && depNode.formula) {
              if (checkHasSpecialFunction(depNode.formula, allNodesLocal, visited)) return true;
            }
          }
          return false;
        };

        const hasSpecialFunction = checkHasSpecialFunction(node?.formula || '', allNodes);

        if (hasSpecialFunction) {
          // MONTHLY 函数节点：从 initialData 读取-BU 数据
          for (let i = 0; i <= index; i++) {
            const checkMonth = months[i];
            // 构造目标 key
            let targetKey;
            if (checkMonth.includes('月')) {
              const monthNum = parseInt(checkMonth, 10);
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{6,8}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else {
              targetKey = `${checkMonth}-目标`;
            }

            // 优先从 initialData 读取，降级到 node.timeData
            const value = initialData?.[targetKey] ?? node.timeData?.[targetKey];
            if (value !== undefined && !isNaN(parseFloat(value))) {
              sum += parseFloat(value);
            }
          }
          cumulativeMap.set(month, sum);
          return;
        }

        // 检查是否包含比率型依赖（递归解析）
        // 使用上面已声明的 resolvedRatio 变量
        const hasRatioDependency = resolvedRatio && resolvedRatio.isRatio;

        // 对于计算指标，如果依赖比率型指标（如 成交率*100），需要从依赖节点递归计算每个月的值
        // 但累计方式是 Σ分子/Σ分母，而不是简单累加
        if (hasRatioDependency) {
          const { numeratorIds, denominatorIds, constant } = resolvedRatio;
          let numeratorSum = 0;
          let denominatorSum = 0;

          for (let i = 0; i <= index; i++) {
            const checkMonth = months[i];
            // 构造目标 key
            let targetKey;
            if (checkMonth.includes('月')) {
              const monthNum = parseInt(checkMonth, 10);
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{4}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else if (/^\d{6,8}$/.test(checkMonth)) {
              targetKey = `${checkMonth}-BU`;
            } else {
              targetKey = `${checkMonth}-目标`;
            }

            let monthNumerator = 0;
            let monthDenominator = 0;

            // 累加分子节点的目标值
            numeratorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const value = depNode.timeData?.[targetKey] ?? depNode.originalTimeData?.[targetKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  monthNumerator += parseFloat(value);
                }
              }
            });

            // 累加分母节点的目标值
            denominatorIds.forEach(depId => {
              const depNode = allNodes[depId];
              if (depNode) {
                const value = depNode.timeData?.[targetKey] ?? depNode.originalTimeData?.[targetKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  monthDenominator += parseFloat(value);
                }
              }
            });

            numeratorSum += monthNumerator;
            denominatorSum += monthDenominator;
          }

          // 计算累计比率：Σ分子 / (Σ分母 * 常数)
          if (denominatorSum !== 0) {
            let ratio = numeratorSum / denominatorSum;
            if (constant) {
              ratio = ratio / constant;
            }
            cumulativeMap.set(month, ratio);
          } else {
            cumulativeMap.set(month, 0);
          }
          return;
        }

        // 非比率型计算指标（如 A*100，A 不是比率型），从依赖节点递归计算
        if (node?.type === 'computed' && node?.formula) {
          const allNodeIds = Object.keys(allNodes || {});
          const deps = FormulaParser.extractDependencies(node.formula, allNodeIds);

          if (deps.length > 0) {
            for (let i = 0; i <= index; i++) {
              const checkMonth = months[i];
              // 构造目标 key
              let targetKey;
              if (checkMonth.includes('月')) {
                const monthNum = parseInt(checkMonth, 10);
                targetKey = `${checkMonth}-BU`;
              } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
                targetKey = `${checkMonth}-BU`;
              } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
                targetKey = `${checkMonth}-BU`;
              } else if (/^\d{4}$/.test(checkMonth)) {
                targetKey = `${checkMonth}-BU`;
              } else if (/^\d{6,8}$/.test(checkMonth)) {
                targetKey = `${checkMonth}-BU`;
              } else {
                targetKey = `${checkMonth}-目标`;
              }

              const monthValues = {};
              let hasAllData = true;

              deps.forEach(depId => {
                const depNode = allNodes[depId];
                if (depNode) {
                  let depValue = null;

                  // 获取依赖节点的目标值
                  if (depNode.type === 'computed') {
                    // 计算指标：从 timeData 获取目标值
                    depValue = depNode.timeData?.[targetKey];
                  } else {
                    // 驱动因子：从 timeData 获取目标值
                    depValue = depNode.timeData?.[targetKey];
                  }

                  if (depValue !== undefined && depValue !== null) {
                    monthValues[depId] = parseFloat(depValue);
                  } else {
                    hasAllData = false;
                  }
                }
              });

              if (hasAllData) {
                try {
                  const compileFn = FormulaParser.compile(node.formula, deps);
                  sum += compileFn(monthValues);
                } catch (e) {
                  console.warn('递归计算目标值失败:', e);
                  // 计算失败时，降级为使用 node.timeData
                  const value = node.timeData?.[targetKey];
                  if (value !== undefined && !isNaN(parseFloat(value))) {
                    sum += parseFloat(value);
                  }
                }
              } else {
                // 数据不完整时，降级为使用 node.timeData
                const value = node.timeData?.[targetKey];
                if (value !== undefined && !isNaN(parseFloat(value))) {
                  sum += parseFloat(value);
                }
              }
            }

            cumulativeMap.set(month, sum);
            return;
          }
        }

        // 降级：直接从 node.timeData 读取并累加（用于 MONTHLY_SUM 等特殊函数节点）
        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          // 构造目标 key
          let targetKey;
          if (checkMonth.includes('月')) {
            const monthNum = parseInt(checkMonth, 10);
            targetKey = `${checkMonth}-BU`;
          } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
            targetKey = `${checkMonth}-BU`;
          } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
            targetKey = `${checkMonth}-BU`;
          } else if (/^\d{4}$/.test(checkMonth)) {
            targetKey = `${checkMonth}-BU`;
          } else if (/^\d{6,8}$/.test(checkMonth)) {
            targetKey = `${checkMonth}-BU`;
          } else {
            targetKey = `${checkMonth}-目标`;
          }

          const value = node.timeData?.[targetKey];
          if (value !== undefined && !isNaN(parseFloat(value))) {
            sum += parseFloat(value);
          }
        }
        cumulativeMap.set(month, sum);
        return;
      }

      // 对于驱动因子节点，使用原来的累计逻辑
      // 对于比率型指标：累计分子/累计分母
      if (isRatioIndicator && ratioComponents) {
        let numeratorSum = 0;
        let denominatorSum = 0;
        let hasData = false;

        const { numeratorIds, denominatorIds } = ratioComponents;

        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];

          let monthNumerator = 0;
          let monthDenominator = 0;

          // 目标累计：所有月份都使用"目标"key
          numeratorIds.forEach(depId => {
            const depNode = allNodes[depId];
            if (depNode) {
              let monthKey;
              // 支持多种时间格式
              if (checkMonth.includes('月')) {
                // 旧格式：1 月
                const monthNum = parseInt(checkMonth, 10);
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
                // 周度格式：2026WK01
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
                // 季度格式：2026Q1
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}$/.test(checkMonth)) {
                // 年度格式：2026
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{6,8}$/.test(checkMonth)) {
                // 新月度格式：202601
                monthKey = `${checkMonth}-BU`;
              } else {
                // 过渡格式：2024-01
                monthKey = `${checkMonth}-目标`;
              }

              // 目标累计：优先从当前 timeData 读取目标值
              const timeValue = depNode.timeData?.[monthKey] ?? depNode.originalTimeData?.[monthKey];
              if (timeValue !== undefined && !isNaN(parseFloat(timeValue))) {
                monthNumerator += parseFloat(timeValue);
              }
            }
          });

          denominatorIds.forEach(depId => {
            const depNode = allNodes[depId];
            if (depNode) {
              let monthKey;
              // 支持多种时间格式
              if (checkMonth.includes('月')) {
                // 旧格式：1 月
                const monthNum = parseInt(checkMonth, 10);
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}WK\d{2}$/.test(checkMonth)) {
                // 周度格式：2026WK01
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}Q[1-4]$/.test(checkMonth)) {
                // 季度格式：2026Q1
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{4}$/.test(checkMonth)) {
                // 年度格式：2026
                monthKey = `${checkMonth}-BU`;
              } else if (/^\d{6,8}$/.test(checkMonth)) {
                // 新月度格式：202601
                monthKey = `${checkMonth}-BU`;
              } else {
                // 过渡格式：2024-01
                monthKey = `${checkMonth}-目标`;
              }

              // 目标累计：优先从当前 timeData 读取目标值
              const timeValue = depNode.timeData?.[monthKey] ?? depNode.originalTimeData?.[monthKey];
              if (timeValue !== undefined && !isNaN(parseFloat(timeValue))) {
                monthDenominator += parseFloat(timeValue);
              }
            }
          });

          if (monthNumerator !== 0 || monthDenominator !== 0) {
            numeratorSum += monthNumerator;
            denominatorSum += monthDenominator;
            hasData = true;
          }
        }

        if (hasData && denominatorSum !== 0) {
          let ratio = numeratorSum / denominatorSum;
          // 如果分母表达式是常数（如 1000），需要再除以它
          if (ratioComponents && !isNaN(ratioComponents.denominatorConstant)) {
            ratio = ratio / ratioComponents.denominatorConstant;
          }
          cumulativeMap.set(month, ratio);
        } else {
          cumulativeMap.set(month, 0);
        }
      } else if (isAverageIndicator) {
        // 平均型指标：使用移动平均 - 所有月份都用目标值
        let sum = 0;
        let count = 0;

        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const targetDataPoint = targetData.find(d => d.month === checkMonth);
          if (targetDataPoint && !isNaN(targetDataPoint.value)) {
            sum += targetDataPoint.value;
            count++;
          }
        }

        cumulativeMap.set(month, count > 0 ? sum / count : 0);
      } else {
        // 普通指标：简单累加 - 所有月份都用目标值
        let sum = 0;
        for (let i = 0; i <= index; i++) {
          const checkMonth = months[i];
          const targetDataPoint = targetData.find(d => d.month === checkMonth);
          if (targetDataPoint && !isNaN(targetDataPoint.value)) {
            sum += targetDataPoint.value;
          }
        }
        cumulativeMap.set(month, sum);
      }
    });

    return cumulativeMap;
  };

  // 计算各类型数据的累计值
  const originalActualCumulative = calculateCumulativeWithActual(originalActualData, null, false);
  const originalForecastCumulative = calculateCumulativeWithActual(originalForecastData, null, false);
  const adjustedForecastCumulative = calculateCumulativeWithActual(originalForecastData, adjustedForecastData, true);
  const targetCumulative = calculateTargetCumulative();

  // 计算柱状图数据范围（用于左侧 Y 轴）- 基于累计值
  const allBarValues = [];
  months.forEach(month => {
    allBarValues.push(originalActualCumulative.get(month) || 0);
    allBarValues.push(originalForecastCumulative.get(month) || 0);
    allBarValues.push(adjustedForecastCumulative.get(month) || 0);
    allBarValues.push(targetCumulative.get(month) || 0);
  });

  let maxBarValue = allBarValues.length > 0 ? Math.max(...allBarValues) : 100;
  let minBarValue = allBarValues.length > 0 ? Math.min(...allBarValues) : 0;

  if (allBarValues.length === 0) {
    maxBarValue = 100;
    minBarValue = 0;
  } else {
    minBarValue = Math.min(0, minBarValue * 1.1);
    maxBarValue = maxBarValue * 1.15;
  }

  const barRange = maxBarValue - minBarValue || 1;

  // 计算月度数据的范围（用于右侧 Y 轴）- 基于月度值（非累计）
  const allMonthlyValues = [
    ...originalActualData.map(d => d.value),
    ...originalForecastData.map(d => d.value),
    ...adjustedForecastData.map(d => d.value),
    ...targetData.map(d => d.value)
  ].filter(v => !isNaN(v) && isFinite(v));

  let maxMonthly = Math.max(...allMonthlyValues);
  let minMonthly = Math.min(...allMonthlyValues);

  if (allMonthlyValues.length === 0) {
    maxMonthly = 100;
    minMonthly = 0;
  } else {
    minMonthly = Math.min(0, minMonthly * 1.1);
    maxMonthly = maxMonthly * 1.15;
  }

  const monthlyRange = maxMonthly - minMonthly || 1;

  // 坐标转换函数
  const xScale = (index) => padding.left + (index + 0.5) / months.length * plotWidth;
  const yScaleLeft = (value) => {
    if (isNaN(value) || !isFinite(value)) return null;
    return padding.top + plotHeight - ((value - minBarValue) / barRange) * plotHeight;
  };
  const yScaleRight = (value) => {
    if (isNaN(value) || !isFinite(value)) return null;
    return padding.top + plotHeight - ((value - minMonthly) / monthlyRange) * plotHeight;
  };

  // 柱状图宽度
  const barWidth = Math.min(32, plotWidth / months.length / 3);
  const barGap = 3;

  // 格式化数值 - 使用节点设置的格式（不带单位，用于图表标注）
  const formatNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '';
    const format = node?.format || '';

    // 根据格式设置返回格式化后的数字（不带单位）
    if (format.includes('0.00')) {
      return value.toFixed(2);
    } else if (format.includes('0.0')) {
      return value.toFixed(1);
    } else if (format.includes('#,##0')) {
      return value.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    } else {
      // 默认：保留最多2位小数，不强制取整
      return value.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    }
  };

  // 格式化坐标轴数值 - 带万/亿单位
  const formatAxisNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '';
    const absValue = Math.abs(value);
    if (absValue >= 100000000) return (value / 100000000).toFixed(1) + '亿';
    if (absValue >= 10000) return (value / 10000).toFixed(1) + '万';
    return formatNumber(value);
  };

  // 判断指标方向
  const isPositive = isPositiveIndicator(nodeName);

  // 获取差额颜色
  const getDiffColor = (diff) => {
    if (diff === 0) return '#94a3b8';
    // 正向指标：增长是好（绿色），下降是坏（红色）
    // 反向指标（成本类）：增长是坏（红色），下降是好（绿色）
    if (isPositive) {
      return diff > 0 ? '#10b981' : '#ef4444';
    } else {
      return diff > 0 ? '#ef4444' : '#10b981';
    }
  };

  return (
    <div id="cumulative-chart-container" style={{ marginTop: '20px', background: '#fff', padding: '12px', borderRadius: '8px' }}>
      {/* 标题和导出按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#374151' }}>
          📊 {timeDimensionName}数据对比
        </h4>
        {onExport && (
          <button
            onClick={() => {
              if (!canExport) {
                alert(getDisableReason('export'));
                return;
              }
              onExport();
            }}
            style={{
              fontSize: '12px',
              color: !canExport ? '#9ca3af' : '#3b82f6',
              background: !canExport ? '#f3f4f6' : '#eff6ff',
              border: !canExport ? '1px solid #d1d5db' : '1px solid #bfdbfe',
              borderRadius: '4px',
              cursor: !canExport ? 'not-allowed' : 'pointer',
              padding: '4px 8px'
            }}
          >
            🖼️ 导出
          </button>
        )}
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 14, height: 14, background: COLORS.originalActual, borderRadius: 3 }}></span>
          实际
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 14, height: 14, background: COLORS.target, borderRadius: 3 }}></span>
          目标
        </span>
        {hasAdjustment && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 14, height: 14, background: '#94a3b8', borderRadius: 3, opacity: 0.5 }}></span>
              初始预测
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 14, height: 14, background: '#10b981', borderRadius: 3 }}></span>
              增加(好)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 14, height: 14, background: '#ef4444', borderRadius: 3 }}></span>
              减少(坏)
            </span>
          </>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid #e5e7eb' }}>
          <svg width="24" height="16">
            <line x1="0" y1="8" x2="24" y2="8" stroke={COLORS.originalActual} strokeWidth="3" />
            <line x1="14" y1="8" x2="24" y2="8" stroke={COLORS.originalForecast} strokeWidth="3" strokeDasharray="6,3" />
            <circle cx="5" cy="8" r="3" fill={COLORS.originalActual} />
          </svg>
          {timeDimensionName}实际/预测
        </span>
      </div>

      {/* SVG 图表 */}
      <svg width={width} height={chartHeight} style={{ background: '#fff' }}>
        {/* 左侧 Y 轴标签 */}
        <text
          x={padding.left - 10}
          y={padding.top - 10}
          textAnchor="end"
          fill="#6b7280"
          fontSize="12"
          fontWeight="600"
        >
          {timeDimensionName}值（柱状）
        </text>

        {/* 右侧 Y 轴标签 */}
        <text
          x={width - 10}
          y={padding.top - 10}
          textAnchor="end"
          fill="#6b7280"
          fontSize="12"
          fontWeight="600"
        >
          {timeDimensionName}值（折线）
        </text>

        {/* 水平网格线和 Y 轴刻度 */}
        {[0, 1, 2, 3, 4, 5].map(i => {
          const y = padding.top + (plotHeight / 5) * i;
          const rightValue = maxMonthly - ((maxMonthly - minMonthly) / 5) * i;
          const leftValue = maxBarValue - ((maxBarValue - minBarValue) / 5) * i;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              {/* 左侧 Y 轴刻度（柱状图） */}
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="#6b7280"
                fontSize="11"
              >
                {formatAxisNumber(leftValue)}
              </text>
              {/* 右侧 Y 轴刻度（折线图） */}
              <text
                x={width - padding.right + 10}
                y={y + 4}
                textAnchor="start"
                fill="#6b7280"
                fontSize="11"
              >
                {formatAxisNumber(rightValue)}
              </text>
            </g>
          );
        })}

        {/* 柱状图 - 使用左侧 Y 轴 */}
        {months.map((month, i) => {
          const x = xScale(i);
          const isActualMonth = i <= actualForecastSplitIndex;

          const actualData = originalActualData.find(d => d.month === month);
          const targetDataPoint = targetData.find(d => d.month === month);
          const forecastData = originalForecastData.find(d => d.month === month);
          const adjustedData = adjustedForecastData.find(d => d.month === month);

          // 使用累计值计算柱状图位置
          const actualCumulative = originalActualCumulative.get(month) || 0;
          const targetCumulativeVal = targetCumulative.get(month) || 0;
          const forecastCumulativeVal = originalForecastCumulative.get(month) || 0;
          const adjustedCumulativeVal = adjustedForecastCumulative.get(month) || 0;

          const actualY = actualData ? yScaleLeft(actualCumulative) : null;
          const targetY = targetDataPoint ? yScaleLeft(targetCumulativeVal) : null;
          const forecastY = forecastData ? yScaleLeft(forecastCumulativeVal) : null;

          const baseY = yScaleLeft(0);

          return (
            <g key={month}>
              {isActualMonth ? (
                <>
                  {/* 实际柱 - 紧贴目标柱左侧 */}
                  {actualY !== null && (
                    <>
                      <rect
                        x={x - barWidth - barGap}
                        y={Math.min(actualY, baseY)}
                        width={barWidth}
                        height={Math.abs(baseY - actualY)}
                        fill={COLORS.originalActual}
                        opacity={0.9}
                        rx={3}
                      />
                      {/* 实际柱数值标注 - 显示累计值 */}
                      <text
                        x={x - barWidth / 2 - barGap}
                        y={actualY < baseY ? actualY - 5 : actualY + 15}
                        textAnchor="middle"
                        fill={COLORS.originalActual}
                        fontSize="10"
                        fontWeight="600"
                      >
                        {formatNumber(actualCumulative)}
                      </text>
                    </>
                  )}
                  {/* 目标柱 - 在中心位置 */}
                  {targetY !== null && (
                    <>
                      <rect
                        x={x}
                        y={Math.min(targetY, baseY)}
                        width={barWidth}
                        height={Math.abs(baseY - targetY)}
                        fill={COLORS.target}
                        opacity={0.85}
                        rx={3}
                      />
                      {/* 目标柱数值标注 - 显示累计值 */}
                      <text
                        x={x + barWidth / 2}
                        y={targetY < baseY ? targetY - 5 : targetY + 15}
                        textAnchor="middle"
                        fill={COLORS.target}
                        fontSize="10"
                        fontWeight="600"
                      >
                        {formatNumber(targetCumulativeVal)}
                      </text>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* 预测期：显示初始预测柱（灰色）+ 差额柱 + 目标柱 */}

                  {/* 目标柱 - 在中心位置 */}
                  {targetY !== null && (
                    <>
                      <rect
                        x={x}
                        y={Math.min(targetY, baseY)}
                        width={barWidth}
                        height={Math.abs(baseY - targetY)}
                        fill={COLORS.target}
                        opacity={0.85}
                        rx={3}
                      />
                      {/* 目标柱数值标注 - 显示累计值 */}
                      <text
                        x={x + barWidth / 2}
                        y={targetY < baseY ? targetY - 5 : targetY + 15}
                        textAnchor="middle"
                        fill={COLORS.target}
                        fontSize="10"
                        fontWeight="600"
                      >
                        {formatNumber(targetCumulativeVal)}
                      </text>
                    </>
                  )}

                  {forecastY !== null && (
                    <>
                      {/* 初始预测柱 - 灰色底色 */}
                      <rect
                        x={x - barWidth - barGap}
                        y={Math.min(forecastY, baseY)}
                        width={barWidth}
                        height={Math.abs(baseY - forecastY)}
                        fill="#cbd5e1"
                        opacity={0.6}
                        rx={3}
                      />
                      {/* 灰色柱子内部显示初始值（仅当没有调整时） */}
                      {(!hasAdjustment || !adjustedData) && Math.abs(baseY - forecastY) > 20 && (
                        <text
                          x={x - barWidth / 2 - barGap}
                          y={(forecastY + baseY) / 2 + 4}
                          textAnchor="middle"
                          fill="#475569"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {formatNumber(forecastCumulativeVal)}
                        </text>
                      )}
                      {/* 灰色柱子顶部显示初始值（当柱子太小时，仅当没有调整时） */}
                      {(!hasAdjustment || !adjustedData) && Math.abs(baseY - forecastY) <= 20 && (
                        <text
                          x={x - barWidth / 2 - barGap}
                          y={forecastY < baseY ? forecastY - 5 : forecastY + 15}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {formatNumber(forecastCumulativeVal)}
                        </text>
                      )}
                      {/* 差额柱 - 叠加在灰色柱子上 */}
                      {(() => {
                        if (!hasAdjustment) return null;
                        if (!adjustedData) return null;
                        if (!forecastData) return null;

                        // 使用累计值计算差额
                        const diffCumulative = adjustedCumulativeVal - forecastCumulativeVal;
                        const diffMonthly = adjustedData.value - forecastData.value;

                        // 累计差额为0，完全不显示
                        if (Math.abs(diffCumulative) < 0.0001) return null;

                        const adjustedY = yScaleLeft(adjustedCumulativeVal);
                        const isGrowing = diffCumulative > 0;
                        const diffY = Math.min(adjustedY, forecastY);
                        const diffHeight = Math.abs(adjustedY - forecastY);

                        // 单期差额为0：透明填充 + 虚线边框（继承的累计影响）
                        const isInherited = Math.abs(diffMonthly) < 0.0001;
                        const diffColor = isInherited ? getDiffColor(diffCumulative) : getDiffColor(diffMonthly);

                          return (
                            <g>
                              {/* 差额柱子 */}
                              <rect
                                x={x - barWidth - barGap}
                                y={diffY}
                                width={barWidth}
                                height={Math.max(3, diffHeight)}
                                fill={isInherited ? 'none' : diffColor}
                                stroke={isInherited ? diffColor : 'none'}
                                strokeWidth={isInherited ? 1.5 : 0}
                                strokeDasharray={isInherited ? '4 2' : 'none'}
                                opacity={isInherited ? 0.6 : 1}
                                rx={2}
                              />
                              {/* 差额柱子端部的三角形箭头（仅单期有调整时显示） */}
                              {!isInherited && (isGrowing ? (
                                <path
                                  d={`M${x - barWidth / 2 - barGap} ${diffY - 6} L${x - barWidth / 2 - barGap - 6} ${diffY} L${x - barWidth / 2 - barGap + 6} ${diffY} Z`}
                                  fill={diffColor}
                                />
                              ) : (
                                <path
                                  d={`M${x - barWidth / 2 - barGap} ${diffY + diffHeight + 6} L${x - barWidth / 2 - barGap - 6} ${diffY + diffHeight} L${x - barWidth / 2 - barGap + 6} ${diffY + diffHeight} Z`}
                                  fill={diffColor}
                                />
                              ))}
                              {/* 差额柱子上的差额标注 */}
                              {!isInherited && (
                                <text
                                  x={x - barWidth / 2 - barGap}
                                  y={diffY + diffHeight / 2 + 4}
                                  textAnchor="middle"
                                  fill="white"
                                  fontSize="10"
                                  fontWeight="700"
                                >
                                  {diffMonthly > 0 ? '+' : ''}{formatNumber(diffMonthly)}
                                </text>
                              )}
                              {/* 调整后最终值标注（在最终位置） - 显示累计值 */}
                              <text
                                x={x - barWidth / 2 - barGap}
                                y={adjustedY < baseY ? adjustedY - 8 : adjustedY + 18}
                                textAnchor="middle"
                                fill={isInherited ? '#94a3b8' : '#1f2937'}
                                fontSize="11"
                                fontWeight={isInherited ? '500' : '700'}
                              >
                                {formatNumber(adjustedCumulativeVal)}
                              </text>
                            </g>
                          );
                        })()
                      }
                    </>
                  )}
                  {/* 目标柱 */}
                  {targetY !== null && (
                    <>
                      <rect
                        x={x}
                        y={Math.min(targetY, baseY)}
                        width={barWidth}
                        height={Math.abs(baseY - targetY)}
                        fill={COLORS.target}
                        opacity={0.85}
                        rx={3}
                      />
                      {/* 目标柱数值标注 - 显示累计值 */}
                      <text
                        x={x + barWidth / 2}
                        y={targetY < baseY ? targetY - 5 : targetY + 15}
                        textAnchor="middle"
                        fill={COLORS.target}
                        fontSize="10"
                        fontWeight="600"
                      >
                        {formatNumber(targetCumulativeVal)}
                      </text>
                    </>
                  )}
                </>
              )}

              {/* X轴标签 - 稀疏显示避免密集 */}
              {(i % xAxisLabelInterval === 0) && (
              <text
                x={x}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                fill="#6b7280"
                fontSize="11"
                transform={`rotate(-30, ${x}, ${chartHeight - padding.bottom + 30})`}
              >
                {formatXAxisLabel(month, timeDimension)}
              </text>
              )}
            </g>
          );
        })}

        {/* 折线图 - 月度数据 */}
        {/* 实际期折线（蓝色实线） */}
        {(() => {
          const actualPoints = [];
          months.forEach((month, i) => {
            if (i <= actualForecastSplitIndex) {
              const data = originalActualData.find(d => d.month === month);
              if (data && !isNaN(data.value)) {
                actualPoints.push({ x: xScale(i), y: yScaleRight(data.value), value: data.value });
              }
            }
          });

          if (actualPoints.length < 2) return null;
          const pathD = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g>
              <path d={pathD} fill="none" stroke={COLORS.originalActual} strokeWidth="2.5" />
              {/* 数据点 */}
              {actualPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill={COLORS.originalActual} stroke="#fff" strokeWidth="2" />
              ))}
              {/* 数值标注 */}
              {actualPoints.map((p, i) => (
                <text
                  key={`label-${i}`}
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fill={COLORS.originalActual}
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatNumber(p.value)}
                </text>
              ))}
            </g>
          );
        })()}

        {/* 预测期折线（蓝色虚线） */}
        {(() => {
          const forecastPoints = [];
          // 添加最后一个实际点作为连接点
          const lastActualData = originalActualData.find(d => {
            const idx = months.indexOf(d.month);
            return idx === actualForecastSplitIndex;
          });
          if (lastActualData) {
            const idx = months.indexOf(lastActualData.month);
            forecastPoints.push({ x: xScale(idx), y: yScaleRight(lastActualData.value), value: lastActualData.value });
          }
          // 添加预测期数据
          months.forEach((month, i) => {
            if (i > actualForecastSplitIndex) {
              const data = originalForecastData.find(d => d.month === month);
              if (data && !isNaN(data.value)) {
                forecastPoints.push({ x: xScale(i), y: yScaleRight(data.value), value: data.value });
              }
            }
          });

          if (forecastPoints.length < 2) return null;
          const pathD = forecastPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g>
              <path d={pathD} fill="none" stroke={COLORS.originalForecast} strokeWidth="2.5" strokeDasharray="8,4" />
              {/* 数据点 - 跳过第一个连接点 */}
              {forecastPoints.slice(1).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill={COLORS.originalForecast} stroke="#fff" strokeWidth="2" />
              ))}
              {/* 数值标注 - 跳过第一个连接点 */}
              {forecastPoints.slice(1).map((p, i) => (
                <text
                  key={`label-${i}`}
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fill={COLORS.originalForecast}
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatNumber(p.value)}
                </text>
              ))}
            </g>
          );
        })()}

        {/* 调整后预测折线（绿色虚线） */}
        {hasAdjustment && (() => {
          const adjustedPoints = [];
          // 添加最后一个实际点作为连接点
          const lastActualData = originalActualData.find(d => {
            const idx = months.indexOf(d.month);
            return idx === actualForecastSplitIndex;
          });
          if (lastActualData) {
            const idx = months.indexOf(lastActualData.month);
            adjustedPoints.push({ x: xScale(idx), y: yScaleRight(lastActualData.value), value: lastActualData.value });
          }
          // 添加调整后预测数据
          months.forEach((month, i) => {
            if (i > actualForecastSplitIndex) {
              const data = adjustedForecastData.find(d => d.month === month);
              if (data && !isNaN(data.value)) {
                adjustedPoints.push({ x: xScale(i), y: yScaleRight(data.value), value: data.value });
              }
            }
          });

          if (adjustedPoints.length < 2) return null;
          const pathD = adjustedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g>
              <path d={pathD} fill="none" stroke={COLORS.adjustedForecast} strokeWidth="2.5" strokeDasharray="8,4" />
              {/* 数据点 - 跳过第一个连接点 */}
              {adjustedPoints.slice(1).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill={COLORS.adjustedForecast} stroke="#fff" strokeWidth="2" />
              ))}
              {/* 数值标注 - 跳过第一个连接点 */}
              {adjustedPoints.slice(1).map((p, i) => (
                <text
                  key={`label-${i}`}
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fill={COLORS.adjustedForecast}
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatNumber(p.value)}
                </text>
              ))}
            </g>
          );
        })()}

        {/* 目标折线（橙色双实线） */}
        {(() => {
          const targetPoints = [];
          months.forEach((month, i) => {
            const data = targetData.find(d => d.month === month);
            if (data && !isNaN(data.value)) {
              targetPoints.push({ x: xScale(i), y: yScaleRight(data.value), value: data.value });
            }
          });

          if (targetPoints.length < 2) return null;
          const pathD = targetPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <g>
              {/* 双实线效果 - 两条粗细不同的线 */}
              <path d={pathD} fill="none" stroke={COLORS.target} strokeWidth="4" />
              <path d={pathD} fill="none" stroke="#fff" strokeWidth="1.5" />
              {/* 数据点 */}
              {targetPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill={COLORS.target} stroke="#fff" strokeWidth="2" />
              ))}
              {/* 数值标注 */}
              {targetPoints.map((p, i) => (
                <text
                  key={`label-${i}`}
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fill={COLORS.target}
                  fontSize="10"
                  fontWeight="600"
                >
                  {formatNumber(p.value)}
                </text>
              ))}
            </g>
          );
        })()}

        {/* 实际/预测分界线 */}
        {actualForecastSplitIndex >= 0 && actualForecastSplitIndex < months.length - 1 && (
          <line
            x1={xScale(actualForecastSplitIndex) + (xScale(1) - xScale(0)) / 2}
            y1={padding.top}
            x2={xScale(actualForecastSplitIndex) + (xScale(1) - xScale(0)) / 2}
            y2={chartHeight - padding.bottom}
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
        )}
      </svg>
    </div>
  );
}

// 绘制平滑曲线（使用 Catmull-Rom 样条插值）
function createSmoothLinePath(points, tension = 0.5) {
  if (!points || points.length < 2) return '';

  try {
    const result = [];

    for (let i = 0; i < points.length; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      if (!p1 || p1.x === undefined || p1.y === undefined) continue;

      if (i === 0) {
        result.push(`M ${p1.x} ${p1.y}`);
      }

      if (i < points.length - 1 && p2 && p2.x !== undefined && p2.y !== undefined) {
        const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
        result.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
      }
    }

    return result.join(' ');
  } catch (e) {
    // 出错时降级为折线
    if (points.length >= 2) {
      return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    }
    return '';
  }
}

// 根据节点显示格式确定小数位数
function getDecimalPlaces(format) {
  if (!format) return 0;
  if (format.includes('0.00')) return 2;
  if (format.includes('0.0')) return 1;
  return 0;
}

// 格式化数值显示 - 根据节点格式
function formatValueForLabel(value, format) {
  try {
    if (value === null || value === undefined || isNaN(value)) return '';

    const decimals = getDecimalPlaces(format);

    // 如果是百分比格式，直接显示数值
    if (format && format.includes('0%')) {
      return value.toFixed(decimals > 0 ? decimals : 1);
    }

    // 大数值简化显示（亿/万）
    if (Math.abs(value) >= 100000000) {
      return (value / 100000000).toFixed(Math.max(1, decimals)) + '亿';
    } else if (Math.abs(value) >= 10000) {
      return (value / 10000).toFixed(Math.max(1, decimals)) + '万';
    }

    // 普通数值
    if (decimals === 0) {
      return Math.round(value).toLocaleString();
    } else {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }
  } catch (e) {
    return '';
  }
}

const TrendChart = ({ node, allNodes = {}, scenarioName = '当前方案', onClose, canExport, getDisableReason }) => {
  const {
    timeData = {},
    originalTimeData,
    name,
    type,
    formula
  } = node || {};

  // ========================================================================
  // 辅助函数：动态计算计算指标的初始 timeData（基于驱动因子的 originalTimeData）
  // ========================================================================
  const computeInitialTimeDataForComputed = useCallback((targetNode, allNodesMap) => {
    if (!targetNode || targetNode.type === 'driver' || !targetNode.formula) {
      return null;
    }

    try {
      const allNodeIds = Object.keys(allNodesMap);
      const deps = FormulaParser.extractDependencies(targetNode.formula, allNodeIds);

      // 收集所有月份标签 - 支持从依赖节点递归收集
      const monthKeys = new Set();

      // 递归收集依赖节点的月份
      const collectMonthKeys = (depNode, visited = new Set()) => {
        if (!depNode || visited.has(depNode.id)) return;
        visited.add(depNode.id);

        if (depNode.type === 'driver') {
          // 驱动因子：直接从 originalTimeData 或 timeData 收集
          const dataToUse = depNode.originalTimeData || depNode.timeData || {};
          Object.keys(dataToUse).forEach(key => monthKeys.add(key));
        } else if (depNode.type === 'computed') {
          // 计算指标：递归收集其依赖节点的月份
          const depFormula = depNode.formula;
          if (depFormula) {
            const depDeps = FormulaParser.extractDependencies(depFormula, allNodeIds);
            depDeps.forEach(depDepId => {
              const depDepNode = allNodesMap[depDepId];
              collectMonthKeys(depDepNode, visited);
            });
          }
          // 同时从 timeData 收集（如果已有计算结果）
          const dataToUse = depNode.timeData || {};
          Object.keys(dataToUse).forEach(key => monthKeys.add(key));
        }
      };

      deps.forEach(depId => {
        const depNode = allNodesMap[depId];
        collectMonthKeys(depNode, new Set());
      });

      console.log('[computeInitialTimeDataForComputed] 收集到的月份键:', {
        targetNode: targetNode.name,
        formula: targetNode.formula,
        monthKeysCount: monthKeys.size,
        acCount: Array.from(monthKeys).filter(k => k.endsWith('-AC')).length,
        fcCount: Array.from(monthKeys).filter(k => k.endsWith('-FC')).length,
        buCount: Array.from(monthKeys).filter(k => k.endsWith('-BU')).length,
        sampleKeys: Array.from(monthKeys).slice(0, 6)
      });

      // 检查是否是 MONTHLY 节点
      if (FormulaParser.hasMonthlyFunction(targetNode.formula)) {
        const timeDataResult = {};

        // 使用 replaceMonthlyWithPlaceholder 处理多个 MONTHLY 函数
        const { formula: formulaWithPlaceholder, allPlaceholders } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);

        // 收集 AC 和 FC 键
        const acKeys = [];
        const fcKeys = [];
        const allPeriodKeys = [];

        monthKeys.forEach(monthKey => {
          try {
            // 为每个占位符计算值
            const placeholderValues = {};

            if (allPlaceholders && allPlaceholders.length > 0) {
              allPlaceholders.forEach(ph => {
                // 从占位符中提取函数类型和依赖节点
                const innerDeps = FormulaParser.extractDependencies(ph.inner, allNodeIds);
                const monthValues = {};

                innerDeps.forEach(depId => {
                  const depNode = allNodesMap[depId];
                  if (depNode) {
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

                // 计算占位符的值
                try {
                  const compileFn = FormulaParser.compile(ph.inner, allNodeIds);
                  placeholderValues[ph.placeholder] = compileFn(monthValues);
                } catch (e) {
                  console.warn('[computeInitialTimeDataForComputed-MONTHLY] 计算占位符失败:', e);
                  placeholderValues[ph.placeholder] = 0;
                }
              });
            }

            // 计算最终值：替换占位符后计算
            let finalFormula = formulaWithPlaceholder;
            Object.keys(placeholderValues).forEach(ph => {
              finalFormula = finalFormula.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), placeholderValues[ph]);
            });

            try {
              // eslint-disable-next-line no-new-func
              const monthValue = new Function(`return ${finalFormula}`)();
              timeDataResult[monthKey] = isNaN(monthValue) ? 0 : monthValue;

              // 收集 AC 和 FC 键
              if (monthKey.endsWith('-AC')) acKeys.push(monthKey);
              if (monthKey.endsWith('-FC')) fcKeys.push(monthKey);
              allPeriodKeys.push(monthKey);
            } catch (e) {
              console.warn('[computeInitialTimeDataForComputed-MONTHLY] 计算最终值失败:', e, finalFormula);
            }
          } catch (e) {}
        });

        // 为当前节点生成-BU 数据
        // 策略：从依赖节点的-BU 数据递归计算，而不是使用 targetValue 比例分配
        const buKeys = allPeriodKeys.filter(k => k.endsWith('-BU'));

        // 同时生成-FC 数据（从依赖节点的-FC 数据计算）
        const fcKeysForGeneration = allPeriodKeys.filter(k => k.endsWith('-FC'));

        console.log('[computeInitialTimeDataForComputed-MONTHLY] 生成-BU 和-FC 数据:', {
          nodeName: targetNode.name,
          buKeysCount: buKeys.length,
          fcKeysCount: fcKeysForGeneration.length
        });

        // 生成-BU 数据
        if (buKeys.length > 0) {
          // 重新获取 innerDeps 和 innerCompileFn（用于递归计算依赖节点）
          const detected = FormulaParser.detectMonthlyFunction(targetNode.formula);
          const innerDeps = detected ? FormulaParser.extractDependencies(detected.inner, allNodeIds) : [];
          const innerCompileFn = detected ? FormulaParser.compile(detected.inner, allNodeIds) : null;

          // 检查是否有外层公式
          const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
          const hasOuterFormula = formulaWithPlaceholder !== placeholder;
          let outerCompileFn = null;
          if (hasOuterFormula) {
            try {
              outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
            } catch (e) {}
          }

          buKeys.forEach(buKey => {
            try {
              const monthValues = {};
              let hasAllData = true;

              innerDeps.forEach(depId => {
                const depNode = allNodesMap[depId];
                if (depNode) {
                  let depInitialData = null;

                  if (depNode.type === 'driver') {
                    // 驱动因子：从 originalTimeData 或 timeData 获取-BU
                    depInitialData = depNode.originalTimeData || depNode.timeData;
                  } else {
                    // 计算指标：递归计算初始数据
                    depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                  }

                  if (depInitialData && depInitialData[buKey] !== undefined) {
                    monthValues[depId] = depInitialData[buKey];
                  } else {
                    hasAllData = false;
                  }
                }
              });

              if (hasAllData) {
                let monthValue = innerCompileFn(monthValues);
                if (hasOuterFormula && outerCompileFn) {
                  try {
                    monthValue = outerCompileFn({ [placeholder]: monthValue });
                  } catch (e) {}
                }
                timeDataResult[buKey] = monthValue;
              }
            } catch (e) {
              console.warn('[computeInitialTimeDataForComputed-MONTHLY] 计算-BU 数据失败:', e);
            }
          });
        }

        // 生成-FC 数据（从依赖节点的-FC 数据计算）
        // 注意：对于 MONTHLY 函数，-FC 显示的是单期预测值，不是累计值
        if (fcKeysForGeneration.length > 0) {
          // 重新获取 innerDeps 和 innerCompileFn（用于递归计算依赖节点）
          const detected = FormulaParser.detectMonthlyFunction(targetNode.formula);
          const innerDeps = detected ? FormulaParser.extractDependencies(detected.inner, allNodeIds) : [];
          const innerCompileFn = detected ? FormulaParser.compile(detected.inner, allNodeIds) : null;

          // 检查是否有外层公式
          const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
          const hasOuterFormula = formulaWithPlaceholder !== placeholder;
          let outerCompileFn = null;
          if (hasOuterFormula) {
            try {
              outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
            } catch (e) {}
          }

          // 获取所有月份基础键，用于累计计算
          const allMonthBaseKeys = new Set();
          fcKeysForGeneration.forEach(fcKey => {
            const baseKey = fcKey.replace(/-FC$/, '');
            allMonthBaseKeys.add(baseKey);
          });
          // 也收集AC键的月份
          acKeys.forEach(acKey => {
            const baseKey = acKey.replace(/-AC$/, '');
            allMonthBaseKeys.add(baseKey);
          });
          const sortedAllMonths = sortPeriodKeys(allMonthBaseKeys);
          fcKeysForGeneration.forEach(fcKey => {
            try {
              const monthValues = {};
              let hasAllData = true;

              innerDeps.forEach(depId => {
                const depNode = allNodesMap[depId];
                if (depNode) {
                  let depInitialData = null;

                  if (depNode.type === 'driver') {
                    depInitialData = depNode.originalTimeData || depNode.timeData;
                  } else {
                    depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                  }

                  if (depInitialData && depInitialData[fcKey] !== undefined) {
                    monthValues[depId] = depInitialData[fcKey];
                  } else {
                    hasAllData = false;
                  }
                }
              });

              if (hasAllData) {
                let monthValue = innerCompileFn(monthValues);
                if (hasOuterFormula && outerCompileFn) {
                  try {
                    monthValue = outerCompileFn({ [placeholder]: monthValue });
                  } catch (e) {}
                }
                timeDataResult[fcKey] = monthValue;
              }
            } catch (e) {
              console.warn('[computeInitialTimeDataForComputed-MONTHLY] 计算 -FC 数据失败:', e);
            }
          });
        }

        return timeDataResult;
      }

      // 普通计算指标（非 MONTHLY）
      const compileFn = FormulaParser.compile(targetNode.formula, allNodeIds);
      const timeDataResult = {};

      // 收集所有 AC 和 FC 键，用于后续生成 BU 数据
      const acKeys = [];
      const fcKeys = [];
      const allPeriodKeys = [];

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
                // 计算指标：递归计算初始数据
                const depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                if (depInitialData && depInitialData[monthKey] !== undefined) {
                  monthValues[depId] = depInitialData[monthKey];
                } else {
                  // 降级：如果递归计算失败，尝试从 depNode.timeData 直接读取
                  monthValues[depId] = depNode.timeData?.[monthKey] ?? depNode.initialBaseline ?? depNode.baseline ?? depNode.value ?? 0;
                }
              }
            }
          });
          const monthValue = compileFn(monthValues);
          timeDataResult[monthKey] = monthValue;

          // 收集 AC 和 FC 键
          if (monthKey.endsWith('-AC')) acKeys.push(monthKey);
          if (monthKey.endsWith('-FC')) fcKeys.push(monthKey);
          allPeriodKeys.push(monthKey);
        } catch (e) {}
      });

      console.log('[computeInitialTimeDataForComputed] 普通计算指标完成:', {
        targetNode: targetNode.name,
        formula: targetNode.formula,
        acCount: acKeys.length,
        fcCount: fcKeys.length,
        allPeriodKeysCount: allPeriodKeys.length,
        timeDataResultKeys: Object.keys(timeDataResult).length
      });

      // 为当前节点生成-BU 数据
      // 核心逻辑：从依赖节点的-BU 数据通过公式计算，而不是使用 targetValue 比例分配
      const buKeys = allPeriodKeys.filter(k => k.endsWith('-BU'));

      // 同时生成-FC 数据（从依赖节点的-FC 数据计算）
      const fcKeysForGeneration = allPeriodKeys.filter(k => k.endsWith('-FC'));

      // 生成-BU 数据
      if (buKeys.length > 0) {
        buKeys.forEach(buKey => {
          try {
            // 从依赖节点递归获取-BU 数据
            const monthValues = {};
            let hasAllData = true;

            deps.forEach(depId => {
              const depNode = allNodesMap[depId];
              if (depNode) {
                let depInitialData = null;

                if (depNode.type === 'driver') {
                  // 驱动因子：从 originalTimeData 或 timeData 获取-BU
                  depInitialData = depNode.originalTimeData || depNode.timeData;
                } else {
                  // 计算指标：递归计算初始数据
                  depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                }

                if (depInitialData && depInitialData[buKey] !== undefined) {
                  monthValues[depId] = depInitialData[buKey];
                } else {
                  hasAllData = false;
                  console.warn('[computeInitialTimeDataForComputed] 缺少-BU 数据:', {
                    targetNode: targetNode.name,
                    depId,
                    buKey,
                    hasDepInitialData: !!depInitialData,
                    depInitialDataKeys: depInitialData ? Object.keys(depInitialData).slice(0, 5) : []
                  });
                }
              }
            });

            if (hasAllData) {
              const monthValue = compileFn(monthValues);
              timeDataResult[buKey] = monthValue;
            }
          } catch (e) {
            console.warn('[computeInitialTimeDataForComputed] 计算-BU 数据失败:', e);
          }
        });
      }

      // 生成-FC 数据
      if (fcKeysForGeneration.length > 0) {
        fcKeysForGeneration.forEach(fcKey => {
          try {
            // 从依赖节点递归获取-FC 数据
            const monthValues = {};
            let hasAllData = true;

            deps.forEach(depId => {
              const depNode = allNodesMap[depId];
              if (depNode) {
                let depInitialData = null;

                if (depNode.type === 'driver') {
                  // 驱动因子：从 originalTimeData 或 timeData 获取-FC
                  depInitialData = depNode.originalTimeData || depNode.timeData;
                } else {
                  // 计算指标：递归计算初始数据
                  depInitialData = computeInitialTimeDataForComputed(depNode, allNodesMap);
                }

                if (depInitialData && depInitialData[fcKey] !== undefined) {
                  monthValues[depId] = depInitialData[fcKey];
                } else {
                  hasAllData = false;
                }
              }
            });

            if (hasAllData) {
              const monthValue = compileFn(monthValues);
              timeDataResult[fcKey] = monthValue;
            }
          } catch (e) {
            console.warn('[computeInitialTimeDataForComputed] 计算-FC 数据失败:', e);
          }
        });
      }

      return timeDataResult;
    } catch (e) {
      console.error('computeInitialTimeDataForComputed error:', e);
      return null;
    }
  }, []);

  // ========================================================================
  // 所有 HOOK 必须放在顶部
  // ========================================================================

  // 窗口状态
  const [panelPosition, setPanelPosition] = useState({ x: 200, y: 80 });
  const [panelSize, setPanelSize] = useState({ width: 950, height: 680 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelStartPos = useRef({ x: 0, y: 0 });
  const panelStartSize = useRef({ width: 0, height: 0 });

  // 检查是否点击了滚动条
  const isScrollbarClick = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;

    const hasScrollbar = target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
    if (!hasScrollbar) return false;

    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const isVerticalScrollbar = x > target.clientWidth - 20 && x <= rect.width;
    const isHorizontalScrollbar = y > target.clientHeight - 20 && y <= rect.height;

    return isVerticalScrollbar || isHorizontalScrollbar;
  };

  // 拖动窗口
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('select') ||
        e.target.closest('textarea') ||
        isScrollbarClick(e)) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartPos.current = { ...panelPosition };
  }, [panelPosition]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    setPanelPosition({
      x: Math.max(0, panelStartPos.current.x + deltaX),
      y: Math.max(0, panelStartPos.current.y + deltaY)
    });
  }, [isDragging, panelStartPos]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 调整窗口大小
  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panelStartSize.current = { ...panelSize };
    panelStartPos.current = { ...panelPosition };
  }, [panelSize, panelPosition]);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizeHandle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;

    let newWidth = panelStartSize.current.width;
    let newHeight = panelStartSize.current.height;
    let newX = panelStartPos.current.x;
    let newY = panelStartPos.current.y;

    if (resizeHandle.includes('right')) {
      newWidth = Math.max(600, panelStartSize.current.width + deltaX);
    }
    if (resizeHandle.includes('bottom')) {
      newHeight = Math.max(500, panelStartSize.current.height + deltaY);
    }
    if (resizeHandle.includes('left')) {
      newWidth = Math.max(600, panelStartSize.current.width - deltaX);
      newX = panelStartPos.current.x + deltaX;
    }
    if (resizeHandle.includes('top')) {
      newHeight = Math.max(500, panelStartSize.current.height - deltaY);
      newY = panelStartPos.current.y + deltaY;
    }

    setPanelSize({ width: newWidth, height: newHeight });
    setPanelPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
  }, [isResizing, resizeHandle, panelStartSize, panelStartPos]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  // 全局监听鼠标移动和抬起
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleGlobalMouseMove = (e) => {
        if (isDragging) handleDragMove(e);
        if (isResizing) handleResizeMove(e);
      };
      const handleGlobalMouseUp = () => {
        if (isDragging) handleDragEnd();
        if (isResizing) handleResizeEnd();
      };
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, isResizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd]);

  // ========================================================================
  // 解析和准备数据
  // ========================================================================
  const chartData = useMemo(() => {
    try {
      // 递归计算计算指标在指定月份的初始值（基于依赖节点的 originalTimeData）
      const computeInitialValueForComputed = (targetNode, monthKey, allNodesLocal, visited = new Set()) => {
        if (!targetNode || visited.has(targetNode.id)) {
          return null;
        }
        visited.add(targetNode.id);

        if (targetNode.type === 'driver') {
          // 驱动因子：直接从 originalTimeData 读取
          return targetNode.originalTimeData?.[monthKey] ?? targetNode.timeData?.[monthKey];
        }

        if (targetNode.type === 'computed' && targetNode.formula) {
          // 检查是否包含 MONTHLY_ 函数
          const hasMonthlyFunction = FormulaParser.hasMonthlyFunction(targetNode.formula);

          if (hasMonthlyFunction) {
            // 处理 MONTHLY_ 函数
            const detected = FormulaParser.detectMonthlyFunction(targetNode.formula);
            if (!detected) {
              // 无法解析，降级为直接编译
            } else {
              // 判断当前计算的是实际期还是预测期
              const isForecastPeriod = monthKey.includes('-FC');

              if (isForecastPeriod) {
                // 预测期：计算单期值（不累计）
                const innerDeps = FormulaParser.extractDependencies(detected.inner, Object.keys(allNodesLocal));
                const monthValues = {};
                let hasAllData = true;

                innerDeps.forEach(depId => {
                  const depNode = allNodesLocal[depId];
                  if (depNode) {
                    // 对于驱动因子：使用 originalTimeData（初始值）
                    // 对于计算指标：递归计算其初始值（基于其依赖节点的 originalTimeData）
                    if (depNode.type === 'driver') {
                      // 预测期：尝试从 originalTimeData 或 timeData 获取 -FC 数据
                      const dataToUse = depNode.originalTimeData || depNode.timeData;
                      let value = dataToUse?.[monthKey];

                      // 如果没有找到 -FC 数据，尝试使用 -AC 数据作为替代
                      if (value === undefined && monthKey.includes('-FC')) {
                        const acKey = monthKey.replace('-FC', '-AC');
                        value = dataToUse?.[acKey];
                      }

                      if (value !== undefined) {
                        monthValues[depId] = parseFloat(value);
                      } else {
                        hasAllData = false;
                      }
                    } else {
                      // 计算指标：递归调用 computeInitialValueForComputed
                      const depValue = computeInitialValueForComputed(depNode, monthKey, allNodesLocal, new Set(visited));
                      if (depValue !== null && depValue !== undefined) {
                        monthValues[depId] = parseFloat(depValue);
                      } else {
                        hasAllData = false;
                      }
                    }
                  }
                });

                if (hasAllData) {
                  try {
                    let monthValue = FormulaParser.compile(detected.inner, innerDeps)(monthValues);
                    // 检查是否有外层公式（如 MONTHLY_SUM(A) * 0.5）
                    const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
                    if (formulaWithPlaceholder !== placeholder) {
                      try {
                        const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
                        monthValue = outerCompileFn({ [placeholder]: monthValue });
                      } catch (e) {
                        console.warn('[computeInitialValueForComputed] 外层公式计算失败:', e);
                      }
                    }
                    return monthValue;
                  } catch (e) {
                    console.warn('[computeInitialValueForComputed] MONTHLY 单期值计算失败:', e);
                  }
                }
              } else {
                // 实际期：计算累计值
                const innerDeps = FormulaParser.extractDependencies(detected.inner, Object.keys(allNodesLocal));
                let cumulativeValue = 0;

                // 获取所有月份键，计算截至 monthKey 的累计
                const allMonthKeys = new Set();
                innerDeps.forEach(depId => {
                  const depNode = allNodesLocal[depId];
                  if (depNode) {
                    // 收集月份时使用 originalTimeData（实际期固定）和 timeData（预测期可变）
                    const dataSources = [depNode.originalTimeData, depNode.timeData].filter(Boolean);
                    dataSources.forEach(dataToUse => {
                      if (dataToUse) {
                        Object.keys(dataToUse).forEach(k => {
                          const baseKey = k.replace(/-(AC|FC|BU)$/, '');
                          allMonthKeys.add(baseKey);
                        });
                      }
                    });
                  }
                });

                // 排序并过滤出截至 monthKey 的月份
                const sortedMonths = sortPeriodKeys(allMonthKeys);
                const monthKeyBase = monthKey.replace(/-(AC|FC|BU)$/, '');
                const currentIdx = sortedMonths.indexOf(monthKeyBase);
                const monthsUpToCurrent = currentIdx >= 0 ? sortedMonths.slice(0, currentIdx + 1) : sortedMonths;

                // 累计计算
                monthsUpToCurrent.forEach(currentMonth => {
                  const monthValues = {};
                  let hasAllData = true;

                  innerDeps.forEach(depId => {
                    const depNode = allNodesLocal[depId];
                    if (depNode) {
                      // 往期用 -AC（originalTimeData），当期根据 monthKey 类型决定
                      // - 如果是 -AC：使用 originalTimeData（固定）
                      // - 如果是 -FC：使用 timeData（随调整变化）
                      // - 如果是 -BU：使用 timeData
                      const suffix = currentMonth === monthKeyBase ? (monthKey.includes('-FC') ? '-FC' : monthKey.includes('-BU') ? '-BU' : '-AC') : '-AC';
                      const keyToUse = currentMonth + suffix;

                      // 对于驱动因子：直接从数据源读取
                      // 对于计算指标：递归调用 computeInitialValueForComputed
                      if (depNode.type === 'driver') {
                        const dataToUse = suffix === '-AC' ? depNode.originalTimeData : depNode.timeData;
                        const depValue = dataToUse?.[keyToUse];
                        if (depValue !== undefined && depValue !== null) {
                          monthValues[depId] = parseFloat(depValue);
                        } else {
                          hasAllData = false;
                        }
                      } else {
                        // 计算指标：递归调用 computeInitialValueForComputed 获取初始值
                        const depValue = computeInitialValueForComputed(depNode, keyToUse, allNodesLocal, new Set(visited));
                        if (depValue !== null && depValue !== undefined) {
                          monthValues[depId] = parseFloat(depValue);
                        } else {
                          hasAllData = false;
                        }
                      }
                    }
                  });

                  if (hasAllData) {
                    try {
                      const compileFn = FormulaParser.compile(detected.inner, innerDeps);
                      cumulativeValue += compileFn(monthValues);
                    } catch (e) {
                      console.warn('[computeInitialValueForComputed] MONTHLY 累计计算失败:', e);
                    }
                  }
                });

                // 检查是否有外层公式
                const { formula: formulaWithPlaceholder, placeholder } = FormulaParser.replaceMonthlyWithPlaceholder(targetNode.formula);
                if (formulaWithPlaceholder !== placeholder) {
                  try {
                    const outerCompileFn = FormulaParser.compile(formulaWithPlaceholder, [placeholder]);
                    return outerCompileFn({ [placeholder]: cumulativeValue });
                  } catch (e) {
                    console.warn('[computeInitialValueForComputed] 外层公式计算失败:', e);
                  }
                }

                return cumulativeValue;
              }
            }
          }

          // 计算指标：从依赖节点递归计算
          const allNodeIds = Object.keys(allNodesLocal);
          const deps = FormulaParser.extractDependencies(targetNode.formula, allNodeIds);
          const monthValues = {};

          for (const depId of deps) {
            const depNode = allNodesLocal[depId];
            if (depNode) {
              const depValue = computeInitialValueForComputed(depNode, monthKey, allNodesLocal, visited);
              if (depValue !== null && depValue !== undefined) {
                monthValues[depId] = parseFloat(depValue);
              } else {
                // 依赖节点没有数据，返回 null
                return null;
              }
            }
          }

          try {
            const compileFn = FormulaParser.compile(targetNode.formula, deps);
            return compileFn(monthValues);
          } catch (e) {
            console.warn('递归计算初始值失败:', e);
            return null;
          }
        }

        return null;
      };

      if (!node) {
        console.warn('[TrendChart] node 为空');
        return null;
      }

      // === 关键逻辑：确定初始数据 ===
      // - 驱动因子：使用 originalTimeData（静态保存）
      // - 计算指标：使用 node.originalTimeData（初始值，保持不变）
      let initialData;

      if (type === 'driver') {
        // 驱动因子：直接使用 originalTimeData
        initialData = originalTimeData && Object.keys(originalTimeData).length > 0
          ? originalTimeData
          : timeData;
      } else {
        // 计算指标：优先使用 node.originalTimeData（初始值），降级使用 node.timeData
        initialData = node.originalTimeData && Object.keys(node.originalTimeData).length > 0
          ? node.originalTimeData
          : (node.timeData && Object.keys(node.timeData).length > 0
            ? node.timeData
            : timeData);
      }

      // 使用当前 timeData 作为调整后的数据
      const currentData = timeData;

      // 优先使用初始数据获取完整月份列表
      const baseData = initialData && Object.keys(initialData).length > 0
        ? initialData
        : currentData;
      const months = getSortedMonths(baseData);

      if (months.length === 0) {
        console.warn('[TrendChart] 没有获取到月份数据');
        return null;
      }

      // 提取各类型数据
      const originalActualData = [];   // 初始实际（从 initialData）
      const originalForecastData = []; // 初始预测（从 initialData）
      const adjustedForecastData = []; // 调整后的预测（从当前 timeData）
      const targetData = [];           // 目标（从 initialData）

      months.forEach(month => {
        // 构造可能的 key 格式（支持新旧格式）
        let actualKey, forecastKey, targetKey;

        // 判断月份格式
        if (/^\d{6,8}$/.test(month)) {
          // 新格式：202601
          actualKey = `${month}-AC`;
          forecastKey = `${month}-FC`;
          targetKey = `${month}-BU`;
        } else if (/^\d{4}WK\d{2}$/.test(month)) {
          // 周度格式：2026WK01
          actualKey = `${month}-AC`;
          forecastKey = `${month}-FC`;
          targetKey = `${month}-BU`;
        } else if (/^\d{4}Q[1-4]$/.test(month)) {
          // 季度格式：2026Q1
          actualKey = `${month}-AC`;
          forecastKey = `${month}-FC`;
          targetKey = `${month}-BU`;
        } else if (month.includes('月')) {
          // 中文月份格式：1月 — 优先用新格式 key，降级用旧格式
          actualKey = `${month}-AC`;
          forecastKey = `${month}-FC`;
          targetKey = `${month}-BU`;
        } else {
          // 过渡格式：2024-01
          actualKey = `${month}-实际`;
          forecastKey = `${month}-预测`;
          targetKey = `${month}-目标`;
        }

        // --- 初始实际数据：从 node.originalTimeData 读取（初始值）---
        let origActualValue = null;
        if (node.originalTimeData && node.originalTimeData[actualKey] !== undefined) {
          origActualValue = parseFloat(node.originalTimeData[actualKey]);
        }
        if (origActualValue === null && node.timeData && node.timeData[actualKey] !== undefined) {
          // 降级：从 node.timeData 读取
          origActualValue = parseFloat(node.timeData[actualKey]);
        }
        if (origActualValue !== null && !isNaN(origActualValue)) {
          originalActualData.push({ month, value: origActualValue });
        }

        // --- 初始预测数据：从 node.originalTimeData 读取（初始值）---
        let origForecastValue = null;
        if (node.originalTimeData && node.originalTimeData[forecastKey] !== undefined) {
          origForecastValue = parseFloat(node.originalTimeData[forecastKey]);
        }
        if ((origForecastValue === null || origForecastValue === 0) && node.timeData && node.timeData[forecastKey] !== undefined) {
          // 降级：从 node.timeData 读取
          origForecastValue = parseFloat(node.timeData[forecastKey]);
        }
        if (origForecastValue !== null && !isNaN(origForecastValue) && origForecastValue !== 0) {
          originalForecastData.push({ month, value: origForecastValue });
        }

        // --- 调整后的预测数据：从 node.timeData 读取（调整后值）---
        // 只在预测期读取（当有初始预测值时）
        if (origForecastValue !== null && origForecastValue !== 0 && origForecastValue !== undefined) {
          if (node.timeData && node.timeData[forecastKey] !== undefined) {
            const adjValue = parseFloat(node.timeData[forecastKey]);
            if (!isNaN(adjValue)) {
              adjustedForecastData.push({ month, value: adjValue });
            }
          }
        }

        // --- 目标数据：从 node.originalTimeData 读取（-BU），不随调整变化 ---
        let targetValue = null;
        if (node.originalTimeData && node.originalTimeData[targetKey] !== undefined) {
          targetValue = parseFloat(node.originalTimeData[targetKey]);
        }
        // 关键修复：不再降级到 timeData（timeData 包含调整后的值，会导致目标变动）
        // 如果 originalTimeData 中没有目标数据，保持 null
        if (targetValue !== null && !isNaN(targetValue)) {
          targetData.push({ month, value: targetValue });
        }
      });

      // 调试：输出数据对比
      if (originalForecastData.length > 0 || adjustedForecastData.length > 0) {
        console.log('[TrendChart] 数据对比:', {
          nodeName: node.name,
          nodeType: node.type,
          originalForecastData: originalForecastData.slice(0, 3),
          adjustedForecastData: adjustedForecastData.slice(0, 3)
        });
      }

      // --- 合并初始实际+预测，形成一条连续的线 ---
      const combinedOriginalData = [];
      const monthMap = new Map();

      originalActualData.forEach(d => monthMap.set(d.month, { ...d, type: 'actual' }));
      originalForecastData.forEach(d => {
        if (!monthMap.has(d.month)) {
          monthMap.set(d.month, { ...d, type: 'forecast' });
        }
      });

      months.forEach(month => {
        if (monthMap.has(month)) {
          combinedOriginalData.push(monthMap.get(month));
        }
      });

      // --- 构建调整预测数据：从最后一个实际值开始，确保连线 ---
      const adjustedForecastDataWithConnection = [];
      if (adjustedForecastData.length > 0) {
        // 找到最后一个实际值点
        const lastActualPoint = originalActualData.length > 0
          ? originalActualData[originalActualData.length - 1]
          : null;

        // 如果有实际值点，先添加它（作为连接点）
        if (lastActualPoint) {
          adjustedForecastDataWithConnection.push(lastActualPoint);
        }

        // 然后添加调整后的预测值，但要跳过在实际值之前的月份
        const lastActualMonth = lastActualPoint ? lastActualPoint.month : null;
        const lastActualIndex = lastActualMonth ? months.indexOf(lastActualMonth) : -1;

        adjustedForecastData.forEach(d => {
          const monthIndex = months.indexOf(d.month);
          // 只添加在最后一个实际值之后或同月的预测值
          if (lastActualIndex === -1 || monthIndex >= lastActualIndex) {
            // 避免重复添加连接点
            if (!lastActualPoint || d.month !== lastActualPoint.month) {
              adjustedForecastDataWithConnection.push(d);
            }
          }
        });
      }

      // 检查是否真的有调整
      // 递归检测：从当前节点出发，遍历所有依赖链，检查是否有驱动因子被调整
      const checkAnyDriverAdjusted = (targetNode, visited = new Set()) => {
        if (!targetNode || visited.has(targetNode.id)) return false;
        visited.add(targetNode.id);

        if (targetNode.type === 'driver') {
          // 驱动因子：直接比较 originalTimeData 和 timeData
          const orig = targetNode.originalTimeData || {};
          const current = targetNode.timeData || {};
          for (const key of Object.keys(orig)) {
            if (key.endsWith('-FC') && orig[key] !== current[key]) {
              return true;
            }
          }
          return false;
        }

        if (targetNode.type === 'computed' && targetNode.formula) {
          // 计算指标：递归检查其依赖节点
          const allNodeIds = Object.keys(allNodes);
          const deps = FormulaParser.extractDependencies(targetNode.formula, allNodeIds);
          for (const depId of deps) {
            const depNode = allNodes[depId];
            if (depNode && checkAnyDriverAdjusted(depNode, visited)) {
              return true;
            }
          }
        }

        return false;
      };

      let hasAdjustment = false;
      if (node.type === 'computed') {
        hasAdjustment = checkAnyDriverAdjusted(node);
      } else {
        // 驱动因子：直接比较 adjusted 和 original
        hasAdjustment = adjustedForecastData.some((d) => {
          const origD = originalForecastData.find(od => od.month === d.month);
          if (!origD) return false;
          return Math.abs(d.value - origD.value) > 0.001;
        });
      }

      // 计算实际/预测分界点 - 移到内部计算，避免循环依赖
      // 正确逻辑：分界点是最后一个实际期（AC 期），即第一个有预测数据的月份的前一个
      let actualForecastSplitIndex = -1;
      for (let i = 0; i < months.length; i++) {
        const month = months[i];
        // 如果这个月份有预测数据，那么前一个就是分界点
        const hasForecast = originalForecastData.some(d => d.month === month);
        if (hasForecast) {
          actualForecastSplitIndex = i - 1;
          break;
        }
      }
      // 如果所有月份都没有预测数据，分界点就是最后一个月份
      if (actualForecastSplitIndex === -1) {
        actualForecastSplitIndex = months.length - 1;
      }

      // 调试日志：检查访问流量的调整状态
      if (node.id === 'fangwenliuliang') {
        console.log('[TrendChart] fangwenliuliang 调整状态:', {
          originalForecastData: originalForecastData.slice(0, 3),
          adjustedForecastData: adjustedForecastData.slice(0, 3),
          hasAdjustment,
          actualForecastSplitIndex
        });
      }

      return {
        months,
        combinedOriginalData,
        originalActualData,
        originalForecastData,
        adjustedForecastData,
        adjustedForecastDataWithConnection,
        targetData,
        hasAdjustment,
        actualForecastSplitIndex,  // 新增：在内部计算
        initialData  // 传给下面的表格用
      };
    } catch (e) {
      console.error('[TrendChart] chartData 计算出错:', e);
      return null;
    }
  }, [node, node?.timeData, node?.originalTimeData, allNodes, computeInitialTimeDataForComputed]);

  // ========================================================================
  // 渲染
  // ========================================================================

  if (!chartData) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          width: '600px',
          maxWidth: '90vw',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          pointerEvents: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              📈 {name || '节点'} - 分期趋势
            </h2>
            <button onClick={onClose} style={{ fontSize: '24px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
          <p style={{ color: '#6b7280' }}>暂无数据</p>
        </div>
      </div>
    );
  }

  const {
    months,
    combinedOriginalData,
    originalActualData,
    originalForecastData,
    adjustedForecastData,
    adjustedForecastDataWithConnection,
    targetData,
    hasAdjustment,
    actualForecastSplitIndex,
    initialData
  } = chartData;

  // 检测时间维度
  const timeDimension = detectTimeDimension(months);
  const timeDimensionName = getTimeDimensionName(timeDimension);

  // 图表尺寸（自适应）
  const chartWidth = Math.max(700, panelSize.width - 100);
  const width = chartWidth;

  // 导出图片功能（试用版限制）
  const handleExport = async () => {
    if (!canExport) {
      alert(getDisableReason('export'));
      return;
    }
    try {
      const element = document.getElementById('cumulative-chart-container');
      if (!element) {
        alert('未找到图表元素');
        return;
      }
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });
      const safeName = String(name || '节点').replace(/[\\/:*?"<>|]/g, '_');
      const link = document.createElement('a');
      link.download = `${safeName}_月度趋势.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请重试');
    }
  };

  // 数据详情折叠状态
  const [isDataDetailExpanded, setIsDataDetailExpanded] = useState(true);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      {/* 浮动窗口 */}
      <div
        style={{
          position: 'absolute',
          left: panelPosition.x,
          top: panelPosition.y,
          width: panelSize.width,
          height: panelSize.height,
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'default',
          pointerEvents: 'auto'
        }}
      >
        {/* 调整大小的句柄 */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 16, height: 16, cursor: 'nw-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, cursor: 'ne-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 16, height: 16, cursor: 'sw-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, cursor: 'se-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
        <div style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 8, cursor: 'n-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'top')} />
        <div style={{ position: 'absolute', bottom: 0, left: 16, right: 16, height: 8, cursor: 's-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom')} />
        <div style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 8, cursor: 'w-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'left')} />
        <div style={{ position: 'absolute', right: 12, top: 16, bottom: 16, width: 8, cursor: 'e-resize', zIndex: 10 }}
          onMouseDown={(e) => handleResizeStart(e, 'right')} />

        {/* 标题栏 - 可拖动 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            background: 'linear-gradient(to right, #f9fafb, #f3f4f6)'
          }}
          onMouseDown={handleDragStart}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
            📈 {name || '节点'} - 分期趋势
          </h2>
          <button onClick={onClose} style={{
            fontSize: '24px',
            color: '#9ca3af',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0 4px'
          }}>
            ✕
          </button>
        </div>

        {/* 内容区域 */}
        <div
          style={{
            padding: '16px 28px 16px 20px',
            flex: 1,
            overflow: 'auto',
            cursor: 'default'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 双纵坐标柱状图 + 折线图 */}
          <CumulativeBarChart
            months={months}
            originalActualData={originalActualData}
            originalForecastData={originalForecastData}
            adjustedForecastData={adjustedForecastData}
            targetData={targetData}
            width={width}
            scenarioName={scenarioName}
            actualForecastSplitIndex={actualForecastSplitIndex}
            hasAdjustment={hasAdjustment}
            nodeName={name}
            onExport={handleExport}
            node={node}
            allNodes={allNodes}
            initialData={initialData}
            canExport={canExport}
            getDisableReason={getDisableReason}
          />

          {/* 数据详情 - 支持滚动查看 */}
          <div style={{ marginTop: '16px', background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                数据详情（{timeDimensionName}）：
              </h3>
              <button
                onClick={() => setIsDataDetailExpanded(!isDataDetailExpanded)}
                style={{
                  fontSize: '12px',
                  padding: '4px 12px',
                  background: isDataDetailExpanded ? '#e5e7eb' : '#3b82f6',
                  color: isDataDetailExpanded ? '#374151' : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {isDataDetailExpanded ? '▴ 折叠' : '▾ 展开'}
              </button>
            </div>
            {isDataDetailExpanded && (
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#f9fafb' }}>{timeDimensionName}</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: COLORS.originalActual }}>初始实际</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: COLORS.originalForecast }}>初始预测</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: COLORS.adjustedForecast }}>{scenarioName}预测</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: COLORS.target }}>目标</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>初始vs目标</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>调整vs目标</th>
                    <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>调整差额</th>
                  </tr>
                </thead>
                <tbody>
                    {months.map(month => {
                      // 构造 key（支持多种格式）
                      let actualKey, forecastKey, targetKey;

                      if (/^\d{6,8}$/.test(month)) {
                        // 新月度格式：202601
                        actualKey = `${month}-AC`;
                        forecastKey = `${month}-FC`;
                        targetKey = `${month}-BU`;
                      } else if (/^\d{4}WK\d{2}$/.test(month)) {
                        // 周度格式：2026WK01
                        actualKey = `${month}-AC`;
                        forecastKey = `${month}-FC`;
                        targetKey = `${month}-BU`;
                      } else if (/^\d{4}Q[1-4]$/.test(month)) {
                        // 季度格式：2026Q1
                        actualKey = `${month}-AC`;
                        forecastKey = `${month}-FC`;
                        targetKey = `${month}-BU`;
                      } else if (/^\d{4}$/.test(month)) {
                        // 年度格式：2026
                        actualKey = `${month}-AC`;
                        forecastKey = `${month}-FC`;
                        targetKey = `${month}-BU`;
                      } else if (month.includes('月')) {
                        // 中文月份格式：1月
                        actualKey = `${month}-AC`;
                        forecastKey = `${month}-FC`;
                        targetKey = `${month}-BU`;
                      } else {
                        // 过渡格式：2024-01
                        actualKey = `${month}-实际`;
                        forecastKey = `${month}-预测`;
                        targetKey = `${month}-目标`;
                      }

                      const dataSource = initialData && Object.keys(initialData).length > 0
                        ? initialData
                        : timeData;

                      const originalActual = dataSource[actualKey];
                      const originalForecast = dataSource[forecastKey];
                      const adjustedForecast = timeData[forecastKey];
                      // 关键修复：目标值只从 originalTimeData（dataSource）读取，不随调整变化
                      const target = dataSource[targetKey];

                      const hasChanged = adjustedForecast !== undefined && originalForecast !== undefined &&
                        Math.abs(parseFloat(adjustedForecast) - parseFloat(originalForecast)) > 0.001;

                      // 计算三个差额
                      const origActualVal = originalActual !== undefined ? parseFloat(originalActual) : null;
                      const origForecastVal = originalForecast !== undefined ? parseFloat(originalForecast) : null;
                      const adjForecastVal = adjustedForecast !== undefined ? parseFloat(adjustedForecast) : null;
                      const targetVal = target !== undefined ? parseFloat(target) : null;

                      // 1. 初始（实际+预测）与目标的差额
                      let diffInitialVsTarget = null;
                      if (origActualVal !== null && origForecastVal !== null && targetVal !== null) {
                        diffInitialVsTarget = origActualVal + origForecastVal - targetVal;
                      } else if (origForecastVal !== null && targetVal !== null && origActualVal === null) {
                        diffInitialVsTarget = origForecastVal - targetVal;
                      } else if (origActualVal !== null && targetVal !== null && origForecastVal === null) {
                        diffInitialVsTarget = origActualVal - targetVal;
                      }

                      // 2. 调整（实际+调整预测）与目标的差额
                      let diffAdjustedVsTarget = null;
                      if (origActualVal !== null && adjForecastVal !== null && targetVal !== null) {
                        diffAdjustedVsTarget = origActualVal + adjForecastVal - targetVal;
                      } else if (adjForecastVal !== null && targetVal !== null && origActualVal === null) {
                        diffAdjustedVsTarget = adjForecastVal - targetVal;
                      } else if (origActualVal !== null && targetVal !== null && adjForecastVal === null) {
                        diffAdjustedVsTarget = origActualVal - targetVal;
                      }

                      // 3. 初始预测与调整预测的差额
                      let diffAdjustment = null;
                      if (adjForecastVal !== null && origForecastVal !== null) {
                        diffAdjustment = adjForecastVal - origForecastVal;
                      }

                      return (
                        <tr key={month}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{month}</td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                            {originalActual !== undefined ? parseFloat(originalActual).toLocaleString() : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                            {originalForecast !== undefined ? parseFloat(originalForecast).toLocaleString() : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: hasChanged ? '600' : 'normal' }}>
                            {adjustedForecast !== undefined ? parseFloat(adjustedForecast).toLocaleString() : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                            {target !== undefined ? parseFloat(target).toLocaleString() : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: diffInitialVsTarget !== null ? (diffInitialVsTarget > 0 ? '#10b981' : '#ef4444') : '#6b7280' }}>
                            {diffInitialVsTarget !== null ? (diffInitialVsTarget > 0 ? '+' : '') + diffInitialVsTarget.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: diffAdjustedVsTarget !== null ? (diffAdjustedVsTarget > 0 ? '#10b981' : '#ef4444') : '#6b7280' }}>
                            {diffAdjustedVsTarget !== null ? (diffAdjustedVsTarget > 0 ? '+' : '') + diffAdjustedVsTarget.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: diffAdjustment !== null ? (diffAdjustment > 0 ? '#10b981' : '#ef4444') : '#6b7280' }}>
                            {diffAdjustment !== null ? (diffAdjustment > 0 ? '+' : '') + diffAdjustment.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendChart;

