/**
 * 第三层：视图适配器
 * 将底层数据转换为视图组件需要的格式
 */

export class ViewAdapter {
  constructor(sourceDataManager, formulaEngine, adjustmentManager) {
    // 依赖注入
    this._sourceDataManager = sourceDataManager;
    this._formulaEngine = formulaEngine;
    this._adjustmentManager = adjustmentManager;
  }

  /**
   * 获取节点视图数据
   * @param {string} nodeId - 节点 ID
   * @param {string} scenarioId - 方案 ID（可选）
   * @returns {NodeViewData}
   */
  getNodeViewData(nodeId, scenarioId) {
    const sourceNode = this._sourceDataManager.getSourceData(nodeId);
    const calculatedNode = this._formulaEngine.getCalculatedNode(nodeId);

    if (!sourceNode && !calculatedNode) {
      console.error(`[ViewAdapter] 节点 ${nodeId} 不存在`);
      return null;
    }

    // 优先使用计算后的节点数据，如果没有则使用原始数据
    const node = calculatedNode || sourceNode;
    const isComputed = node.type === 'computed';

    // 获取基准快照中的原始 BU 数据（用于计算指标的目标显示）
    const baselineNode = this._adjustmentManager.getBaselineNode(nodeId);
    const baselineOriginalTimeData = baselineNode?.originalTimeData || null;

    console.log(`[ViewAdapter] ${nodeId} 基准快照数据：`, {
      isComputed: node.type === 'computed',
      hasBaselineNode: !!baselineNode,
      hasBaselineOriginalTimeData: !!baselineOriginalTimeData,
      baselineKeys: baselineOriginalTimeData ? Object.keys(baselineOriginalTimeData).filter(k => k.includes('-BU')) : []
    });

    // 构建视图数据
    const viewData = {
      id: node.id,
      name: node.name,
      type: node.type,
      level: node.level || '1',
      unit: node.unit || '',
      format: node.format || '#,##0',
      direction: node.direction || 'auto',
      initial: { periods: {}, summary: {} },
      adjusted: { periods: {}, summary: {} },
      diffs: {}
    };

    // 获取所有期间（排序）
    const periods = Object.keys(node.periods || {}).sort();
    // isComputed 已在上面声明（第 31 行）

    // 构建各期间数据
    // FormulaEngine 已存储：AC/FC=单期值，AC_cumulative/FC_cumulative=累计值
    periods.forEach(period => {
      const periodData = node.periods[period];

      // 获取当期值和累计值
      const actualValue = periodData?.AC ?? null;
      const forecastValue = periodData?.FC ?? null;
      const targetValue = periodData?.BU ?? null;

      // 获取原始值（用于 initial 显示，不随调整变化）
      const originalActual = this._adjustmentManager.getOriginalValue(nodeId, period, 'AC');
      const originalForecast = this._adjustmentManager.getOriginalValue(nodeId, period, 'FC');

      // 关键修复：对于计算指标，从基准快照获取 BU 原始值（不随调整变化）
      // 对于驱动因子，从 AdjustmentManager 获取 BU 原始值
      let originalTarget;
      if (isComputed && baselineOriginalTimeData) {
        // 计算指标：从基准快照的 originalTimeData 获取 BU
        const buKey = `${period}-BU`;
        originalTarget = baselineOriginalTimeData[buKey] ?? 0;
        console.log(`[ViewAdapter] ${nodeId} ${period} 计算指标目标值：从基准快照获取`, {
          buKey,
          baselineValue: baselineOriginalTimeData[buKey],
          currentValue: targetValue,
          usedValue: originalTarget
        });
      } else {
        // 驱动因子：从 AdjustmentManager 获取 BU
        originalTarget = this._adjustmentManager.getOriginalValue(nodeId, period, 'BU');
      }

      // 只有当原始值不存在时才使用计算值
      const useOriginalActual = originalActual !== 0 ? originalActual : actualValue;
      const useOriginalForecast = originalForecast !== 0 ? originalForecast : forecastValue;
      const useOriginalTarget = originalTarget !== 0 ? originalTarget : targetValue;

      // 初始值（来自原始数据，不随调整变化）
      viewData.initial.periods[period] = {
        actual: useOriginalActual,
        forecast: (useOriginalForecast !== null && useOriginalForecast !== undefined && useOriginalForecast !== 0) ? useOriginalForecast :
                  (forecastValue !== null && forecastValue !== undefined && forecastValue !== 0) ? forecastValue : null,
        target: useOriginalTarget,
        // 使用原始数据计算累计值
        actual_cumulative: periodData?.AC_cumulative ?? useOriginalActual,
        forecast_cumulative: periodData?.FC_cumulative ?? null,
        target_cumulative: periodData?.BU_cumulative ?? useOriginalTarget
      };

      // 调整后的值 - 如果没有调整则等于初始值
      // 关键修复：对于计算指标，直接使用 calculatedNode.periods 中的值（已包含驱动因子调整后的影响）
      let adjustedActual, adjustedForecast;
      if (isComputed) {
        // 计算指标：直接从 periodData 获取（FormulaEngine 已使用调整后的值计算）
        adjustedActual = actualValue;
        adjustedForecast = forecastValue;
      } else {
        // 驱动因子：从 AdjustmentManager 获取调整后的值
        adjustedActual = this._adjustmentManager.getAdjustedValue(nodeId, period, 'AC');
        adjustedForecast = this._adjustmentManager.getAdjustedValue(nodeId, period, 'FC');
        // 关键修复：对于驱动因子，如果没有 FC 值（AC 期），设为 null 而不是 0
        if (adjustedForecast === 0 && originalForecast === 0) {
          adjustedForecast = null;
        }
      }

      // 调整后的累计值
      let adjustedAcCumulative, adjustedFcCumulative;
      if (isComputed) {
        // 计算指标：直接使用 periodData 中的累计值（FormulaEngine 已计算）
        adjustedAcCumulative = periodData?.AC_cumulative;
        adjustedFcCumulative = periodData?.FC_cumulative;
      } else {
        // 驱动因子：重新计算调整后的累计值
        const periodKeys = periods.filter(p => p <= period).sort();
        adjustedFcCumulative = 0;
        adjustedAcCumulative = 0;
        periodKeys.forEach(p => {
          const adjFc = this._adjustmentManager.getAdjustedValue(nodeId, p, 'FC');
          const adjAc = this._adjustmentManager.getAdjustedValue(nodeId, p, 'AC');
          const origFc = this._adjustmentManager.getOriginalValue(nodeId, p, 'FC');
          const origAc = this._adjustmentManager.getOriginalValue(nodeId, p, 'AC');
          // 只有当有调整或者原始数据有 FC 时才累加
          if (adjFc !== origFc && adjFc !== 0) {
            adjustedFcCumulative += adjFc;
          } else if (origFc !== null && origFc !== undefined && origFc !== 0) {
            adjustedFcCumulative += origFc;
          }
          if (adjAc !== origAc && adjAc !== 0) {
            adjustedAcCumulative += adjAc;
          } else if (origAc !== null && origAc !== undefined && origAc !== 0) {
            adjustedAcCumulative += origAc;
          }
        });
      }

      viewData.adjusted.periods[period] = {
        actual: adjustedActual,
        forecast: adjustedForecast !== 0 ? adjustedForecast : (forecastValue !== 0 ? forecastValue : null),
        target: targetValue,
        actual_cumulative: adjustedAcCumulative || viewData.initial.periods[period].actual_cumulative,
        forecast_cumulative: adjustedFcCumulative || viewData.initial.periods[period].forecast_cumulative,
        target_cumulative: viewData.initial.periods[period].target_cumulative
      };

      // 差额
      const initialActual = actualValue;
      const initialForecast = forecastValue;

      viewData.diffs[period] = {
        actualVsTarget: initialActual !== null && targetValue !== null
          ? initialActual - targetValue
          : null,
        forecastVsTarget: initialForecast !== null && targetValue !== null
          ? initialForecast - targetValue
          : null,
        adjustedForecastVsInitial: adjustedForecast !== null && initialForecast !== null
          ? adjustedForecast - initialForecast
          : null,
        adjustedForecastVsTarget: adjustedForecast !== null && targetValue !== null
          ? adjustedForecast - targetValue
          : null
      };
    });

    // 关键修复：对于计算指标，从 FormulaEngine 的 calculatedNode 中获取 FC 汇总字段
    // 并添加到最后一期的 adjusted periods 中，以便 _calculateSummary 能正确读取
    if (isComputed && periods.length > 0) {
      const lastPeriod = periods[periods.length - 1];
      const calculatedNode = this._formulaEngine.getCalculatedNode(nodeId);
      if (calculatedNode?.periods?.[lastPeriod]?.FC_only_cumulative !== undefined) {
        viewData.adjusted.periods[lastPeriod].FC_only_cumulative = calculatedNode.periods[lastPeriod].FC_only_cumulative;
      }
      if (calculatedNode?.periods?.[lastPeriod]?.FC_only !== undefined) {
        viewData.adjusted.periods[lastPeriod].FC_only = calculatedNode.periods[lastPeriod].FC_only;
      }
      // 简单公式型比率指标使用 FC_only_total
      if (calculatedNode?.periods?.[lastPeriod]?.FC_only_total !== undefined) {
        viewData.adjusted.periods[lastPeriod].FC_only_total = calculatedNode.periods[lastPeriod].FC_only_total;
      }
      if (calculatedNode?.periods?.[lastPeriod]?.FC_total !== undefined) {
        viewData.adjusted.periods[lastPeriod].FC_total = calculatedNode.periods[lastPeriod].FC_total;
      }

      // 关键修复：对于计算指标，直接使用 calculatedNode.summary 中的汇总值
      // 因为这些值已经包含了调整后的计算结果
      if (calculatedNode?.summary) {
        // initial.summary 使用 calculatedNode 的汇总值
        viewData.initial.summary = {
          actualTotal: calculatedNode.summary.actualTotal ?? 0,
          actualCount: calculatedNode.summary.actualCount ?? 0,
          forecastTotal: calculatedNode.summary.forecastTotal ?? 0,
          forecastCount: calculatedNode.summary.forecastCount ?? 0,
          targetTotal: calculatedNode.summary.budgetTotal ?? 0,
          targetCount: calculatedNode.summary.budgetCount ?? 0,
          actualPlusForecast: calculatedNode.periods?.[lastPeriod]?.FC_cumulative
            ?? calculatedNode.periods?.[lastPeriod]?.AC_cumulative
            ?? ((calculatedNode.summary.actualTotal ?? 0) + (calculatedNode.summary.forecastTotal ?? 0))
        };

        // adjusted.summary 使用调整后的汇总值
        // AC 期值与 initial 相同（AC 不随调整变化）
        // FC 期值：优先使用 FC-only 汇总字段，回退到 summary.forecastTotal
        const adjustedForecastTotal = calculatedNode.periods?.[lastPeriod]?.FC_only_cumulative
          ?? calculatedNode.periods?.[lastPeriod]?.FC_only_total
          ?? calculatedNode.periods?.[lastPeriod]?.FC_total
          ?? calculatedNode.periods?.[lastPeriod]?.FC_only
          ?? calculatedNode.summary.forecastTotal ?? 0;
        const adjustedActualPlusForecast = calculatedNode.periods?.[lastPeriod]?.FC_cumulative ?? ((calculatedNode.summary.actualTotal ?? 0) + adjustedForecastTotal);

        viewData.adjusted.summary = {
          actualTotal: calculatedNode.summary.actualTotal ?? 0,  // AC 不变
          actualCount: calculatedNode.summary.actualCount ?? 0,
          forecastTotal: adjustedForecastTotal,  // 使用调整后的 FC 值
          forecastCount: calculatedNode.summary.forecastCount ?? 0,
          targetTotal: calculatedNode.summary.budgetTotal ?? 0,
          targetCount: calculatedNode.summary.budgetCount ?? 0,
          actualPlusForecast: adjustedActualPlusForecast  // AC + 调整后FC（整体）
        };

        return viewData;
      }
    }

    // 计算汇总值 - 判断是否是计算指标
    // 注意：不再区分"比率型"和"非比率型"，统一用公式计算 AC_total 和 FC_total

    viewData.initial.summary = this._calculateSummary(viewData.initial.periods, isComputed);
    const adjustedSummary = this._calculateSummary(viewData.adjusted.periods, isComputed);
    viewData.adjusted.summary = adjustedSummary;

    return viewData;
  }

