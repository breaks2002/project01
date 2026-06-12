/**
 * 第一层：公式引擎
 * 基于原始数据 + 公式计算所有指标的各期值
 * 支持缓存和增量计算
 */

import { FormulaParser } from '../../engine/FormulaParser';
import { aggregateMonthlyValues } from '../../utils/formatters';

export class FormulaEngine {
  constructor(sourceDataManager, adjustmentManager = null) {
    // 计算结果缓存
    this._cache = {
      nodes: new Map(),
      version: 0,
      sourceDataVersion: 0
    };

    // 依赖图
    this._dependencyGraph = new Map();

    // 拓扑排序结果
    this._computeOrder = [];

    // 数据管理和调整管理（可选）
    this._sourceDataManager = sourceDataManager;
    this._adjustmentManager = adjustmentManager;
  }

  /**
   * 设置 AdjustmentManager（解决循环依赖问题）
   * @param {AdjustmentManager} adjustmentManager - 调整管理器
   */
  setAdjustmentManager(adjustmentManager) {
    this._adjustmentManager = adjustmentManager;
    console.log('[FormulaEngine] AdjustmentManager 已设置');
  }

  /**
   * 计算所有节点
   * @param {Map<string, SourceDataNode> | Object} sourceData - 原始数据
   * @param {Object} options - 选项
   * @returns {CalculatedDataCache} 计算结果缓存
   */
  calculateAll(sourceData, options = {}) {
    const { incremental = false } = options;

    console.log('[FormulaEngine] 开始计算所有节点...');
    console.log(`[FormulaEngine] 增量计算：${incremental}`);

    // 检查是否需要重新计算
    if (incremental && !this._needsRecalculation(sourceData)) {
      console.log('[FormulaEngine] 缓存命中，跳过计算');
      return this._cache;
    }

    // 清空缓存
    this._cache.nodes.clear();
    this._dependencyGraph.clear();

    // 构建依赖图
    this._buildDependencyGraph(sourceData);

    // 拓扑排序
    this._computeOrder = this._topologicalSort();

    if (!this._computeOrder) {
      console.error('[FormulaEngine] 存在环形依赖，无法计算');
      return this._cache;
    }

    // 按拓扑顺序计算每个节点
    // 兼容 Map 和 Object
    const allNodeIds = sourceData instanceof Map
      ? Array.from(sourceData.keys())
      : Object.keys(sourceData);

    console.log('[FormulaEngine] 所有节点 ID:', allNodeIds);
    console.log('[FormulaEngine] 计算顺序:', this._computeOrder);

    this._computeOrder.forEach(nodeId => {
      const sourceNode = sourceData instanceof Map
        ? sourceData.get(nodeId)
        : sourceData[nodeId];
      if (!sourceNode) {
        console.warn('[FormulaEngine] 节点不存在:', nodeId);
        return;
      }

      if (nodeId === 'zonghe_zhibiao') {
        console.log('[FormulaEngine] 处理综合指标 zonghe_zhibiao:', {
          sourceNode,
          type: sourceNode.type,
          formula: sourceNode.formula
        });
      }

      if (sourceNode.type === 'driver') {
        // 驱动因子：直接复制原始数据
        this._cache.nodes.set(nodeId, this._createCalculatedNodeFromSource(sourceNode));
        console.log('[FormulaEngine] 驱动因子:', nodeId);
      } else {
        // 计算指标：根据公式计算
        const calculatedNode = this._calculateNode(nodeId, sourceNode, sourceData, allNodeIds);
        this._cache.nodes.set(nodeId, calculatedNode);
        console.log('[FormulaEngine] 计算指标:', nodeId, '公式:', sourceNode.formula);
      }
    });

    this._cache.version++;
    // 获取版本号（兼容 SourceDataManager 和普通对象）
    this._cache.sourceDataVersion = sourceData.getVersion?.() || 0;

    console.log(`[FormulaEngine] 计算完成，共 ${this._cache.nodes.size} 个节点`);

    // 调试：打印几个计算后的节点
    const sampleNodes = ['zhuanhualv_xiansuo', 'zongchengjiaoe', 'wanchenglv'];
    sampleNodes.forEach(nodeId => {
      const node = this._cache.nodes.get(nodeId);
      if (node) {
        console.log(`[FormulaEngine] ${nodeId} 计算结果:`, {
          summary: node.summary,
          periodsCount: node.periods ? Object.keys(node.periods).length : 0,
          samplePeriod: node.periods ? Object.entries(node.periods)[0] : null
        });
      }
    });

    return this._cache;
  }

  /**
   * 计算单个节点
   * @param {string} nodeId - 节点 ID
   * @param {SourceDataNode} sourceNode - 原始节点
   * @param {Map<string, SourceDataNode>} sourceData - 原始数据
   * @param {string[]} allNodeIds - 所有节点 ID
   * @returns {CalculatedNode} 计算结果
   */
  _calculateNode(nodeId, sourceNode, sourceData, allNodeIds) {
    const formula = sourceNode.formula;

    if (!formula) {
      return this._createCalculatedNodeFromSource(sourceNode);
    }

    // 检查是否包含 MONTHLY 函数
    if (FormulaParser.hasMonthlyFunction(formula)) {
      return this._calculateMonthlyNode(nodeId, sourceNode, sourceData, allNodeIds);
    } else {
      return this._calculateSimpleNode(nodeId, sourceNode, sourceData, allNodeIds);
    }
  }

  /**
   * 计算简单节点（非 MONTHLY 函数）- 普通公式
   * 计算逻辑：
   * 1. 每期单值 = 用该期数据代入公式计算
   * 2. 逐期累计 = 用截止该期的累计数据代入公式（各依赖分别累加后代入）
   * 3. 汇总值 = 最后一期的累计值
   */
  _calculateSimpleNode(nodeId, sourceNode, sourceData, allNodeIds) {
    const periods = {};
    const formula = sourceNode.formula;

    // 辅助函数：从 sourceData 获取节点
    const getNode = (id) => {
      if (sourceData instanceof Map) {
        return sourceData.get(id);
      } else {
        return sourceData[id];
      }
    };

    // 辅助函数：获取依赖节点（优先从缓存获取计算后的节点）
    const getDepNode = (depId) => {
      const cachedNode = this._cache.nodes.get(depId);
      if (cachedNode) {
        return cachedNode;
      }
      return getNode(depId);
    };

    // 辅助函数：获取调整后的值（如果有调整）
    const getAdjustedValue = (nodeId, period, dataType) => {
      // 1. 优先检查 AdjustmentManager 是否有调整记录
      if (this._adjustmentManager) {
        const hasAdjustment = this._adjustmentManager.hasAdjustment(nodeId, period, dataType);
        if (hasAdjustment) {
          // 有调整记录，直接返回调整后的值
          const adjustedValue = this._adjustmentManager.getAdjustedValue(nodeId, period, dataType);
          console.log(`[FormulaEngine] getAdjustedValue: ${nodeId} ${period}-${dataType} = ${adjustedValue} (有调整)`);
          return adjustedValue;
        }
      }

      // 2. 从缓存节点获取（包含计算后的 periods 数据）
      const cachedNode = this._cache.nodes.get(nodeId);
      if (cachedNode && cachedNode.periods && cachedNode.periods[period]) {
        const periodData = cachedNode.periods[period];
        const value = periodData?.[dataType];
        if (value !== null && value !== undefined) {
          return value;
        }
      }

      // 3. 从 sourceData 获取
      const node = getNode(nodeId);
      if (node && node.periods && node.periods[period]) {
        return node.periods[period]?.[dataType] ?? 0;
      }

      return 0;
    };

    // 收集所有期间和依赖
    const allPeriods = new Set();
    const deps = FormulaParser.extractDependencies(formula, allNodeIds);

    deps.forEach(depId => {
      const depNode = getDepNode(depId);
      if (depNode) {
        Object.keys(depNode.periods || {}).forEach(p => allPeriods.add(p));
      }
    });

    const sortedPeriods = Array.from(allPeriods).sort();

    console.log(`[FormulaEngine] _calculateSimpleNode: ${nodeId}`, {
      formula,
      depsCount: deps.length,
      periodsCount: sortedPeriods.length,
      samplePeriod: sortedPeriods[0]
    });

    // 编译公式函数
    const compileFn = FormulaParser.compile(formula, allNodeIds);

    // ========== 性能优化：使用前缀和（Prefix Sum）预处理累计值 ==========
    // 传统方法：每个期间都要从第 1 期累加到当前期 → O(P²)
    // 前缀和优化：一次性预处理所有前缀和 → O(P)，查询 O(1)
    const prefixSums = {};  // { depId: { acPrefix: [], fcPrefix: [], buPrefix: [] } }

    deps.forEach(depId => {
      const depNode = getDepNode(depId);
      const acPrefix = [0];
      const fcPrefix = [0];
      const buPrefix = [0];

      for (let i = 0; i < sortedPeriods.length; i++) {
        const p = sortedPeriods[i];
        // 关键修复：使用调整后的值计算前缀和
        const adjustedAC = getAdjustedValue(depId, p, 'AC');
        const adjustedFC = getAdjustedValue(depId, p, 'FC');
        const depData = depNode?.periods?.[p];
        const adjustedBU = depData?.BU ?? 0;  // BU 不会被调整

        const prevAC = acPrefix[i];
        const prevFC = fcPrefix[i];
        const prevBU = buPrefix[i];

        acPrefix.push(prevAC + adjustedAC);
        fcPrefix.push(prevFC + adjustedFC);
        buPrefix.push(prevBU + adjustedBU);
      }

      prefixSums[depId] = { acPrefix, fcPrefix, buPrefix };
    });
    // ========== 性能优化结束 ==========

    // 逐期计算
    sortedPeriods.forEach((period, index) => {
      // 判断当前期是 AC 期还是 FC 期
      let isACPeriod = false;
      const firstDepId = deps[0];
      if (firstDepId) {
        // 使用 getDepNode 获取缓存节点（包含计算后的 periods 数据）
        const depNode = getDepNode(firstDepId);
        if (depNode && depNode.periods && depNode.periods[period]) {
          isACPeriod = depNode.periods[period]?.AC !== null && depNode.periods[period]?.AC !== undefined;
        }
      }

      // 1. 计算每期单值：用该期调整后的数据代入
      const periodValues = {};
      const periodBUValues = {};  // 关键修复：BU 值用依赖节点的 BU 值计算，不用 AC/FC
      let hasValidValues = true;
      deps.forEach(depId => {
        // 关键修复：使用调整后的值计算每期单值
        // getAdjustedValue 返回调整后的值（如果有调整）或原始值（如果没有调整）
        const adjustedAC = getAdjustedValue(depId, period, 'AC');
        const adjustedFC = getAdjustedValue(depId, period, 'FC');

        // 判断当前期是 AC 期还是 FC 期
        const depNode = getDepNode(depId);
        const depData = depNode?.periods?.[period];
        const isACPeriod = depData?.AC !== null && depData?.AC !== undefined;

        const validValue = isACPeriod ? adjustedAC : adjustedFC;
        if (validValue === null || validValue === undefined) {
          hasValidValues = false;
        }
        periodValues[depId] = validValue ?? 0;

        // 关键修复：BU 值用依赖节点的 BU 值（目标值），不随调整变化
        const depBU = depData?.BU ?? 0;
        periodBUValues[depId] = depBU;
      });

      const periodValue = hasValidValues ? compileFn(periodValues) : 0;

      // 2. 计算逐期累计：用依赖节点的累计值代入公式计算
      // 规则：累计值 = 公式(依赖的累计值)
      // 例如：zonghe_zhibiao = chengjiaolv_zong * pingjun_kejunjia_zong / 1000
      // 累计值 = chengjiaolv_zong 累计值 * pingjun_kejunjia_zong 累计值 / 1000 = 81
      // 2. 计算逐期累计：累计值 = Σ(每期单值的计算结果)
      // 2. 计算逐期累计：每个变量取 Σ(每期单值) 代入公式
      // 注意：AC 和 FC 共同构成完整期间，累计值 = ΣAC + ΣFC
      const cumulativeSums = {};
      deps.forEach(depId => {
        const depNode = getDepNode(depId);
        let depSum = 0;

        // 累加依赖的每期单值（AC + FC）
        for (let i = 0; i <= index; i++) {
          const p = sortedPeriods[i];
          const pDepData = depNode?.periods?.[p];

          // AC 和 FC 都要累加（它们共同构成完整期间）
          if (pDepData?.AC !== null && pDepData?.AC !== undefined) {
            depSum += pDepData.AC;
          }
          if (pDepData?.FC !== null && pDepData?.FC !== undefined) {
            depSum += pDepData.FC;
          }
        }

        cumulativeSums[depId] = depSum;
      });

      const cumulativeValue = compileFn(cumulativeSums);

      // 调试日志
      if (nodeId === 'zonghe_zhibiao') {
        console.log(`[FormulaEngine] zonghe_zhibiao 累计值 [${period}]:`, {
          cumulativeSums,
          cumulativeValue
        });
      }

      // 3. BU 值处理（关键修复：用依赖节点的 BU 值计算，不是 AC/FC 值）
      const buPeriodValue = compileFn(periodBUValues);

      // 4. 存储
      if (isACPeriod) {
        periods[period] = {
          AC: periodValue,
          FC: null,
          BU: buPeriodValue,  // 每期单值
          AC_cumulative: cumulativeValue,
          FC_cumulative: null,
          BU_cumulative: cumulativeValue  // BU 的累计值也用 cumulativeValue
        };
      } else {
        periods[period] = {
          AC: null,
          FC: periodValue,
          BU: buPeriodValue,  // 每期单值
          AC_cumulative: null,
          FC_cumulative: cumulativeValue,
          BU_cumulative: cumulativeValue  // BU 的累计值也用 cumulativeValue
        };
      }
    });

    // 统一计算 AC_total 和 FC_total：用汇总值代入公式
    // AC_total = formula(ΣAC期依赖值, ...)
    // FC_total = formula(ΣFC期依赖值, ...)
    // 注意：非MONTHLY函数（如SQRT）也是"先每期算，再累加"，所以汇总时直接累加单期值即可
    let acTotalValue = 0;
    let fcTotalValue = 0;
    let acHasValue = false;
    let fcHasValue = false;

    sortedPeriods.forEach(period => {
      const p = periods[period];
      if (p.AC !== null && p.AC !== undefined) {
        acTotalValue += p.AC;
        acHasValue = true;
      }
      if (p.FC !== null && p.FC !== undefined) {
        fcTotalValue += p.FC;
        fcHasValue = true;
      }
    });

    // 对于包含函数的公式，用依赖的汇总值重新计算 AC_total 和 FC_total
    // 例：A/B + C，AC_total = (ΣAC_A)/(ΣAC_B) + ΣAC_C，FC_total = (ΣFC_A)/(ΣFC_B) + ΣFC_C
    const acPlaceholderValues = {};
    const fcPlaceholderValues = {};

    deps.forEach(depId => {
      const depNode = getDepNode(depId);
      let acSum = 0, fcSum = 0;
      if (depNode && depNode.periods) {
        sortedPeriods.forEach(period => {
          const pd = depNode.periods[period];
          // AC 期汇总
          if (pd?.AC !== null && pd?.AC !== undefined) acSum += pd.AC;
          // FC 期汇总：优先使用依赖节点自身的 FC 值（计算指标已经计算好了）
          // 驱动因子被调整过的情况，使用调整后的值
          if (pd?.FC !== null && pd?.FC !== undefined) {
            if (this._adjustmentManager && this._adjustmentManager.hasAdjustment(depId, period, 'FC')) {
              const adjustedFC = this._adjustmentManager.getAdjustedValue(depId, period, 'FC');
              fcSum += adjustedFC;
            } else {
              fcSum += pd.FC;
            }
          }
        });
      }
      acPlaceholderValues[depId] = acSum;
      fcPlaceholderValues[depId] = fcSum;
    });

    const acTotalByFormula = compileFn(acPlaceholderValues);
    const fcTotalByFormula = compileFn(fcPlaceholderValues);

    // 用公式重新计算的值覆盖累加值（对于比率型/复杂公式，公式计算≠累加单期值）
    acTotalValue = acTotalByFormula;
    fcTotalValue = fcTotalByFormula;

    // 存储 AC_total 和 FC_total（所有期间统一设置）
    sortedPeriods.forEach(period => {
      periods[period].AC_total = acHasValue ? acTotalValue : 0;
      periods[period].FC_total = fcHasValue ? fcTotalValue : 0;
    });

    // 关键修复：所有公式类型都设置 FC_only_total（用于"预测"显示）
    // FC_only_total = 纯 FC 期的计算结果汇总
    const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
    if (lastPeriod && periods[lastPeriod]) {
      periods[lastPeriod].FC_only_total = fcHasValue ? fcTotalValue : 0;
    }

    console.log(`[FormulaEngine] ${nodeId} periods 填充完成:`, {
      periodsCount: Object.keys(periods).length,
      samplePeriod: periods[sortedPeriods[0]],
      AC_total: acTotalValue,
      FC_total: fcTotalValue,
      performance: `前缀和优化：O(P²) → O(P)，500 期场景性能提升约 ${sortedPeriods.length / 2}倍`
    });

    // 调试：综合指标详细计算过程
    if (nodeId === 'zonghe_zhibiao') {
      const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
      const lastP = periods[lastPeriod];
      console.log(`[FormulaEngine] zonghe_zhibiao 详细计算:`, {
        formula,
        deps,
        lastPeriod,
        lastPeriodData: lastP,
        FC_cumulative: lastP?.FC_cumulative,
        AC_cumulative: lastP?.AC_cumulative
      });
      // 打印每个依赖的最后一期值
      deps.forEach(depId => {
        const depNode = getDepNode(depId);
        const depLastPeriod = depNode?.periods?.[lastPeriod];
        console.log(`[FormulaEngine] zonghe_zhibiao 依赖 ${depId}:`, {
          lastPeriodValue: depLastPeriod,
          FC_cumulative: depLastPeriod?.FC_cumulative,
          FC: depLastPeriod?.FC
        });
      });
    }

    console.log(`[FormulaEngine] ${nodeId} 计算完成:`, {
      periodsCount: Object.keys(periods).length,
      lastPeriod: sortedPeriods[sortedPeriods.length - 1],
      lastPeriodData: periods[sortedPeriods[sortedPeriods.length - 1]],
      sampleValue: periods[sortedPeriods[0]]
    });

    return this._createCalculatedNode(nodeId, sourceNode, periods);
  }