  /**
   * 获取趋势图数据
   * @param {string} nodeId - 节点 ID
   * @param {string} scenarioId - 方案 ID（可选）
   * @returns {TrendChartData}
   */
  getTrendChartData(nodeId, scenarioId) {
    const viewData = this.getNodeViewData(nodeId, scenarioId);

    if (!viewData) {
      return null;
    }

    const periods = Object.keys(viewData.initial.periods).sort();

    // 找到实际/预测分割点（第一个 FC 非 null 且 AC 为 null 的位置）
    let splitIndex = -1;
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const hasAc = viewData.initial.periods[period].actual !== null;
      const hasFc = viewData.initial.periods[period].forecast !== null;

      if (!hasAc && hasFc) {
        splitIndex = i;
        break;
      }
    }

    // 如果没有纯预测期，找到第一个有 FC 的位置
    if (splitIndex === -1) {
      for (let i = 0; i < periods.length; i++) {
        if (viewData.initial.periods[periods[i]].forecast !== null) {
          splitIndex = i;
          break;
        }
      }
    }

    // 构建系列数据
    const series = [];

    // 1. 初始实际（蓝色柱子）
    series.push({
      name: '初始实际',
      type: 'bar',
      data: periods.map(p => ({
        period: p,
        value: viewData.initial.periods[p].actual ?? 0
      })),
      style: { fill: '#3B82F6' }  // 蓝色
    });

    // 2. 初始预测（橙色柱子）
    series.push({
      name: '初始预测',
      type: 'bar',
      data: periods.map(p => ({
        period: p,
        value: viewData.initial.periods[p].forecast ?? 0
      })),
      style: { fill: '#F59E0B' }  // 橙色
    });

    // 3. 调整后预测（绿色柱子）- 只在有调整的预测期显示
    const hasAdjustment = periods.some(p =>
      viewData.diffs[p]?.adjustedForecastVsInitial !== null &&
      viewData.diffs[p]?.adjustedForecastVsInitial !== 0
    );

    if (hasAdjustment) {
      series.push({
        name: '调整后预测',
        type: 'bar',
        data: periods.map(p => ({
          period: p,
          value: viewData.adjusted.periods[p].forecast ?? 0
        })),
        style: { fill: '#10B981' }  // 绿色
      });
    }

    // 4. 目标（灰色柱子）
    const hasTarget = periods.some(p =>
      viewData.initial.periods[p].target !== null &&
      viewData.initial.periods[p].target !== 0
    );

    if (hasTarget) {
      series.push({
        name: '目标',
        type: 'bar',
        data: periods.map(p => ({
          period: p,
          value: viewData.initial.periods[p].target ?? 0
        })),
        style: { fill: '#6B7280' }  // 灰色
      });
    }