  /**
   * 计算 MONTHLY 节点（支持多个 MONTHLY 函数）
   * 逐期计算：存储每期单值和累计值
   */
  _calculateMonthlyNode(nodeId, sourceNode, sourceData, allNodeIds) {
    const formula = sourceNode.formula;
    const periods = {};

    // 检测 MONTHLY 函数（支持多个）
    const { formula: formulaWithPlaceholders, allPlaceholders } =
      FormulaParser.replaceMonthlyWithPlaceholder(formula);

    console.log(`[FormulaEngine] ${nodeId} 检测 MONTHLY 函数:`, {
      formula,
      formulaWithPlaceholders,
      allPlaceholdersCount: allPlaceholders?.length,
      allPlaceholders
    });

    if (!allPlaceholders || allPlaceholders.length === 0) {
      console.log(`[FormulaEngine] ${nodeId} 没有 MONTHLY 函数，使用 _calculateSimpleNode`);
      return this._calculateSimpleNode(nodeId, sourceNode, sourceData, allNodeIds);
    }

    // 编译外层公式（包含所有占位符）
    let outerCompileFn = null;
    try {
      const allPlaceholderNames = allPlaceholders.map(p => p.placeholder);
      outerCompileFn = FormulaParser.compile(formulaWithPlaceholders, allPlaceholderNames);
    } catch (e) {
      console.error(`[FormulaEngine] 编译外层公式失败:`, e);
      return this._createCalculatedNode(nodeId, sourceNode, {});
    }

    // 辅助函数：获取节点（优先缓存的计算节点，因为 computed 指标的 sourceData 没有 periods）
    const getNode = (id) => {
      // 优先从缓存获取（有完整的 periods 数据），其次从 sourceData 获取
      const cachedNode = this._cache.nodes.get(id);
      if (cachedNode) return cachedNode;
      if (sourceData instanceof Map) {
        return sourceData.get(id);
      } else {
        return sourceData[id];
      }
    };

    // 收集所有期间和依赖
    const allPeriods = new Set();
    const allDepsByPlaceholder = {};

    console.log(`[FormulaEngine] _calculateMonthlyNode: ${nodeId} 收集期间`, {
      sourceNodeHasPeriods: !!sourceNode.periods,
      sourceNodePeriodsCount: sourceNode.periods ? Object.keys(sourceNode.periods).length : 0
    });

    allPlaceholders.forEach((ph) => {
      const innerDeps = FormulaParser.extractDependencies(ph.inner, allNodeIds);
      allDepsByPlaceholder[ph.placeholder] = innerDeps;

      sourceNode.periods && Object.keys(sourceNode.periods).forEach(p => allPeriods.add(p));
      innerDeps.forEach(depId => {
        const depNode = getNode(depId) || this._cache.nodes.get(depId);
        console.log(`[FormulaEngine] ${nodeId} 收集依赖节点 ${depId} 期间:`, {
          found: !!depNode,
          hasPeriods: !!(depNode?.periods),
          periodsCount: depNode?.periods ? Object.keys(depNode.periods).length : 0
        });
        if (depNode) {
          Object.keys(depNode.periods || {}).forEach(p => allPeriods.add(p));
        }
      });
    });

    const sortedPeriods = Array.from(allPeriods).sort();

    console.log(`[FormulaEngine] _calculateMonthlyNode: ${nodeId}`, {
      formula: sourceNode.formula,
      placeholderCount: allPlaceholders.length,
      sortedPeriodsCount: sortedPeriods.length,
      sortedPeriodsSample: sortedPeriods.slice(0, 5)
    });

    if (sortedPeriods.length === 0) {
      console.error(`[FormulaEngine] ${nodeId} 没有收集到任何期间！`);
    }

    // ========== 逐期计算 ==========
    // 对每个期间，计算该期的单期值和累计值
    // 单期值：计算该期的表达式值
    // 累计值：根据 MONTHLY_xxx 的类型，聚合从第一期到该期的表达式值
    // - MONTHLY_SUM: 累计 = Σ(每期表达式值)
    // - MONTHLY_AVG: 累计 = AVG(每期表达式值)
    // - MONTHLY_MAX: 累计 = MAX(每期表达式值)
    // - MONTHLY_MIN: 累计 = MIN(每期表达式值)
    // - MONTHLY_COUNT: 累计 = COUNT(每期表达式值)
    // - MONTHLY_COUNT_NONZERO: 累计 = 非零期数的计数

    sortedPeriods.forEach((period, index) => {
      periods[period] = { AC: null, FC: null, BU: null };

      // 关键修复：在值收集之前，先判断当前期间是 AC 期还是 FC 期
      // 避免驱动因子节点同时有 AC 和 FC 数据时被重复收集
      let isACPeriod = false;
      const firstDepId = allDepsByPlaceholder[allPlaceholders[0]?.placeholder]?.[0];
      if (firstDepId) {
        // 优先从缓存获取计算后的节点（有 AC/FC 数据），其次从 sourceData 获取
        const depNode = this._cache.nodes.get(firstDepId) || getNode(firstDepId);
        if (depNode && depNode.periods && depNode.periods[period]) {
          isACPeriod = depNode.periods[period]?.AC !== null && depNode.periods[period]?.AC !== undefined;
        }
      }

      // 计算当前期间的单期值（只计算当前期间）
      const singlePeriodPlaceholderValues = {};
      const singlePeriodBUPlaceholderValues = {};

      // 计算当前期间的累计值（从 WK01 到当前期）
      const cumulativePlaceholderValues = {};
      const cumulativeBUPlaceholderValues = {};

      // 关键修复：FC-only 累计值占位符（只聚合 FC 期数据，用于 forecastTotal 显示）
      const fcOnlyCumulativePlaceholderValues = {};

      allPlaceholders.forEach(ph => {
        const innerDeps = allDepsByPlaceholder[ph.placeholder];
        const singleMonthValues = [];  // 当前期间的值
        const cumulativeMonthValues = [];  // 从 WK01 到当前期的所有值（AC+FC）
        const fcOnlyCumulativeMonthValues = [];  // 纯 FC 期累计值（只包含 FC 期）
        const buMonthValues = [];
        const buCumulativeMonthValues = [];

        // 收集当前期间的值（用于单期计算）
        // 关键修复：根据当前期间是 AC 期还是 FC 期，只收集对应类型的值
        // 避免驱动因子节点同时有 AC 和 FC 数据时被重复收集
        innerDeps.forEach(depId => {
          const depNode = getNode(depId) || this._cache.nodes.get(depId);
          if (depNode && depNode.periods && depNode.periods[period]) {
            const periodData = depNode.periods[period];

            if (isACPeriod) {
              // AC 期：只收集 AC 数据
              if (periodData?.AC !== null && periodData?.AC !== undefined) {
                const adjustedAC = this._adjustmentManager?.getAdjustedValue(depId, period, 'AC');
                if (adjustedAC !== null && adjustedAC !== undefined && adjustedAC !== 0) {
                  singleMonthValues.push(adjustedAC);
                }
              }
            } else {
              // FC 期：只收集 FC 数据（使用调整后的预测值）
              if (periodData?.FC !== null && periodData?.FC !== undefined) {
                const adjustedFC = this._adjustmentManager?.getAdjustedValue(depId, period, 'FC');
                if (adjustedFC !== null && adjustedFC !== undefined && adjustedFC !== 0) {
                  singleMonthValues.push(adjustedFC);
                }
              }
            }

            // BU 值单独收集
            if (periodData?.BU !== null && periodData?.BU !== undefined) {
              buMonthValues.push(periodData.BU);
            }
          }
        });

        // 收集从第一期到当前期间的所有值（用于累计计算）
        // 关键修复：每个期间根据自身是 AC 期还是 FC 期，收集对应类型的值
        // 同时收集纯 FC 期累计值（只包含 FC 期，用于 forecastTotal 显示）
        for (let i = 0; i <= index; i++) {
          const p = sortedPeriods[i];
          innerDeps.forEach(depId => {
            const depNode = getNode(depId) || this._cache.nodes.get(depId);
            if (depNode && depNode.periods && depNode.periods[p]) {
              const periodData = depNode.periods[p];
              // 判断该期间是 AC 期还是 FC 期
              const pIsAC = periodData?.AC !== null && periodData?.AC !== undefined;
              const pIsFC = periodData?.FC !== null && periodData?.FC !== undefined;

              if (pIsAC) {
                // AC 期：收集 AC 值
                const adjustedAC = this._adjustmentManager?.getAdjustedValue(depId, p, 'AC');
                if (adjustedAC !== null && adjustedAC !== undefined && adjustedAC !== 0) {
                  cumulativeMonthValues.push(adjustedAC);
                }
              }
              if (pIsFC) {
                // FC 期：收集 FC 值（使用调整后的预测值）
                const adjustedFC = this._adjustmentManager?.getAdjustedValue(depId, p, 'FC');
                if (adjustedFC !== null && adjustedFC !== undefined && adjustedFC !== 0) {
                  cumulativeMonthValues.push(adjustedFC);
                  fcOnlyCumulativeMonthValues.push(adjustedFC);  // 纯 FC 累计也收集
                }
              }
              // BU 值单独收集
              if (periodData?.BU !== null && periodData?.BU !== undefined) {
                buCumulativeMonthValues.push(periodData.BU);
              }
            }
          });
        }

        // 应用 MONTHLY 聚合函数 - 单期计算
        if (singleMonthValues.length > 0) {
          singlePeriodPlaceholderValues[ph.placeholder] = aggregateMonthlyValues(singleMonthValues, ph.type);
        } else {
          singlePeriodPlaceholderValues[ph.placeholder] = 0;
        }

        // 应用 MONTHLY 聚合函数 - 累计计算
        if (cumulativeMonthValues.length > 0) {
          cumulativePlaceholderValues[ph.placeholder] = aggregateMonthlyValues(cumulativeMonthValues, ph.type);
        } else {
          cumulativePlaceholderValues[ph.placeholder] = 0;
        }

        // BU 值 - 单期
        if (buMonthValues.length > 0) {
          singlePeriodBUPlaceholderValues[ph.placeholder] = aggregateMonthlyValues(buMonthValues, ph.type);
        } else {
          singlePeriodBUPlaceholderValues[ph.placeholder] = 0;
        }

        // BU 值 - 累计
        if (buCumulativeMonthValues.length > 0) {
          cumulativeBUPlaceholderValues[ph.placeholder] = aggregateMonthlyValues(buCumulativeMonthValues, ph.type);
        } else {
          cumulativeBUPlaceholderValues[ph.placeholder] = 0;
        }

        // 关键修复：FC-only 累计值（只聚合 FC 期数据，用于 forecastTotal 显示）
        if (fcOnlyCumulativeMonthValues.length > 0) {
          fcOnlyCumulativePlaceholderValues[ph.placeholder] = aggregateMonthlyValues(fcOnlyCumulativeMonthValues, ph.type);
        } else {
          fcOnlyCumulativePlaceholderValues[ph.placeholder] = 0;
        }
      });

      // 计算当前期间的单期值和累计值
      const periodValue = outerCompileFn(singlePeriodPlaceholderValues);
      const periodCumulativeValue = outerCompileFn(cumulativePlaceholderValues);
      const periodBUValue = outerCompileFn(singlePeriodBUPlaceholderValues);
      const periodBUCumulativeValue = outerCompileFn(cumulativeBUPlaceholderValues);

      // isACPeriod 已在值收集前判断（见循环开头），此处复用

      if (isACPeriod) {
        // AC 期：存储当期单值和累计值
        periods[period].AC = isNaN(periodValue) ? 0 : periodValue;
        periods[period].AC_cumulative = isNaN(periodCumulativeValue) ? 0 : periodCumulativeValue;
        periods[period].FC = null;
        periods[period].FC_cumulative = null;
      } else {
        // FC 期：存储当期单值和累计值
        periods[period].FC = isNaN(periodValue) ? 0 : periodValue;
        periods[period].FC_cumulative = isNaN(periodCumulativeValue) ? 0 : periodCumulativeValue;
        // 关键修复：存储纯 FC 期累计值（只包含 FC 期数据，用于 forecastTotal 显示）
        // FC-only 单期值 = 当前 FC 期的公式结果
        periods[period].FC_only = isNaN(periodValue) ? 0 : periodValue;
        // FC-only 累计值 = 只聚合 FC 期数据的结果
        periods[period].FC_only_cumulative = isNaN(outerCompileFn(fcOnlyCumulativePlaceholderValues)) ? 0 : outerCompileFn(fcOnlyCumulativePlaceholderValues);
        // FC-only total = 纯 FC 期的计算结果汇总（用于"预测"显示）
        periods[period].FC_only_total = isNaN(outerCompileFn(fcOnlyCumulativePlaceholderValues)) ? 0 : outerCompileFn(fcOnlyCumulativePlaceholderValues);
        periods[period].AC = null;
        periods[period].AC_cumulative = null;
      }

      // BU 值
      periods[period].BU = isNaN(periodBUValue) ? 0 : periodBUValue;
      periods[period].BU_cumulative = isNaN(periodBUCumulativeValue) ? 0 : periodBUCumulativeValue;
    });

    console.log(`[FormulaEngine] ${nodeId} 计算完成:`, {
      AC: periods[sortedPeriods[0]]?.AC,
      FC: periods[sortedPeriods[0]]?.FC,
      BU: periods[sortedPeriods[0]]?.BU,
      AC_cumulative: periods[sortedPeriods[sortedPeriods.length - 1]]?.AC_cumulative,
      FC_cumulative: periods[sortedPeriods[sortedPeriods.length - 1]]?.FC_cumulative,
      periodsCount: Object.keys(periods).length,
      sortedPeriodsCount: sortedPeriods.length
    });

    return this._createCalculatedNode(nodeId, sourceNode, periods);
  }

  /**
   * 从原始节点创建计算节点
   */
  _createCalculatedNodeFromSource(sourceNode) {
    const periods = {};

    // 复制原始数据，如果有调整则使用调整后的值
    if (sourceNode.periods) {
      Object.keys(sourceNode.periods).forEach(period => {
        const originalData = sourceNode.periods[period];
        // 深拷贝原始数据，避免修改源数据
        periods[period] = {
          AC: (originalData?.AC !== null && originalData?.AC !== undefined) ? originalData.AC : null,
          FC: (originalData?.FC !== null && originalData?.FC !== undefined) ? originalData.FC : null,
          BU: originalData?.BU ?? null,
          AC_cumulative: originalData?.AC_cumulative ?? null,
          FC_cumulative: originalData?.FC_cumulative ?? null,
          BU_cumulative: originalData?.BU_cumulative ?? null
        };

        // 检查是否有调整，如果有则使用调整后的值
        if (this._adjustmentManager) {
          // 先检查是否有调整记录
          const hasFcAdjustment = this._adjustmentManager.hasAdjustment(sourceNode.id, period, 'FC');
          const hasAcAdjustment = this._adjustmentManager.hasAdjustment(sourceNode.id, period, 'AC');

          // 如果 FC 有调整，使用调整后的值
          if (hasFcAdjustment) {
            const adjustedFC = this._adjustmentManager.getAdjustedValue(sourceNode.id, period, 'FC');
            periods[period].FC = adjustedFC;
          }

          // 如果 AC 有调整，使用调整后的值
          if (hasAcAdjustment) {
            const adjustedAC = this._adjustmentManager.getAdjustedValue(sourceNode.id, period, 'AC');
            periods[period].AC = adjustedAC;
          }
        }
      });

      // 计算累计值（在所有的值都设置好后）
      const sortedPeriods = Object.keys(periods).sort();
      let acCumulativeSum = 0;
      let fcCumulativeSum = 0;

      sortedPeriods.forEach((period, index) => {
        if (periods[period]?.AC !== null && periods[period]?.AC !== undefined) {
          acCumulativeSum += periods[period].AC;
        }
        if (periods[period]?.FC !== null && periods[period]?.FC !== undefined) {
          fcCumulativeSum += periods[period].FC;
        }
        // 只有当有 AC 值时才设置 AC_cumulative
        if (acCumulativeSum > 0) {
          periods[period].AC_cumulative = acCumulativeSum;
        }
        // 只有当有 FC 值时才设置 FC_cumulative
        if (fcCumulativeSum > 0) {
          periods[period].FC_cumulative = fcCumulativeSum;
          // 驱动因子：FC_cumulative 本身就是纯 FC 总和（与 AC 分别累加）
          // 设置 FC-only 相关字段，保持下游逻辑一致
          periods[period].FC_only_cumulative = fcCumulativeSum;
          periods[period].FC_only_total = fcCumulativeSum;
          periods[period].FC_total = fcCumulativeSum;
          periods[period].FC_only = periods[period].FC;
        } else if (periods[period]?.FC !== null && periods[period]?.FC !== undefined) {
          // FC 值为 0 时也要设置 FC-only 字段
          periods[period].FC_only_cumulative = 0;
          periods[period].FC_only_total = 0;
          periods[period].FC_total = 0;
          periods[period].FC_only = 0;
        }
      });
    }

    // 计算汇总
    const resultNode = this._createCalculatedNode(sourceNode.id, sourceNode, periods);
    return resultNode;
  }