    return {
      periods,
      series,
      splitIndex: splitIndex >= 0 ? splitIndex : periods.length
    };
  }

  /**
   * 获取表格数据（用于 DataPanel）
   * @param {string} nodeId - 节点 ID
   * @param {string} scenarioId - 方案 ID（可选）
   * @returns {TableData}
   */
  getTableData(nodeId, scenarioId) {
    const viewData = this.getNodeViewData(nodeId, scenarioId);

    if (!viewData) {
      return null;
    }

    const periods = Object.keys(viewData.initial.periods).sort();

    // 表头
    const headers = [
      '期间',
      '初始实际',
      '初始预测',
      '调整后预测',
      '目标',
      '初始 vs 目标',
      '调整 vs 目标',
      '调整差额'
    ];

    // 行数据
    const rows = periods.map(period => {
      const initial = viewData.initial.periods[period];
      const adjusted = viewData.adjusted.periods[period];
      const diffs = viewData.diffs[period];

      return {
        period,
        cells: [
          { key: 'period', value: period },
          { key: 'initialActual', value: this._formatValue(initial.actual, viewData.format) },
          { key: 'initialForecast', value: this._formatValue(initial.forecast, viewData.format) },
          { key: 'adjustedForecast', value: this._formatValue(adjusted.forecast, viewData.format) },
          { key: 'target', value: this._formatValue(initial.target, viewData.format) },
          {
            key: 'initialVsTarget',
            value: this._formatDiff(diffs.actualVsTarget, viewData.format),
            className: this._getDiffColorClass(diffs.actualVsTarget)
          },
          {
            key: 'adjustedVsTarget',
            value: this._formatDiff(diffs.adjustedForecastVsTarget, viewData.format),
            className: this._getDiffColorClass(diffs.adjustedForecastVsTarget)
          },
          {
            key: 'adjustmentDiff',
            value: this._formatDiff(diffs.adjustedForecastVsInitial, viewData.format),
            className: this._getDiffColorClass(diffs.adjustedForecastVsInitial)
          }
        ]
      };
    });

    return { headers, rows };
  }

  /**
   * 获取月份明细表数据
   * @param {string} scenarioId - 方案 ID（可选）
   * @returns {TableData}
   */
  getMonthDetailTableData(scenarioId) {
    const allNodes = this._sourceDataManager.getAllNodes();
    const rows = [];

    // 收集所有期间
    const allPeriods = new Set();
    allNodes.forEach(node => {
      Object.keys(node.periods || {}).forEach(p => allPeriods.add(p));
    });

    const sortedPeriods = Array.from(allPeriods).sort();

    // 表头
    const headers = [
      '指标名称',
      '指标 ID',
      '单位',
      ...sortedPeriods.flatMap(p => [
        `${p} 实际`,
        `${p} 预测`,
        `${p} 目标`,
        `${p} 差额 (vs 初)`,
        `${p} 差额% (vs 初)`,
        `${p} 差额 (vs 目)`,
        `${p} 差额% (vs 目)`
      ])
    ];

    // 行数据
    allNodes.forEach(node => {
      const viewData = this.getNodeViewData(node.id, scenarioId);
      if (!viewData) return;

      const rowCells = [
        { key: 'name', value: node.name },
        { key: 'id', value: node.id },
        { key: 'unit', value: node.unit || '-' }
      ];

      sortedPeriods.forEach(period => {
        const periodData = viewData.initial.periods[period];
        const adjustedData = viewData.adjusted.periods[period];
        const diffs = viewData.diffs[period];

        // 实际
        rowCells.push({ key: `${period}-AC`, value: this._formatValue(periodData?.actual, node.format) });
        // 预测
        rowCells.push({ key: `${period}-FC`, value: this._formatValue(periodData?.forecast, node.format) });
        // 目标
        rowCells.push({ key: `${period}-BU`, value: this._formatValue(periodData?.target, node.format) });
        // 差额 (vs 初)
        rowCells.push({
          key: `${period}-diff-initial`,
          value: adjustedData?.forecast !== null && periodData?.forecast !== null
            ? this._formatDiff(adjustedData.forecast - periodData.forecast, node.format)
            : '-'
        });
        // 差额% (vs 初)
        rowCells.push({
          key: `${period}-diff-initial-pct`,
          value: periodData?.forecast !== null && periodData?.forecast !== 0 && adjustedData?.forecast !== null
            ? `${((adjustedData.forecast - periodData.forecast) / periodData.forecast * 100).toFixed(2)}%`
            : '-'
        });
        // 差额 (vs 目)
        rowCells.push({
          key: `${period}-diff-target`,
          value: periodData?.forecast !== null && periodData?.target !== null
            ? this._formatDiff(periodData.forecast - periodData.target, node.format)
            : '-'
        });
        // 差额% (vs 目)
        rowCells.push({
          key: `${period}-diff-target-pct`,
          value: periodData?.target !== null && periodData?.target !== 0 && periodData?.forecast !== null
            ? `${((periodData.forecast - periodData.target) / periodData.target * 100).toFixed(2)}%`
            : '-'
        });
      });

      rows.push({ period: node.id, cells: rowCells });
    });

    return { headers, rows };
  }

  /**
   * 计算汇总值
   * @param {Object} periods - 期间数据
   * @param {boolean} isComputed - 是否是计算指标
   * @returns {Object} 汇总值
   */
  _calculateSummary(periods, isComputed = false) {
    let actualTotal = 0;
    let actualCount = 0;
    let forecastTotal = 0;
    let forecastCount = 0;
    let targetTotal = 0;
    let targetCount = 0;

    // 对于计算指标，取最后一期的累计值
    if (isComputed) {
      const lastPeriod = Object.keys(periods).sort().pop();
      const lastP = periods[lastPeriod];

      if (lastP) {
        // 实际 = AC_total（AC 期的计算结果汇总）
        // 关键修复：如果最后一期是 FC 期，需要往前找最后一个 AC 期的累计值
        if (lastP?.AC_total !== null && lastP?.AC_total !== undefined) {
          actualTotal = lastP.AC_total;
        } else if (lastP?.AC_cumulative !== null && lastP?.AC_cumulative !== undefined) {
          actualTotal = lastP.AC_cumulative;
        } else if (lastP?.AC !== null && lastP?.AC !== undefined) {
          actualTotal = lastP.AC;
        } else {
          // 最后一期是 FC 期，往前找最后一个有 AC 值的期间
          const sortedKeys = Object.keys(periods).sort();
          for (let i = sortedKeys.length - 1; i >= 0; i--) {
            const p = periods[sortedKeys[i]];
            if (p?.AC_cumulative !== null && p?.AC_cumulative !== undefined) {
              actualTotal = p.AC_cumulative;
              break;
            } else if (p?.AC !== null && p?.AC !== undefined) {
              actualTotal = p.AC;
              break;
            }
          }
        }
        actualCount = 1;

        // 预测 = 纯 FC 期的计算结果汇总
        // 优先级：MONTHLY 函数型 → 简单公式型 → 驱动因子回退
        if (lastP?.FC_only_cumulative !== null && lastP?.FC_only_cumulative !== undefined) {
          forecastTotal = lastP.FC_only_cumulative;
        } else if (lastP?.FC_only_total !== null && lastP?.FC_only_total !== undefined) {
          // 简单公式型比率指标（_calculateSimpleNode 设置）
          forecastTotal = lastP.FC_only_total;
        } else if (lastP?.FC_total !== null && lastP?.FC_total !== undefined) {
          forecastTotal = lastP.FC_total;
        } else if (lastP?.FC_only !== null && lastP?.FC_only !== undefined) {
          forecastTotal = lastP.FC_only;
        } else if (lastP?.FC_cumulative !== null && lastP?.FC_cumulative !== undefined) {
          // 回退：仅适用于驱动因子（FC_cumulative 是纯 FC 总和）
          const acCumulative = lastP?.AC_cumulative ?? actualTotal;
          if (Math.abs(lastP.FC_cumulative - acCumulative) < 0.0001) {
            forecastTotal = 0;  // 没有 FC 期
          } else {
            forecastTotal = lastP.FC_cumulative;
          }
        } else {
          forecastTotal = 0;
        }
        forecastCount = 1;

        targetTotal = lastP?.BU_cumulative ?? lastP?.BU ?? 0;
        targetCount = 1;

        // 关键修复：主数值（actualPlusForecast）= AC + 调整后FC（整体）
        // 对于计算指标，使用最后一期的 FC_cumulative（即 AC + FC 整体累计值）
        const actualPlusForecast = lastP?.FC_cumulative ?? (actualTotal + forecastTotal);

        return {
          actualTotal,
          actualCount,
          forecastTotal,
          forecastCount,
          targetTotal,
          targetCount,
          actualPlusForecast
        };
      }
    }

    // 驱动因子：累加所有期的值
    Object.values(periods).forEach(p => {
      if (p.actual !== null && p.actual !== undefined) {
        actualTotal += p.actual;
        actualCount++;
      }
      if (p.forecast !== null && p.forecast !== undefined) {
        forecastTotal += p.forecast;
        forecastCount++;
      }
      if (p.target !== null && p.target !== undefined) {
        targetTotal += p.target;
        targetCount++;
      }
    });

    return {
      actualTotal,
      actualCount,
      forecastTotal,
      forecastCount,
      targetTotal,
      targetCount,
      actualPlusForecast: actualTotal + forecastTotal
    };
  }

  /**
   * 格式化数值
   * @param {number} value - 值
   * @param {string} format - 格式
   * @returns {string | number}
   */
  _formatValue(value, format) {
    if (value === null || value === undefined) return '-';
    if (typeof value !== 'number' || isNaN(value)) return '-';

    if (format?.includes('#,##0')) {
      return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    } else if (format?.includes('0.00')) {
      return value.toFixed(2);
    } else if (format?.includes('%')) {
      return (value * 100).toFixed(2) + '%';
    } else {
      return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    }
  }

  /**
   * 格式化差额
   * @param {number} diff - 差额
   * @param {string} format - 格式
   * @returns {string}
   */
  _formatDiff(diff, format) {
    if (diff === null || diff === undefined) return '-';
    if (typeof diff !== 'number' || isNaN(diff)) return '-';

    const prefix = diff > 0 ? '+' : '';
    return prefix + this._formatValue(Math.abs(diff), format);
  }

  /**
   * 获取差额颜色类
   * @param {number} diff - 差额
   * @returns {string}
   */
  _getDiffColorClass(diff) {
    if (diff === null || diff === undefined || diff === 0) return '';
    return diff > 0 ? 'text-green-600' : 'text-red-600';
  }
}