  /**
   * 创建计算节点
   *
   * 汇总值计算规则：
   * - 汇总值 = 最后一期的累计值
   * - actualTotal: AC 累计值（最后一期）
   * - forecastTotal: FC 累计值（最后一期）
   * - budgetTotal: BU 累计值（最后一期）
   */
  _createCalculatedNode(nodeId, sourceNode, periods) {
    // 调试日志
    const samplePeriod = periods && Object.keys(periods).length > 0 ?
      Object.entries(periods)[0] : null;
    console.log(`[FormulaEngine] _createCalculatedNode: ${nodeId}`, {
      periodsCount: periods ? Object.keys(periods).length : 0,
      samplePeriod: samplePeriod ? `${samplePeriod[0]}: AC=${samplePeriod[1]?.AC}, FC=${samplePeriod[1]?.FC}, BU=${samplePeriod[1]?.BU}` : null
    });

    // 汇总值 = 最后一期的累计值
    const sortedPeriods = Object.keys(periods).sort();
    const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
    const lastP = periods[lastPeriod];

    let actualTotal = 0;
    let actualCount = 0;
    let forecastTotal = 0;
    let forecastCount = 0;
    let budgetTotal = 0;
    let budgetCount = 0;

    let actualPlusForecast = 0;

    if (lastP) {
      // AC 汇总：取最后一个 AC 期的累计值（如果最后一期是 FC 期，需要往前找最后一个 AC 期）
      if (lastP?.AC_cumulative !== null && lastP?.AC_cumulative !== undefined) {
        actualTotal = lastP.AC_cumulative;
      } else if (lastP?.AC !== null && lastP?.AC !== undefined) {
        actualTotal = lastP.AC;
      } else {
        // 最后一期是 FC 期，往前找最后一个有 AC_cumulative 的期间
        for (let i = sortedPeriods.length - 1; i >= 0; i--) {
          const p = periods[sortedPeriods[i]];
          if (p?.AC_cumulative !== null && p?.AC_cumulative !== undefined) {
            actualTotal = p.AC_cumulative;
            break;
          } else if (p?.AC !== null && p?.AC !== undefined) {
            actualTotal = p.AC;
            break;
          }
        }
      }
      actualCount = sortedPeriods.filter(p => {
        const v = periods[p]?.AC;
        return v !== null && v !== undefined && v !== 0;
      }).length;

      // 先初始化 FC 汇总值（累加）
      forecastCount = sortedPeriods.filter(p => periods[p]?.FC !== 0 && periods[p]?.FC !== null && periods[p]?.FC !== undefined).length;
      const fcSumValues = sortedPeriods.map(p => periods[p]?.FC).filter(v => v !== null && v !== undefined && v !== 0);
      let fcRawSum = 0;
      fcSumValues.forEach(v => fcRawSum += v);
      forecastTotal = fcRawSum;

      // 应用汇总方式（aggregationType）
      // 默认 SUM（加总），也支持 AVERAGE/MIN/MAX/COUNT 等
      const aggType = (sourceNode.aggregationType || 'sum').toUpperCase();

      if (aggType === 'AVERAGE' || aggType === 'AVG') {
        // 平均模式：actualTotal 和 forecastTotal 分别除以期数
        if (actualCount > 0) actualTotal = actualTotal / actualCount;
        if (forecastCount > 0) forecastTotal = forecastTotal / forecastCount;
      } else if (aggType === 'MIN') {
        // 取最小值：遍历所有 AC 期和 FC 期的单期值
        const acValues = sortedPeriods.map(p => periods[p]?.AC).filter(v => v !== null && v !== undefined);
        const fcValues = sortedPeriods.map(p => periods[p]?.FC).filter(v => v !== null && v !== undefined);
        if (acValues.length > 0) actualTotal = Math.min(...acValues);
        if (fcValues.length > 0) forecastTotal = Math.min(...fcValues);
      } else if (aggType === 'MAX') {
        const acValues = sortedPeriods.map(p => periods[p]?.AC).filter(v => v !== null && v !== undefined);
        const fcValues = sortedPeriods.map(p => periods[p]?.FC).filter(v => v !== null && v !== undefined);
        if (acValues.length > 0) actualTotal = Math.max(...acValues);
        if (fcValues.length > 0) forecastTotal = Math.max(...fcValues);
      } else if (aggType === 'COUNT' || aggType === 'COUNT_NONZERO') {
        actualTotal = actualCount;
        forecastTotal = forecastCount;
      }
      // SUM 模式：保持累加值不变

      // FC 汇总：区分驱动因子和计算指标
      if (sourceNode.type === 'driver') {
        // 驱动因子：直接用前面按 aggregationType 计算的结果，不需要优先级链
        // forecastTotal 已经在上面根据 aggType 设置为 FC累加值（SUM）或 FC平均值（AVERAGE）等
        // 确保 forecastTotal 至少有 FC_cumulative 作为兜底
        if (forecastTotal === 0 && lastP?.FC_cumulative !== null && lastP?.FC_cumulative !== undefined) {
          forecastTotal = lastP.FC_cumulative;
        }
      } else {
        // 计算指标：使用优先级链
        // 1. MONTHLY 函数型：FC_only_cumulative（纯 FC 期重新计算的结果）
        // 2. 简单公式型：FC_only_total（ΣFC 依赖值代入公式的结果）
        // 3. FC_total（通用 FC 汇总值）
        // 4. FC_only（FC 单期值）
        // 5. FC_cumulative 回退
        if (lastP?.FC_only_cumulative !== null && lastP?.FC_only_cumulative !== undefined) {
          forecastTotal = lastP.FC_only_cumulative;
        } else if (lastP?.FC_only_total !== null && lastP?.FC_only_total !== undefined) {
          forecastTotal = lastP.FC_only_total;
        } else if (lastP?.FC_total !== null && lastP?.FC_total !== undefined) {
          forecastTotal = lastP.FC_total;
        } else if (lastP?.FC_only !== null && lastP?.FC_only !== undefined) {
          forecastTotal = lastP.FC_only;
        } else if (lastP?.FC_cumulative !== null && lastP?.FC_cumulative !== undefined) {
          // 回退：仅适用于驱动因子（FC_cumulative 是纯 FC 总和）
          let lastAcCumulative = 0;
          if (lastP?.AC_cumulative !== null && lastP?.AC_cumulative !== undefined) {
            lastAcCumulative = lastP.AC_cumulative;
          } else {
            for (let i = sortedPeriods.length - 1; i >= 0; i--) {
              const p = periods[sortedPeriods[i]];
              if (p?.AC_cumulative !== null && p?.AC_cumulative !== undefined) {
                lastAcCumulative = p.AC_cumulative;
                break;
              }
            }
          }
          // 如果 FC_cumulative == AC_cumulative（说明没有 FC 期），预测为 0
          if (Math.abs(lastP.FC_cumulative - lastAcCumulative) < 0.0001) {
            forecastTotal = 0;
          } else {
            forecastTotal = lastP.FC_cumulative;
          }
        } else if (lastP?.FC !== null && lastP?.FC !== undefined) {
          forecastTotal = lastP.FC;
        } else {
          forecastTotal = 0;
        }
        forecastCount = sortedPeriods.filter(p => periods[p]?.FC !== 0 && periods[p]?.FC !== null && periods[p]?.FC !== undefined).length;
      }

      // BU 汇总：取最后一期的 BU 累计值
      budgetTotal = lastP?.BU_cumulative ?? lastP?.BU ?? 0;
      budgetCount = 1;

      // actualPlusForecast = AC + FC 整体值
      // 关键修复：对于计算指标，FC_cumulative（或 AC_cumulative）存储的是 AC+FC 联合计算的结果
      // - 对于求和型：FC_cumulative = Σ(AC) + Σ(FC) = 整体总和
      // - 对于比率型：FC_cumulative = formula(ΣAC+ΣFC) = 整体比率（不能把 AC 比率和 FC 比率相加）
      actualPlusForecast = lastP?.FC_cumulative ?? lastP?.AC_cumulative ?? (actualTotal + forecastTotal);
    }

    return {
      id: nodeId,
      name: sourceNode.name,
      type: sourceNode.type,
      level: sourceNode.level || '1',
      formula: sourceNode.formula,
      dependencies: FormulaParser.extractDependencies(sourceNode.formula || '', []),
      periods,
      summary: {
        actualTotal,
        actualCount,
        forecastTotal,
        forecastCount,
        budgetTotal,
        budgetCount,
        actualPlusForecast
      },
      unit: sourceNode.unit,
      format: sourceNode.format,
      direction: sourceNode.direction,
      // 保留 range 配置（驱动因子的最小值/最大值）
      range: sourceNode.range
    };
  }

  /**
   * 构建依赖图
   * @param {Map<string, SourceDataNode> | Object} sourceData - 原始数据
   */
  _buildDependencyGraph(sourceData) {
    const allNodeIds = sourceData instanceof Map
      ? Array.from(sourceData.keys())
      : Object.keys(sourceData);

    const forEachNode = sourceData instanceof Map
      ? (cb) => sourceData.forEach(cb)
      : (cb) => Object.entries(sourceData).forEach(([id, node]) => cb(node, id));

    forEachNode((node, nodeId) => {
      if (node.type === 'driver') {
        this._dependencyGraph.set(nodeId, []);
      } else {
        const deps = FormulaParser.extractDependencies(node.formula || '', allNodeIds);
        this._dependencyGraph.set(nodeId, deps);
      }
    });
  }

  /**
   * 拓扑排序
   * @returns {string[] | null} 计算顺序，存在环时返回 null
   */
  _topologicalSort() {
    const inDegree = new Map();
    const adjacency = new Map();

    // 初始化
    this._dependencyGraph.forEach((deps, nodeId) => {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    });

    // 构建邻接表和入度
    this._dependencyGraph.forEach((deps, nodeId) => {
      deps.forEach(depId => {
        if (adjacency.has(depId)) {
          adjacency.get(depId).push(nodeId);
          inDegree.set(nodeId, (inDegree.get(nodeId) || 0) + 1);
        }
      });
    });

    // Kahn 算法
    const queue = [];
    const result = [];

    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) queue.push(nodeId);
    });

    while (queue.length > 0) {
      const nodeId = queue.shift();
      result.push(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      neighbors.forEach(neighbor => {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      });
    }

    // 检查是否存在环
    if (result.length !== this._dependencyGraph.size) {
      return null;  // 存在环
    }

    return result;
  }

  /**
   * 检查是否需要重新计算
   */
  _needsRecalculation(sourceData) {
    const currentVersion = sourceData.getVersion?.() || 0;
    return this._cache.sourceDataVersion !== currentVersion;
  }

  /**
   * 获取计算后的节点
   * @param {string} nodeId - 节点 ID
   * @returns {CalculatedNode | null}
   */
  getCalculatedNode(nodeId) {
    return this._cache.nodes.get(nodeId) || null;
  }

  /**
   * 获取所有计算后的节点
   * @returns {Map<string, CalculatedNode>}
   */
  getAllCalculatedNodes() {
    return new Map(this._cache.nodes);
  }

  /**
   * 失效缓存
   * @param {string[]} nodeIds - 需要失效的节点 ID 列表
   */
  invalidateCache(nodeIds) {
    // 收集所有需要失效的节点（包括上游依赖节点）
    const allInvalidatedIds = new Set(nodeIds);

    // 遍历依赖图，找到所有依赖这些节点的节点
    this._dependencyGraph.forEach((deps, nodeId) => {
      if (deps.some(depId => nodeIds.includes(depId))) {
        allInvalidatedIds.add(nodeId);
        // 递归查找更上游的节点
        this._findUpstreamNodes(nodeId, allInvalidatedIds);
      }
    });

    // 删除缓存
    allInvalidatedIds.forEach(nodeId => {
      this._cache.nodes.delete(nodeId);
    });
    this._cache.version++;

    console.log(`[FormulaEngine] 失效缓存：${Array.from(allInvalidatedIds).join(', ')}`);
  }

  /**
   * 递归查找上游依赖节点
   * @param {string} nodeId - 节点 ID
   * @param {Set<string>} collectedIds - 已收集的节点 ID 集合
   */
  _findUpstreamNodes(nodeId, collectedIds) {
    this._dependencyGraph.forEach((deps, id) => {
      if (deps.includes(nodeId) && !collectedIds.has(id)) {
        collectedIds.add(id);
        this._findUpstreamNodes(id, collectedIds);
      }
    });
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this._cache.nodes.clear();
    this._cache.version++;
  }

  /**
   * 获取依赖图
   * @returns {Map<string, string[]>}
   */
  getDependencyGraph() {
    return new Map(this._dependencyGraph);
  }

  /**
   * 获取计算顺序
   * @returns {string[]}
   */
  getComputeOrder() {
    return [...this._computeOrder];
  }
}
